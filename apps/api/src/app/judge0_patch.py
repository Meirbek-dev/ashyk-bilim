import logging
import time
import threading
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session

logger = logging.getLogger(__name__)

def apply_judge0_patches(session_factory: sessionmaker[Session]) -> None:
    """
    Applies patches to the Judge0 languages database table.
    Enforces virtual memory/concurrency bounds for Go and Java compilers
    so they run correctly under 256MB sandbox constraints.
    """
    logger.info("Starting Judge0 language patches checking/polling...")
    
    max_retries = 24  # Poll for up to 2 minutes
    retry_interval = 5.0
    
    for attempt in range(1, max_retries + 1):
        try:
            with session_factory() as session:
                # Check if languages table exists and contains the necessary rows
                res = session.execute(text(
                    "SELECT COUNT(*) FROM languages WHERE id IN (22, 60, 62);"
                )).scalar()
                
                if res and res >= 3:
                    logger.info(f"Target languages found in database. Applying updates (attempt {attempt})...")
                    
                    # Update Go (1.13.5) with id 60
                    session.execute(text(
                        "UPDATE languages "
                        "SET compile_cmd = 'CGO_ENABLED=0 GOCACHE=/tmp/.cache/go-build /usr/local/go-1.13.5/bin/go build -p 2 %s main.go' "
                        "WHERE id = 60;"
                    ))
                    
                    # Update Go (1.9) with id 22
                    session.execute(text(
                        "UPDATE languages "
                        "SET compile_cmd = 'CGO_ENABLED=0 GOCACHE=/tmp/.cache/go-build /usr/local/go-1.9/bin/go build -p 2 %s main.go' "
                        "WHERE id = 22;"
                    ))
                    
                    # Update Java (OpenJDK 13.0.1) with id 62
                    session.execute(text(
                        "UPDATE languages "
                        "SET compile_cmd = '/usr/local/openjdk13/bin/javac -J-Xmx64m -J-XX:CompressedClassSpaceSize=16m -J-XX:MaxMetaspaceSize=64m -J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 %s Main.java', "
                        "    run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/local/openjdk13/bin/java -Xint -Xmx16m -Xms8m -Xss256k -XX:VMThreadStackSize=256 -XX:CompilerThreadStackSize=256 -XX:-UseCompressedClassPointers -XX:MaxMetaspaceSize=16m -XX:ReservedCodeCacheSize=2496k -XX:+UseSerialGC Main' "
                        "WHERE id = 62;"
                    ))

                    # Update Java (OpenJDK 9 with Eclipse OpenJ9) with id 26
                    session.execute(text(
                        "UPDATE languages "
                        "SET compile_cmd = '/usr/local/openjdk9-openj9/bin/javac -J-Xmx64m %s Main.java', "
                        "    run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/local/openjdk9-openj9/bin/java -Xint -Xmx16m -Xms8m -Xss256k Main' "
                        "WHERE id = 26;"
                    ))

                    # Update Java (OpenJDK 8) with id 27
                    session.execute(text(
                        "UPDATE languages "
                        "SET compile_cmd = '/usr/lib/jvm/java-8-openjdk-amd64/bin/javac -J-Xmx64m -J-XX:CompressedClassSpaceSize=16m -J-XX:MaxMetaspaceSize=64m -J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 %s Main.java', "
                        "    run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/lib/jvm/java-8-openjdk-amd64/bin/java -Xint -Xmx16m -Xms8m -Xss256k -XX:VMThreadStackSize=256 -XX:CompilerThreadStackSize=256 -XX:-UseCompressedClassPointers -XX:MaxMetaspaceSize=16m -XX:ReservedCodeCacheSize=2496k -XX:+UseSerialGC Main' "
                        "WHERE id = 27;"
                    ))

                    # Update Java (OpenJDK 7) with id 28
                    session.execute(text(
                        "UPDATE languages "
                        "SET compile_cmd = '/usr/lib/jvm/java-7-openjdk-amd64/bin/javac -J-Xmx64m -J-XX:MaxPermSize=64m -J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 %s Main.java', "
                        "    run_cmd = '/usr/bin/env MALLOC_ARENAS_MAX=1 /usr/lib/jvm/java-7-openjdk-amd64/bin/java -Xint -Xmx16m -Xms8m -Xss256k -XX:VMThreadStackSize=256 -XX:CompilerThreadStackSize=256 -XX:MaxPermSize=16m -XX:ReservedCodeCacheSize=2496k -XX:+UseSerialGC Main' "
                        "WHERE id = 28;"
                    ))

                    
                    session.commit()
                    logger.info("Successfully patched Judge0 languages table.")
                    return
                else:
                    logger.warning(
                        f"Judge0 target languages (id 22, 60, 62) not yet available in DB (found {res}). "
                        f"Retrying in {retry_interval}s... (attempt {attempt}/{max_retries})"
                    )
        except Exception as e:
            logger.warning(
                f"Languages table not yet ready or error encountered: {e}. "
                f"Retrying in {retry_interval}s... (attempt {attempt}/{max_retries})"
            )
        
        time.sleep(retry_interval)
        
    logger.error("Could not patch Judge0 languages table: languages not found or database not initialized by Judge0 within timeout.")

def start_judge0_patcher(session_factory: sessionmaker[Session]) -> None:
    """
    Spawns a daemon thread to apply Judge0 patches asynchronously,
    preventing any blockage of the main application/startup lifespan.
    """
    thread = threading.Thread(target=apply_judge0_patches, args=(session_factory,), daemon=True)
    thread.start()
