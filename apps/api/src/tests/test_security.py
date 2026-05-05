from src.security.security import security_hash_password, security_verify_password


def test_security_hash_password_returns_hash() -> None:
    password = "StrongPassword123!"

    hashed_password = security_hash_password(password)

    assert hashed_password != password
    assert hashed_password.startswith("$")


def test_security_verify_password_accepts_valid_password() -> None:
    password = "StrongPassword123!"
    hashed_password = security_hash_password(password)

    assert security_verify_password(password, hashed_password) is True


def test_security_verify_password_rejects_invalid_password() -> None:
    hashed_password = security_hash_password("StrongPassword123!")

    assert security_verify_password("WrongPassword123!", hashed_password) is False


def test_security_verify_password_rejects_missing_hash() -> None:
    assert security_verify_password("StrongPassword123!", None) is False
