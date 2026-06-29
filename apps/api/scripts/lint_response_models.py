from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
SRC_ROOT = APP_ROOT / "src"
ROUTE_METHODS = {"get", "post", "put", "patch", "delete", "api_route"}
ALLOWED_RESPONSE_CLASSES = {
    "EventSourceResponse",
    "FileResponse",
    "RedirectResponse",
    "StreamingResponse",
}
NO_CONTENT_STATUS_CODES = {"204", "status.HTTP_204_NO_CONTENT"}


@dataclass(frozen=True)
class RouteViolation:
    path: Path
    line: int
    method: str
    route_path: str
    function_name: str

    def format(self) -> str:
        rel_path = self.path.relative_to(APP_ROOT)
        return (
            f"{rel_path}:{self.line}: @{self.method}({self.route_path}) "
            f"{self.function_name} must declare response_model"
        )


def _is_route_decorator(decorator: ast.expr) -> bool:
    if not isinstance(decorator, ast.Call):
        return False
    if not isinstance(decorator.func, ast.Attribute):
        return False
    if decorator.func.attr not in ROUTE_METHODS:
        return False
    return isinstance(decorator.func.value, ast.Name) and decorator.func.value.id in {"app", "router"}


def _keyword_expr(decorator: ast.Call, name: str) -> str | None:
    for keyword in decorator.keywords:
        if keyword.arg == name:
            return ast.unparse(keyword.value)
    return None


def _has_required_response_contract(decorator: ast.Call) -> bool:
    response_model = _keyword_expr(decorator, "response_model")
    if response_model is not None and response_model != "None":
        return True

    status_code = _keyword_expr(decorator, "status_code")
    if status_code in NO_CONTENT_STATUS_CODES:
        return True

    response_class = _keyword_expr(decorator, "response_class")
    return response_class in ALLOWED_RESPONSE_CLASSES


def _route_path(decorator: ast.Call) -> str:
    if not decorator.args:
        return '""'
    return ast.unparse(decorator.args[0])


def _scan_file(path: Path) -> list[RouteViolation]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    violations: list[RouteViolation] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        for decorator in node.decorator_list:
            if not _is_route_decorator(decorator):
                continue
            assert isinstance(decorator, ast.Call)
            if _has_required_response_contract(decorator):
                continue
            assert isinstance(decorator.func, ast.Attribute)
            violations.append(
                RouteViolation(
                    path=path,
                    line=decorator.lineno,
                    method=decorator.func.attr,
                    route_path=_route_path(decorator),
                    function_name=node.name,
                )
            )
    return violations


def main() -> int:
    violations: list[RouteViolation] = []
    for path in sorted(SRC_ROOT.rglob("*.py")):
        if "tests" in path.parts:
            continue
        violations.extend(_scan_file(path))

    if violations:
        print("Routes returning JSON must declare an explicit response_model.", file=sys.stderr)
        print("Allowed exceptions: 204, RedirectResponse, StreamingResponse, FileResponse, SSE.", file=sys.stderr)
        for violation in violations:
            print(violation.format(), file=sys.stderr)
        return 1

    print("All JSON routes declare response_model or an allowed non-JSON exception.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
