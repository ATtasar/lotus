@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 "%~dp0tools\bootstrap_build.py" %*
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo 源码安装和构建需要 Python 3.13+。免环境使用请下载 https://github.com/ATtasar/lotus/releases 的 Windows 运行包。
    pause
    exit /b 1
  )
  python "%~dp0tools\bootstrap_build.py" %*
)
if errorlevel 1 (
  echo 操作失败，请保留上面的错误信息。
  pause
  exit /b 1
)
exit /b 0
