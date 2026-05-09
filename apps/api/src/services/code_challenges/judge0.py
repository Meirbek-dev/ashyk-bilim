"""Judge0 code execution adapter.

Provides a canonical async interface for running student code against test cases.
All Judge0 outages surface as ``Judge0DegradedError`` so callers can return a
DEGRADED run state instead of propagating infrastructure failures to students.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from config.config import get_settings

logger = logging.getLogger(__name__)


class Judge0DegradedError(Exception):
    """Raised when Judge0 is unavailable or returns an unexpected error."""


def _get_judge0_base_url() -> str:
    settings = get_settings()
    return getattr(settings, "judge0_base_url", "http://localhost:2358")


def _get_judge0_api_key() -> str | None:
    settings = get_settings()
    return getattr(settings, "judge0_api_key", None)


def _make_client() -> httpx.AsyncClient:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    api_key = _get_judge0_api_key()
    if api_key:
        headers["X-Auth-Token"] = api_key
    return httpx.AsyncClient(
        base_url=_get_judge0_base_url(),
        headers=headers,
        timeout=30.0,
    )


async def _submit_single(
    client: httpx.AsyncClient,
    language_id: int,
    source_code: str,
    stdin: str,
    expected_output: str,
    time_limit: int | None,
    memory_limit: int | None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "language_id": language_id,
        "source_code": source_code,
        "stdin": stdin,
        "expected_output": expected_output,
    }
    if time_limit is not None:
        body["cpu_time_limit"] = time_limit
    if memory_limit is not None:
        body["memory_limit"] = memory_limit * 1024  # MB → KB

    try:
        resp = await client.post(
            "/submissions",
            json=body,
            params={"base64_encoded": "false", "wait": "true"},
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.TimeoutException as exc:
        raise Judge0DegradedError("Judge0 request timed out") from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code >= 500:
            raise Judge0DegradedError(
                f"Judge0 returned {exc.response.status_code}"
            ) from exc
        raise


def _extract_status_description(result: dict[str, Any]) -> str:
    status = result.get("status") or {}
    if isinstance(status, dict):
        return str(status.get("description", "")).upper()
    return str(status).upper()


async def run_code(
    *,
    language_id: int,
    source_code: str,
    test_cases: list[dict[str, str]],
    custom_input: str | None = None,
    time_limit: int | None = None,
    memory_limit: int | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Run source_code against provided test cases on Judge0.

    Returns a dict with keys:
        status: str ("DONE" | "COMPILE_ERROR" | "RUNTIME_ERROR" | "TIMEOUT")
        passed: int
        total: int
        score: float (0–100)
        stdout: str | None   (stdout from last test)
        stderr: str | None   (stderr from last test)
        compile_output: str | None
        time: float | None   (seconds)
        memory: int | None   (KB)
        details: list[dict]  (per-test results)

    Raises:
        Judge0DegradedError — when Judge0 is unavailable or returns 5xx.
    """
    if not test_cases and custom_input is None:
        return {
            "status": "DONE",
            "passed": 0,
            "total": 0,
            "score": None,
            "stdout": None,
            "stderr": None,
            "compile_output": None,
            "time": None,
            "memory": None,
            "details": [],
        }

    if custom_input is not None:
        # Single custom run — not scored
        test_cases = [{"id": "custom", "input": custom_input, "expected_output": ""}]

    async with _make_client() as client:
        tasks = [
            _submit_single(
                client=client,
                language_id=language_id,
                source_code=source_code,
                stdin=tc["input"],
                expected_output=tc.get("expected_output", ""),
                time_limit=time_limit,
                memory_limit=memory_limit,
            )
            for tc in test_cases
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    details: list[dict[str, Any]] = []
    passed = 0
    total = len(test_cases)
    last_stdout: str | None = None
    last_stderr: str | None = None
    compile_output: str | None = None
    last_time: float | None = None
    last_memory: int | None = None
    overall_status = "DONE"

    for tc, result in zip(test_cases, results, strict=False):
        if isinstance(result, Judge0DegradedError):
            raise result
        if isinstance(result, Exception):
            raise Judge0DegradedError(f"Unexpected runner error: {result}") from result

        desc = _extract_status_description(result)
        co = result.get("compile_output") or ""
        if co:
            compile_output = co

        if "COMPILE" in desc:
            overall_status = "COMPILE_ERROR"
            details.append({
                "test_id": tc.get("id", ""),
                "passed": False,
                "actual": None,
                "time": None,
                "memory": None,
            })
            break

        tc_passed = desc == "ACCEPTED"
        if "TIME" in desc:
            overall_status = "TIMEOUT"
        elif "RUNTIME" in desc or "SIGNAL" in desc:
            if overall_status == "DONE":
                overall_status = "RUNTIME_ERROR"

        if tc_passed:
            passed += 1

        stdout = result.get("stdout") or ""
        stderr = result.get("stderr") or ""
        t = result.get("time")
        mem = result.get("memory")
        last_stdout = stdout
        last_stderr = stderr
        last_time = float(t) if t is not None else None
        last_memory = int(mem) if mem is not None else None

        details.append({
            "test_id": tc.get("id", ""),
            "passed": tc_passed,
            "actual": stdout.strip(),
            "time": last_time,
            "memory": last_memory,
        })

    score = round(passed / total * 100, 2) if total > 0 and custom_input is None else None
    return {
        "status": overall_status,
        "passed": passed,
        "total": total,
        "score": score,
        "stdout": last_stdout,
        "stderr": last_stderr,
        "compile_output": compile_output,
        "time": last_time,
        "memory": last_memory,
        "details": details,
    }
