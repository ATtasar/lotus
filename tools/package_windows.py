"""Repackage a verified frozen program after documentation/installer-only changes."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def package(program, version):
    program = Path(program).resolve()
    output = program.parent
    if not (program / "Lotus.exe").is_file() or (program / "_internal/VERSION").read_text().strip() != version:
        raise ValueError("实际 EXE 或其版本不匹配，停止打包。")
    ui = json.loads((ROOT / "docs/UI-MANIFEST.json").read_text(encoding="utf-8"))
    for name, checksum in ui["files"].items():
        if hashlib.sha256((program / "_internal" / name).read_bytes()).hexdigest() != checksum:
            raise ValueError("运行包内的 UI 与已批准版本不一致：" + name)
    for name in ("README.md", "START-HERE-WINDOWS.md", "THIRD-PARTY-NOTICES.md"):
        shutil.copyfile(ROOT / name, program / name)
    shutil.copytree(ROOT / "docs", program / "docs", dirs_exist_ok=True)
    for name, command in {"停止工作台.cmd": "stop", "创建快捷方式.cmd": "shortcut", "打开数据目录.cmd": "open-data", "备份数据.cmd": "backup"}.items():
        (program / name).write_bytes((f'@echo off\r\nchcp 65001 >nul\r\n"%~dp0Lotus.exe" {command} %*\r\n').encode("utf-8"))
    archive = output / f"lotus-{version}-portable-win64.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for file in sorted(program.rglob("*")):
            if file.is_file():
                if file.suffix in (".sqlite", ".db", ".log") or file.name in ("config.json", "config.last-good.json", "service.json"):
                    raise ValueError("打包目录含用户数据，停止：" + str(file))
                bundle.write(file, Path("Lotus") / file.relative_to(program))
    candidates = [os.environ.get("ISCC"), shutil.which("ISCC.exe"), str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs/Inno Setup 6/ISCC.exe"), str(Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)")) / "Inno Setup 6/ISCC.exe")]
    compiler = next((file for file in candidates if file and Path(file).is_file()), None)
    if compiler:
        subprocess.run([compiler, "/Qp", f"/DMyAppVersion={version}", f"/DDistDir={program}", f"/DReleaseDir={output}", str(ROOT / "packaging/installer.iss")], cwd=ROOT, check=True)
    else:
        print("EXE 与便携 ZIP 已生成；未检测到 Inno Setup，未生成安装包。", flush=True)
    manifest = {"version": version, "files": {file.name: {"sha256": hashlib.sha256(file.read_bytes()).hexdigest(), "bytes": file.stat().st_size} for file in output.iterdir() if file.is_file() and file.name != "release.json"}}
    (output / "release.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2), flush=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--program", required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    package(args.program, args.version)
