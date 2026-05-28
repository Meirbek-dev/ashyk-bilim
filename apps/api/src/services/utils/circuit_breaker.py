import asyncio
import logging
import threading
import time
from collections.abc import Awaitable, Callable
from typing import ParamSpec, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")
P = ParamSpec("P")


class CircuitBreakerOpenException(Exception):
    """Exception raised when a call is attempted on an open circuit breaker."""


class CircuitBreaker:
    """
    A generic Circuit Breaker implementation supporting both sync and async execution paths.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        expected_exceptions: tuple[type[BaseException], ...] = (Exception,),
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exceptions = expected_exceptions

        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
        self.failures = 0
        self.last_failure_time: float | None = None
        self._lock = asyncio.Lock()
        self._sync_lock = threading.Lock()

    def _before_call(self) -> None:
        now = time.monotonic()
        if self.state == "OPEN":
            if self.last_failure_time and (now - self.last_failure_time) > self.recovery_timeout:
                self.state = "HALF_OPEN"
                logger.info("Circuit breaker %s entered HALF_OPEN state", self.name)
            else:
                msg = f"Circuit breaker {self.name} is OPEN"
                raise CircuitBreakerOpenException(msg)

    def _on_success(self) -> None:
        if self.state == "HALF_OPEN":
            self.state = "CLOSED"
            self.failures = 0
            logger.info(
                "Circuit breaker %s entered CLOSED state after successful test",
                self.name,
            )
        elif self.state == "CLOSED":
            self.failures = 0

    def _on_failure(self, exc: BaseException) -> None:
        if isinstance(exc, self.expected_exceptions):
            self.failures += 1
            self.last_failure_time = time.monotonic()
            if self.state == "HALF_OPEN" or self.failures >= self.failure_threshold:
                self.state = "OPEN"
                logger.warning(
                    "Circuit breaker %s entered OPEN state after %d failures. Last exception: %s",
                    self.name,
                    self.failures,
                    str(exc),
                )
        raise exc

    def call(self, func: Callable[P, T], *args: P.args, **kwargs: P.kwargs) -> T:
        """Execute a synchronous function wrapped by the circuit breaker."""
        with self._sync_lock:
            self._before_call()
        try:
            result = func(*args, **kwargs)
            with self._sync_lock:
                self._on_success()
            return result
        except BaseException as exc:
            with self._sync_lock:
                self._on_failure(exc)
            raise

    async def call_async(self, func: Callable[P, Awaitable[T]], *args: P.args, **kwargs: P.kwargs) -> T:
        """Execute an asynchronous function wrapped by the circuit breaker."""
        async with self._lock:
            self._before_call()
        try:
            result = await func(*args, **kwargs)
            async with self._lock:
                self._on_success()
            return result
        except BaseException as exc:
            async with self._lock:
                self._on_failure(exc)
            raise
