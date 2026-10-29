from io import StringIO
import json
import os
from pathlib import Path
import sys
from threading import Thread
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from lab_worker_inbox import RequestInbox


def lines(*requests):
    return StringIO("".join(json.dumps(request) + "\n" for request in requests))


def details(identifier, **extra):
    return {"id": identifier, "kind": "lab_details", "labStreaming": True, **extra}


def cancel(identifier, **extra):
    return {"kind": "cancel_lab_details", "target": identifier, **extra}


class WorkerInboxTests(unittest.TestCase):
    def read_all(self, stream, capacity=2):
        rejected = []
        inbox = RequestInbox(stream, lambda identifier, error: rejected.append((identifier, error)), capacity)
        self.addCleanup(inbox.close)
        self.assertTrue(inbox.reader_done.wait(1), "reader must reach EOF without main inference")
        return inbox, rejected

    def test_fifo_and_eof_preserve_jobs_until_explicit_completion(self):
        inbox, rejected = self.read_all(lines(details(1), {"id": 2, "kind": "turn"}))
        self.assertEqual(inbox.pending_count, 2)
        first, event = next(inbox)
        second, primary_event = next(inbox)
        self.assertEqual((first["id"], second["id"]), (1, 2))
        self.assertFalse(event.is_set())
        self.assertIsNone(primary_event)
        self.assertEqual(inbox.pending_count, 2)  # Dequeue is not completion.
        inbox.done(first)
        self.assertEqual(inbox.pending_count, 1)
        inbox.done(second)
        self.assertEqual(inbox.pending_count, 0)
        for _ in range(2):
            with self.assertRaises(StopIteration):
                next(inbox)
        self.assertEqual(rejected, [])

    def test_cancel_before_dequeue_keeps_capacity_until_ack(self):
        inbox, rejected = self.read_all(lines(details(1), details(2), cancel(2)))
        first, first_event = next(inbox)
        second, second_event = next(inbox)
        self.assertFalse(first_event.is_set())
        self.assertTrue(second_event.is_set())
        self.assertEqual(inbox.pending_count, 2)
        inbox.done(second)
        self.assertEqual(inbox.pending_count, 1)
        inbox.done(first)
        self.assertEqual(inbox.pending_count, 0)
        self.assertEqual(rejected, [])

    def test_full_inbox_rejects_extra_work_but_still_reads_cancellation(self):
        inbox, rejected = self.read_all(lines(details(1), {"id": 2, "kind": "turn"},
                                            {"id": 3, "kind": "turn"}, cancel(1)))
        first, event = next(inbox)
        second, _ = next(inbox)
        self.assertTrue(event.is_set())
        self.assertEqual(rejected, [(3, "WorkerBusyError")])
        self.assertEqual(inbox.pending_count, 2)
        self.assertEqual(second["id"], 2)
        inbox.done(first)
        inbox.done(second)
        with self.assertRaises(StopIteration):
            next(inbox)

    def test_primary_and_non_boolean_lab_flags_are_never_cancellable(self):
        for request in [{"id": 1, "kind": "turn", "labStreaming": True},
                        details(1, labStreaming=False), details(1, labStreaming=1),
                        {"id": 1, "kind": "readings"}]:
            with self.subTest(request=request):
                inbox, rejected = self.read_all(lines(request, cancel(1)))
                original, event = next(inbox)
                self.assertIsNone(event)
                self.assertEqual(rejected, [])
                inbox.done(original)

    def test_future_invalid_and_late_controls_do_not_poison_new_requests(self):
        controls = [cancel(1), cancel(True), cancel(1, id=99), cancel(1, extra=True),
                    cancel("1"), cancel(0), cancel(1.0), {"kind": "cancel_lab_details"}]
        inbox, rejected = self.read_all(lines(*controls, details(1)))
        original, event = next(inbox)
        self.assertFalse(event.is_set())
        inbox.done(original)
        # A late control after completion is ignored, including reuse of an ID.
        inbox._cancel(cancel(1))
        self.assertFalse(event.is_set())
        self.assertEqual(rejected, [])

    def test_duplicate_id_cannot_release_or_replace_the_original(self):
        inbox, rejected = self.read_all(lines(details(1), details(1), cancel(1)))
        original, event = next(inbox)
        self.assertEqual(rejected, [(None, "DuplicateRequestError")])
        self.assertEqual(inbox.pending_count, 1)
        self.assertTrue(event.is_set())
        inbox.done(dict(original))
        self.assertEqual(inbox.pending_count, 1)
        inbox.done(original)
        self.assertEqual(inbox.pending_count, 0)

    def test_duplicate_control_keys_cannot_cancel_an_ambiguous_target(self):
        source = lines(details(1)).getvalue() + '{"kind":"cancel_lab_details","target":99,"target":1}\n'
        inbox, rejected = self.read_all(StringIO(source))
        original, event = next(inbox)
        self.assertFalse(event.is_set())
        self.assertEqual(rejected, [(None, "InvalidRequestError")])
        inbox.done(original)

    def test_invalid_json_shapes_and_ids_only_emit_constant_rejection_codes(self):
        bad = '{"personal":"not logged"\n' + "\n".join(json.dumps(x) for x in [
            [], None, True, {"id": True}, {"id": "secret"}, {"id": 0}, {"id": 1.0},
            {"id": 9007199254740992},
        ]) + "\n"
        inbox, rejected = self.read_all(StringIO(bad))
        self.assertEqual(len(rejected), 9)
        self.assertTrue(all(row == (None, "InvalidRequestError") for row in rejected))
        self.assertEqual(inbox.pending_count, 0)
        self.assertEqual(list(inbox), [])

    def test_active_request_can_be_cancelled_while_consumer_is_busy(self):
        read_fd, write_fd = os.pipe()
        with os.fdopen(read_fd, "r") as source, os.fdopen(write_fd, "w") as target:
            rejected = []
            with RequestInbox(source, lambda *row: rejected.append(row)) as inbox:
                target.write(json.dumps(details(1)) + "\n")
                target.flush()
                original, event = next(inbox)
                target.write(json.dumps(cancel(1)) + "\n")
                target.flush()
                self.assertTrue(event.wait(1), "cancel must not wait for the consumer")
                self.assertEqual(inbox.pending_count, 1)
                inbox.done(original)
                target.write(json.dumps(details(2)) + "\n")
                target.flush()
                following, next_event = next(inbox)
                self.assertEqual(following["id"], 2)
                self.assertFalse(next_event.is_set())
                inbox.done(following)
                self.assertEqual(rejected, [])

    def test_close_wakes_waiting_consumer_without_owning_stdin(self):
        read_fd, write_fd = os.pipe()
        with os.fdopen(read_fd, "r") as source, os.fdopen(write_fd, "w") as target:
            inbox = RequestInbox(source, lambda *_: None)
            result = []
            consumer = Thread(target=lambda: result.extend(list(inbox)), daemon=True)
            consumer.start()
            inbox.close()
            consumer.join(1)
            self.assertFalse(consumer.is_alive())
            self.assertFalse(source.closed)
            self.assertEqual(result, [])
            self.assertEqual(inbox.pending_count, 0)
            target.close()
            self.assertTrue(inbox.reader_done.wait(1))

    def test_close_cancels_optional_jobs_and_drops_queued_references(self):
        inbox, _ = self.read_all(lines(details(1), {"id": 2, "kind": "turn"}))
        original, event = next(inbox)
        inbox.close()
        self.assertTrue(event.is_set())
        self.assertEqual(inbox.pending_count, 0)
        inbox.done(original)
        self.assertEqual(list(inbox), [])

    def test_stream_or_emitter_failure_does_not_leave_consumer_blocked(self):
        def broken(*_):
            raise OSError("not emitted")
        inbox = RequestInbox(StringIO("not-json\n"), broken)
        self.addCleanup(inbox.close)
        self.assertTrue(inbox.reader_done.wait(1))
        with self.assertRaisesRegex(RuntimeError, "worker_inbox_reader_failed"):
            next(inbox)
        with self.assertRaises(StopIteration):
            next(inbox)


if __name__ == "__main__":
    unittest.main()
