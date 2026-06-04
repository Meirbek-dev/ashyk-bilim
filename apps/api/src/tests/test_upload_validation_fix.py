import pathlib
import sys
from datetime import UTC, datetime

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from typing import Any

from pydantic import ValidationError

from src.db.uploads import UploadRead, UploadStatus

# Set development mode to enable Pydantic strict mode for this test specifically
UploadRead.model_config["strict"] = True
UploadRead.model_rebuild(force=True)


def test_pydantic_is_strict() -> None:
    """Verify that strict mode is actually enabled for the test."""
    assert UploadRead.model_config.get("strict") is True


def test_upload_read_status_coercion() -> None:
    """Verify that UploadRead allows 'status' to be a string even in strict mode.
    This simulates reading from a database column defined as String.
    """
    now = datetime.now(UTC)
    data: dict[str, Any] = {
        "upload_uuid": "ul_01KRN7W538CNMGNH9F17Q53XBM",
        "filename": "test.png",
        "content_type": "image/png",
        "size_bytes": 1024,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "storage_key": "uploads/user/2026/05/ul_01/e3b0.png",
        "status": "RECEIVING",  # Raw string from DB
        "expires_at": now,
        "finalized_at": None,
    }

    # Before the fix, this would raise ValidationError:
    # "Input should be an instance of UploadStatus [type=is_instance_of, input_value='RECEIVING', input_type=str]"
    upload_read = UploadRead.model_validate(data)

    assert upload_read.status == UploadStatus.RECEIVING
    assert isinstance(upload_read.status, UploadStatus)


def test_upload_read_other_fields_remain_strict() -> None:
    """Verify that other fields (like size_bytes) still enforce strict types."""
    now = datetime.now(UTC)
    data: dict[str, Any] = {
        "upload_uuid": "ul_01KRN7W538CNMGNH9F17Q53XBM",
        "filename": "test.png",
        "content_type": "image/png",
        "size_bytes": "1024",  # String instead of int
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "storage_key": "uploads/user/2026/05/ul_01/e3b0.png",
        "status": UploadStatus.RECEIVING,
        "expires_at": now,
        "finalized_at": None,
    }

    with pytest.raises(ValidationError) as excinfo:
        UploadRead.model_validate(data)

    # It should be a Pydantic ValidationError
    assert "Input should be a valid integer" in str(excinfo.value)
