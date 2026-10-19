import io
import json
from urllib.error import URLError

import pytest

import updates


@pytest.mark.parametrize(
    ("left", "right", "expected"),
    [
        ("1.10.0", "1.9.9", 1),
        ("v1.2.0", "1.2", 0),
        ("2.0.0-beta.2", "2.0.0-beta.10", -1),
        ("2.0.0-rc.1", "2.0.0", -1),
        ("1.2.3+build.8", "1.2.3", 0),
    ],
)
def test_version_comparison(left, right, expected):
    assert updates.compare_versions(left, right) == expected


def test_latest_formal_release_is_compared_to_packaged_version(monkeypatch):
    payload = {
        "tag_name": "v1.10.0",
        "name": "Lotus 1.10.0",
        "body": "更新说明",
        "html_url": "https://github.com/ATtasar/lotus/releases/tag/v1.10.0",
        "published_at": "2026-10-19T00:00:00Z",
        "draft": False,
        "prerelease": False,
    }

    class Response(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *_):
            self.close()

    monkeypatch.setattr(updates, "urlopen", lambda *_args, **_kwargs: Response(json.dumps(payload).encode()))
    result = updates.check_for_updates("1.9.9")
    assert result["currentVersion"] == "1.9.9"
    assert result["latestVersion"] == "1.10.0"
    assert result["updateAvailable"] is True
    assert result["releaseNotes"] == "更新说明"
    current = updates.check_for_updates("1.10.0")
    assert current["isLatest"] is True
    assert current["updateAvailable"] is False


def test_network_failure_is_non_destructive_user_error(monkeypatch):
    monkeypatch.setattr(updates, "urlopen", lambda *_args, **_kwargs: (_ for _ in ()).throw(URLError("offline")))
    with pytest.raises(updates.UpdateCheckError, match="软件仍可离线使用"):
        updates.check_for_updates("1.1.0")
