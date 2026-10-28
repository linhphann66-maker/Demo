"""Extension boundary; no artificial AI jobs are created in Phase 1."""
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Callable, Protocol, TypeVar

T = TypeVar('T')

class JobExecutor(Protocol):
    def submit(self, task: Callable[[], T]) -> Future[T]: ...
    def shutdown(self) -> None: ...

class LocalJobExecutor:
    def __init__(self, max_workers: int = 2):
        self.pool = ThreadPoolExecutor(max_workers=max_workers)
    def submit(self, task: Callable[[], T]) -> Future[T]:
        return self.pool.submit(task)
    def shutdown(self) -> None:
        self.pool.shutdown(wait=True, cancel_futures=True)
