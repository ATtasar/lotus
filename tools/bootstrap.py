"""First-time source installation; everyday launch never runs pip."""
from pathlib import Path
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    if os.name != "nt" or sys.version_info < (3, 13) or sys.maxsize < 2**32:
        raise SystemExit("源码安装需要 Windows 10/11 和 64 位 Python 3.13+；也可直接下载免环境的 Windows 运行包。")
    python = ROOT / ".venv/Scripts/python.exe"
    if not python.is_file():
        subprocess.run([sys.executable, "-m", "venv", str(ROOT / ".venv")], check=True)
    subprocess.run([str(python), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(ROOT / "requirements.txt")], cwd=ROOT, check=True)
    subprocess.run([str(python), str(ROOT / "launcher.py"), "install", *sys.argv[1:]], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
