from datetime import date
from pathlib import Path
from typing import Annotated

import typer
from alembic import command
from alembic.config import Config
from sqlmodel import select

from config.config import get_settings
from src.core.platform import (
    PLATFORM_BRAND_NAME,
    PLATFORM_DESCRIPTION,
    PLATFORM_LABEL,
)
from src.db.platform import Platform, PlatformCreate
from src.db.users import User, UserCreate
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import session_scope
from src.services.analytics.rollups import refresh_teacher_analytics_rollups
from src.services.platform import get_platform
from src.services.setup.setup import (
    install_create_platform,
    install_create_platform_user,
    install_default_elements,
)

cli = typer.Typer()


def _run_migrations_to_head() -> None:
    alembic_config = Config(str(Path(__file__).with_name("alembic.ini")))
    settings = get_settings()
    alembic_config.set_main_option(
        "sqlalchemy.url", settings.database_config.sql_connection_string
    )
    command.upgrade(alembic_config, "head")


@cli.command()
def install(
    short: Annotated[bool, typer.Option(help="Install with predefined values")] = False,
) -> None:
    _run_migrations_to_head()

    settings = get_settings()
    engine = build_engine(settings)
    factory = build_session_factory(engine)
    try:
        with session_scope(factory) as db_session:
            print("Installing default elements...")
            install_default_elements(db_session)
            print("Default elements installed ✅")

            if short:
                bootstrap_config = settings.bootstrap
                admin_email = bootstrap_config.initial_admin_email
                admin_password = bootstrap_config.initial_admin_password

                if not admin_email:
                    print(
                        "❌ Error: PLATFORM_INITIAL_ADMIN_EMAIL environment variable is required"
                    )
                    raise typer.Exit(code=1)

                if not admin_password:
                    print(
                        "❌ Error: PLATFORM_INITIAL_ADMIN_PASSWORD environment variable is required"
                    )
                    print(
                        "Please set PLATFORM_INITIAL_ADMIN_PASSWORD environment variable before running installation."
                    )
                    raise typer.Exit(code=1)

                print(f"Creating {PLATFORM_BRAND_NAME}...")
                platform_object = PlatformCreate(
                    name=PLATFORM_BRAND_NAME,
                    description=PLATFORM_DESCRIPTION,
                    about=f"{PLATFORM_BRAND_NAME} - Образовательная платформа для онлайн-обучения",
                    email=str(admin_email),
                    logo_image="",
                    thumbnail_image="",
                    label=PLATFORM_LABEL,
                )
                install_create_platform(platform_object, db_session)
                print(f"{PLATFORM_BRAND_NAME} created ✅")

                print(f"Creating {PLATFORM_BRAND_NAME} admin user...")
                print(
                    f"Using email from PLATFORM_INITIAL_ADMIN_EMAIL environment variable: {admin_email}"
                )
                print(
                    "Using password from PLATFORM_INITIAL_ADMIN_PASSWORD environment variable"
                )
                user = UserCreate(
                    username="Admin",
                    email=str(admin_email),
                    password=admin_password,
                )
                install_create_platform_user(user, db_session)
                print(f"{PLATFORM_BRAND_NAME} user created ✅")

                print("Installation completed ✅")
                print()
                print("Login with the following credentials:")
                print("email: " + str(admin_email))
                print(
                    "password: (the password you set in PLATFORM_INITIAL_ADMIN_PASSWORD)"
                )
                print("⚠️ Remember to change the password after logging in ⚠️")

            else:
                print(f"Creating {PLATFORM_BRAND_NAME}...")
                platform_object = PlatformCreate(
                    name=PLATFORM_BRAND_NAME,
                    description=PLATFORM_DESCRIPTION,
                    email="",
                    logo_image="",
                    thumbnail_image="",
                    label=PLATFORM_LABEL,
                )
                install_create_platform(platform_object, db_session)
                print(f"{PLATFORM_BRAND_NAME} platform created ✅")

                print("Creating your admin user...")
                username = typer.prompt("What's the username for the user?")
                email = typer.prompt("What's the email for the user?")
                password = typer.prompt(
                    "What's the password for the user?", hide_input=True
                )
                user = UserCreate(username=username, email=email, password=password)
                install_create_platform_user(user, db_session)
                print(username + " user created ✅")

                print("Installation completed ✅\n")
                print("Login with the following credentials:")
                print("email: " + email)
                print("password: The password you entered")
    finally:
        engine.dispose()


@cli.command()
def main() -> None:
    cli()


@cli.command()
def refresh_analytics(
    snapshot_date: Annotated[
        str | None, typer.Option(help="Optional snapshot date in YYYY-MM-DD format")
    ] = None,
) -> None:
    settings = get_settings()
    engine = build_engine(settings)
    factory = build_session_factory(engine)
    try:
        with session_scope(factory) as db_session:
            parsed_snapshot = (
                date.fromisoformat(snapshot_date) if snapshot_date else None
            )
            result = refresh_teacher_analytics_rollups(
                db_session, snapshot_date=parsed_snapshot
            )
            print(result)
    finally:
        engine.dispose()


@cli.command()
def migrate_users_to_platform() -> None:
    """Migrate users without membership into the platform."""
    from src.db.permission_enums import RoleSlug
    from src.db.permissions import Role, UserRole

    settings = get_settings()
    engine = build_engine(settings)
    factory = build_session_factory(engine)
    try:
        with session_scope(factory) as db_session:
            print("=" * 80)
            print("Migrating users to platform")
            print("=" * 80)

            platform = get_platform(db_session)

            if not platform:
                print("❌ Error: Platform not found")
                print("Please create the platform first using 'python cli.py install'")
                raise typer.Exit(code=1)

            print(f"✅ Found platform: {platform.name}")

            user_role = db_session.exec(
                select(Role).where(Role.slug == RoleSlug.USER)
            ).first()

            if not user_role:
                print("❌ Error: Default 'user' role not found")
                print("Please run migrations first")
                raise typer.Exit(code=1)

            print(f"✅ Found user role: {user_role.name} (ID: {user_role.id})")

            all_users = db_session.exec(select(User)).all()
            print(f"\n📊 Found {len(all_users)} total users in database")

            users_with_roles = db_session.exec(
                select(UserRole.user_id).distinct()
            ).all()
            user_ids_with_roles = {user_id for (user_id,) in users_with_roles}
            print(
                f"📊 {len(user_ids_with_roles)} users already have platform memberships"
            )

            users_without_platform = [
                u for u in all_users if u.id not in user_ids_with_roles
            ]
            print(
                f"📊 {len(users_without_platform)} users need to be migrated to the platform\n"
            )

            if not users_without_platform:
                print("✅ All users already have platform memberships. Nothing to do!")
                return

            migrated_count = 0
            skipped_count = 0

            for user in users_without_platform:
                try:
                    new_user_role = UserRole(user_id=user.id, role_id=user_role.id)
                    db_session.add(new_user_role)
                    migrated_count += 1
                    print(
                        f"  ✅ Added user {user.username} (ID: {user.id}) to {platform.name}"
                    )
                except Exception as e:
                    skipped_count += 1
                    print(f"  ⚠️  Skipping user {user.username} (ID: {user.id}): {e!s}")

            db_session.commit()

            print("\n" + "=" * 80)
            print("Migration complete!")
            print("=" * 80)
            print(f"✅ Successfully migrated: {migrated_count} users")
            if skipped_count > 0:
                print(f"⚠️  Skipped: {skipped_count} users")
            print()
    finally:
        engine.dispose()


if __name__ == "__main__":
    cli()
