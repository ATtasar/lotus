"""Fail if the approved desktop resources differ from their recorded hashes."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def check():
    expected = json.loads((ROOT / "docs/UI-MANIFEST.json").read_text(encoding="utf-8"))
    for name, checksum in expected["files"].items():
        file = ROOT / name
        if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != checksum:
            raise ValueError("现有电脑端资源被修改：" + name)
    print("PASS: all approved desktop UI resources are unchanged", flush=True)


if __name__ == "__main__":
    check()
