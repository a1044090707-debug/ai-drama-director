"""Create a complete source/assets archive without tool installations or caches."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = "ai-director-complete-2026-11-09"
OUTPUT = ROOT / (NAME + ".zip")
DIRECTORIES = ("assets", "vendor", "model-preview", "modeling", "tests", "design-demos")
CODE = {".js", ".mjs", ".cjs", ".py", ".html", ".css", ".md", ".json", ".ps1", ".cmd", ".bat"}


def include(path):
    return not any(part in {"__pycache__", "node_modules", ".git"} for part in path.parts) and path.suffix not in {".pyc", ".pyo"} and not re.search(r"\.blend\d+$", path.name)


def main():
    files = {p for p in ROOT.iterdir() if p.is_file() and (p.suffix.lower() in CODE | {".png"} or p.name == ".gitignore")}
    for directory in DIRECTORIES:
        files.update(p for p in (ROOT / directory).rglob("*") if p.is_file() and include(p.relative_to(ROOT)))
    files.update(p for p in (ROOT / ".modeling").iterdir() if p.is_file() and p.suffix.lower() in CODE)
    files = sorted(files, key=lambda p: p.relative_to(ROOT).as_posix())
    entries = []
    for path in files:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        entries.append({"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": digest.hexdigest()})
    manifest = {"project": NAME, "date": "2026-11-09", "files": entries, "file_count": len(entries), "total_bytes": sum(entry["bytes"] for entry in entries)}
    print(json.dumps({"stage": "compressing", "files": len(files), "source_mb": round(manifest["total_bytes"] / 1024**2, 1)}), flush=True)
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for path in files:
            archive.write(path, NAME + "/" + path.relative_to(ROOT).as_posix())
        archive.writestr(NAME + "/PACKAGE-MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    with zipfile.ZipFile(OUTPUT) as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError("ZIP CRC failure: " + bad)
        assert len(archive.namelist()) == len(entries) + 1
        for entry in entries:
            info = archive.getinfo(NAME + "/" + entry["path"])
            assert info.file_size == entry["bytes"], entry["path"]
        # Check the current homepage's code imports and asset references.
        for name in ("index.html", "style.css", "characters.js", "motion.js", "avatar3d.js", "animal-avatar3d.mjs", "character-models.mjs", "imported-avatar.mjs", "jaw-morph.mjs", "action-poses.mjs", "model-preview/fullbody/driver.mjs", "model-preview/rain/avatar.mjs", "vendor/three.module.js", "vendor/GLTFLoader.js", "vendor/BufferGeometryUtils.js", "start.py", "start.cmd", "运行说明.md"):
            archive.getinfo(NAME + "/" + name)
        models = (ROOT / "character-models.mjs").read_text(encoding="utf-8")
        assets = re.findall(r"asset:'\./([^']+)'", models)
        assert len(assets) == 8
        for asset in assets:
            archive.getinfo(NAME + "/" + asset)
    print(json.dumps({"stage": "verified", "path": str(OUTPUT), "files": len(entries) + 1, "zip_mb": round(OUTPUT.stat().st_size / 1024**2, 1), "human_models": len(assets), "crc": "PASS"}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
