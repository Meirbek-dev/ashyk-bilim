import pathlib
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.auth.users import get_public_user
from src.db.users import PublicUser
from src.routers.uploads.chunked_upload import router


@pytest.fixture(name="client")
def client_fixture() -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/uploads")

    user = PublicUser(
        id=1,
        user_uuid="user_1",
        username="teacher",
        first_name="Teacher",
        middle_name="",
        last_name="User",
        email="teacher@example.com",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )

    app.dependency_overrides[get_public_user] = lambda: user
    return TestClient(app)


def test_initiate_with_empty_uuid(client: TestClient) -> None:
    # This matches what the frontend sends for platform type: type_of_dir="platform" and uuid=""
    data = {
        "directory": "courses/course_1/activities/activity_1/documentpdf",
        "type_of_dir": "platform",
        "filename": "documentpdf.pdf",
        "total_chunks": "10",
        "file_size": "66000000",
        "uuid": "",
    }
    response = client.post("/uploads/initiate", data=data)
    assert response.status_code == 200
    res_data = response.json()
    assert "upload_uuid" in res_data
    assert res_data["message"] == "Сессия загрузки начата"


def test_initiate_with_missing_uuid(client: TestClient) -> None:
    # What if uuid is completely missing?
    data = {
        "directory": "courses/course_1/activities/activity_1/documentpdf",
        "type_of_dir": "platform",
        "filename": "documentpdf.pdf",
        "total_chunks": "10",
        "file_size": "66000000",
    }
    response = client.post("/uploads/initiate", data=data)
    assert response.status_code == 200
    res_data = response.json()
    assert "upload_uuid" in res_data
    assert res_data["message"] == "Сессия загрузки начата"


def test_users_initiate_requires_uuid(client: TestClient) -> None:
    data = {
        "directory": "users/user_1/activities/activity_1/documentpdf",
        "type_of_dir": "users",
        "filename": "documentpdf.pdf",
        "total_chunks": "10",
        "file_size": "66000000",
        "uuid": "",
    }
    response = client.post("/uploads/initiate", data=data)
    assert response.status_code == 400
    assert response.json()["detail"] == "uuid is required"

    # Also check when it is completely missing
    data_missing = {
        "directory": "users/user_1/activities/activity_1/documentpdf",
        "type_of_dir": "users",
        "filename": "documentpdf.pdf",
        "total_chunks": "10",
        "file_size": "66000000",
    }
    response_missing = client.post("/uploads/initiate", data=data_missing)
    assert response_missing.status_code == 400
    assert response_missing.json()["detail"] == "uuid is required"
