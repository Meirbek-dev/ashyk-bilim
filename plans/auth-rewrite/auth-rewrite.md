# Auth rewrite

# 0. Migration Strategy (Non-negotiable)

**Do a big-bang rewrite.**

---

# 1. Dependency Changes

### Remove

* `authlib`
* `joserfc`

### Add

```toml
fastapi-users[sqlalchemy]>=15.0.0
```

You already have:

* `argon2-cffi` ✅ (good, matches fastapi-users defaults)
* `redis` ✅ (use for token storage / blacklist)
* `pydantic v2` ✅ (fastapi-users v15 compatible)

---

# 2. Core Architectural Shift

## From

* Custom JWT issuing (authlib)
* Manual dependency injection for user
* Likely ad-hoc OAuth / sessions

## To

* `UserManager` (business logic)
* `AuthenticationBackend` (transport + strategy)
* `FastAPIUsers` (router factory)
* Typed user models

---

# 3. User Model Refactor (Critical)

### Your current

Likely SQLModel with custom fields

### Target

A model compatible with fastapi-users:

```python
from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID
from sqlmodel import SQLModel, Field

class User(SQLAlchemyBaseUserTableUUID, SQLModel, table=True):
    __tablename__ = "users"

    # your fields
    full_name: str | None = None
    is_teacher: bool = False
```

### Requirements

* UUID primary key (matches your `python-ulid`? → decide now)
* Required fields:

  * `email`
  * `hashed_password`
  * `is_active`
  * `is_superuser`
  * `is_verified`

### ⚠️ Decision Point

You use `ULID`. fastapi-users defaults to UUID. **Switch to UUID (simpler)**

---

# 4. Database Adapter Layer

If using SQLModel:

```python
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase

async def get_user_db(session: AsyncSession):
    yield SQLAlchemyUserDatabase(session, User)
```

If SQLModel integration is incomplete → implement adapter manually.

---

# 5. Password Hashing (Argon2)

You already use:

* `argon2-cffi`

fastapi-users uses `passlib` internally.

### Override hasher

```python
from fastapi_users.password import PasswordHelper
from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto"
)

password_helper = PasswordHelper(pwd_context)
```

---

# 6. UserManager (Business Logic Layer)

This replaces a large portion of your current auth logic.

```python
from fastapi_users import BaseUserManager, UUIDIDMixin

class UserManager(UUIDIDMixin, BaseUserManager[User, UUID]):
    reset_password_token_secret = settings.SECRET
    verification_token_secret = settings.SECRET

    async def on_after_register(self, user, request=None):
        # don't integrate with resend (i don't have an email yet)
        pass

    async def on_after_login(self, user, request=None):
        # logging / analytics (logfire)
        pass
```

---

# 7. Authentication Backend Design

You should implement **two backends**:

## 7.1 JWT (stateless API)

```python
from fastapi_users.authentication import JWTStrategy

def get_jwt_strategy():
    return JWTStrategy(
        secret=settings.SECRET,
        lifetime_seconds=3600,
    )
```

## 7.2 Cookie (optional, for frontend apps)

```python
from fastapi_users.authentication import CookieTransport

cookie_transport = CookieTransport(cookie_name="auth")
```

---

## Backend Assembly

```python
from fastapi_users.authentication import AuthenticationBackend

auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)
```

---

# 8. FastAPIUsers Instance

```python
fastapi_users = FastAPIUsers[User, UUID](
    get_user_manager,
    [auth_backend],
)
```

---

# 9. Router Migration

## Replace your custom routes with

```python
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/auth/jwt",
)

app.include_router(
    fastapi_users.get_register_router(),
    prefix="/auth",
)

app.include_router(
    fastapi_users.get_users_router(),
    prefix="/users",
)
```

---

# 10. Dependency Injection Refactor

Replace:

```python
current_user = Depends(custom_auth)
```

With:

```python
current_user = fastapi_users.current_user()
```

Variants:

```python
current_active_user = fastapi_users.current_user(active=True)
current_superuser = fastapi_users.current_user(superuser=True)
```

---

# 11. OAuth Migration (If Using Authlib for OAuth)

fastapi-users supports OAuth:

```python
from fastapi_users.authentication import OAuth2AuthorizeCallback

# configure providers (Google, etc.)
```

You will:

1. Remove authlib OAuth clients
2. Recreate providers using fastapi-users OAuth integration

---

---

# 13. Redis Integration (Optional but Recommended)

Use Redis for:

* Token blacklist
* Session invalidation
* Rate limiting (you already use `slowapi`)

---

# 14. Migration of Existing Users

- write migrations using uv run alembic revision

### Problem

Passwords + JWTs from authlib

### Plan

1. **Keep password hashes** (argon2 → compatible)
2. **Invalidate old JWTs**
3. Force re-login OR:

---

# 15. Middleware Cleanup

Remove:

* authlib middleware
* custom JWT parsing

Add:

* fastapi-users dependencies only

---

# 16. Testing Plan (Mandatory)

Your agent should:

### Backend (pytest)

* Registration
* Login
* Token refresh
* Protected routes
* Permission checks

### Security Tests

* Invalid JWT
* Expired token
* Tampered signature

---

# 17. Removal Phase

After full migration:

* Delete:

  * authlib
  * custom auth services
  * legacy JWT utils

* Run:

```bash
alembic revision --autogenerate
```

---

# 18. Expected Improvements

* Stronger type safety (Pydantic v2 alignment)
* Reduced custom auth code (~60–80% reduction)
* Standardized flows
* Easier RBAC extension

---

# 19. Optional Advanced Enhancements

Once stable:

* Add RBAC layer (roles/permissions table)
* Add refresh tokens (custom strategy)
* Add device/session tracking
* Add audit logging (logfire integration)

---

# 20. Deliverable Checklist for Your Agent

Your coding agent should produce:

* [ ] New `User` model
* [ ] `UserManager`
* [ ] Auth backend(s)
* [ ] Router setup
* [ ] Dependency replacements
* [ ] Migration scripts
* [ ] Test suite
* [ ] Removal PR for authlib
