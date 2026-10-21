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


def test_saved_data_location_survives_missing_or_stale_environment(tmp_path, monkeypatch):
    import launcher
    program, data = tmp_path / 'program', tmp_path / 'chosen-data'
    program.mkdir()
    (data / 'data').mkdir(parents=True)
    (data / 'data/workbench.sqlite').write_bytes(b'location-test')
    (program / 'data-location.json').write_text(json.dumps({'appId': 'lotus-workbench-windows-v1', 'dataRoot': str(data)}))
    monkeypatch.setattr(launcher, 'PROGRAM', program)
    monkeypatch.delenv('LOTUS_LOCAL_ROOT', raising=False)
    assert launcher.default_root() == data
    monkeypatch.setenv('LOTUS_LOCAL_ROOT', str(tmp_path / 'outdated-root'))
    assert launcher.default_root() == data


@pytest.mark.parametrize('value', [None, {'appId':'other','dataRoot':'E:/missing'}, {'appId':'lotus-workbench-windows-v1','dataRoot':'relative/path'}])
def test_invalid_saved_data_location_never_opens_another_workspace(tmp_path, monkeypatch, value):
    import launcher
    (tmp_path / 'data-location.json').write_text(json.dumps(value))
    monkeypatch.setattr(launcher, 'PROGRAM', tmp_path)
    with pytest.raises(ValueError, match='位置配置无效'):
        launcher.default_root()


def test_missing_saved_drive_never_initializes_a_blank_database(tmp_path, monkeypatch):
    import launcher
    missing = tmp_path / 'unavailable-drive'
    (tmp_path / 'data-location.json').write_text(json.dumps({'appId':'lotus-workbench-windows-v1','dataRoot':str(missing)}))
    monkeypatch.setattr(launcher, 'PROGRAM', tmp_path)
    with pytest.raises(ValueError, match='未新建空库'):
        launcher.default_root()
    assert not missing.exists()


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


def test_windows_delete_pending_state_is_retried(tmp_path, monkeypatch):
    import launcher
    errors = iter([PermissionError('delete pending'), FileNotFoundError('gone')])
    def read(_):
        raise next(errors)
    monkeypatch.setattr(launcher, 'read_json', read)
    assert launcher.state(tmp_path) is None


def test_real_state_permission_error_is_not_hidden(tmp_path, monkeypatch):
    import launcher
    def denied(_):
        raise PermissionError('real access denied')
    monkeypatch.setattr(launcher, 'read_json', denied)
    with pytest.raises(PermissionError):
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
