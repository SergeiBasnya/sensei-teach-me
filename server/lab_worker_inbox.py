"""Bounded JSONL inbox with cancellation for optional lab details only.

The reader does no inference. It can observe a cancellation while the main
thread is generating, without moving any MLX work to another thread.
"""
from __future__ import annotations

import json
from queue import Empty, Full, Queue
from threading import Event, Lock, Thread


_END = object()


def _request_id(value):
    # JSON booleans are not request IDs. Keep IDs exactly representable in JS.
    return type(value) is int and 0 < value <= 9007199254740991


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate_inbox_key")
        value[key] = item
    return value


class RequestInbox:
    """Yield (request, cancellation_event_or_none) in accepted FIFO order.

    ``done(request)`` runs after all computation/cleanup, immediately before the
    terminal response is emitted. This avoids a fast client sending new work
    after the acknowledgement but before the reader has released its slot. A
    cancellation alone never releases capacity; Node keeps its own in-flight
    slot until it receives the acknowledgement.
    ``on_reject(id_or_none, constant_error_code)`` runs on the reader thread;
    the caller owns serialization and synchronization of protocol output.
    """

    def __init__(self, stream, on_reject, max_pending=2):
        if type(max_pending) is not int or max_pending < 1:
            raise ValueError("invalid_inbox_capacity")
        self._stream = stream
        self._on_reject = on_reject
        self._max_pending = max_pending
        # At most max_pending requests plus one EOF marker can be enqueued.
        self._queue = Queue(maxsize=max_pending + 1)
        self._lock = Lock()
        self._pending = {}
        self._closed = Event()
        self._exhausted = Event()
        self._reader_failed = Event()
        self.reader_done = Event()
        self._thread = Thread(target=self._read, name="lab-jsonl-reader", daemon=True)
        self._thread.start()

    @property
    def pending_count(self):
        with self._lock:
            return len(self._pending)

    def _read(self):
        try:
            for line in self._stream:
                if self._closed.is_set():
                    break
                try:
                    request = json.loads(line, object_pairs_hook=_unique_object)
                except (ValueError, TypeError):
                    self._on_reject(None, "InvalidRequestError")
                    continue
                if not isinstance(request, dict):
                    self._on_reject(None, "InvalidRequestError")
                    continue
                if request.get("kind") == "cancel_lab_details":
                    self._cancel(request)
                    continue
                identifier = request.get("id")
                if not _request_id(identifier):
                    self._on_reject(None, "InvalidRequestError")
                    continue
                rejection = None
                with self._lock:
                    if self._closed.is_set():
                        break
                    if identifier in self._pending:
                        # Do not terminate the original request with this ID.
                        rejection = (None, "DuplicateRequestError")
                    elif len(self._pending) >= self._max_pending:
                        rejection = (identifier, "WorkerBusyError")
                    else:
                        cancellable = (request.get("kind") == "lab_details"
                                       and request.get("labStreaming") is True)
                        event = Event() if cancellable else None
                        item = (request, event)
                        self._pending[identifier] = item
                        # Capacity is enforced above including the active job;
                        # never block here or the reader could miss cancel.
                        try:
                            self._queue.put_nowait(item)
                        except Full:
                            self._pending.pop(identifier, None)
                            rejection = (identifier, "WorkerBusyError")
                if rejection:
                    self._on_reject(*rejection)
        except Exception:
            # A broken stream/emitter is a protocol failure, never a reason to
            # print a request or leave the consumer blocked forever.
            self._reader_failed.set()
        finally:
            self._wake_iterator()
            self.reader_done.set()

    def _cancel(self, message):
        # Controls have no request ID and no terminal response of their own.
        if set(message) != {"kind", "target"} or not _request_id(message.get("target")):
            return
        with self._lock:
            item = self._pending.get(message["target"])
            if item is not None and item[1] is not None:
                item[1].set()

    def _wake_iterator(self):
        # close() may already have inserted an EOF marker. No blocking put.
        try:
            self._queue.put_nowait(_END)
        except Full:
            pass

    def __iter__(self):
        return self

    def __next__(self):
        if self._closed.is_set() or self._exhausted.is_set():
            raise StopIteration
        item = self._queue.get()
        if item is _END or self._closed.is_set():
            self._exhausted.set()
            if self._reader_failed.is_set():
                raise RuntimeError("worker_inbox_reader_failed")
            raise StopIteration
        return item

    def done(self, request):
        identifier = request.get("id")
        with self._lock:
            item = self._pending.get(identifier)
            if item is not None and item[0] is request:
                self._pending.pop(identifier)

    def close(self):
        """Stop accepting work; a blocked stdin reader remains a daemon.

        The owner retains ownership of the input stream. We never close the
        process's stdin from this helper, or wait indefinitely for a read.
        """
        with self._lock:
            self._closed.set()
            for _, event in self._pending.values():
                if event is not None:
                    event.set()
            self._pending.clear()
        for _ in range(self._max_pending + 1):
            try:
                self._queue.get_nowait()
            except Empty:
                break
        self._wake_iterator()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
