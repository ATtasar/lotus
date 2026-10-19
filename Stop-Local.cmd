@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
set /p LOTUS_RELEASE_VERSION=<"%~dp0VERSION"
if exist "%~dp0Lotus.exe" (
  "%~dp0Lotus.exe" stop %*
) else if exist "%~dp0dist\%LOTUS_RELEASE_VERSION%\Lotus\Lotus.exe" (
  "%~dp0dist\%LOTUS_RELEASE_VERSION%\Lotus\Lotus.exe" stop %*
) else if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" "%~dp0launcher.py" stop %*
) else (
  echo 尚未安装源码运行环境。请运行 Install-Local.cmd，或从 GitHub Releases 下载 Windows 运行包。
  pause
  exit /b 1
)
if errorlevel 1 (
  echo 操作失败，请保留错误信息，并查看本机日志。
  pause
  exit /b 1
)
exit /b 0
