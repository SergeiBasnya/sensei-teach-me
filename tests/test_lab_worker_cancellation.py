"""Exercise the real JSONL dispatch with fake MLX and a controlled stdin pipe."""
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import json
import os
from pathlib import Path
import sys
from threading import Condition, Event, Thread, get_ident
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import conversation_worker
from lab_worker_inbox import RequestInbox


class ProtocolOutput(StringIO):
    def __init__(self, order):
        super().__init__()
        self.records = []
        self.condition = Condition()
        self.order = order

    def write(self, text):
        # emit_protocol writes one complete JSONL record while holding its lock.
        value = json.loads(text)
        with self.condition:
            self.records.append(value)
            self.order.append(("ack", value.get("id"), get_ident()))
            self.condition.notify_all()
        return super().write(text)

    def wait_record(self, predicate):
        with self.condition:
            if not self.condition.wait_for(lambda: any(predicate(r) for r in self.records), timeout=3):
                raise AssertionError("worker did not emit the expected protocol event")
            return next(r for r in self.records if predicate(r))


def module(name, **members):
    value = ModuleType(name)
    value.__dict__.update(members)
    return value


class WorkerCancellationTests(unittest.TestCase):
    def exercise(self, phase):
        owner = get_ident()
        order = []
        generations = []
        cancellation_events = {}
        generation_waiting = Event()
        driver_errors = []
        output = ProtocolOutput(order)
        japanese = "どんな音楽が好きですか？"
        self.assertIsNone(conversation_worker.checked_translation(japanese))

        class ObservedInbox(RequestInbox):
            def __next__(self):
                request, event = super().__next__()
                cancellation_events[request["id"]] = event
                return request, event

            def done(self, request):
                order.append(("done", request["id"], get_ident()))
                super().done(request)

        class Tokenizer:
            def apply_chat_template(self, messages, **_):
                return json.dumps(messages, ensure_ascii=False)

        class Romanizer:
            def __call__(self, _):
                order.append(("reading", 2, get_ident()))
                return "hai"

        def load(*_):
            order.append(("load", None, get_ident()))
            return object(), Tokenizer()

        def synchronize():
            order.append(("sync", 1, get_ident()))

        def generate(*_, **__):
            raise AssertionError("optional translation must use the cancellable generator")

        def stream_generate(*_, **options):
            order.append(("stream", 1, get_ident()))
            generations.append(options)
            try:
                if phase == "token":
                    # The real main loop has consumed a partial value before the
                    # driver cancels; that value must never become a result.
                    yield SimpleNamespace(text='{"french":"Quel genre ')
                generation_waiting.set()
                if not cancellation_events[1].wait(3):
                    raise AssertionError("reader did not observe cancellation during inference")
                if phase == "prefill":
                    options["prompt_progress_callback"](options["prefill_step_size"], 512)
                yield SimpleNamespace(text='de musique aimes-tu ?"}')
            finally:
                order.append(("stream_closed", 1, get_ident()))

        core = module("mlx.core", float16="fake", synchronize=synchronize)
        fake_modules = {
            "imageio_ffmpeg": module("imageio_ffmpeg"),
            "numpy": module("numpy"),
            "pedagogic_romaji": module("pedagogic_romaji", PedagogicRomanizer=Romanizer),
            "mlx": module("mlx", core=core),
            "mlx.core": core,
            "mlx_whisper": module("mlx_whisper"),
            "mlx_whisper.transcribe": module("mlx_whisper.transcribe", ModelHolder=SimpleNamespace(get_model=lambda *_: None)),
            "mlx_lm": module("mlx_lm", load=load, generate=generate, stream_generate=stream_generate),
            "mlx_lm.sample_utils": module("mlx_lm.sample_utils", make_sampler=lambda **_: None),
        }
        read_fd, write_fd = os.pipe()
        with os.fdopen(read_fd, "r") as source, os.fdopen(write_fd, "w") as target:
            def send(request):
                target.write(json.dumps(request, ensure_ascii=False) + "\n")
                target.flush()

            def drive():
                try:
                    output.wait_record(lambda r: r.get("ready") is True)
                    send({"id": 1, "kind": "lab_details", "labStreaming": True,
                          "japanese": japanese, "history": []})
                    if not generation_waiting.wait(3):
                        raise AssertionError("main did not start the optional generation")
                    send({"kind": "cancel_lab_details", "target": 1})
                    # A primary request can be queued while the main generator
                    # is still unwinding; the reader itself never executes it.
                    send({"id": 2, "kind": "readings", "texts": ["はい"]})
                    output.wait_record(lambda r: r.get("id") == 1)
                    output.wait_record(lambda r: r.get("id") == 2)
                except BaseException as error:
                    driver_errors.append(error)
                finally:
                    target.close()  # EOF lets the real main dispatch terminate.

            driver = Thread(target=drive, name="test-jsonl-client", daemon=True)
            with patch.dict(sys.modules, fake_modules), patch.object(sys, "stdin", source), \
                    patch.object(conversation_worker, "RequestInbox", ObservedInbox), \
                    redirect_stdout(output), redirect_stderr(StringIO()):
                driver.start()
                conversation_worker.main()
                driver.join(3)
            self.assertFalse(driver.is_alive())
        self.assertEqual(driver_errors, [])
        records = [r for r in output.records if "id" in r]
        self.assertEqual([r["id"] for r in records], [1, 2])
        self.assertIs(records[0].get("cancelled"), True)
        self.assertNotIn("result", records[0])
        self.assertNotIn("error", records[0])
        self.assertEqual(records[1].get("result"), ["hai"])
        self.assertNotIn("error", records[1])
        self.assertEqual(len(generations), 1)
        self.assertEqual(generations[0]["max_tokens"], 140)
        self.assertGreater(generations[0]["prefill_step_size"], 0)
        self.assertLessEqual(generations[0]["prefill_step_size"], 128)
        self.assertEqual([item[2] for item in order], [owner] * len(order))
        first = lambda name, identifier=1: next(i for i, item in enumerate(order) if item[:2] == (name, identifier))
        self.assertLess(first("stream_closed"), first("sync"))
        self.assertLess(first("sync"), first("done"))
        self.assertLess(first("done"), first("ack"))
        self.assertLess(first("ack"), first("reading", 2))
        self.assertLess(first("reading", 2), first("ack", 2))

    def test_cancellation_after_a_partial_token_synchronizes_before_ack_and_allows_readings(self):
        self.exercise("token")

    def test_prefill_progress_cancellation_has_no_partial_result_and_releases_main_thread(self):
        self.exercise("prefill")


if __name__ == "__main__":
    unittest.main()
