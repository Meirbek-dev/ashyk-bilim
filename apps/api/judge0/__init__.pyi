from collections.abc import Sequence
from datetime import datetime
from typing import Literal, Protocol

class _HttpClient(Protocol):
    def close(self) -> None: ...

class Language:
    id: int
    name: str
    is_archived: bool

class Client:
    endpoint: str
    client: _HttpClient
    languages: list[Language]
    config: object
    @property
    def retry_strategy(self) -> object: ...
    @retry_strategy.setter
    def retry_strategy(self, value: object) -> None: ...
    def get_languages(self) -> list[Language]: ...
    def get_config_info(self) -> object: ...

class Status:
    ACCEPTED: Literal[3]
    WRONG_ANSWER: Literal[4]
    TIME_LIMIT_EXCEEDED: Literal[5]
    COMPILATION_ERROR: Literal[6]
    RUNTIME_ERROR: Literal[11]

class TestCase:
    input: str
    expected_output: str | None
    def __init__(self, input_: str, expected_output: str | None) -> None: ...

class Submission:
    token: str | None
    status: int | str | None
    message: str | None
    stdout: str | None
    stderr: str | None
    compile_output: str | None
    time: float | str | None
    memory: int | None
    created_at: datetime | None
    finished_at: datetime | None

def run(
    *,
    client: Client,
    source_code: str,
    language: int,
    test_cases: Sequence[TestCase],
    cpu_time_limit: float | None = None,
    wall_time_limit: float | None = None,
    compiler_options: str | None = None,
    memory_limit: int | None = None,
    stack_limit: int | None = None,
    max_processes_and_or_threads: int | None = None,
    enable_per_process_and_thread_time_limit: bool = False,
    enable_per_process_and_thread_memory_limit: bool = False,
    max_file_size: int | None = None,
    enable_network: bool = False,
) -> Submission | list[Submission]: ...
