#!/usr/bin/env python3
"""
Package extension/ into a Chrome Web Store-ready zip (stdlib only, no deps).

The zip places manifest.json at its ROOT (as the store requires), reading the
version from the manifest to name the artifact.

Run:  python3 tools/build.py
Out:  dist/tabq-<version>.zip
"""

import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "extension")
DIST = os.path.join(ROOT, "dist")

# Files/dirs that must never ship inside the package.
EXCLUDE_NAMES = {".DS_Store", "Thumbs.db"}
EXCLUDE_EXT = {".zip", ".swp", ".tmp"}


def included(path):
    name = os.path.basename(path)
    if name in EXCLUDE_NAMES:
        return False
    if os.path.splitext(name)[1] in EXCLUDE_EXT:
        return False
    return True


def main():
    with open(os.path.join(SRC, "manifest.json"), encoding="utf-8") as f:
        version = json.load(f)["version"]

    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, f"tabq-{version}.zip")

    count = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for folder, _dirs, files in os.walk(SRC):
            for name in files:
                full = os.path.join(folder, name)
                if not included(full):
                    continue
                # arcname is relative to extension/ -> manifest.json at the root
                arcname = os.path.relpath(full, SRC)
                zf.write(full, arcname)
                count += 1

    size_kb = os.path.getsize(out) / 1024
    print(f"Packaged {count} files -> {os.path.relpath(out, ROOT)} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
