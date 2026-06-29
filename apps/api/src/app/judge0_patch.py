import logging
import threading
import time

from sqlalchemy import inspect, text
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session

logger = logging.getLogger(__name__)


def apply_judge0_patches(session_factory: sessionmaker[Session]) -> None:
    """Applies patches to the Judge0 languages database table.
    Enforces compiler/runtime flags for managed runtimes so they run
    correctly inside Judge0 sandbox constraints.
    """
    logger.info("Starting Judge0 language patches checking/polling...")

    max_retries = 24  # Poll for up to 2 minutes
    retry_interval = 5.0

    for attempt in range(1, max_retries + 1):
        try:
            with session_factory() as session:
                table_exists = inspect(session.connection()).has_table("languages")
                if not table_exists:
                    logger.info(
                        "Skipping Judge0 language patches: public.languages is not present in the application database."
                    )
                    return

                # Check if languages table contains the core rows.
                res = (
                    session
                    .connection()
                    .execute(text("SELECT COUNT(*) FROM languages WHERE id IN (22, 60, 62);"))
                    .scalar()
                )

                if res and res >= 3:
                    logger.info(
                        "Target languages found in database. Applying updates (attempt %s)...",
                        attempt,
                    )

                    # Update Go (1.13.5) with id 60
                    session.connection().execute(
                        text(
                            "UPDATE languages "
                            "SET compile_cmd = 'CGO_ENABLED=0 GOMAXPROCS=1 GOGC=30 GOCACHE=/tmp/.cache/go-build /usr/local/go-1.13.5/bin/go build -p 1 %s main.go' "
                            "WHERE id = 60;"
                        )
                    )

                    # Update Go (1.9) with id 22
                    session.connection().execute(
                        text(
                            "UPDATE languages "
                            "SET compile_cmd = 'CGO_ENABLED=0 GOMAXPROCS=1 GOGC=30 GOCACHE=/tmp/.cache/go-build /usr/local/go-1.9/bin/go build -p 1 %s main.go' "
                            "WHERE id = 22;"
                        )
                    )

                    # Update Java (OpenJDK 13.0.1) with id 62
                    session.connection().execute(
                        text(
                            "UPDATE languages "
                            "SET compile_cmd = '/usr/local/openjdk13/bin/javac -J-Xmx96m -J-Xms16m -J-XX:MaxMetaspaceSize=96m -J-XX:CompressedClassSpaceSize=16m -J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 %s Main.java', "
                            "    run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/local/openjdk13/bin/java -Xint -Xmx64m -Xms8m -Xss512k -XX:VMThreadStackSize=512 -XX:CompilerThreadStackSize=512 -XX:MaxMetaspaceSize=64m -XX:CompressedClassSpaceSize=16m -XX:ReservedCodeCacheSize=16m -XX:+UseSerialGC Main' "
                            "WHERE id = 62;"
                        )
                    )

                    # Update Java (OpenJDK 9 with Eclipse OpenJ9) with id 26
                    session.connection().execute(
                        text(
                            "UPDATE languages "
                            "SET compile_cmd = '/usr/local/openjdk9-openj9/bin/javac -J-Xmx64m %s Main.java', "
                            "    run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/local/openjdk9-openj9/bin/java -Xint -Xmx16m -Xms8m -Xss256k Main' "
                            "WHERE id = 26;"
                        )
                    )

                    # Update Java (OpenJDK 8) with id 27
                    session.connection().execute(
                        text(
                            "UPDATE languages "
                            "SET compile_cmd = '/usr/lib/jvm/java-8-openjdk-amd64/bin/javac -J-Xmx96m -J-Xms16m -J-XX:MaxMetaspaceSize=96m -J-XX:CompressedClassSpaceSize=16m -J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 %s Main.java', "
                            "    run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/lib/jvm/java-8-openjdk-amd64/bin/java -Xint -Xmx64m -Xms8m -Xss512k -XX:VMThreadStackSize=512 -XX:CompilerThreadStackSize=512 -XX:MaxMetaspaceSize=64m -XX:CompressedClassSpaceSize=16m -XX:ReservedCodeCacheSize=16m -XX:+UseSerialGC Main' "
                            "WHERE id = 27;"
                        )
                    )

                    # Update Java (OpenJDK 7) with id 28
                    session.connection().execute(
                        text(
                            "UPDATE languages "
                            "SET compile_cmd = '/usr/lib/jvm/java-7-openjdk-amd64/bin/javac -J-Xmx96m -J-Xms16m -J-XX:MaxPermSize=96m -J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 %s Main.java', "
                            "    run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/lib/jvm/java-7-openjdk-amd64/bin/java -Xint -Xmx64m -Xms8m -Xss512k -XX:VMThreadStackSize=512 -XX:CompilerThreadStackSize=512 -XX:MaxPermSize=64m -XX:ReservedCodeCacheSize=16m -XX:+UseSerialGC Main' "
                            "WHERE id = 28;"
                        )
                    )

                    # Update Kotlin (1.3.70) with id 78
                    session.connection().execute(
                        text(
                            "UPDATE languages "
                            "SET compile_cmd = '/usr/bin/env JAVA_OPTS=\"-Xmx512m -Xms64m -XX:MaxMetaspaceSize=256m -XX:CompressedClassSpaceSize=64m -XX:ReservedCodeCacheSize=64m -XX:+UseSerialGC\" /usr/local/kotlin-1.3.70/bin/kotlinc %s Main.kt -include-runtime -d main.jar', "
                            "    run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/local/openjdk13/bin/java -Xint -Xmx64m -Xms8m -Xss512k -XX:VMThreadStackSize=512 -XX:CompilerThreadStackSize=512 -XX:MaxMetaspaceSize=64m -XX:CompressedClassSpaceSize=16m -XX:ReservedCodeCacheSize=16m -XX:+UseSerialGC -jar main.jar' "
                            "WHERE id = 78;"
                        )
                    )

                    session.commit()
                    logger.info("Successfully patched Judge0 languages table.")
                    return
                logger.warning(
                    "Judge0 target languages (id 22, 60, 62) not yet available in DB (found %s). Retrying in %ss... (attempt %s/%s)",
                    res,
                    retry_interval,
                    attempt,
                    max_retries,
                )
        except Exception as e:
            logger.warning(
                "Languages table not yet ready or error encountered: %s. Retrying in %ss... (attempt %s/%s)",
                e,
                retry_interval,
                attempt,
                max_retries,
            )

        time.sleep(retry_interval)

    logger.error(
        "Could not patch Judge0 languages table: languages not found or database not initialized by Judge0 within timeout."
    )


def start_judge0_patcher(session_factory: sessionmaker[Session]) -> None:
    """Spawns a daemon thread to apply Judge0 patches asynchronously,
    preventing any blockage of the main application/startup lifespan.
    """
    thread = threading.Thread(target=apply_judge0_patches, args=(session_factory,), daemon=True)
    thread.start()
