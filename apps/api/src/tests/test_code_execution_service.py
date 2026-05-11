import pathlib
import sys
from types import SimpleNamespace

import pytest
from judge0 import Status
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.db.assessments import CodeTestCase
from src.db.code_execution import CodeRun, CodeRunCase, CodeRunPurpose, CodeRunStatus
from src.services.code_execution.service import CodeExecutionService


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(
        engine, tables=[CodeRun.__table__, CodeRunCase.__table__]
    )
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(
        engine, tables=[CodeRunCase.__table__, CodeRun.__table__]
    )


class FakeFactory:
    def get_client(self):
        return SimpleNamespace(languages=[])


@pytest.mark.asyncio
async def test_code_execution_persists_visible_and_masks_hidden_results(
    monkeypatch, db_session
):
    def fake_run(**_kwargs):
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
    assert db_session.get(CodeRunCase, 2).is_visible is False


@pytest.mark.asyncio
async def test_code_execution_reuses_idempotent_run(monkeypatch, db_session):
    calls = 0

    def fake_run(**_kwargs):
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


async def async_run_service(
    service: CodeExecutionService,
    db_session: Session,
    *,
    idempotency_key: str | None = None,
):
    return await service.run(
        db_session=db_session,
        assessment_uuid="assessment_code",
        item_uuid="item_code",
        user_id=42,
        purpose=CodeRunPurpose.VISIBLE,
        language_id=71,
        source_code="print('ok')",
        test_cases=[
            CodeTestCase(
                id="visible",
                input="2",
                expected_output="4",
                description="visible case",
                is_visible=True,
                weight=2,
            ),
            CodeTestCase(
                id="hidden", input="3", expected_output="9", is_visible=False, weight=3
            ),
        ],
        idempotency_key=idempotency_key,
    )
