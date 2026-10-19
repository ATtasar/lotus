"""Repackage a verified frozen program after documentation/installer-only changes."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import zipfile
import importlib.metadata
import sys

ROOT = Path(__file__).resolve().parents[1]


def collect_licenses(program):
    directory = program / "licenses"
    directory.mkdir(exist_ok=True)
    names = [line.split("==", 1)[0] for line in (ROOT / "requirements.txt").read_text().splitlines() if "==" in line and not line.startswith("#")]
    names.extend(["PyInstaller", "setuptools"])
    for name in names:
        distribution = importlib.metadata.distribution(name)
        target = directory / (name.replace("_", "-") + "-" + distribution.version)
        for entry in distribution.files or []:
            if "licenses" in [part.lower() for part in entry.parts] or entry.name.lower().startswith(("license", "licence", "copying", "notice")):
                source = Path(distribution.locate_file(entry))
                if source.is_file():
                    # Keep filenames collision-free, including vendored notices.
                    destination = target / str(entry).replace("..", "parent").replace("/", "_").replace("\\", "_")
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(source, destination)
    python_license = Path(sys.base_prefix) / "LICENSE.txt"
    if not python_license.is_file():
        raise ValueError("未找到 Python 运行时许可，停止发布。")
    shutil.copyfile(python_license, directory / "PYTHON-LICENSE.txt")
    shutil.copyfile(ROOT / "docs/OIMIMO-LICENSE.txt", directory / "OIMIMO-LICENSE.txt")


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
    collect_licenses(program)
    for name, command in {"停止工作台.cmd": "stop", "创建快捷方式.cmd": "shortcut", "打开数据目录.cmd": "open-data", "备份数据.cmd": "backup"}.items():
        (program / name).write_bytes((f'@echo off\r\nchcp 65001 >nul\r\n"%~dp0Lotus.exe" {command} %*\r\n').encode("utf-8"))
    source_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    source_dirty = bool(subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=ROOT, text=True).strip())
    if source_dirty:
        raise ValueError("发布源码存在未提交修改，先保存提交再打包，避免安装包与 GitHub 标签不一致。")
    provenance = {"version": version, "sourceCommit": source_commit, "repository": "https://github.com/ATtasar/lotus", "desktop": ui["files"], "workflowRun": os.environ.get("GITHUB_RUN_ID", "local")}
    (program / "BUILD-INFO.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8")
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
    manifest = {"version": version, "sourceCommit": source_commit, "repository": provenance["repository"], "workflowRun": provenance["workflowRun"], "desktop": ui["files"], "files": {file.name: {"sha256": hashlib.sha256(file.read_bytes()).hexdigest(), "bytes": file.stat().st_size} for file in output.iterdir() if file.is_file() and file.name != "release.json"}}
    (output / "release.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2), flush=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--program", required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    package(args.program, args.version)
