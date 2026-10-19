[CmdletBinding()]
param([string]$Python,[switch]$SkipDependencies)
$ErrorActionPreference='Stop'
Push-Location $PSScriptRoot
try {
    if (-not $Python) {
        $candidate=Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
        if (Test-Path -LiteralPath $candidate) { $Python=$candidate }
        else {
            throw '请先运行 Build-Windows.cmd，或使用 -Python 指定 Python 3.13+ 的完整路径。'
        }
    }
    $env:PYTHONUTF8='1'
    if (-not $SkipDependencies) {
        & $Python -m pip install -r requirements-build.txt
        if ($LASTEXITCODE -ne 0) { throw '构建依赖安装失败。' }
    }
    & $Python tools/build_windows.py
    if ($LASTEXITCODE -ne 0) { throw '构建未完成，请保留上面的错误日志。' }
} finally { Pop-Location }
