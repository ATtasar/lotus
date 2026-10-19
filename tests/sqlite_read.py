"""Read-only test oracle; never imported by the installed application."""
import json
from pathlib import Path
import sqlite3
import sys

root = Path(sys.argv[1]).resolve()
sql = sys.argv[2]
if not sql.lstrip().upper().startswith("SELECT "):
    raise ValueError("Test oracle only permits SELECT queries")
connection = sqlite3.connect((root / "data/workbench.sqlite").as_uri() + "?mode=ro", uri=True)
connection.row_factory = sqlite3.Row
try:
    rows = [dict(row) for row in connection.execute(sql, json.loads(sys.argv[3]))]
    print(json.dumps(rows, ensure_ascii=False))
finally:
    connection.close()
