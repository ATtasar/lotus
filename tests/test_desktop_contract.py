from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]


def test_approved_ui_is_byte_identical():
    manifest = json.loads((ROOT / "docs/UI-MANIFEST.json").read_text(encoding="utf-8"))
    for name, checksum in manifest["files"].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == checksum, name


def test_windows_cmds_have_real_crlf_without_bom():
    for file in ROOT.glob("*.cmd"):
        content = file.read_bytes()
        assert not content.startswith(b"\xef\xbb\xbf"), file.name
        assert b"\r\n" in content, file.name
        assert b"\n" not in content.replace(b"\r\n", b""), file.name
