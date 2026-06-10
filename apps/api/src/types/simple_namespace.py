from typing import override


class SimpleNamespace:
    def __init__(self, **kwargs: object) -> None:
        self.__dict__.update(kwargs)

    @override
    def __repr__(self) -> str:
        items = " ".join(f"{key}={value!r}" for key, value in sorted(self.__dict__.items()))
        return f"{type(self).__name__}({items})"
