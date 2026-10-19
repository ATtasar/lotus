"""Fail if the desktop resources differ from the recorded revision hashes."""
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
    print("PASS: desktop resources match the recorded revision manifest", flush=True)


if __name__ == "__main__":
    check()
