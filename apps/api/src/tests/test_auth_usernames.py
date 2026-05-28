from src.services.auth.usernames import build_generated_username


def test_generated_username_falls_back_to_email_for_non_ascii_names() -> None:
    assert (
        build_generated_username(
            "\u0418\u0432\u0430\u043d",
            "\u0418\u0432\u0430\u043d\u043e\u0432",
            email="student.ivanov@example.com",
            suffix="8674",
        )
        == "student.ivanov.8674"
    )


def test_generated_username_collapses_punctuation() -> None:
    assert build_generated_username("John..", ".Doe", email="john@example.com", suffix="0001") == "john.doe.0001"
