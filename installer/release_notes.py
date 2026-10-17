"""
Build the GitHub Release text for a version: its section of CHANGELOG.md, then the install steps.

    python installer/release_notes.py v2.0.1 --out notes.md

Used by .github/workflows/windows-installer.yml when a version tag is pushed. If CHANGELOG.md has no
section for the version, the Release still gets the install steps (and the build prints a warning).
"""

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def changelog_section(version):
    """The body under '## [2.0.1] - date' (or '## 2.0.1'), up to the next '## ' heading."""
    text = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    heading = re.compile(rf"^## \[?{re.escape(version)}\]?(?:\s|$).*$", re.M)
    match = heading.search(text)
    if not match:
        return None
    rest = text[match.end():]
    end = re.search(r"^## |^\[[^\]]+\]: ", rest, re.M)  # next version, or the link list at the bottom
    return rest[:end.start() if end else len(rest)].strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tag", help="the version tag, e.g. v2.0.1")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    version = args.tag.lstrip("v")
    install = (ROOT / "installer" / "RELEASE_NOTES.md").read_text(encoding="utf-8").strip()
    section = changelog_section(version)
    if section:
        body = f"## What's new in {version}\n\n{section.replace('### ', '#### ')}\n\n---\n\n{install}\n"
    else:
        print(f"::warning::CHANGELOG.md has no section for {version}; the Release only gets the install steps")
        body = install + "\n"
    Path(args.out).write_text(body, encoding="utf-8")
    print(f"Release notes for {version}: {len(body)} characters")


if __name__ == "__main__":
    main()
