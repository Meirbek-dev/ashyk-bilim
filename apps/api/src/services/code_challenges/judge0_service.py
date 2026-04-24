"""
Judge0 Service

Handles all interactions with the Judge0 code execution API.
"""

import asyncio
import base64
import hashlib
import logging
from typing import Any

import httpx

from config.config import get_settings
from src.db.courses.code_challenges import (
    CustomTestResponse,
    Judge0Language,
    Judge0Status,
    TestCase,
    TestCaseResult,
)

logger = logging.getLogger(__name__)

# Configuration
JUDGE0_TIMEOUT = 30.0
JUDGE0_MAX_RETRIES = 4
JUDGE0_POLL_INTERVAL = 0.5  # seconds
JUDGE0_MAX_BATCH_SIZE = 20


class Judge0Error(Exception):
    """Base exception for Judge0 errors"""


class Judge0UnavailableError(Judge0Error):
    """Judge0 service is unavailable"""


class Judge0Service:
    """Service for interacting with Judge0 API"""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or get_settings().integrations.judge0.base_url

    async def health_check(self) -> bool:
        """Check if Judge0 is available"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/config_info")
                return response.status_code == 200
        except Exception as e:
            logger.exception(f"Judge0 health check failed: {e}")
            return False

    async def get_languages(self) -> list[Judge0Language]:
        """Fetch available languages from Judge0"""
        try:
            async with httpx.AsyncClient(timeout=JUDGE0_TIMEOUT) as client:
                response = await client.get(f"{self.base_url}/languages")
                response.raise_for_status()
                return [Judge0Language(**lang) for lang in response.json()]
        except Exception as e:
            logger.exception(f"Failed to fetch languages: {e}")
            msg = f"Failed to fetch languages: {e}"
            raise Judge0Error(msg)

    async def get_statuses(self) -> dict[int, str]:
        """Fetch status descriptions from Judge0"""
        try:
            async with httpx.AsyncClient(timeout=JUDGE0_TIMEOUT) as client:
                response = await client.get(f"{self.base_url}/statuses")
                response.raise_for_status()
                return {s["id"]: s["description"] for s in response.json()}
        except Exception as e:
            logger.exception(f"Failed to fetch statuses: {e}")
            msg = f"Failed to fetch statuses: {e}"
            raise Judge0Error(msg)

    def _encode_base64(self, text: str) -> str:
        """Encode text to base64"""
        return base64.b64encode(text.encode("utf-8")).decode("utf-8")

    def _decode_base64(self, encoded: str | None) -> str | None:
        """Decode base64 text"""
        if not encoded:
            return None
        try:
            return base64.b64decode(encoded).decode("utf-8")
        except Exception:
            return encoded  # Return as-is if not valid base64

    def _build_submission(
        self,
        source_code: str,
        language_id: int,
        stdin: str = "",
        expected_output: str | None = None,
        time_limit: float | None = None,
        memory_limit: int | None = None,
    ) -> dict[str, Any]:
        """Build a single submission payload"""
        submission = {
            "source_code": self._encode_base64(source_code),
            "language_id": language_id,
            "stdin": self._encode_base64(stdin),
        }

        if expected_output is not None:
            submission["expected_output"] = self._encode_base64(expected_output)

        if time_limit is not None:
            submission["cpu_time_limit"] = time_limit

        if memory_limit is not None:
            submission["memory_limit"] = memory_limit * 1024  # Convert MB to KB

        return submission

    async def create_submission(
        self,
        source_code: str,
        language_id: int,
        stdin: str = "",
        expected_output: str | None = None,
        time_limit: float | None = None,
        memory_limit: int | None = None,
        wait: bool = False,
    ) -> str | dict[str, Any]:
        """
        Create a single submission.

        Args:
            source_code: The source code to execute
            language_id: Judge0 language ID
            stdin: Input to the program
            expected_output: Expected output for comparison
            time_limit: CPU time limit in seconds
            memory_limit: Memory limit in MB
            wait: If True, wait for result synchronously

        Returns:
            If wait=False: submission token
            If wait=True: submission result dict
        """
        submission = self._build_submission(
            source_code, language_id, stdin, expected_output, time_limit, memory_limit
        )

        try:
            async with httpx.AsyncClient(timeout=JUDGE0_TIMEOUT) as client:
                params = {"base64_encoded": "true"}
                if wait:
                    params["wait"] = "true"

                response = await client.post(
                    f"{self.base_url}/submissions",
                    json=submission,
                    params=params,
                )
                response.raise_for_status()
                result = response.json()

                if wait:
                    return self._process_result(result)
                return result["token"]

        except httpx.TimeoutException:
            logger.exception("Judge0 submission timed out")
            msg = "Judge0 request timed out"
            raise Judge0UnavailableError(msg)
        except httpx.HTTPStatusError as e:
            logger.exception(f"Judge0 HTTP error: {e.response.status_code}")
            msg = f"Judge0 HTTP error: {e.response.status_code}"
            raise Judge0Error(msg)
        except Exception as e:
            logger.exception(f"Judge0 submission failed: {e}")
            msg = f"Judge0 submission failed: {e}"
            raise Judge0Error(msg)

    async def create_batch_submission(
        self,
        submissions: list[dict[str, Any]],
    ) -> list[str]:
        """
        Create batch submission for multiple test cases.

        Args:
            submissions: List of submission dicts with source_code, language_id, stdin, etc.

        Returns:
            List of submission tokens
        """
        if len(submissions) > JUDGE0_MAX_BATCH_SIZE:
            msg = f"Batch size exceeds maximum of {JUDGE0_MAX_BATCH_SIZE}"
            raise ValueError(msg)

        try:
            async with httpx.AsyncClient(timeout=JUDGE0_TIMEOUT) as client:
                response = await client.post(
                    f"{self.base_url}/submissions/batch",
                    json={"submissions": submissions},
                    params={"base64_encoded": "true"},
                )
                response.raise_for_status()
                return [s["token"] for s in response.json()]

        except httpx.TimeoutException:
            logger.exception("Judge0 batch submission timed out")
            msg = "Judge0 request timed out"
            raise Judge0UnavailableError(msg)
        except Exception as e:
            logger.exception(f"Judge0 batch submission failed: {e}")
            msg = f"Judge0 batch submission failed: {e}"
            raise Judge0Error(msg)

    async def get_submission(self, token: str) -> dict[str, Any]:
        """Get submission result by token"""
        try:
            async with httpx.AsyncClient(timeout=JUDGE0_TIMEOUT) as client:
                response = await client.get(
                    f"{self.base_url}/submissions/{token}",
                    params={"base64_encoded": "true"},
                )
                response.raise_for_status()
                return self._process_result(response.json())

        except Exception as e:
            logger.exception(f"Failed to get submission {token}: {e}")
            msg = f"Failed to get submission: {e}"
            raise Judge0Error(msg)

    async def get_batch_submissions(self, tokens: list[str]) -> list[dict[str, Any]]:
        """Get multiple submission results"""
        try:
            async with httpx.AsyncClient(timeout=JUDGE0_TIMEOUT) as client:
                response = await client.get(
                    f"{self.base_url}/submissions/batch",
                    params={
                        "tokens": ",".join(tokens),
                        "base64_encoded": "true",
                    },
                )
                response.raise_for_status()
                data = response.json()
                return [self._process_result(s) for s in data.get("submissions", [])]

        except Exception as e:
            logger.exception(f"Failed to get batch submissions: {e}")
            msg = f"Failed to get batch submissions: {e}"
            raise Judge0Error(msg)

    def _process_result(self, result: dict[str, Any]) -> dict[str, Any]:
        """Process and decode a submission result"""
        return {
            "token": result.get("token"),
            "status": result.get("status", {}),
            "time": result.get("time"),
            "memory": result.get("memory"),
            "stdout": self._decode_base64(result.get("stdout")),
            "stderr": self._decode_base64(result.get("stderr")),
            "compile_output": self._decode_base64(result.get("compile_output")),
            "message": self._decode_base64(result.get("message")),
        }

    async def poll_submission(
        self,
        token: str,
        max_retries: int = JUDGE0_MAX_RETRIES,
    ) -> dict[str, Any]:
        """Poll for submission result with exponential backoff"""
        delay = JUDGE0_POLL_INTERVAL

        for attempt in range(max_retries + 1):
            result = await self.get_submission(token)
            status_id = result.get("status", {}).get("id", 0)

            if Judge0Status.from_code(status_id).is_finished:
                return result

            if attempt < max_retries:
                await asyncio.sleep(delay)
                delay = min(delay * 2, 4.0)  # Max 4 second delay

        # Return last result even if not finished
        return result

    async def poll_batch_submissions(
        self,
        tokens: list[str],
        max_retries: int = JUDGE0_MAX_RETRIES,
        stop_on_failure: bool = False,
    ) -> list[dict[str, Any]]:
        """
        Poll for batch submission results.

        Args:
            tokens: List of submission tokens
            max_retries: Maximum polling attempts
            stop_on_failure: If True, stop polling when first failure is detected

        Returns:
            List of submission results
        """
        delay = JUDGE0_POLL_INTERVAL
        results = [None] * len(tokens)
        pending = set(range(len(tokens)))

        for attempt in range(max_retries + 1):
            if not pending:
                break

            batch_results = await self.get_batch_submissions([
                tokens[i] for i in pending
            ])

            # Map results back to original indices
            pending_list = list(pending)
            for i, result in enumerate(batch_results):
                original_idx = pending_list[i]
                results[original_idx] = result

                status_id = result.get("status", {}).get("id", 0)
                status = Judge0Status.from_code(status_id)

                if status.is_finished:
                    pending.discard(original_idx)

                    # Check for failure in stop_on_failure mode
                    if stop_on_failure and status.is_error:
                        logger.info(f"Stopping on failure at test {original_idx}")
                        return [r for r in results if r is not None]

            if pending and attempt < max_retries:
                await asyncio.sleep(delay)
                delay = min(delay * 2, 4.0)

        return [r for r in results if r is not None]

    async def run_test_cases(
        self,
        source_code: str,
        language_id: int,
        test_cases: list[TestCase],
        time_limit: float = 5.0,
        memory_limit: int = 256,
        stop_on_failure: bool = False,
    ) -> list[TestCaseResult]:
        """
        Run source code against test cases.

        Args:
            source_code: The source code to execute
            language_id: Judge0 language ID
            test_cases: List of test cases to run
            time_limit: CPU time limit per test (seconds)
            memory_limit: Memory limit (MB)
            stop_on_failure: Stop on first failure

        Returns:
            List of test case results
        """
        if not test_cases:
            return []

        # Build submissions for each test case
        submissions = []
        for tc in test_cases:
            tc_time_limit = tc.time_limit_override or time_limit
            submissions.append(
                self._build_submission(
                    source_code,
                    language_id,
                    tc.input,
                    tc.expected_output,
                    tc_time_limit,
                    memory_limit,
                )
            )

        # Handle batch size limits
        all_results = []
        for i in range(0, len(submissions), JUDGE0_MAX_BATCH_SIZE):
            batch = submissions[i : i + JUDGE0_MAX_BATCH_SIZE]
            batch_test_cases = test_cases[i : i + JUDGE0_MAX_BATCH_SIZE]

            # Create batch submission
            tokens = await self.create_batch_submission(batch)

            # Poll for results
            raw_results = await self.poll_batch_submissions(
                tokens, stop_on_failure=stop_on_failure
            )

            # Convert to TestCaseResult
            for tc, raw in zip(batch_test_cases, raw_results, strict=False):
                status = raw.get("status", {})
                status_id = status.get("id", 0)

                result = TestCaseResult(
                    test_case_id=tc.id,
                    status=status_id,
                    status_description=status.get("description", "Unknown"),
                    passed=status_id == Judge0Status.ACCEPTED.value,
                    time_ms=float(raw.get("time") or 0) * 1000
                    if raw.get("time")
                    else None,
                    memory_kb=float(raw.get("memory") or 0)
                    if raw.get("memory")
                    else None,
                    stdout=raw.get("stdout"),
                    stderr=raw.get("stderr"),
                    compile_output=raw.get("compile_output"),
                    message=raw.get("message"),
                )
                all_results.append(result)

                # Check for early stop
                if stop_on_failure and not result.passed:
                    return all_results

        return all_results

    async def run_custom_test(
        self,
        source_code: str,
        language_id: int,
        stdin: str,
        time_limit: float = 5.0,
        memory_limit: int = 256,
    ) -> CustomTestResponse:
        """
        Run source code with custom input (no expected output comparison).

        Args:
            source_code: The source code to execute
            language_id: Judge0 language ID
            stdin: Custom input
            time_limit: CPU time limit (seconds)
            memory_limit: Memory limit (MB)

        Returns:
            CustomTestResponse with execution results
        """
        result = await self.create_submission(
            source_code,
            language_id,
            stdin,
            expected_output=None,
            time_limit=time_limit,
            memory_limit=memory_limit,
            wait=True,  # Synchronous for custom tests
        )

        status = result.get("status", {})

        return CustomTestResponse(
            status=status.get("id", 0),
            status_description=status.get("description", "Unknown"),
            stdout=result.get("stdout"),
            stderr=result.get("stderr"),
            compile_output=result.get("compile_output"),
            time_ms=float(result.get("time") or 0) * 1000
            if result.get("time")
            else None,
            memory_kb=float(result.get("memory") or 0)
            if result.get("memory")
            else None,
        )


def get_submission_cache_key(source_code: str, language_id: int, stdin: str) -> str:
    """Generate cache key for submission results"""
    content = f"{source_code}:{language_id}:{stdin}"
    return f"code_challenge:submission:{hashlib.sha256(content.encode()).hexdigest()}"
