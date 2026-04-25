import secrets
import string

from fastapi_users.password import PasswordHelper
from passlib.context import CryptContext

### 🔒 Secure Random Generation #############################################


def generate_secure_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_secure_code(length: int = 8) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


### 🔒 Password Hashing #####################################################

# passlib CryptContext with argon2 — compatible with existing argon2-cffi hashes
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
password_helper = PasswordHelper(pwd_context)


def security_hash_password(password: str) -> str:
    return password_helper.hash(password)


def security_verify_password(plain_password: str, hashed_password: str | None) -> bool:
    if hashed_password is None:
        return False
    valid, _ = password_helper.verify_and_update(plain_password, hashed_password)
    return valid
