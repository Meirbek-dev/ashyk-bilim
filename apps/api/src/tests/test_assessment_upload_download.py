# pyright: reportMissingImports=false

import hashlib
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, select

from src.auth.users import get_public_user
from src.db.uploads import Upload, UploadStatus
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers.uploads.chunked_upload import router

_TABLES = [User.__table__, Upload.__table__]


def _public_user(user_id: int, user_uuid: str) -> PublicUser:
    return PublicUser(
        id=user_id,
        user_uuid=user_uuid,
        username=f"user.{user_id}",
        first_name="Upload",
        last_name="Owner",
        email=f"user.{user_id}@example.com",
        is_verified=True,
    )


@pytest.fixture(name="db_session_factory")
def db_session_factory_fixture() -> Iterator[Callable[[], Session]]:
    engine = build_engine(get_settings())
    SQLModel.metadata.create_all(engine, tables=_TABLES)
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(engine, tables=list(reversed(_TABLES)))
        engine.dispose()


@pytest.fixture(name="upload_client")
def upload_client_fixture(
    db_session_factory: Callable[[], Session],
) -> tuple[TestClient, dict[str, PublicUser]]:
    owner = _public_user(1, "user_upload_owner")
    current_user = {"value": owner}

    with db_session_factory() as session:
        session.add(
            User(
                id=owner.id,
                user_uuid=owner.user_uuid,
                username=owner.username,
                first_name=owner.first_name,
                last_name=owner.last_name,
                email=owner.email,
            )
        )
        session.commit()

    app = FastAPI()
    app.include_router(router, prefix="/uploads")

    def override_get_db_session() -> Iterator[Session]:
        with db_session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: current_user["value"]
    return TestClient(app), current_user


def _create_upload(client: TestClient, *, filename: str = "отчет финал.txt") -> str:
    response = client.post(
        "/uploads",
        json={"filename": filename, "content_type": "text/plain", "size": 12},
    )
    assert response.status_code == 200
    return response.json()["upload_uuid"]


def test_owner_can_finalize_get_url_and_download_identical_bytes(
    upload_client: tuple[TestClient, dict[str, PublicUser]],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    client, _ = upload_client
    monkeypatch.chdir(tmp_path)
    content = b"upload bytes\x00\xff"
    upload_id = _create_upload(client)

    put_response = client.put(
        f"/uploads/{upload_id}/bytes",
        content=content,
        headers={"content-type": "application/octet-stream"},
    )
    assert put_response.status_code == 200

    finalize_response = client.post(
        f"/uploads/{upload_id}/finalize",
        json={
            "sha256": hashlib.sha256(content).hexdigest(),
            "content_type": "application/octet-stream",
        },
    )
    assert finalize_response.status_code == 200

    url_response = client.get(f"/uploads/{upload_id}/url")
    assert url_response.status_code == 200
    assert url_response.json()["get_url"].endswith(f"/uploads/{upload_id}/download")

    download_response = client.get(url_response.json()["get_url"])
    assert download_response.status_code == 200
    assert download_response.content == content
    assert download_response.headers["content-type"] == "application/octet-stream"
    assert "filename*=UTF-8''" in download_response.headers["content-disposition"]


def test_download_hides_upload_from_other_users(
    upload_client: tuple[TestClient, dict[str, PublicUser]],
) -> None:
    client, current_user = upload_client
    upload_id = _create_upload(client)
    current_user["value"] = _public_user(2, "user_upload_outsider")

    response = client.get(f"/uploads/{upload_id}/download")

    assert response.status_code == 404
    assert response.json()["detail"] == "Загрузка не найдена"


def test_download_rejects_non_finalized_and_missing_uploads(
    upload_client: tuple[TestClient, dict[str, PublicUser]],
) -> None:
    client, _ = upload_client
    upload_id = _create_upload(client)

    non_finalized = client.get(f"/uploads/{upload_id}/download")
    missing = client.get("/uploads/ul_missing/download")

    assert non_finalized.status_code == 409
    assert non_finalized.json()["detail"] == "Загрузка не завершена"
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Загрузка не найдена"


def test_download_reports_missing_finalized_bytes(
    upload_client: tuple[TestClient, dict[str, PublicUser]],
    db_session_factory: Callable[[], Session],
) -> None:
    client, _ = upload_client
    upload_id = _create_upload(client)
    with db_session_factory() as session:
        upload = session.exec(select(Upload).where(Upload.upload_uuid == upload_id)).one()
        assert upload is not None
        upload.status = UploadStatus.FINALIZED
        upload.storage_key = "uploads/missing.bin"
        session.add(upload)
        session.commit()

    response = client.get(f"/uploads/{upload_id}/download")

    assert response.status_code == 404
    assert response.json()["detail"] == "Байты загрузки отсутствуют"
