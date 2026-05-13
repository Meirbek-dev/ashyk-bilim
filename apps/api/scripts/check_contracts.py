#!/usr/bin/env python3
"""CI contract verification for the API.

Scans Python source files for legacy symbols and patterns that should have been
fully removed after the Assessment Modernization migration.

Exit codes:
  0 — all checks passed
  1 — one or more violations found

Usage (from repo root):
    python apps/api/scripts/check_contracts.py

Or via uv:
    uv run python apps/api/scripts/check_contracts.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# ── Configuration ─────────────────────────────────────────────────────────────

# Root directory to scan (resolved relative to this script's parent).
_SRC_ROOT = Path(__file__).parent.parent / "src"

# Patterns that must NOT appear in any .py file.
# Each entry is (pattern, description).
_FORBIDDEN_PATTERNS: list[tuple[str, str]] = [
    ("assignment_scheduler", "Legacy assignment_scheduler symbol"),
    ("grade_assignments", "Legacy grade_assignments permission key"),
    ("AssignmentTask ", "Legacy AssignmentTask model reference"),
    ("assignmenttasksubmission", "Legacy assignmenttasksubmission table name"),
    ("AssignmentUserSubmission", "Legacy AssignmentUserSubmission model reference"),
    ("assignmentusersubmission", "Legacy assignmentusersubmission table name"),
]

# Allowlist: files that may legitimately contain a forbidden pattern.
# Add file paths (relative to _SRC_ROOT) that are migration scripts or
# the contract check itself.
_ALLOWLIST: frozenset[str] = frozenset({
    # The migration that drops the legacy tables may reference them.
    "migrations/versions/a1b2c3d4e5f7_drop_legacy_assignment_tables.py",
    # This script itself is allowed to contain the patterns for matching.
    "scripts/check_contracts.py",
    # Deprecated permission map for backward compat.
    "src/security/rbac.py",
    # Validate pipeline rejects legacy submission kinds by name.
    "src/services/grading/pipeline/validate.py",
})


# ── Scanner ───────────────────────────────────────────────────────────────────

def _relative(path: Path) -> str:
    try:
        return str(path.relative_to(_SRC_ROOT.parent))
    except ValueError:
        return str(path)


def run_checks() -> int:
    """Run all contract checks. Returns the total number of violations found."""
    total_violations = 0

    for pattern, description in _FORBIDDEN_PATTERNS:
        violations = _scan_pattern(pattern, description)
        total_violations += len(violations)
        if violations:
            print(f"\n✗ FAIL — {description} (pattern: '{pattern}')")
            for file_path, line_no, line in violations:
                print(f"  {_relative(file_path)}:{line_no}: {line.strip()}")
        else:
            print(f"✓ {description}")

    return total_violations


def _scan_pattern(pattern: str, _description: str) -> list[tuple[Path, int, str]]:
    """Return list of (path, line_number, line) for each occurrence."""
    violations: list[tuple[Path, int, str]] = []
    for py_file in sorted(_SRC_ROOT.rglob("*.py")):
        # Normalise to forward slashes for cross-platform allowlist matching.
        rel = str(py_file.relative_to(_SRC_ROOT.parent)).replace(chr(92), chr(47))
        if any(al in rel for al in _ALLOWLIST):
            continue

        try:
            lines = py_file.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue

        for line_no, line in enumerate(lines, start=1):
            if pattern.lower() in line.lower():
                violations.append((py_file, line_no, line))

    return violations


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Scanning {_SRC_ROOT} for legacy patterns...\n")
    violations = run_checks()
    print()
    if violations:
        print(f"[check:contracts] FAILED — {violations} violation(s) found. Fix before merging.")
        sys.exit(1)
    else:
        print("[check:contracts] All contract checks passed.")
        sys.exit(0)
