from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
SRC_ROOT = APP_ROOT / "src"


@dataclass(frozen=True)
class Finding:
    path: Path
    line: int
    code: str
    message: str

    def format(self) -> str:
        return f"{self.path.relative_to(APP_ROOT)}:{self.line}: {self.code} {self.message}"


def _is_http_exception_call(node: ast.AST) -> bool:
    return isinstance(node, ast.Call) and (
        (isinstance(node.func, ast.Name) and node.func.id == "HTTPException")
        or (isinstance(node.func, ast.Attribute) and node.func.attr == "HTTPException")
    )


def _has_string_detail(node: ast.Call) -> bool:
    for keyword in node.keywords:
        if keyword.arg == "detail" and isinstance(keyword.value, ast.Constant) and isinstance(keyword.value.value, str):
            return True
    return False


def _scan_file(path: Path) -> list[Finding]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    findings: list[Finding] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Raise) and node.exc is not None and _is_http_exception_call(node.exc):
            assert isinstance(node.exc, ast.Call)
            code = "RAW_HTTP_EXCEPTION_STRING" if _has_string_detail(node.exc) else "RAW_HTTP_EXCEPTION"
            findings.append(
                Finding(
                    path=path,
                    line=node.lineno,
                    code=code,
                    message="raise AppError subclasses instead of raw HTTPException",
                )
            )

        if isinstance(node, ast.ExceptHandler):
            catches_broad_exception = node.type is None or (
                isinstance(node.type, ast.Name) and node.type.id in {"Exception", "BaseException"}
            )
            if catches_broad_exception:
                findings.append(
                    Finding(
                        path=path,
                        line=node.lineno,
                        code="BROAD_EXCEPTION_CATCH",
                        message="classify as dependency, side effect, background retry, or bug",
                    )
                )

    return findings


def main() -> int:
    findings: list[Finding] = []
    for path in sorted(SRC_ROOT.rglob("*.py")):
        if "tests" in path.parts:
            continue
        findings.extend(_scan_file(path))

    by_code: dict[str, int] = {}
    for finding in findings:
        by_code[finding.code] = by_code.get(finding.code, 0) + 1

    print("Backend error handling audit")
    for code, count in sorted(by_code.items()):
        print(f"- {code}: {count}")

    if findings:
        print("\nFirst findings:")
        for finding in findings[:100]:
            print(f"- {finding.format()}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
