import secrets
import string

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

### 🔒 Secure Random Generation #############################################


def generate_secure_password(length: int = 12) -> str:
    """Generate a cryptographically secure random password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_secure_code(length: int = 8) -> str:
    """Generate a cryptographically secure random alphanumeric code."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


### 🔒 Password Hashing #####################################################

# Argon2id with secure defaults
pwd_hasher = PasswordHasher()


def security_hash_password(password: str) -> str:
    """Hash a password using Argon2id."""
    return pwd_hasher.hash(password)


def security_verify_password(plain_password: str, hashed_password: str | None) -> bool:
    """Verify a password against its Argon2id hash.

    Returns False when hashed_password is None (OAuth-only users have no local
    password set).
    """
    if hashed_password is None:
        return False
    try:
        pwd_hasher.verify(hashed_password, plain_password)
        return True
    except VerifyMismatchError:
        return False
