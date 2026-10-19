import base64
import copy
import hashlib
import json
from pathlib import Path
import sqlite3

import pytest
from pydantic import ValidationError

from db import Store, Conflict, restore_backup, read_json, json_bytes
from models import initial_data, validate_workspace
from db import SCHEMA_VERSION

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="


def fixture():
    data = initial_data()
    data["platforms"] = [{"id": "platform1", "name": "测试平台", "color": "#333333", "fee": 5}]
    data["clients"] = [{"id": "client1", "name": "测试单主", "platforms": ["platform1"], "preferences": "偏好", "dislikes": "雷点", "requirements": "要求", "notes": "备注", "cn": "称呼", "salutation": "单主", "platformLink": "https://example.com/client"}]
    data["orders"] = [{"id": "order1", "title": "电脑端稿件", "category": "自定义头像", "platform": "platform1", "client": "client1", "deposit": 100, "balance": 200, "fee": 5, "requirements": "绘制要求", "notes": "备注", "start": "2026-10-19", "due": "2026-10-20", "status": "未开始", "paid": False, "stages": ["未开始", "配色确认", "草稿", "成图", "完成"], "images": [PNG], "extras": [{"name": "加急", "amount": 30}]}]
    data["current"] = "order1"
    data["categories"] = ["自定义头像"]
    data["assets"] = [{"id": "asset1", "name": "例图", "src": PNG}]
    data["watermarkMark"] = PNG
    data["toolTemplates"] = [{"id": "layout1", "name": "排版模板", "kind": "layout", "layout": {"version": 1, "width": 1000, "height": 1000, "bg": "#ffffff", "backgroundImage": PNG, "font": "song", "color": "#123456", "items": [{"kind": "text", "name": "自定义文字", "text": "交付信息", "binding": "", "x": 500, "y": 300, "rotation": 0, "width": 500, "size": 28, "align": "center"}, {"kind": "image", "name": "插图", "src": PNG, "x": 400, "y": 500, "rotation": 0, "scale": 60}]}}]
    return data


def test_persistence_images_and_reopen(tmp_path):
    store = Store(tmp_path, initialize=True)
    data = fixture()
    assert store.save(data, 0) == 1
    changed = copy.deepcopy(data)
    changed["orders"][0]["status"] = "草稿"
    changed["orders"][0]["notes"] = "更新后"
    store.save(changed, 1)
    assert Store(tmp_path).load() == {"revision": 2, "data": changed}
    with store.connection(readonly=True) as connection:
        raw = connection.execute("SELECT payload FROM desktop_records WHERE collection='orders'").fetchone()[0]
        assert "base64" not in raw and "@disk:" in raw
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert connection.execute("SELECT COUNT(*) FROM desktop_edges").fetchone()[0] == 3
    assert len(list(store.files_dir.iterdir())) == 1


def test_conflicts_and_transaction_failure_preserve_last_commit(tmp_path):
    store = Store(tmp_path, initialize=True)
    data = fixture()
    store.save(data, 0)
    with pytest.raises(Conflict):
        store.save(data, 0)
    with store.connection() as connection:
        connection.execute("CREATE TRIGGER simulate_disk_failure BEFORE INSERT ON desktop_records BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END")
    data["orders"][0]["title"] = "不应提交"
    with pytest.raises(sqlite3.DatabaseError):
        store.save(data, 1)
    assert store.load() == {"revision": 1, "data": fixture()}


def test_archived_client_and_deletion_keep_other_images(tmp_path):
    store = Store(tmp_path, initialize=True)
    data = fixture()
    store.save(data, 0)
    data["archivedClients"], data["clients"] = data["clients"], []
    store.save(data, 1)
    with store.connection(readonly=True) as connection:
        assert connection.execute("SELECT target_collection FROM desktop_edges WHERE slot='client'").fetchone()[0] == "archivedClients"
    data["orders"], data["current"] = [], ""
    store.save(data, 2)
    assert Store(tmp_path).load()["data"] == data
    assert any("before-desktop-change" in item.name for item in (tmp_path / "backups").iterdir())
    assert len(list(store.files_dir.iterdir())) == 1


def test_backup_restore_preserves_original_directory(tmp_path):
    store = Store(tmp_path, initialize=True)
    original = fixture()
    store.save(original, 0)
    backup = store.backup()
    original_manifest = read_json(Path(backup) / "backup.json")
    changed = copy.deepcopy(original)
    changed["orders"][0]["title"] = "恢复前"
    store.save(changed, 1)
    result = restore_backup(tmp_path, backup)
    assert Store(tmp_path).load() == {"revision": 1, "data": original}
    assert Path(result["preserved"], "workbench.sqlite").is_file()
    assert read_json(Path(backup) / "backup.json") == original_manifest
    assert hashlib.sha256(Path(backup, "workbench.sqlite").read_bytes()).hexdigest() == original_manifest["files"]["workbench.sqlite"]


def test_corrupt_backup_is_rejected_before_replacing_data(tmp_path):
    store = Store(tmp_path, initialize=True)
    store.save(fixture(), 0)
    backup = Path(store.backup())
    (backup / "workbench.sqlite").write_bytes(b"invalid backup")
    with pytest.raises(ValueError, match="摘要"):
        restore_backup(tmp_path, backup)
    assert store.load()["data"] == fixture()


def test_schema_2_migration_preserves_existing_records_and_legacy_tables(tmp_path):
    store = Store(tmp_path, initialize=True)
    store.save(fixture(), 0)
    with store.connection() as connection:
        connection.executescript("DROP TABLE desktop_edges; DROP TABLE schema_migrations; CREATE TABLE old_records(id TEXT PRIMARY KEY,payload TEXT); INSERT INTO old_records VALUES('legacy','must preserve'); PRAGMA user_version=2;")
        before = [tuple(row) for row in connection.execute("SELECT * FROM desktop_records ORDER BY rowid")]
    upgraded = Store(tmp_path)
    with upgraded.connection(readonly=True) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
        assert connection.execute("SELECT payload FROM old_records").fetchone()[0] == "must preserve"
        assert [tuple(row) for row in connection.execute("SELECT * FROM desktop_records ORDER BY rowid")] == before
    assert upgraded.load() == {"revision": 1, "data": fixture()}
    before_upgrade = next(path for path in (tmp_path / "backups").iterdir() if "before-python-v3" in path.name)
    assert read_json(before_upgrade / "backup.json")["schemaVersion"] == 2
    restore_backup(tmp_path, before_upgrade)
    assert Store(tmp_path).load()["data"] == fixture()


def test_missing_empty_and_future_database_are_never_reset(tmp_path):
    with pytest.raises(ValueError, match="原数据库不存在"):
        Store(tmp_path)
    assert not (tmp_path / "data/workbench.sqlite").exists()
    (tmp_path / "data").mkdir()
    sqlite3.connect(tmp_path / "data/workbench.sqlite").close()
    with pytest.raises(ValueError, match="版本不兼容"):
        Store(tmp_path)
    with sqlite3.connect(tmp_path / "data/workbench.sqlite") as connection:
        assert connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall() == []
    isolated = tmp_path / "future"
    store = Store(isolated, initialize=True)
    store.save(fixture(), 0)
    with store.connection() as connection:
        connection.execute("PRAGMA user_version=99")
    with pytest.raises(ValueError, match="版本不兼容"):
        Store(isolated)
    with sqlite3.connect(store.database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM desktop_records WHERE collection='orders'").fetchone()[0] == 1


def test_failed_schema_migration_rolls_back_and_keeps_backup(tmp_path, monkeypatch):
    store = Store(tmp_path, initialize=True)
    store.save(fixture(), 0)
    with store.connection() as connection:
        connection.executescript("DROP TABLE desktop_edges; DROP TABLE schema_migrations; PRAGMA user_version=2;")
    def fail_migration(*_):
        raise ValueError("simulated migration failure")
    with monkeypatch.context() as context:
        context.setattr(Store, "_edges", fail_migration)
        with pytest.raises(ValueError, match="已回滚"):
            Store(tmp_path)
    with sqlite3.connect(store.database) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 2
        assert connection.execute("SELECT name FROM sqlite_master WHERE name='desktop_edges'").fetchall() == []
    assert Store(tmp_path, migrate=False).load()["data"] == fixture()
    assert any("before-python-v3" in folder.name for folder in (tmp_path / "backups").iterdir())


def test_interrupted_confirmed_restore_recovers_from_journal(tmp_path, monkeypatch):
    import db
    store = Store(tmp_path, initialize=True)
    store.save(fixture(), 0)
    backup = store.backup()
    changed = fixture()
    changed["orders"][0]["notes"] = "恢复前必须保留"
    store.save(changed, 1)
    copy_file = db.shutil.copyfile
    def interrupted(source, target, *args, **kwargs):
        if str(source).find("restore-") >= 0 and Path(target) == store.database:
            raise OSError("simulated restore interruption")
        return copy_file(source, target, *args, **kwargs)
    with monkeypatch.context() as context:
        context.setattr(db.shutil, "copyfile", interrupted)
        with pytest.raises(OSError, match="interruption"):
            restore_backup(tmp_path, backup)
    assert (tmp_path / "restore-journal.json").is_file()
    assert Store(tmp_path).load()["data"] == fixture()
    assert not (tmp_path / "restore-journal.json").exists()
    assert any(folder.name.startswith("preserved-data-") for folder in tmp_path.iterdir())


@pytest.mark.parametrize("change", [
    lambda data: data["orders"][0].update(client="missing"),
    lambda data: data["clients"][0].update(platforms=["missing"]),
    lambda data: data["orders"][0].update(status="unknown"),
    lambda data: data["orders"][0].update(deposit=float("nan")),
    lambda data: data["orders"][0].update(start="2026-02-30"),
    lambda data: data["orders"][0].update(images=["https://example.com/remote.png"]),
    lambda data: data["clients"][0].update(platformLink="javascript:alert(1)"),
    lambda data: data["categories"].append("自定义头像"),
])
def test_invalid_inputs_do_not_change_database(tmp_path, change):
    store = Store(tmp_path, initialize=True)
    store.save(fixture(), 0)
    data = fixture()
    change(data)
    with pytest.raises((ValueError, ValidationError)):
        store.save(data, 1)
    assert store.load() == {"revision": 1, "data": fixture()}
