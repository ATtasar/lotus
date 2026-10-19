import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import pytest

from test_storage import fixture

ROOT = Path(__file__).resolve().parents[1]
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def test_service_state_removed_during_stop_is_safe(tmp_path, monkeypatch):
    import launcher
    (tmp_path / 'runtime').mkdir()
    (tmp_path / 'runtime/service.json').write_text('{}')
    def removed_during_read(_):
        raise FileNotFoundError('service removed its own state while exiting')
    monkeypatch.setattr(launcher, 'read_json', removed_during_read)
    assert launcher.state(tmp_path) is None


def test_corrupt_service_state_is_not_silently_ignored(tmp_path):
    import launcher
    (tmp_path / 'runtime').mkdir()
    (tmp_path / 'runtime/service.json').write_text('{broken')
    with pytest.raises(json.JSONDecodeError):
        launcher.state(tmp_path)


def test_source_install_restart_and_missing_config_recovery(tmp_path):
    port = 17862
    base = f"http://127.0.0.1:{port}"
    def run(command, *args, ok=True):
        result = subprocess.run([sys.executable, str(ROOT / "launcher.py"), command, "--data-root", str(tmp_path), *args], cwd=tmp_path, env={**os.environ, "PYTHONUTF8": "1"}, capture_output=True, text=True, encoding="utf-8", timeout=45)
        if ok:
            assert result.returncode == 0, result.stdout + result.stderr
        else:
            assert result.returncode != 0
        return result
    def request(endpoint, body=None):
        with HTTP.open(urllib.request.Request(base + "/local-api/session", headers={"X-Lotus-Local": "1"})) as response:
            token = json.load(response)["token"]
        headers = {"X-Lotus-Local": "1", "X-Lotus-Token": token}
        if body is not None:
            headers["Content-Type"] = "application/json"
        with HTTP.open(urllib.request.Request(base + "/local-api/" + endpoint, headers=headers, data=json.dumps(body).encode() if body is not None else None)) as response:
            return json.load(response)
    try:
        run("install", "--port", str(port), "--no-browser", "--no-tray", "--no-shortcut")
        original = fixture()
        request("desktop-workspace", {"data": original, "baseRevision": 0})
        before = request("desktop-workspace")
        first = request("health")
        run("start", "--no-browser", "--no-tray")
        assert request("health")["pid"] == first["pid"]
        run("stop")
        (tmp_path / "config.json").rename(tmp_path / "preserved-config.json")
        run("start", "--no-browser", "--no-tray")
        assert request("desktop-workspace") == before
        assert request("health")["port"] == port
        run("stop")
        database = tmp_path / "data/workbench.sqlite"
        database.rename(tmp_path / "preserved-database.sqlite")
        try:
            assert "未新建空库" in run("start", "--no-browser", "--no-tray", ok=False).stdout
            assert not database.exists()
        finally:
            (tmp_path / "preserved-database.sqlite").rename(database)
        run("start", "--no-browser", "--no-tray")
        assert request("desktop-workspace") == before
    finally:
        run("stop")
