"""Judge0 SDK backed execution service for canonical code challenges."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import override
from urllib.parse import SplitResult, urlsplit, urlunsplit

import httpx
from fastapi import HTTPException, status
from judge0.clients import __version__ as JUDGE0_SDK_VERSION  # noqa: N812
from sqlmodel import Session, select
from ulid import ULID

import judge0
from config.config import get_settings, secret_value
from src.db.assessments import CodeRunTestResult, CodeTestCase
from src.db.code_execution import CodeRun, CodeRunCase, CodeRunPurpose, CodeRunStatus
from src.services.utils.circuit_breaker import CircuitBreaker
from src.types import JsonObject

logger = logging.getLogger(__name__)
judge0_breaker = CircuitBreaker("judge0", failure_threshold=5, recovery_timeout=30.0)
_OUTPUT_TRUNCATION_MARKER = "\n[output truncated]"
_JVM_LANGUAGE_IDS = frozenset({26, 27, 28, 62, 78})
_GO_LANGUAGE_IDS = frozenset({22, 60})
_JVM_MIN_MEMORY_LIMIT_KB = 1536 * 1024
_GO_MIN_MEMORY_LIMIT_KB = 512 * 1024
_MANAGED_RUNTIME_STACK_LIMIT_KB = 64 * 1024
_MANAGED_RUNTIME_MAX_PROCESSES_AND_THREADS = 128
_JAVA_COMPILER_OPTIONS = (
    "-J-Xmx96m -J-Xms16m -J-XX:MaxMetaspaceSize=96m "
    "-J-XX:CompressedClassSpaceSize=16m -J-XX:ReservedCodeCacheSize=16m "
    "-J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1"
)
_JAVA_7_COMPILER_OPTIONS = (
    "-J-Xmx96m -J-Xms16m -J-XX:MaxPermSize=96m "
    "-J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC "
    "-J-XX:TieredStopAtLevel=1"
)
_KOTLIN_COMPILER_OPTIONS = (
    "-J-Xmx512m -J-Xms64m -J-XX:MaxMetaspaceSize=256m "
    "-J-XX:CompressedClassSpaceSize=64m -J-XX:ReservedCodeCacheSize=64m "
    "-J-XX:+UseSerialGC"
)
_IDEMPOTENT_REUSE_STATUSES = frozenset({
    CodeRunStatus.ACCEPTED,
    CodeRunStatus.WRONG_ANSWER,
})


def _compare_output(actual: str | None, expected: str | None, match_mode: str) -> bool:
    act = (actual or "").strip("\r\n")
    exp = (expected or "").strip("\r\n")
    if match_mode == "EXACT":
        return act == exp
    if match_mode == "TRIMMED":
        return act.strip() == exp.strip()
    if match_mode == "IGNORE_WHITESPACE":
        return "".join(act.split()) == "".join(exp.split())
    if match_mode == "NUMERIC_TOLERANCE":
        act_tokens = act.split()
        exp_tokens = exp.split()
        if len(act_tokens) != len(exp_tokens):
            return False
        for a, e in zip(act_tokens, exp_tokens, strict=False):
            try:
                af = float(a)
                ef = float(e)
                if abs(af - ef) > 1e-6:
                    return False
            except ValueError:
                if a != e:
                    return False
        return True
    return act == exp


class CodeExecutionDegradedError(Exception):
    """Raised when Judge0 cannot accept or complete a run."""


@dataclass(frozen=True)
class Judge0SandboxPolicy:
    memory_limit_kb: int | None
    stack_limit_kb: int | None = None
    max_processes_and_or_threads: int | None = None


@dataclass(frozen=True)
class CodeExecutionCaseResult:
    test_id: str
    passed: bool
    is_visible: bool
    stdin: str | None
    expected: str | None
    actual: str | None
    stdout: str | None
    stderr: str | None
    compile_output: str | None
    message: str | None
    status_id: int | None
    status_description: str
    judge0_token: str | None
    time: float | None
    memory: int | None
    weight: float
    description: str


@dataclass(frozen=True)
class CodeExecutionResult:
    run_uuid: str
    status: CodeRunStatus
    passed: int
    total: int
    score: float | None
    stdout: str | None
    stderr: str | None
    compile_output: str | None
    time: float | None
    memory: int | None
    details: list[CodeExecutionCaseResult]
    error_message: str | None = None

    def visible_response_results(self) -> list[CodeRunTestResult]:
        return [
            CodeRunTestResult(
                test_id=result.test_id,
                passed=result.passed,
                status_id=result.status_id,
                status_description=result.status_description,
                description=result.description,
                weight=result.weight,
                stdin=result.stdin,
                expected=result.expected,
                actual=result.actual,
                is_visible=True,
                time=result.time,
                memory=result.memory,
            )
            for result in self.details
            if result.is_visible
        ]

    def grading_details(self) -> list[JsonObject]:
        return [
            {
                "test_id": result.test_id,
                "passed": result.passed,
                "weight": result.weight,
                "description": result.description,
                "message": result.message or result.status_description,
                "is_visible": result.is_visible,
                "actual": result.actual if result.is_visible else None,
                "time": result.time,
                "memory": result.memory,
            }
            for result in self.details
        ]

    def metadata_record(self, *, language_id: int) -> JsonObject:
        return {
            "run_id": self.run_uuid,
            "language_id": language_id,
            "status": self.status.value,
            "passed": self.passed,
            "total": self.total,
            "score": self.score,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "compile_output": self.compile_output,
            "time": self.time,
            "memory": self.memory,
            "details": self.grading_details(),
            "created_at": datetime.now(UTC).isoformat(),
        }


class Judge0SdkClientFactory:
    """Creates and caches the official Judge0 SDK client."""

    def __init__(self) -> None:
        self._client: judge0.Client | None = None
        self._fingerprint: tuple[object, ...] | None = None
        self._lock = threading.Lock()

    def get_client(self) -> judge0.Client:
        settings = get_settings().integrations.judge0
        headers: dict[str, str] = {}
        api_key = secret_value(settings.api_key)
        if api_key:
            headers["X-Auth-Token"] = api_key

        fingerprint = (
            settings.base_url,
            api_key,
            settings.request_timeout_seconds,
            settings.poll_interval_seconds,
            settings.poll_max_wait_seconds,
        )
        with self._lock:
            if self._client is None or self._fingerprint != fingerprint:
                if self._client is not None:
                    self._client.client.close()
                self._client = self._create_client(
                    base_url=settings.base_url,
                    headers=headers,
                    timeout_seconds=settings.request_timeout_seconds,
                    poll_interval_seconds=settings.poll_interval_seconds,
                    poll_max_wait_seconds=settings.poll_max_wait_seconds,
                )
                self._fingerprint = fingerprint
            return self._client

    def _create_client(
        self,
        *,
        base_url: str,
        headers: dict[str, str],
        timeout_seconds: float,
        poll_interval_seconds: float,
        poll_max_wait_seconds: float,
    ) -> judge0.Client:
        last_error: Exception | None = None
        for endpoint in _judge0_endpoint_candidates(base_url):
            try:
                return _ConfiguredJudge0Client(
                    endpoint=endpoint,
                    headers=headers,
                    timeout_seconds=timeout_seconds,
                    poll_interval_seconds=poll_interval_seconds,
                    poll_max_wait_seconds=poll_max_wait_seconds,
                )
            except Exception as exc:
                last_error = exc
                logger.info("Judge0 endpoint unavailable: %s", endpoint)

        msg = "Judge0 client initialization failed"
        raise RuntimeError(msg) from last_error

    def close(self) -> None:
        with self._lock:
            if self._client is not None:
                self._client.client.close()
            self._client = None
            self._fingerprint = None


class _ConfiguredJudge0Client(judge0.Client):  # type: ignore[misc]
    def __init__(
        self,
        endpoint: str,
        headers: dict[str, str] | None = None,
        *,
        timeout_seconds: float,
        poll_interval_seconds: float,
        poll_max_wait_seconds: float,
    ) -> None:
        self.endpoint = endpoint
        self.headers = headers or {}
        self.headers.update({
            "X-Judge0-App": "Judge0 Python SDK",
            "X-Judge0-App-Version": JUDGE0_SDK_VERSION,
        })
        self._poll_interval_seconds = poll_interval_seconds
        self._poll_max_wait_seconds = poll_max_wait_seconds
        self.client = httpx.Client(
            base_url=self.endpoint,
            timeout=httpx.Timeout(timeout_seconds),
        )

        try:
            self.languages = self.get_languages()
            self.config = self.get_config_info()
        except Exception as exc:
            self.client.close()
            msg = "Judge0 client initialization failed"
            raise RuntimeError(msg) from exc

    @property
    @override
    def retry_strategy(self) -> _BoundedIntervalRetry:
        return _BoundedIntervalRetry(
            poll_interval_seconds=self._poll_interval_seconds,
            max_wait_seconds=self._poll_max_wait_seconds,
        )

    @retry_strategy.setter
    @override
    def retry_strategy(self, _value: _BoundedIntervalRetry) -> None:
        return


class _BoundedIntervalRetry:
    def __init__(self, *, poll_interval_seconds: float, max_wait_seconds: float) -> None:
        self.poll_interval_seconds = poll_interval_seconds
        self.max_wait_seconds = max_wait_seconds
        self.total_wait_time = 0.0

    def wait(self) -> None:
        time.sleep(self.poll_interval_seconds)

    def step(self) -> None:
        self.total_wait_time += self.poll_interval_seconds

    def is_done(self) -> bool:
        return self.total_wait_time >= self.max_wait_seconds


class CodeExecutionService:
    def __init__(self, client_factory: Judge0SdkClientFactory | None = None) -> None:
        self._client_factory = client_factory or Judge0SdkClientFactory()

    async def list_languages(self) -> list[dict[str, object]]:
        try:
            return await asyncio.to_thread(self._list_languages_sync)
        except Exception as exc:
            logger.warning("ASSESSMENT_SUPPORT_ALERT Judge0 language discovery failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Judge0 is unavailable; code execution languages could not be loaded",
            ) from exc

    def close(self) -> None:
        close = getattr(self._client_factory, "close", None)
        if close is not None:
            close()

    async def run(
        self,
        *,
        db_session: Session,
        assessment_uuid: str,
        item_uuid: str,
        user_id: int,
        purpose: CodeRunPurpose,
        language_id: int,
        source_code: str,
        test_cases: list[CodeTestCase],
        custom_input: str | None = None,
        submission_uuid: str | None = None,
        idempotency_key: str | None = None,
        time_limit_seconds: int | None = None,
        memory_limit_mb: int | None = None,
    ) -> CodeExecutionResult:
        self._validate_language(language_id)
        self._validate_payload(source_code=source_code, custom_input=custom_input)
        existing = self._find_idempotent_run(
            db_session,
            user_id=user_id,
            item_uuid=item_uuid,
            purpose=purpose,
            idempotency_key=idempotency_key,
            source_sha256=_sha256(source_code),
            stdin_sha256=_sha256(custom_input or "") if custom_input is not None else None,
            language_id=language_id,
        )
        if existing is not None:
            return self._result_from_db(db_session, existing)

        run_uuid = f"code_run_{ULID()}"
        tests = (
            [
                CodeTestCase(
                    id="custom",
                    input=custom_input or "",
                    expected_output="",
                    is_visible=True,
                )
            ]
            if custom_input is not None
            else test_cases
        )
        run = CodeRun(
            run_uuid=run_uuid,
            assessment_uuid=assessment_uuid,
            item_uuid=item_uuid,
            submission_uuid=submission_uuid,
            user_id=user_id,
            purpose=purpose,
            status=CodeRunStatus.RUNNING,
            language_id=language_id,
            source_sha256=_sha256(source_code),
            stdin_sha256=_sha256(custom_input or "") if custom_input is not None else None,
            idempotency_key=idempotency_key,
            total=len(tests),
            started_at=datetime.now(UTC),
        )
        db_session.add(run)
        db_session.commit()
        db_session.refresh(run)

        try:
            result = await asyncio.to_thread(
                self._execute_sync,
                run_uuid=run_uuid,
                language_id=language_id,
                source_code=source_code,
                test_cases=tests,
                scored=custom_input is None,
                time_limit_seconds=time_limit_seconds,
                memory_limit_mb=memory_limit_mb,
            )
        except Exception as exc:
            logger.warning("ASSESSMENT_SUPPORT_ALERT Judge0 execution degraded: %s", exc)
            logger.info(
                "judge0_execution_metrics run_uuid=%s language_id=%s degraded=true",
                run_uuid,
                language_id,
            )
            result = CodeExecutionResult(
                run_uuid=run_uuid,
                status=CodeRunStatus.DEGRADED,
                passed=0,
                total=len(tests),
                score=None,
                stdout=None,
                stderr=None,
                compile_output=None,
                time=None,
                memory=None,
                details=[],
                error_message=str(exc),
            )

        self._persist_result(db_session, run, result)
        return result

    def get_run(
        self,
        *,
        db_session: Session,
        run_uuid: str,
        user_id: int,
        item_uuid: str,
    ) -> CodeExecutionResult | None:
        run = db_session.exec(
            select(CodeRun).where(
                CodeRun.run_uuid == run_uuid,
                CodeRun.user_id == user_id,
                CodeRun.item_uuid == item_uuid,
            )
        ).first()
        return None if run is None else self._result_from_db(db_session, run)

    def _list_languages_sync(self) -> list[dict[str, object]]:
        client = self._client_factory.get_client()
        settings = get_settings().integrations.judge0
        allowed = set(settings.allowed_language_ids)
        languages = client.languages or []
        return [
            {
                "id": language.id,
                "name": language.name,
                "is_archived": language.is_archived is True,
                "monaco_language": monaco_language_for(language.name),
            }
            for language in languages
            if language.is_archived is not True and (not allowed or int(language.id) in allowed)
        ]

    def _execute_sync(
        self,
        *,
        run_uuid: str,
        language_id: int,
        source_code: str,
        test_cases: list[CodeTestCase],
        scored: bool,
        time_limit_seconds: int | None,
        memory_limit_mb: int | None,
    ) -> CodeExecutionResult:
        settings = get_settings().integrations.judge0
        client = self._client_factory.get_client()
        sandbox_policy = _sandbox_policy_for_language(language_id, memory_limit_mb)
        started_at = time.monotonic()

        def _run_judge0() -> object:
            return judge0.run(
                client=client,
                source_code=source_code,
                language=language_id,
                test_cases=[judge0.TestCase(test.input, None) for test in test_cases],
                cpu_time_limit=float(time_limit_seconds) if time_limit_seconds else None,
                wall_time_limit=float(time_limit_seconds + 1) if time_limit_seconds else None,
                compiler_options=_compiler_options_for_language(language_id),
                memory_limit=sandbox_policy.memory_limit_kb,
                stack_limit=sandbox_policy.stack_limit_kb,
                max_processes_and_or_threads=sandbox_policy.max_processes_and_or_threads,
                enable_per_process_and_thread_time_limit=True,
                enable_per_process_and_thread_memory_limit=True,
                max_file_size=settings.max_output_file_kb,
                enable_network=False,
            )

        submissions = judge0_breaker.call(_run_judge0)
        if isinstance(submissions, judge0.Submission):
            submissions = [submissions]

        details: list[CodeExecutionCaseResult] = []
        passed = 0
        stdout = stderr = compile_output = None
        time_value = None
        memory_value = None
        overall_status = CodeRunStatus.ACCEPTED

        for test, submission in zip(test_cases, submissions, strict=False):
            case_status = normalize_status(submission.status)

            # Extract standard status
            status_id = int(submission.status) if submission.status is not None else None
            status_description = str(submission.status) if submission.status is not None else ""

            if scored and case_status == CodeRunStatus.ACCEPTED:
                match_mode = getattr(test, "match_mode", "EXACT")
                if not _compare_output(submission.stdout, test.expected_output, match_mode):
                    case_status = CodeRunStatus.WRONG_ANSWER
                    case_passed = False
                    status_id = 4
                    status_description = "Wrong Answer"
                else:
                    case_passed = True
                    passed += 1
            else:
                case_passed = case_status == CodeRunStatus.ACCEPTED if scored else True
                if case_passed and scored:
                    passed += 1

            if case_status != CodeRunStatus.ACCEPTED and overall_status == CodeRunStatus.ACCEPTED:
                overall_status = case_status

            stdout = _truncate_output(submission.stdout, settings.max_output_bytes)
            stderr = _truncate_output(submission.stderr, settings.max_output_bytes)
            compile_output = _truncate_output(submission.compile_output, settings.max_output_bytes)
            message = _truncate_output(submission.message, settings.max_output_bytes)
            time_value = float(submission.time) if submission.time is not None else None
            memory_value = int(submission.memory) if submission.memory is not None else None
            details.append(
                CodeExecutionCaseResult(
                    test_id=test.id,
                    passed=case_passed,
                    is_visible=test.is_visible,
                    stdin=test.input if test.is_visible else None,
                    expected=test.expected_output if test.is_visible else None,
                    actual=(stdout or "").strip() if test.is_visible else None,
                    stdout=stdout,
                    stderr=stderr,
                    compile_output=compile_output,
                    message=message,
                    status_id=status_id,
                    status_description=status_description,
                    judge0_token=str(submission.token) if submission.token is not None else None,
                    time=time_value,
                    memory=memory_value,
                    weight=float(test.weight or 1),
                    description=test.description or "",
                )
            )

        elapsed_seconds = time.monotonic() - started_at
        queue_seconds = _max_queue_seconds(submissions)
        logger.info(
            "judge0_execution_metrics run_uuid=%s language_id=%s status=%s "
            "total=%s sdk_elapsed_seconds=%.3f execution_seconds=%s "
            "queue_seconds=%s degraded=false",
            run_uuid,
            language_id,
            overall_status.value,
            len(details),
            elapsed_seconds,
            time_value,
            queue_seconds,
        )

        total = len(test_cases)
        if scored and details:
            total_weight = sum(detail.weight for detail in details) or float(total)
            earned_weight = sum(detail.weight for detail in details if detail.passed)
            score = round(earned_weight / total_weight * 100, 2)
        else:
            score = None
        if scored and passed < total and overall_status == CodeRunStatus.ACCEPTED:
            overall_status = CodeRunStatus.WRONG_ANSWER
        return CodeExecutionResult(
            run_uuid=run_uuid,
            status=overall_status,
            passed=passed if scored else 0,
            total=total,
            score=score,
            stdout=stdout,
            stderr=stderr,
            compile_output=compile_output,
            time=time_value,
            memory=memory_value,
            details=details,
        )

    def _validate_payload(self, *, source_code: str, custom_input: str | None) -> None:
        settings = get_settings().integrations.judge0
        if len(source_code.encode()) > settings.max_source_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Source code exceeds the configured size limit",
            )
        if custom_input is not None and len(custom_input.encode()) > settings.max_stdin_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Custom input exceeds the configured size limit",
            )

    def _validate_language(self, language_id: int) -> None:
        settings = get_settings().integrations.judge0
        if settings.allowed_language_ids and language_id not in settings.allowed_language_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Language is not allowed for code execution",
            )

    def _find_idempotent_run(
        self,
        db_session: Session,
        *,
        user_id: int,
        item_uuid: str,
        purpose: CodeRunPurpose,
        idempotency_key: str | None,
        source_sha256: str,
        stdin_sha256: str | None,
        language_id: int,
    ) -> CodeRun | None:
        if not idempotency_key:
            return None
        existing = db_session.exec(
            select(CodeRun).where(
                CodeRun.user_id == user_id,
                CodeRun.item_uuid == item_uuid,
                CodeRun.purpose == purpose,
                CodeRun.idempotency_key == idempotency_key,
            )
        ).first()
        if existing is None:
            return None
        if (
            existing.source_sha256 != source_sha256
            or existing.stdin_sha256 != stdin_sha256
            or existing.language_id != language_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency key was already used for a different code run",
            )
        if existing.status not in _IDEMPOTENT_REUSE_STATUSES:
            existing.idempotency_key = None
            db_session.add(existing)
            db_session.commit()
            return None
        return existing

    def _result_from_db(self, db_session: Session, run: CodeRun) -> CodeExecutionResult:
        cases = db_session.exec(
            select(CodeRunCase).where(CodeRunCase.run_uuid == run.run_uuid).order_by(CodeRunCase.id)
        ).all()
        details = [
            CodeExecutionCaseResult(
                test_id=case.test_id,
                passed=case.passed,
                is_visible=case.is_visible,
                stdin=case.stdin if case.is_visible else None,
                expected=case.expected_output if case.is_visible else None,
                actual=case.stdout.strip() if case.stdout and case.is_visible else None,
                stdout=case.stdout,
                stderr=case.stderr,
                compile_output=case.compile_output,
                message=case.message,
                status_id=case.status_id,
                status_description=case.status_description,
                judge0_token=case.judge0_token,
                time=case.time_seconds,
                memory=case.memory_kb,
                weight=case.weight,
                description=case.description,
            )
            for case in cases
        ]
        return CodeExecutionResult(
            run_uuid=run.run_uuid,
            status=CodeRunStatus(run.status),
            passed=run.passed,
            total=run.total,
            score=run.score,
            stdout=details[-1].stdout if details else None,
            stderr=details[-1].stderr if details else None,
            compile_output=details[-1].compile_output if details else None,
            time=details[-1].time if details else None,
            memory=details[-1].memory if details else None,
            details=details,
            error_message=run.error_message,
        )

    def _persist_result(
        self,
        db_session: Session,
        run: CodeRun,
        result: CodeExecutionResult,
    ) -> None:
        run.status = result.status
        run.passed = result.passed
        run.total = result.total
        run.score = result.score
        run.error_message = result.error_message
        run.finished_at = datetime.now(UTC)
        db_session.add(run)
        for detail in result.details:
            db_session.add(
                CodeRunCase(
                    run_uuid=run.run_uuid,
                    test_id=detail.test_id,
                    judge0_token=detail.judge0_token,
                    stdin=detail.stdin,
                    expected_output=detail.expected,
                    description=detail.description,
                    weight=detail.weight,
                    is_visible=detail.is_visible,
                    status_id=detail.status_id,
                    status_description=detail.status_description,
                    passed=detail.passed,
                    stdout=detail.stdout,
                    stderr=detail.stderr,
                    compile_output=detail.compile_output,
                    message=detail.message,
                    time_seconds=detail.time,
                    memory_kb=detail.memory,
                )
            )
        db_session.commit()


def _sandbox_policy_for_language(language_id: int, memory_limit_mb: int | None) -> Judge0SandboxPolicy:
    requested_memory_kb = memory_limit_mb * 1024 if memory_limit_mb else None

    if language_id in _JVM_LANGUAGE_IDS:
        return Judge0SandboxPolicy(
            memory_limit_kb=max(requested_memory_kb or 0, _JVM_MIN_MEMORY_LIMIT_KB),
            stack_limit_kb=_MANAGED_RUNTIME_STACK_LIMIT_KB,
            max_processes_and_or_threads=_MANAGED_RUNTIME_MAX_PROCESSES_AND_THREADS,
        )

    if language_id in _GO_LANGUAGE_IDS:
        return Judge0SandboxPolicy(
            memory_limit_kb=max(requested_memory_kb or 0, _GO_MIN_MEMORY_LIMIT_KB),
            stack_limit_kb=_MANAGED_RUNTIME_STACK_LIMIT_KB,
            max_processes_and_or_threads=_MANAGED_RUNTIME_MAX_PROCESSES_AND_THREADS,
        )

    return Judge0SandboxPolicy(memory_limit_kb=requested_memory_kb)


def _compiler_options_for_language(language_id: int) -> str | None:
    if language_id in {27, 62}:
        return _JAVA_COMPILER_OPTIONS
    if language_id == 28:
        return _JAVA_7_COMPILER_OPTIONS
    if language_id == 26:
        return "-J-Xmx96m"
    if language_id == 78:
        return _KOTLIN_COMPILER_OPTIONS
    if language_id in _GO_LANGUAGE_IDS:
        return "-p 1"
    return None


def normalize_status(value: object) -> CodeRunStatus:
    name = getattr(value, "name", None)
    normalized = str(name or value or "").upper()
    if normalized == "ACCEPTED":
        return CodeRunStatus.ACCEPTED
    if "WRONG" in normalized:
        return CodeRunStatus.WRONG_ANSWER
    if "TIME" in normalized:
        return CodeRunStatus.TIME_LIMIT
    if "COMPIL" in normalized:
        return CodeRunStatus.COMPILE_ERROR
    if "RUNTIME" in normalized or "SIGNAL" in normalized or "NZEC" in normalized:
        return CodeRunStatus.RUNTIME_ERROR
    if "IN_QUEUE" in normalized or "QUEUE" in normalized:
        return CodeRunStatus.QUEUED
    if "PROCESS" in normalized:
        return CodeRunStatus.RUNNING
    return CodeRunStatus.INTERNAL_ERROR


def monaco_language_for(name: str) -> str:
    normalized = name.lower()
    if "python" in normalized:
        return "python"
    if "c++" in normalized or "cpp" in normalized:
        return "cpp"
    if normalized.startswith("c ") or "gcc" in normalized or "clang" in normalized:
        return "c"
    if "c#" in normalized or "csharp" in normalized:
        return "csharp"
    if "java " in normalized or "openjdk" in normalized:
        return "java"
    if "javascript" in normalized or "node" in normalized:
        return "javascript"
    if "typescript" in normalized:
        return "typescript"
    if "rust" in normalized:
        return "rust"
    if "sqlite" in normalized or "sql" in normalized:
        return "sql"
    if "php" in normalized:
        return "php"
    if "swift" in normalized:
        return "swift"
    if "go " in normalized or normalized.startswith("go"):
        return "go"
    if "kotlin" in normalized:
        return "kotlin"
    if "ruby" in normalized:
        return "ruby"
    return "plaintext"


def _judge0_endpoint_candidates(base_url: str) -> tuple[str, ...]:
    candidates = [base_url]
    parsed = urlsplit(base_url)
    hostname = parsed.hostname
    if hostname in {"localhost", "127.0.0.1", "::1"}:
        candidates.append(_replace_url_hostname(parsed, "judge0-server"))
    elif hostname == "judge0-server":
        candidates.append(_replace_url_hostname(parsed, "localhost"))

    return tuple(dict.fromkeys(candidates))


def _replace_url_hostname(parsed: SplitResult, hostname: str) -> str:
    netloc = hostname
    if parsed.port is not None:
        netloc = f"{netloc}:{parsed.port}"

    return urlunsplit(parsed._replace(netloc=netloc))


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _truncate_output(value: str | None, max_bytes: int) -> str | None:
    if value is None:
        return None

    encoded = value.encode()
    if len(encoded) <= max_bytes:
        return value

    marker = _OUTPUT_TRUNCATION_MARKER.encode()
    budget = max(0, max_bytes - len(marker))
    return encoded[:budget].decode(errors="ignore") + _OUTPUT_TRUNCATION_MARKER


def _max_queue_seconds(submissions: list[judge0.Submission]) -> float | None:
    queue_times = [
        queue_seconds for submission in submissions if (queue_seconds := _queue_seconds(submission)) is not None
    ]
    return round(max(queue_times), 3) if queue_times else None


def _queue_seconds(submission: judge0.Submission) -> float | None:
    created_at = getattr(submission, "created_at", None)
    finished_at = getattr(submission, "finished_at", None)
    if created_at is None or finished_at is None:
        return None

    total_seconds = (finished_at - created_at).total_seconds()
    run_seconds = float(getattr(submission, "time", None) or 0)
    return max(0.0, total_seconds - run_seconds)


_service = CodeExecutionService()


def get_code_execution_service() -> CodeExecutionService:
    return _service


def close_code_execution_client() -> None:
    _service.close()
