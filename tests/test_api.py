from pathlib import Path
import pytest

from app import create_app
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


def test_original_desktop_resources_and_runtime_config(client):
    client, _ = client
    root = Path(__file__).resolve().parents[1]
    for name in ("index.html", "styles.css", "app.js", "api.js", "storage.js", "designer.js"):
        response = client.get("/" + name, base_url=ORIGIN)
        assert response.data == (root / "desktop" / name).read_bytes()
        assert "connect-src 'self'" in response.headers["Content-Security-Policy"]
    assert "desktopOnly" in client.get("/runtime-config.js", base_url=ORIGIN).text
