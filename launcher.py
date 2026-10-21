"""Windows browser launcher, single instance, tray and local maintenance commands."""
from pathlib import Path
import sys

if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import argparse
import ctypes
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
import signal
import subprocess
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from uuid import uuid4

from db import APP_ID, Store, read_json, replace_json, restore_backup, utc_stamp

PROGRAM = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent


def default_root():
    # Installed copies retain their chosen database directory independently of
    # Explorer's inherited environment. Never silently fall back to an empty
    # default workspace when a previously selected drive is unavailable.
    location = PROGRAM / 'data-location.json'
    if location.exists():
        saved = read_json(location)
        value = saved.get('dataRoot') if isinstance(saved, dict) else None
        if not isinstance(value, str) or saved.get('appId') != APP_ID or not Path(value).is_absolute():
            raise ValueError('已保存的数据位置配置无效，请保留原数据并检查 data-location.json。')
        root = Path(value).resolve()
        if not (root / 'data/workbench.sqlite').is_file():
            raise ValueError('已保存的数据库位置无法访问，未新建空库：' + str(root))
        return root
    override = os.environ.get("LOTUS_LOCAL_ROOT")
    if override:
        root = Path(override)
    elif os.name == "nt":
        buffer = ctypes.create_unicode_buffer(32768)
        if ctypes.windll.shell32.SHGetFolderPathW(None, 0x1C, None, 0, buffer) != 0:
            raise ValueError("无法确定 Windows 本地用户数据目录。")
        root = Path(buffer.value) / "Lotus-Workbench"
    else:
        root = Path.home() / ".local/share/Lotus-Workbench"
    if not root.is_absolute():
        raise ValueError("数据目录必须使用绝对路径。")
    return root.resolve()


def resource_path(name):
    return Path(getattr(sys, "_MEIPASS", PROGRAM)) / name


def setup_logging(root):
    # Frozen Windows Python ignores PYTHONUTF8; keep piped CMD/PowerShell logs
    # readable as UTF-8 without changing any page text or workspace UI.
    for stream in (sys.stdout, sys.stderr):
        if stream is not None and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    directory = root / "logs"
    directory.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(directory / "lotus.log", maxBytes=4 * 1024 * 1024, backupCount=5, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logging.getLogger().addHandler(handler)
    logging.getLogger().setLevel(logging.INFO)


def say(message):
    logging.info(message)
    if sys.stdout is not None:
        print(message, flush=True)


def notify(message, *, error=False):
    say(message)
    if os.name == "nt" and sys.stdout is None:
        ctypes.windll.user32.MessageBoxW(None, message, "创作者工作台", 0x10 if error else 0x40)


HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def http(url, *, token=None, body=None, timeout=2):
    headers = {"X-Lotus-Local": "1"}
    if token:
        headers["X-Lotus-Token"] = token
    encoded = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        encoded = json.dumps(body).encode("utf-8")
    with HTTP.open(urllib.request.Request(url, data=encoded, headers=headers), timeout=timeout) as response:
        return json.load(response)


def health(port):
    try:
        return http(f"http://127.0.0.1:{port}/local-api/health", timeout=0.7)
    except (OSError, ValueError):
        return None


def state(root):
    file = root / "runtime/service.json"
    for attempt in range(5):
        try:
            return read_json(file)
        except FileNotFoundError:
            return None
        except PermissionError:
            # Windows can briefly reject opening a delete-pending file while
            # a service exits. Retry that transient case; real access failures
            # still surface instead of being mistaken for a stopped service.
            if attempt == 4:
                raise
            time.sleep(0.02)


def settings(root, port=None):
    primary, recovery = root / "config.json", root / "config.last-good.json"
    file = primary if primary.exists() else recovery if recovery.exists() else None
    config = read_json(file) if file else {"appId": APP_ID, "port": port or 17841}
    if config.get("appId") != APP_ID or type(config.get("port")) is not int or not 1024 <= config["port"] <= 65535:
        raise ValueError("安装配置无效，原数据库保留。")
    if config.get("dataRoot") and os.path.normcase(str(Path(config["dataRoot"]).resolve())) != os.path.normcase(str(root)):
        raise ValueError("配置中的数据目录与启动目录不一致，已停止。")
    if port is not None and port != config["port"]:
        raise ValueError("端口已在安装配置中固定；请停止服务后修改配置，不会静默打开另一份工作区。")
    if file == recovery:
        replace_json(primary, config)
        say("已从安装配置副本恢复，原数据库保留。")
    return config


class ServiceGuard:
    """Windows named mutex is released by the OS even after a crash."""
    def __init__(self, root):
        self.handle = None
        if os.name == "nt":
            kernel = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
            kernel.CreateMutexW.restype = ctypes.c_void_p
            kernel.CloseHandle.argtypes = [ctypes.c_void_p]
            name = "Local\\Lotus-Workbench-" + hashlib.sha256(os.path.normcase(str(root)).encode()).hexdigest()[:24]
            self.handle = kernel.CreateMutexW(None, False, name)
            if not self.handle:
                raise ctypes.WinError(ctypes.get_last_error())
            if ctypes.get_last_error() == 183:
                kernel.CloseHandle(self.handle)
                self.handle = None
                raise ValueError("工作台服务已经运行或正在启动，请稍后再次打开。")
            self.kernel = kernel
        else:
            import fcntl
            (root / "runtime").mkdir(parents=True, exist_ok=True)
            self.handle = (root / "runtime/python.lock").open("a+")
            fcntl.flock(self.handle, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def close(self):
        if self.handle is not None:
            if os.name == "nt":
                self.kernel.CloseHandle(self.handle)
            else:
                self.handle.close()
            self.handle = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def same_root(value, root):
    return value and os.path.normcase(str(Path(value).resolve())) == os.path.normcase(str(root))


def process_alive(pid):
    if type(pid) is not int or pid <= 0:
        return False
    if os.name == "nt":
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32)]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return ctypes.get_last_error() == 5
        try:
            code = ctypes.c_uint32()
            return bool(kernel.GetExitCodeProcess(handle, ctypes.byref(code))) and code.value == 259
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def stop(root, *, quiet=False):
    current = state(root)
    if not current:
        if not quiet:
            say("本机服务未运行。")
        return
    current_health = health(current["port"])
    if current_health is None:
        if process_alive(current.get("pid")):
            raise ValueError("原服务进程仍存在但没有就绪，未强制终止。请检查日志。")
        if not quiet:
            say("服务未响应；不会强制终止未知进程。请检查日志。")
        return
    if current_health.get("appId") != APP_ID or current_health.get("instance") != current.get("instance") or current_health.get("pid") != current.get("pid") or not same_root(current_health.get("dataRoot"), root):
        raise ValueError("服务身份与数据目录不匹配，不会操作其他进程。")
    http(f"http://127.0.0.1:{current['port']}" + current.get("apiBase", "/local-api/") + "stop", token=current["token"], body={}, timeout=15)
    for _ in range(300):
        remaining = state(root)
        if health(current["port"]) is None and (remaining is None or remaining.get("instance") != current["instance"] or not process_alive(current["pid"])):
            if not quiet:
                say("工作台服务已停止。")
            return
        time.sleep(0.1)
    raise ValueError("服务尚未停止，未强制结束进程；请检查日志。")


def open_browser(root, port):
    url = f"http://127.0.0.1:{port}"
    if not webbrowser.open(url, new=2):
        raise ValueError("服务已就绪，默认浏览器未自动打开，请访问：" + url)
    replace_json(root / "runtime/last-open.json", {"url": url, "at": utc_stamp()})


def launcher_command(*args):
    return [sys.executable, *([] if getattr(sys, "frozen", False) else [str(PROGRAM / "launcher.py")]), *map(str, args)]


def start(root, args):
    config = settings(root, args.port)
    port = config["port"]
    from app import DESKTOP_FILES
    if not all((resource_path("desktop") / name).is_file() for name in DESKTOP_FILES):
        raise ValueError("程序页面资源缺失，请完整解压或重新安装。")
    first_install = not (root / "data").exists() and not (root / "config.json").exists()
    if not (root / "data/workbench.sqlite").is_file() and not (root / "restore-journal.json").exists() and not (args.command == "install" or first_install):
        raise ValueError("原数据库不存在，已停止，未新建空库；请检查数据目录或恢复备份。")
    current = health(port)
    if current:
        if current.get("appId") != APP_ID or not same_root(current.get("dataRoot"), root):
            raise ValueError("端口被其他服务占用，未停止该服务。")
        if current.get("engine") == "flask" and same_root(current.get("web"), resource_path("desktop")) and args.command != "install":
            say(f"复用本机服务：http://127.0.0.1:{port}")
            if not args.no_browser:
                open_browser(root, port)
            return
        # A verified previous Lotus service is stopped through its own API.
        # No taskkill, firewall changes, PWA or unrelated process termination.
        stop(root)
    else:
        previous = state(root)
        if previous and process_alive(previous.get("pid")):
            raise ValueError("原服务进程仍在启动或没有响应；不会重复启动。请稍后重试并检查日志。")
    instance = str(uuid4())
    (root / "runtime").mkdir(parents=True, exist_ok=True)
    log_file = root / "logs/service-output.log"
    argv = launcher_command("serve", "--data-root", root, "--port", port, "--instance", instance)
    if args.command == "install" or first_install:
        argv.append("--initialize")
    if args.no_tray:
        argv.append("--no-tray")
    with log_file.open("ab") as output:
        child = subprocess.Popen(argv, cwd=PROGRAM, stdin=subprocess.DEVNULL, stdout=output, stderr=output, creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS if os.name == "nt" else 0, start_new_session=os.name != "nt")
    for _ in range(160):
        current = health(port)
        if current and current.get("appId") == APP_ID and current.get("engine") == "flask" and same_root(current.get("dataRoot"), root) and same_root(current.get("web"), resource_path("desktop")):
            say(f"工作台已就绪：http://127.0.0.1:{port}\n数据库：{root / 'data/workbench.sqlite'}")
            if not args.no_browser:
                open_browser(root, port)
            return
        if child.poll() is not None:
            break
        time.sleep(0.1)
    raise ValueError("本机服务未能就绪，原数据保留。请查看：" + str(log_file))


def serve(root, args):
    from app import create_app
    from waitress import create_server
    with ServiceGuard(root):
        port = settings(root, args.port)["port"]
        current = health(port)
        if current is not None:
            raise ValueError("端口已被占用，不会同时打开同一数据库。")
        previous = state(root)
        if previous and previous.get("pid") != os.getpid() and process_alive(previous.get("pid")):
            raise ValueError("另一份旧服务进程仍存在，已中止重复启动。")
        app = create_app(root, port=port, instance=args.instance, initialize=args.initialize)
        backend = app.extensions["lotus"]
        if args.initialize:
            backend["store"].backup("installation-check")
        info = {"appId": APP_ID, "port": port, "dataRoot": str(root), "sourceRoot": str(PROGRAM), "engine": "flask", "version": resource_path("VERSION").read_text().strip()}
        replace_json(root / "config.last-good.json", info)
        replace_json(root / "config.json", info)
        stopped = threading.Event()
        server = create_server(app, host="127.0.0.1", port=port, threads=4, map={}, max_request_body_size=128 * 1024 * 1024, ident="Lotus")
        backend["shutdown"] = stopped.set
        control = {**info, "pid": os.getpid(), "instance": args.instance, "token": backend["token"], "web": str(resource_path("desktop")), "apiBase": backend["apiBase"]}
        replace_json(root / "runtime/service.json", control)
        replace_json(root / "runtime/service.lock", {"pid": os.getpid(), "instance": args.instance, "engine": "flask"})
        thread = threading.Thread(target=server.run, name="lotus-http", daemon=True)
        thread.start()
        icon = None
        try:
            if os.name == "nt" and not args.no_tray:
                import pystray
                from PIL import Image
                def show_folder(folder):
                    os.startfile(str(folder))
                icon = pystray.Icon("LotusWorkbench", Image.open(resource_path("desktop/workbench.ico")), "创作者工作台", menu=pystray.Menu(
                    pystray.MenuItem("打开工作台", lambda *_: open_browser(root, port), default=True),
                    pystray.MenuItem("打开数据目录", lambda *_: show_folder(root / "data")),
                    pystray.MenuItem("打开备份目录", lambda *_: show_folder(root / "backups")),
                    pystray.MenuItem("备份数据库与图片", lambda *_: notify("完整备份：" + backend["store"].backup())),
                    pystray.MenuItem("查看日志", lambda *_: show_folder(root / "logs")),
                    pystray.MenuItem("停止服务", lambda *_: stopped.set()),
                ))
                icon.run_detached()
            for sig in (signal.SIGINT, signal.SIGTERM):
                signal.signal(sig, lambda *_: stopped.set())
            say(f"Flask 本机服务已启动：http://127.0.0.1:{port}")
            while not stopped.wait(0.2):
                if not thread.is_alive():
                    raise ValueError("本机 HTTP 服务意外停止，请查看日志。")
        finally:
            backend["closing"] = True
            if icon:
                icon.stop()
            server.close()
            server.task_dispatcher.shutdown(timeout=10)
            from waitress import wasyncore
            wasyncore.close_all(map=server._map)
            thread.join(timeout=5)
            for file in (root / "runtime/service.json", root / "runtime/service.lock"):
                if file.is_file() and read_json(file).get("instance") == args.instance:
                    file.unlink()


def shortcuts(root, args):
    if os.name != "nt":
        raise ValueError("桌面和开始菜单入口仅支持 Windows。")
    config = settings(root)
    if not (root / "data/workbench.sqlite").is_file():
        raise ValueError("请先安装，不能为未初始化的工作台创建快捷方式。")
    script = r'''
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$shell=New-Object -ComObject WScript.Shell
$desktop=if($env:LOTUS_DESKTOP_DIR){$env:LOTUS_DESKTOP_DIR}else{[Environment]::GetFolderPath('Desktop')}
$menu=if($env:LOTUS_MENU_DIR){$env:LOTUS_MENU_DIR}else{[Environment]::GetFolderPath('Programs')}
foreach($folder in @($desktop,$menu)){
 New-Item -ItemType Directory -Path $folder -Force | Out-Null
 $link=$shell.CreateShortcut((Join-Path $folder '创作者工作台.lnk'))
 $link.TargetPath=$env:LOTUS_EXE
 $link.Arguments=$env:LOTUS_ARGS
 $link.WorkingDirectory=$env:LOTUS_PROGRAM
 $link.IconLocation=$env:LOTUS_ICON+',0'
 $link.Description='启动电脑端创作者工作台'
 $link.WindowStyle=7
 $link.Save()
 Write-Output $link.FullName
}
'''
    frozen = getattr(sys, "frozen", False)
    exe = sys.executable if frozen else str(PROGRAM / "Start-Local.cmd")
    argv = subprocess.list2cmdline(["start", "--data-root", str(root)]) if frozen else subprocess.list2cmdline(["--data-root", str(root)])
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], env={**os.environ, "LOTUS_EXE": exe, "LOTUS_ARGS": argv, "LOTUS_PROGRAM": str(PROGRAM), "LOTUS_ICON": str(resource_path("desktop/workbench.ico")), "LOTUS_DESKTOP_DIR": args.desktop_dir or "", "LOTUS_MENU_DIR": args.start_menu_dir or ""}, capture_output=True, text=True, encoding="utf-8", creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise ValueError("创建快捷方式失败：" + result.stderr)
    say("已创建桌面和开始菜单快捷方式：\n" + result.stdout.strip())


def main(argv=None):
    parser = argparse.ArgumentParser(description="电脑端创作者工作台")
    parser.add_argument("command", choices=["start", "serve", "install", "stop", "shortcut", "backup", "restore", "open-data", "version"], nargs="?", default="start")
    parser.add_argument("--data-root")
    parser.add_argument("--port", type=int)
    parser.add_argument("--instance", default=str(uuid4()))
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--no-tray", action="store_true")
    parser.add_argument("--no-shortcut", action="store_true")
    parser.add_argument("--desktop-dir")
    parser.add_argument("--start-menu-dir")
    parser.add_argument("--initialize", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--from", dest="backup_source")
    args = parser.parse_args(argv)
    root = Path(args.data_root) if args.data_root else default_root()
    if not root.is_absolute():
        raise ValueError("数据目录必须为绝对路径。")
    root = root.resolve()
    setup_logging(root)
    if args.command == "version":
        say(resource_path("VERSION").read_text().strip())
    elif args.command in ("start", "install"):
        start(root, args)
        if args.command == "install" and not args.no_shortcut:
            shortcuts(root, args)
    elif args.command == "serve":
        serve(root, args)
    elif args.command == "stop":
        stop(root, quiet=args.quiet)
    elif args.command == "shortcut":
        shortcuts(root, args)
    elif args.command == "open-data":
        if not (root / "data/workbench.sqlite").exists():
            raise ValueError("原数据目录未找到，不会创建空库。")
        os.startfile(str(root / "data"))
    elif args.command == "backup":
        current = state(root)
        if current and health(current["port"]):
            result = http(f"http://127.0.0.1:{current['port']}" + current.get("apiBase", "/local-api/") + "backup", token=current["token"], body={}, timeout=120)
            say("完整备份：" + result["path"])
        else:
            with ServiceGuard(root):
                say("完整备份：" + Store(root).backup())
    elif args.command == "restore":
        if not args.backup_source:
            raise ValueError('请指定 --from "完整备份目录"。')
        message = "恢复将替换当前工作区，恢复前会备份并保留原数据。是否继续？"
        if sys.stdin is not None and sys.stdin.isatty():
            confirmed = input(message + " 输入 RESTORE：") == "RESTORE"
        elif os.name == "nt" and getattr(sys, "frozen", False):
            confirmed = ctypes.windll.user32.MessageBoxW(None, message, "确认恢复", 0x134) == 6
        else:
            raise ValueError("恢复必须在交互终端确认，不接受自动确认参数。")
        if not confirmed:
            say("已取消恢复，数据未修改。")
            return
        stop(root, quiet=True)
        with ServiceGuard(root):
            say("恢复完成：" + json.dumps(restore_backup(root, args.backup_source), ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        logging.exception("工作台操作失败")
        notify("操作失败：" + str(error) + "\n原数据不会被自动清空。", error=True)
        sys.exit(1)
