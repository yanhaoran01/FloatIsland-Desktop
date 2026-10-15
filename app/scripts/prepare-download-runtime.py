# FloatIsland - https://github.com/JNTMTMTM/eIsland
# Copyright (C) 2026 contributors. GPL-3.0.
"""@file prepare-download-runtime.py
@description Reproduce pinned Windows media resources from the checked-in manifest.
@author 鸡哥
"""
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "resources" / "download-runtime"
MANIFEST = json.loads((DEST / "manifest.json").read_text(encoding="utf8"))
CACHE = ROOT / ".fusion-build" / "download-cache"
CACHE.mkdir(parents=True, exist_ok=True)

def sha(path):
    """Hash a local file in bounded blocks."""
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1048576), b""):
            value.update(chunk)
    return value.hexdigest()

for component in MANIFEST["components"]:
    if all((DEST / row["name"]).exists() and sha(DEST / row["name"]) == row["sha256"] for row in component["files"]):
        continue
    url = component["url"]
    if not url.startswith("https://github.com/"):
        raise RuntimeError("Untrusted resource source")
    archive = CACHE / (component["archiveSha256"] + Path(url).suffix)
    if not archive.exists() or sha(archive) != component["archiveSha256"]:
        temporary = archive.with_suffix(".part")
        request = urllib.request.Request(url, headers={"User-Agent": "FloatIsland-build"})
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            while chunk := response.read(1048576):
                output.write(chunk)
        if sha(temporary) != component["archiveSha256"]:
            temporary.unlink()
            raise RuntimeError("Download checksum mismatch")
        temporary.replace(archive)
    if url.endswith(".zip"):
        with zipfile.ZipFile(archive) as source:
            for row in component["files"]:
                matches = [name for name in source.namelist() if Path(name).name == row["name"]]
                if len(matches) != 1:
                    raise RuntimeError("Ambiguous archive member")
                (DEST / row["name"]).write_bytes(source.read(matches[0]))
    else:
        (DEST / component["files"][0]["name"]).write_bytes(archive.read_bytes())
    for row in component["files"]:
        if sha(DEST / row["name"]) != row["sha256"]:
            raise RuntimeError("Extracted binary checksum mismatch")
print("Pinned media resources verified")
