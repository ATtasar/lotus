from pathlib import Path
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    if os.name != "nt" or sys.version_info < (3, 13) or sys.maxsize < 2**32:
        raise SystemExit("构建需要 Windows 10/11 和 64 位 Python 3.13+。")
    python = ROOT / ".venv/Scripts/python.exe"
    if not python.exists():
        subprocess.run([sys.executable, "-m", "venv", str(ROOT / ".venv")], check=True)
    subprocess.run([str(python), "-m", "pip", "install", "-r", str(ROOT / "requirements-build.txt")], cwd=ROOT, check=True)
    subprocess.run([str(python), str(ROOT / "tools/build_windows.py"), *sys.argv[1:]], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
