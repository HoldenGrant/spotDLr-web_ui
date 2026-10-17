"""
spotDLr's version: the one place it's written. Shown in Settings → About.

When releasing: set VERSION here, rename [Unreleased] in CHANGELOG.md to this version, then tag vVERSION.
The Windows build refuses a tag that doesn't match VERSION, so the installer never shows a wrong number.
"""

import subprocess
import sys
from functools import lru_cache
from pathlib import Path

VERSION = "2.1.0"


@lru_cache(maxsize=1)
def source_build():
    """From source, where this copy stands against the tags: "v2.0.1" (exactly the release),
    "v2.0.1-3-gabc1234" (3 commits after it), "-dirty" (uncommitted changes). None in the installed app."""
    if getattr(sys, "frozen", False):
        return None
    try:
        result = subprocess.run(["git", "describe", "--tags", "--dirty", "--always"], cwd=Path(__file__).parent,
                                capture_output=True, text=True, timeout=3)
        return result.stdout.strip() or None if result.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None  # no git, or not a git checkout (e.g. a downloaded zip)
