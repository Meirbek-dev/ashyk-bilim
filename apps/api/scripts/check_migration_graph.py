"""Validate Alembic revision links without importing migration modules."""

from __future__ import annotations

import argparse
import ast
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Revision:
    revision_id: str
    down_revisions: tuple[str, ...]
    path: Path


def _literal_assignment(module: ast.Module, name: str) -> object | None:
    for node in module.body:
        value: ast.expr | None = None
        targets: list[str] = []

        if isinstance(node, ast.Assign):
            value = node.value
            targets = [target.id for target in node.targets if isinstance(target, ast.Name)]
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            value = node.value
            targets = [node.target.id]

        if name in targets and value is not None:
            return ast.literal_eval(value)

    return None


def _as_down_revisions(value: object) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return (value,)
    if isinstance(value, tuple) and all(isinstance(item, str) for item in value):
        return value

    msg = f"Unsupported down_revision value: {value!r}"
    raise TypeError(msg)


def load_revisions(versions_dir: Path) -> list[Revision]:
    revisions: list[Revision] = []
    for path in sorted(versions_dir.glob("*.py")):
        module = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        revision_id = _literal_assignment(module, "revision")
        if not isinstance(revision_id, str):
            msg = f"{path}: missing literal revision id"
            raise TypeError(msg)
        revisions.append(
            Revision(
                revision_id=revision_id,
                down_revisions=_as_down_revisions(_literal_assignment(module, "down_revision")),
                path=path,
            )
        )
    return revisions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--versions-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "migrations" / "versions",
        help="Alembic versions directory. Defaults to apps/api/migrations/versions.",
    )
    parser.add_argument(
        "--require-single-head",
        action="store_true",
        help="Fail unless the graph has exactly one head.",
    )
    args = parser.parse_args()

    revisions = load_revisions(args.versions_dir)
    by_id: dict[str, Revision] = {}
    duplicate_ids: set[str] = set()
    for revision in revisions:
        if revision.revision_id in by_id:
            duplicate_ids.add(revision.revision_id)
        by_id[revision.revision_id] = revision

    child_count = {revision.revision_id: 0 for revision in revisions}
    missing_refs: list[tuple[str, str, Path]] = []
    for revision in revisions:
        for parent_id in revision.down_revisions:
            parent = by_id.get(parent_id)
            if parent is None:
                missing_refs.append((revision.revision_id, parent_id, revision.path))
            else:
                child_count[parent.revision_id] += 1

    heads = sorted(revision_id for revision_id, count in child_count.items() if count == 0)
    bases = sorted(revision.revision_id for revision in revisions if not revision.down_revisions)

    print(f"revisions: {len(revisions)}")
    print(f"heads: {len(heads)} {', '.join(heads)}")
    print(f"bases: {len(bases)} {', '.join(bases)}")
    print(f"missing down_revision references: {len(missing_refs)}")

    for revision_id in sorted(duplicate_ids):
        print(f"duplicate revision id: {revision_id}")
    for revision_id, parent_id, path in missing_refs:
        print(f"missing reference: {revision_id} -> {parent_id} ({path.name})")

    if duplicate_ids or missing_refs:
        return 1
    if args.require_single_head and len(heads) != 1:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
