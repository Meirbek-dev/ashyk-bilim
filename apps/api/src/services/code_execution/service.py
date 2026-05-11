"""Judge0 SDK backed execution service for canonical code challenges."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import judge0
from fastapi import HTTPException, status
from sqlmodel import Session, select
from ulid import ULID

from config.config import get_settings
from src.db.assessments import CodeRunTestResult, CodeTestCase
from src.db.code_execution import CodeRun, CodeRunCase, CodeRunPurpose, CodeRunStatus

logger = logging.getLogger(__name__)


class CodeExecutionDegradedError(Exception):
    """Raised when Judge0 cannot accept or complete a run."""


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

    def grading_details(self) -> list[dict[str, Any]]:
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

    def metadata_record(self, *, language_id: int) -> dict[str, Any]:
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
        self._lock = threading.Lock()

    def get_client(self) -> judge0.Client:
        settings = get_settings().integrations.judge0
        headers: dict[str, str] = {}
        if settings.api_key:
            headers["X-Auth-Token"] = settings.api_key

        with self._lock:
            if self._client is None:
                self._client = judge0.Client(
                    endpoint=settings.base_url,
                    headers=headers,
                    retry_strategy=judge0.MaxWaitTime(settings.poll_max_wait_seconds),
                )
            return self._client


class CodeExecutionService:
    def __init__(self, client_factory: Judge0SdkClientFactory | None = None) -> None:
        self._client_factory = client_factory or Judge0SdkClientFactory()

    async def list_languages(self) -> list[dict[str, object]]:
        try:
            return await asyncio.to_thread(self._list_languages_sync)
        except Exception as exc:
            logger.warning(
                "ASSESSMENT_SUPPORT_ALERT Judge0 language discovery failed: %s", exc
            )
            return []

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
        self._validate_payload(source_code=source_code, custom_input=custom_input)
        existing = self._find_idempotent_run(
            db_session,
            user_id=user_id,
            item_uuid=item_uuid,
            purpose=purpose,
            idempotency_key=idempotency_key,
            source_sha256=_sha256(source_code),
            stdin_sha256=_sha256(custom_input or "")
            if custom_input is not None
            else None,
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
            stdin_sha256=_sha256(custom_input or "")
            if custom_input is not None
            else None,
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
            logger.warning(
                "ASSESSMENT_SUPPORT_ALERT Judge0 execution degraded: %s", exc
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
        return [
            {
                "id": language.id,
                "name": language.name,
                "is_archived": language.is_archived is True,
                "monaco_language": monaco_language_for(language.name),
            }
            for language in client.languages
            if language.is_archived is not True
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
        client = self._client_factory.get_client()
        submissions = judge0.run(
            client=client,
            source_code=source_code,
            language=language_id,
            test_cases=[
                judge0.TestCase(test.input, test.expected_output if scored else None)
                for test in test_cases
            ],
            cpu_time_limit=float(time_limit_seconds) if time_limit_seconds else None,
            memory_limit=memory_limit_mb * 1024 if memory_limit_mb else None,
        )
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
            if (
                case_status != CodeRunStatus.ACCEPTED
                and overall_status == CodeRunStatus.ACCEPTED
            ):
                overall_status = case_status
            case_passed = case_status == CodeRunStatus.ACCEPTED if scored else True
            if case_passed and scored:
                passed += 1
            stdout = submission.stdout
            stderr = submission.stderr
            compile_output = submission.compile_output
            time_value = float(submission.time) if submission.time is not None else None
            memory_value = (
                int(submission.memory) if submission.memory is not None else None
            )
            details.append(
                CodeExecutionCaseResult(
                    test_id=test.id,
                    passed=case_passed,
                    is_visible=test.is_visible,
                    stdin=test.input if test.is_visible else None,
                    expected=test.expected_output if test.is_visible else None,
                    actual=(submission.stdout or "").strip()
                    if test.is_visible
                    else None,
                    stdout=submission.stdout,
                    stderr=submission.stderr,
                    compile_output=submission.compile_output,
                    message=submission.message,
                    status_id=int(submission.status)
                    if submission.status is not None
                    else None,
                    status_description=str(submission.status)
                    if submission.status is not None
                    else "",
                    judge0_token=str(submission.token)
                    if submission.token is not None
                    else None,
                    time=time_value,
                    memory=memory_value,
                    weight=float(test.weight or 1),
                    description=test.description or "",
                )
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
        if (
            custom_input is not None
            and len(custom_input.encode()) > settings.max_stdin_bytes
        ):
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Custom input exceeds the configured size limit",
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
        return existing

    def _result_from_db(self, db_session: Session, run: CodeRun) -> CodeExecutionResult:
        cases = db_session.exec(
            select(CodeRunCase)
            .where(CodeRunCase.run_uuid == run.run_uuid)
            .order_by(CodeRunCase.id)
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


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


_service = CodeExecutionService()


def get_code_execution_service() -> CodeExecutionService:
    return _service
