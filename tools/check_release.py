"""Exercise the actual frozen EXE using isolated data; does not need Node."""
from pathlib import Path
import argparse
import json
import os
import subprocess
import tempfile
import time
import urllib.request
import sys
import shutil

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exe", required=True)
    args = parser.parse_args()
    exe = Path(args.exe).resolve()
    if not exe.is_file():
        raise ValueError("EXE 没有实际生成。")
    (ROOT / "artifacts").mkdir(exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix="frozen-check-", dir=ROOT / "artifacts"))
    desktop, menu = root / "Desktop", root / "StartMenu"
    port = 17866
    base = f"http://127.0.0.1:{port}"
    http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    runtime_env = {key: value for key, value in os.environ.items() if key not in ("PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV")}
    windows = Path(os.environ["SystemRoot"])
    runtime_env["PATH"] = os.pathsep.join(map(str, [windows / "System32", windows, windows / "System32/WindowsPowerShell/v1.0"]))
    assert shutil.which("node", path=runtime_env["PATH"]) is None
    assert shutil.which("python", path=runtime_env["PATH"]) is None
    def run(command, *options):
        completed = subprocess.run([str(exe), command, "--data-root", str(root), *options], cwd=root, env=runtime_env, timeout=50, creationflags=subprocess.CREATE_NO_WINDOW)
        if completed.returncode:
            raise ValueError("打包程序执行失败，请查看：" + str(root / "logs/lotus.log"))
    def request(endpoint, body=None):
        headers = {"X-Lotus-Local": "1"}
        with http.open(urllib.request.Request(base + "/local-api/session", headers=headers), timeout=3) as response:
            headers["X-Lotus-Token"] = json.load(response)["token"]
        if body is not None:
            headers["Content-Type"] = "application/json"
        with http.open(urllib.request.Request(base + "/local-api/" + endpoint, headers=headers, data=json.dumps(body).encode() if body is not None else None), timeout=15) as response:
            return json.load(response)
    try:
        run("install", "--port", str(port), "--no-browser", "--no-tray", "--desktop-dir", str(desktop), "--start-menu-dir", str(menu))
        with http.open(base, timeout=5) as response:
            if response.read() != (ROOT / "desktop/index.html").read_bytes():
                raise ValueError("运行包未提供已审核的电脑端页面。")
        # Import only in the test driver, never in the frozen application.
        sys.path.insert(0, str(ROOT / "tests"))
        from test_storage import fixture
        data = fixture()
        request("desktop-workspace", {"data": data, "baseRevision": 0})
        first = request("health")
        assert first["version"] == (ROOT / "VERSION").read_text(encoding="utf-8").strip()
        assert request("info")["version"] == first["version"]
        run("start", "--no-browser", "--no-tray")
        assert request("health")["pid"] == first["pid"]
        run("stop")
        for folder in (desktop, menu):
            previous_open = json.loads((root / "runtime/last-open.json").read_text(encoding="utf-8"))["at"] if (root / "runtime/last-open.json").exists() else None
            link = folder / "创作者工作台.lnk"
            assert link.is_file()
            result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "Start-Process -FilePath $env:LOTUS_TEST_LINK -WindowStyle Hidden"], env={**os.environ, "LOTUS_TEST_LINK": str(link)}, capture_output=True, timeout=20, creationflags=subprocess.CREATE_NO_WINDOW)
            assert result.returncode == 0
            for _ in range(160):
                try:
                    opened = json.loads((root / "runtime/last-open.json").read_text(encoding="utf-8"))
                    if opened["url"] == base and opened["at"] != previous_open and request("health")["profile"] == "desktop-only":
                        break
                except (OSError, ValueError):
                    pass
                time.sleep(0.1)
            assert request("desktop-workspace")["data"] == data
            assert opened["at"] != previous_open
            run("stop")
        result = {"passed": True, "exe": str(exe), "isolatedRoot": str(root), "checks": ["no system Python or Node required by EXE", "packaged VERSION exposed by local API", "reviewed desktop HTML", "order/image SQLite save", "same-process reuse", "real Windows desktop and Start menu shortcuts", "default browser invocation", "restart persistence", "loopback-only profile"]}
        (ROOT / "artifacts/frozen-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        run("stop", "--quiet")


if __name__ == "__main__":
    main()
