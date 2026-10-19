# PyInstaller onedir: include local desktop resources, never user data.
from pathlib import Path
project = Path(SPECPATH).parent
a = Analysis(
    [str(project / 'launcher.py')],
    pathex=[str(project)],
    binaries=[],
    datas=[(str(project / 'desktop'), 'desktop'), (str(project / 'VERSION'), '.'), (str(project / 'docs/OIMIMO-LICENSE.txt'), 'licenses')],
    hiddenimports=['app', 'db', 'models', 'images', 'updates', 'pystray._win32'],
    excludes=['pytest', 'tkinter', 'playwright'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='Lotus', console=False, debug=False, strip=False, upx=False, icon=[str(project / 'desktop/workbench.ico')])
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='Lotus')
