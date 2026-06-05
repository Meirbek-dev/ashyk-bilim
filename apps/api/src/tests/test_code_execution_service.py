import pathlib
import sys
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from judge0 import Status

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from collections.abc import Generator
from typing import Never, cast

from src.db.assessments import CodeTestCase
from src.db.code_execution import CodeRun, CodeRunCase, CodeRunPurpose, CodeRunStatus
from src.services.code_execution.service import (
    CodeExecutionResult,
    CodeExecutionService,
    Judge0SdkClientFactory,
    _ConfiguredJudge0Client,
    _judge0_endpoint_candidates,
)


@pytest.fixture
def db_session() -> Generator[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(
        engine,
        tables=[
            SQLModel.metadata.tables["code_run"],
            SQLModel.metadata.tables["code_run_case"],
        ],
    )
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(
        engine,
        tables=[
            SQLModel.metadata.tables["code_run_case"],
            SQLModel.metadata.tables["code_run"],
        ],
    )


class FakeFactory(Judge0SdkClientFactory):
    def get_client(self) -> SimpleNamespace:  # type: ignore[override]
        return SimpleNamespace(languages=[])


@pytest.mark.asyncio
async def test_code_execution_persists_visible_and_masks_hidden_results(
    monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    def fake_run(**_kwargs: object) -> list[SimpleNamespace]:
        return [
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="4\n",
                stderr=None,
                compile_output=None,
                message=None,
                token="visible-token",
                time=0.01,
                memory=1024,
            ),
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="9\n",
                stderr=None,
                compile_output=None,
                message=None,
                token="hidden-token",
                time=0.02,
                memory=2048,
            ),
        ]

    monkeypatch.setattr("src.services.code_execution.service.judge0.run", fake_run)
    service = CodeExecutionService(client_factory=FakeFactory())

    result = await async_run_service(service, db_session)

    assert result.status == CodeRunStatus.ACCEPTED
    assert result.passed == 2
    assert result.total == 2
    visible = result.visible_response_results()
    assert len(visible) == 1
    assert visible[0].stdin == "2"
    assert visible[0].expected == "4"
    assert visible[0].actual == "4"
    details = result.grading_details()
    assert details[0]["actual"] == "4"
    assert details[0]["weight"] == 2.0
    assert details[0]["description"] == "visible case"
    assert details[1]["actual"] is None

    persisted = db_session.get(CodeRun, 1)
    assert persisted is not None
    assert persisted.status == CodeRunStatus.ACCEPTED
    case_2 = db_session.get(CodeRunCase, 2)
    assert case_2 is not None
    assert case_2.is_visible is False


@pytest.mark.asyncio
async def test_code_execution_reuses_idempotent_run(monkeypatch: pytest.MonkeyPatch, db_session: Session) -> None:
    calls = 0

    def fake_run(**_kwargs: object) -> list[SimpleNamespace]:
        nonlocal calls
        calls += 1
        return [
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="ok\n",
                stderr=None,
                compile_output=None,
                message=None,
                token="visible-token",
                time=0.01,
                memory=256,
            ),
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="hidden\n",
                stderr=None,
                compile_output=None,
                message=None,
                token="hidden-token",
                time=0.01,
                memory=256,
            ),
        ]

    monkeypatch.setattr("src.services.code_execution.service.judge0.run", fake_run)
    service = CodeExecutionService(client_factory=FakeFactory())

    first = await async_run_service(service, db_session, idempotency_key="same-key")
    second = await async_run_service(service, db_session, idempotency_key="same-key")

    assert first.run_uuid == second.run_uuid
    assert calls == 1
    assert second.visible_response_results()[0].stdin == "2"
    assert second.grading_details()[0]["weight"] == 2.0


@pytest.mark.asyncio
async def test_code_execution_retries_failed_idempotent_run(
    monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    calls = 0

    def fake_run(**_kwargs: object) -> list[SimpleNamespace]:
        nonlocal calls
        calls += 1
        if calls == 1:
            return [
                SimpleNamespace(
                    status=Status.COMPILATION_ERROR,
                    stdout=None,
                    stderr=None,
                    compile_output="old compiler failure",
                    message=None,
                    token="failed-token",
                    time=None,
                    memory=None,
                )
            ]
        return [
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="4\n",
                stderr=None,
                compile_output=None,
                message=None,
                token="accepted-token",
                time=0.01,
                memory=256,
            )
        ]

    monkeypatch.setattr("src.services.code_execution.service.judge0.run", fake_run)
    service = CodeExecutionService(client_factory=FakeFactory())

    first = await async_run_service(
        service,
        db_session,
        idempotency_key="retry-key",
        single_case=True,
    )
    second = await async_run_service(
        service,
        db_session,
        idempotency_key="retry-key",
        single_case=True,
    )

    assert first.status == CodeRunStatus.COMPILE_ERROR
    assert second.status == CodeRunStatus.ACCEPTED
    assert first.run_uuid != second.run_uuid
    assert calls == 2


@pytest.mark.asyncio
async def test_code_execution_truncates_output_and_passes_sandbox_policy(
    monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    captured_kwargs: dict[str, object] = {}
    created_at = datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC)

    def fake_run(**kwargs: object) -> list[SimpleNamespace]:
        captured_kwargs.update(kwargs)
        return [
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="x" * 150_000,
                stderr="err",
                compile_output="compile",
                message=None,
                token="visible-token",
                time=0.5,
                wall_time=0.7,
                memory=1024,
                created_at=created_at,
                finished_at=created_at + timedelta(seconds=2),
            ),
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="hidden\n",
                stderr=None,
                compile_output=None,
                message=None,
                token="hidden-token",
                time=0.1,
                wall_time=0.2,
                memory=1024,
                created_at=created_at,
                finished_at=created_at + timedelta(seconds=1),
            ),
        ]

    monkeypatch.setattr("src.services.code_execution.service.judge0.run", fake_run)
    service = CodeExecutionService(client_factory=FakeFactory())

    result = await async_run_service(
        service,
        db_session,
        time_limit_seconds=2,
        memory_limit_mb=64,
    )

    assert captured_kwargs["enable_network"] is False
    assert captured_kwargs["max_file_size"] == 128
    assert captured_kwargs["wall_time_limit"] == 3.0
    assert captured_kwargs["memory_limit"] == 64 * 1024
    assert captured_kwargs["enable_per_process_and_thread_time_limit"] is True
    assert captured_kwargs["enable_per_process_and_thread_memory_limit"] is True
    assert result.details[0].stdout is not None
    assert len(result.details[0].stdout.encode()) <= 100_000
    assert result.details[0].stdout.endswith("[output truncated]")


@pytest.mark.asyncio
async def test_code_execution_raises_jvm_sandbox_limits(monkeypatch: pytest.MonkeyPatch, db_session: Session) -> None:
    captured_kwargs: dict[str, object] = {}

    def fake_run(**kwargs: object) -> list[SimpleNamespace]:
        captured_kwargs.update(kwargs)
        return [
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="2\n",
                stderr=None,
                compile_output=None,
                message=None,
                token="java-token",
                time=0.1,
                memory=1024,
            )
        ]

    monkeypatch.setattr("src.services.code_execution.service.judge0.run", fake_run)
    service = CodeExecutionService(client_factory=FakeFactory())

    await async_run_service(
        service,
        db_session,
        language_id=62,
        memory_limit_mb=256,
        single_case=True,
    )

    assert captured_kwargs["memory_limit"] == 1536 * 1024
    assert captured_kwargs["stack_limit"] == 64 * 1024
    assert captured_kwargs["max_processes_and_or_threads"] == 128
    assert "-J-XX:MaxMetaspaceSize=96m" in cast("str", captured_kwargs["compiler_options"])
    assert "-J-Xmx96m" in cast("str", captured_kwargs["compiler_options"])


@pytest.mark.asyncio
async def test_code_execution_raises_go_sandbox_limits(monkeypatch: pytest.MonkeyPatch, db_session: Session) -> None:
    captured_kwargs: dict[str, object] = {}

    def fake_run(**kwargs: object) -> list[SimpleNamespace]:
        captured_kwargs.update(kwargs)
        return [
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="2\n",
                stderr=None,
                compile_output=None,
                message=None,
                token="go-token",
                time=0.1,
                memory=1024,
            )
        ]

    monkeypatch.setattr("src.services.code_execution.service.judge0.run", fake_run)
    service = CodeExecutionService(client_factory=FakeFactory())

    await async_run_service(
        service,
        db_session,
        language_id=60,
        memory_limit_mb=256,
        single_case=True,
    )

    assert captured_kwargs["memory_limit"] == 512 * 1024
    assert captured_kwargs["stack_limit"] == 64 * 1024
    assert captured_kwargs["max_processes_and_or_threads"] == 128
    assert captured_kwargs["compiler_options"] == "-p 1"


@pytest.mark.asyncio
async def test_code_execution_sets_kotlin_compiler_jvm_options(
    monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    captured_kwargs: dict[str, object] = {}

    def fake_run(**kwargs: object) -> list[SimpleNamespace]:
        captured_kwargs.update(kwargs)
        return [
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="2\n",
                stderr=None,
                compile_output=None,
                message=None,
                token="kotlin-token",
                time=0.1,
                memory=1024,
            )
        ]

    monkeypatch.setattr("src.services.code_execution.service.judge0.run", fake_run)
    service = CodeExecutionService(client_factory=FakeFactory())

    await async_run_service(
        service,
        db_session,
        language_id=78,
        memory_limit_mb=256,
        single_case=True,
    )

    assert captured_kwargs["memory_limit"] == 1536 * 1024
    assert "-J-XX:MaxMetaspaceSize=256m" in cast("str", captured_kwargs["compiler_options"])
    assert "-J-Xmx512m" in cast("str", captured_kwargs["compiler_options"])


def test_code_execution_filters_allowed_languages() -> None:
    class Factory(Judge0SdkClientFactory):
        def get_client(self) -> SimpleNamespace:  # type: ignore[override]
            return SimpleNamespace(
                languages=[
                    SimpleNamespace(id=71, name="Python (3.8.1)", is_archived=False),
                    SimpleNamespace(id=999, name="Unsafe", is_archived=False),
                    SimpleNamespace(id=63, name="JavaScript", is_archived=True),
                ]
            )

    service = CodeExecutionService(client_factory=Factory())

    assert [language["id"] for language in service._list_languages_sync()] == [71]


@pytest.mark.asyncio
async def test_code_execution_language_discovery_reports_service_unavailable() -> None:
    class Factory:
        def get_client(self) -> Never:
            msg = "Judge0 unavailable"
            raise RuntimeError(msg)

    service = CodeExecutionService(client_factory=Factory())

    with pytest.raises(HTTPException) as exc_info:
        await service.list_languages()

    assert exc_info.value.status_code == 503


def test_code_execution_rejects_disallowed_language() -> None:
    service = CodeExecutionService(client_factory=FakeFactory())

    with pytest.raises(HTTPException) as exc_info:
        service._validate_language(999)

    assert exc_info.value.status_code == 400


def test_judge0_configured_client_returns_fresh_retry_strategy() -> None:
    client = _ConfiguredJudge0Client.__new__(_ConfiguredJudge0Client)
    client._poll_interval_seconds = 0.2
    client._poll_max_wait_seconds = 3.0
    client.client = SimpleNamespace(close=lambda: None)

    first = client.retry_strategy
    first.step()
    second = client.retry_strategy

    assert first.total_wait_time == 0.2
    assert second.total_wait_time == 0.0


def test_judge0_endpoint_candidates_bridge_local_and_compose_hosts() -> None:
    assert _judge0_endpoint_candidates("http://localhost:2358") == (
        "http://localhost:2358",
        "http://judge0-server:2358",
    )
    assert _judge0_endpoint_candidates("http://judge0-server:2358") == (
        "http://judge0-server:2358",
        "http://localhost:2358",
    )


async def async_run_service(
    service: CodeExecutionService,
    db_session: Session,
    *,
    idempotency_key: str | None = None,
    language_id: int = 71,
    time_limit_seconds: int | None = None,
    memory_limit_mb: int | None = None,
    single_case: bool = False,
) -> CodeExecutionResult:
    test_cases = [
        CodeTestCase(
            id="visible",
            input="2",
            expected_output="4",
            description="visible case",
            is_visible=True,
            weight=2,
        ),
        CodeTestCase(id="hidden", input="3", expected_output="9", is_visible=False, weight=3),
    ]
    return await service.run(
        db_session=db_session,
        assessment_uuid="assessment_code",
        item_uuid="item_code",
        user_id=42,
        purpose=CodeRunPurpose.VISIBLE,
        language_id=language_id,
        source_code="print('ok')",
        test_cases=test_cases[:1] if single_case else test_cases,
        idempotency_key=idempotency_key,
        time_limit_seconds=time_limit_seconds,
        memory_limit_mb=memory_limit_mb,
    )


@pytest.mark.asyncio
async def test_code_execution_with_different_source_code_and_hash_in_key(
    monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    calls = 0

    def fake_run(**_kwargs: object) -> list[SimpleNamespace]:
        nonlocal calls
        calls += 1
        return [
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout="ok\n",
                stderr=None,
                compile_output=None,
                message=None,
                token="visible-token",
                time=0.01,
                memory=256,
            )
        ]

    monkeypatch.setattr("src.services.code_execution.service.judge0.run", fake_run)
    service = CodeExecutionService(client_factory=FakeFactory())

    import hashlib

    # Simulating the submission of "first version of code"
    source_1 = "print('first')"
    hash_1 = hashlib.sha256(source_1.encode("utf-8")).hexdigest()
    key_1 = f"final:submission123:item_code:71:{hash_1}"

    run_1 = await service.run(
        db_session=db_session,
        assessment_uuid="assessment_code",
        item_uuid="item_code",
        user_id=42,
        purpose=CodeRunPurpose.FINAL,
        language_id=71,
        source_code=source_1,
        test_cases=[CodeTestCase(id="visible", input="2", expected_output="4", is_visible=True, weight=2)],
        idempotency_key=key_1,
    )

    # Simulating the submission of "second version of code" under same submission draft
    source_2 = "print('second')"
    hash_2 = hashlib.sha256(source_2.encode("utf-8")).hexdigest()
    key_2 = f"final:submission123:item_code:71:{hash_2}"

    run_2 = await service.run(
        db_session=db_session,
        assessment_uuid="assessment_code",
        item_uuid="item_code",
        user_id=42,
        purpose=CodeRunPurpose.FINAL,
        language_id=71,
        source_code=source_2,
        test_cases=[CodeTestCase(id="visible", input="2", expected_output="4", is_visible=True, weight=2)],
        idempotency_key=key_2,
    )

    # Simulating a retry of the "second version of code" (should hit idempotency)
    run_3 = await service.run(
        db_session=db_session,
        assessment_uuid="assessment_code",
        item_uuid="item_code",
        user_id=42,
        purpose=CodeRunPurpose.FINAL,
        language_id=71,
        source_code=source_2,
        test_cases=[CodeTestCase(id="visible", input="2", expected_output="4", is_visible=True, weight=2)],
        idempotency_key=key_2,
    )

    # Verify that different code versions did not conflict and run_2 was executed
    assert run_1.run_uuid != run_2.run_uuid
    assert run_2.run_uuid == run_3.run_uuid
    assert calls == 2  # run_1 and run_2 were sent to Judge0, run_3 reused run_2 from cache


@pytest.mark.asyncio
async def test_code_execution_match_modes(monkeypatch: pytest.MonkeyPatch, db_session: Session) -> None:
    outputs: list[str] = []

    def fake_run(**_kwargs: object) -> list[SimpleNamespace]:
        return [
            SimpleNamespace(
                status=Status.ACCEPTED,
                stdout=out,
                stderr=None,
                compile_output=None,
                message=None,
                token=f"token-{i}",
                time=0.01,
                memory=256,
            )
            for i, out in enumerate(outputs)
        ]

    monkeypatch.setattr("src.services.code_execution.service.judge0.run", fake_run)
    service = CodeExecutionService(client_factory=FakeFactory())

    # 1. EXACT match mode
    outputs = ["hello\n", "hello", "hello \n"]
    run = await service.run(
        db_session=db_session,
        assessment_uuid="assessment_code",
        item_uuid="item_code",
        user_id=42,
        purpose=CodeRunPurpose.FINAL,
        language_id=71,
        source_code="print('hello')",
        test_cases=[
            CodeTestCase(id="c1", input="x", expected_output="hello", match_mode="EXACT"),
            CodeTestCase(id="c2", input="x", expected_output="hello", match_mode="EXACT"),
            CodeTestCase(id="c3_fail", input="x", expected_output="hello", match_mode="EXACT"),
        ],
    )
    assert run.details[0].passed is True
    assert run.details[1].passed is True
    assert run.details[2].passed is False

    # 2. TRIMMED match mode
    outputs = ["  hello  \n", "world"]
    run = await service.run(
        db_session=db_session,
        assessment_uuid="assessment_code",
        item_uuid="item_code",
        user_id=42,
        purpose=CodeRunPurpose.FINAL,
        language_id=71,
        source_code="print('hello')",
        test_cases=[
            CodeTestCase(id="c3", input="x", expected_output="hello", match_mode="TRIMMED"),
            CodeTestCase(id="c4", input="x", expected_output="world  ", match_mode="TRIMMED"),
        ],
    )
    assert run.details[0].passed is True
    assert run.details[1].passed is True

    # 3. IGNORE_WHITESPACE match mode
    outputs = ["h e l l o\n"]
    run = await service.run(
        db_session=db_session,
        assessment_uuid="assessment_code",
        item_uuid="item_code",
        user_id=42,
        purpose=CodeRunPurpose.FINAL,
        language_id=71,
        source_code="print('hello')",
        test_cases=[
            CodeTestCase(
                id="c5",
                input="x",
                expected_output="hello",
                match_mode="IGNORE_WHITESPACE",
            ),
        ],
    )
    assert run.details[0].passed is True

    # 4. NUMERIC_TOLERANCE match mode
    outputs = ["3.14159265\n", "100.0000001\n", "abc 123\n"]
    run = await service.run(
        db_session=db_session,
        assessment_uuid="assessment_code",
        item_uuid="item_code",
        user_id=42,
        purpose=CodeRunPurpose.FINAL,
        language_id=71,
        source_code="print('hello')",
        test_cases=[
            CodeTestCase(
                id="c6",
                input="x",
                expected_output="3.141593",
                match_mode="NUMERIC_TOLERANCE",
            ),  # diff is ~3.5e-7
            CodeTestCase(
                id="c7",
                input="x",
                expected_output="100.0",
                match_mode="NUMERIC_TOLERANCE",
            ),  # diff is 1e-7
            CodeTestCase(
                id="c8",
                input="x",
                expected_output="abc 123",
                match_mode="NUMERIC_TOLERANCE",
            ),  # non-numeric token match
        ],
    )
    assert run.details[0].passed is True
    assert run.details[1].passed is True
    assert run.details[2].passed is True
