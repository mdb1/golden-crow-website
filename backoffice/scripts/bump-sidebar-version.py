#!/usr/bin/env python3

import re
import subprocess
import sys
from pathlib import Path

VERSION_FILE = "backoffice/src/lib/app-version.ts"
VERSION_PATTERN = re.compile(r'BACKOFFICE_VERSION = "(\d+)\.(\d+)"')


def get_repo_root() -> Path:
    return Path(
        subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            text=True,
        ).strip()
    )


def increment_version(current_version: str) -> str:
    major_part, minor_part = current_version.split(".")
    major = int(major_part)
    minor = int(minor_part)
    return f"{major}.{minor + 1}"


def main() -> int:
    repo_root = get_repo_root()
    version_file_path = repo_root / VERSION_FILE
    source = version_file_path.read_text(encoding="utf8")
    match = VERSION_PATTERN.search(source)

    if match is None:
        raise RuntimeError(f"Could not find BACKOFFICE_VERSION in {version_file_path}")

    current_version = f"{match.group(1)}.{match.group(2)}"
    next_version = increment_version(current_version)

    if "--dry-run" in sys.argv:
        print(next_version)
        return 0

    next_source = VERSION_PATTERN.sub(
        f'BACKOFFICE_VERSION = "{next_version}"',
        source,
        count=1,
    )
    version_file_path.write_text(next_source, encoding="utf8")
    subprocess.run(
        ["git", "add", VERSION_FILE],
        cwd=repo_root,
        check=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
