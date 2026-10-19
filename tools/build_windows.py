"""Test -> verify reviewed UI manifest -> standalone EXE -> ZIP -> installer."""
from pathlib import Path
import os
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from package_windows import package

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    subprocess.run(list(map(str, args)), cwd=ROOT, check=True)


def main():
    if os.name != "nt":
        raise SystemExit("Windows EXE 必须在 Windows 构建。")
    run(sys.executable, ROOT / "tools/check_ui.py")
    run(sys.executable, "-m", "pytest", "-q", ROOT / "tests")
    version = (ROOT / "VERSION").read_text().strip()
    if not version or any(ch not in "0123456789." for ch in version):
        raise ValueError("VERSION 必须为数字版本，例如 1.1.0。")
    # A versioned build directory avoids deleting any previous program/data folder.
    output = ROOT / "dist" / version
    if (output / "Lotus").exists():
        raise ValueError("此版本已有构建产物。请保留它，并递增 VERSION 或先自行移动旧构建。")
    run(sys.executable, "-m", "PyInstaller", "--distpath", output, "--workpath", ROOT / "build" / version, ROOT / "packaging/lotus.spec")
    program = output / "Lotus"
    if not (program / "Lotus.exe").is_file():
        raise ValueError("没有实际生成 Lotus.exe，停止发布。")
    package(program, version)


if __name__ == "__main__":
    main()
