from pathlib import Path
import pytest

import app as app_module
from app import create_app
from updates import UpdateCheckError
from test_storage import fixture

ORIGIN = "http://127.0.0.1:17861"


@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path, port=17861, initialize=True)
    return app.test_client(), app


def session(client):
    return {"X-Lotus-Local": "1", "X-Lotus-Token": client.get("/local-api/session", base_url=ORIGIN, headers={"X-Lotus-Local": "1"}).json["token"]}


def test_api_commits_reopens_and_returns_real_paths(client):
    client, app = client
    headers = session(client)
    response = client.post("/local-api/desktop-workspace", base_url=ORIGIN, headers=headers, json={"data": fixture(), "baseRevision": 0})
    assert response.status_code == 200 and response.json == {"revision": 1}
    assert client.get("/local-api/desktop-workspace", base_url=ORIGIN, headers=headers).json["data"] == fixture()
    info = client.get("/local-api/info", base_url=ORIGIN, headers=headers).json
    assert Path(info["databasePath"]).is_file() and Path(info["filesPath"]).is_dir()
    assert client.post("/local-api/desktop-workspace", base_url=ORIGIN, headers=headers, json={"data": fixture(), "baseRevision": 0}).status_code == 409
    assert client.post("/local-api/backup", base_url=ORIGIN, headers=headers, json={}).status_code == 200


def test_foreign_origin_host_and_missing_token_are_rejected(client):
    client, _ = client
    assert client.get("/local-api/health", base_url=ORIGIN).json["engine"] == "flask"
    assert client.get("/local-api/desktop-workspace", base_url=ORIGIN).status_code == 403
    assert client.get("/local-api/session", base_url=ORIGIN, headers={"X-Lotus-Local": "1", "Origin": "https://untrusted.example"}).status_code == 403
    assert client.get("/local-api/health", base_url="http://192.168.1.2:17861").status_code == 403
    headers = session(client)
    assert client.post("/local-api/desktop-workspace", base_url=ORIGIN, headers={**headers, "X-Lotus-Token": "wrong"}, json={}).status_code == 403
    assert client.post("/local-api/desktop-workspace", base_url=ORIGIN, headers=headers, data="{}", content_type="text/plain").status_code == 415


@pytest.mark.parametrize("url", ["/mobile/", "/local-api/workspace", "/local-api/lan/status", "/db.py", "/config.json", "/data/workbench.sqlite", "/uploads/private", "/../db.py"])
def test_desktop_only_routes(client, url):
    client, _ = client
    assert client.get(url, base_url=ORIGIN, headers=session(client)).status_code == 404


def test_desktop_resources_and_runtime_config(client):
    client, _ = client
    root = Path(__file__).resolve().parents[1]
    for name in ("index.html", "styles.css", "app.js", "api.js", "storage.js", "designer.js", "tools-extra.js", "workbench-model.js", "workspace.js", "workspace-model.js", "workspace.css"):
        response = client.get("/" + name, base_url=ORIGIN)
        assert response.data == (root / "desktop" / name).read_bytes()
        assert "connect-src 'self'" in response.headers["Content-Security-Policy"]
    assert "desktopOnly" in client.get("/runtime-config.js", base_url=ORIGIN).text


def test_update_endpoint_uses_packaged_version_and_handles_offline(client, monkeypatch):
    client, _ = client
    headers = session(client)
    info = client.get("/local-api/info", base_url=ORIGIN, headers=headers).json
    assert info["version"] == (Path(__file__).resolve().parents[1] / "VERSION").read_text().strip()

    monkeypatch.setattr(
        app_module,
        "check_for_updates",
        lambda current: {
            "currentVersion": current,
            "latestVersion": "9.0.0",
            "releaseName": "Lotus 9.0.0",
            "releaseNotes": "说明",
            "releaseUrl": "https://github.com/ATtasar/lotus/releases/tag/v9.0.0",
            "publishedAt": "2026-10-19T00:00:00Z",
            "updateAvailable": True,
            "isLatest": False,
        },
    )
    result = client.get("/local-api/update", base_url=ORIGIN, headers=headers)
    assert result.status_code == 200
    assert result.json["currentVersion"] == info["version"]
    assert result.json["updateAvailable"] is True

    monkeypatch.setattr(
        app_module,
        "check_for_updates",
        lambda _current: (_ for _ in ()).throw(UpdateCheckError("网络不可用，软件仍可离线使用。")),
    )
    result = client.get("/local-api/update", base_url=ORIGIN, headers=headers)
    assert result.status_code == 503
    assert "离线使用" in result.json["message"]
