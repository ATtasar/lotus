"""Read the packaged version and check the latest stable GitHub release."""
from __future__ import annotations

import json
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPOSITORY = "ATtasar/lotus"
RELEASES_API = f"https://api.github.com/repos/{REPOSITORY}/releases/latest"
RELEASES_PAGE = f"https://github.com/{REPOSITORY}/releases"
_VERSION = re.compile(
    r"^v?(?P<core>0|[1-9]\d*)(?:\.(?P<minor>0|[1-9]\d*))?(?:\.(?P<patch>0|[1-9]\d*))?"
    r"(?:-(?P<pre>[0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$"
)


class UpdateCheckError(RuntimeError):
    """A user-displayable release check failure."""


def read_current_version(base: Path) -> str:
    try:
        value = (Path(base) / "VERSION").read_text(encoding="utf-8").strip()
    except OSError as error:
        raise UpdateCheckError("无法读取本机 VERSION，软件仍可离线使用。") from error
    parse_version(value)
    return value.lstrip("vV")


def parse_version(value: str) -> tuple[tuple[int, int, int], tuple]:
    match = _VERSION.fullmatch(str(value).strip())
    if not match:
        raise ValueError(f"版本号格式不正确：{value}")
    core = tuple(int(match.group(name) or 0) for name in ("core", "minor", "patch"))
    prerelease = match.group("pre")
    if prerelease is None:
        return core, (1,)
    parts = tuple((0, int(part)) if part.isdigit() else (1, part.lower()) for part in prerelease.split("."))
    return core, (0, *parts)


def compare_versions(left: str, right: str) -> int:
    """Return -1, 0 or 1 using SemVer-compatible numeric ordering."""
    a, b = parse_version(left), parse_version(right)
    return (a > b) - (a < b)


def check_for_updates(current_version: str, *, timeout: float = 8.0) -> dict:
    request = Request(
        RELEASES_API,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": f"Lotus-Workbench/{current_version}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read(1024 * 1024).decode("utf-8"))
    except HTTPError as error:
        if error.code == 404:
            message = "暂时无法读取 GitHub 正式版本；仓库为私有时不会使用或保存你的登录凭据。"
        else:
            message = f"GitHub 版本服务暂时不可用（HTTP {error.code}）。"
        raise UpdateCheckError(message + " 软件仍可离线使用。") from error
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        raise UpdateCheckError("网络不可用或 GitHub 没有响应，软件仍可离线使用。") from error

    if not isinstance(payload, dict) or payload.get("draft") or payload.get("prerelease"):
        raise UpdateCheckError("GitHub 没有返回可用的最新正式版本，软件仍可离线使用。")
    tag = str(payload.get("tag_name") or "").strip()
    try:
        latest = tag.lstrip("vV")
        parse_version(latest)
    except ValueError as error:
        raise UpdateCheckError("GitHub 正式版本号格式不正确，已停止比较。") from error
    url = str(payload.get("html_url") or "")
    expected = f"https://github.com/{REPOSITORY}/releases/"
    if not url.startswith(expected):
        raise UpdateCheckError("GitHub 下载页面地址不可信，已停止打开。")
    comparison = compare_versions(current_version, latest)
    return {
        "currentVersion": current_version,
        "latestVersion": latest,
        "releaseName": str(payload.get("name") or tag or f"Lotus {latest}")[:200],
        "releaseNotes": str(payload.get("body") or "本次发布未填写更新说明。")[:30000],
        "releaseUrl": url,
        "publishedAt": str(payload.get("published_at") or ""),
        "updateAvailable": comparison < 0,
        "isLatest": comparison >= 0,
    }
