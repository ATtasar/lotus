"""SQLite repository, explicit migrations, private files and verified backups.

Architecture inspired by oimimo-scheduler; no oimimo business records or UI.
Version 2 databases from Lotus-Workbench are preserved and migrated in place.
"""
from contextlib import contextmanager
import base64
import copy
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sqlite3
import threading
from urllib.parse import quote
from uuid import uuid4

from images import DISK_REFERENCE, decode_image, file_id, image_slots
from models import COLLECTIONS, initial_data, validate_workspace

APP_ID = "lotus-workbench-windows-v1"
SCHEMA_VERSION = 3


class Conflict(ValueError):
    pass


def utc_stamp():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def digest(content):
    return hashlib.sha256(content).hexdigest()


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")


def flush_file(file: Path):
    with file.open("r+b") as stream:
        os.fsync(stream.fileno())


def write_durable(file: Path, content: bytes):
    file.parent.mkdir(parents=True, exist_ok=True)
    with file.open("xb") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def replace_json(file: Path, value):
    pending = file.with_name(file.name + "." + uuid4().hex + ".pending")
    write_durable(pending, json_bytes(value))
    try:
        os.replace(pending, file)
    except OSError as error:
        if error.errno != 18:  # Windows redirected folders may report EXDEV.
            raise
        shutil.copyfile(pending, file)
        flush_file(file)
        if file.read_bytes() != pending.read_bytes():
            raise ValueError("配置写入校验失败，完整暂存文件保留。") from error
        pending.unlink()


def read_json(file):
    return json.loads(Path(file).read_text(encoding="utf-8-sig"))


class Store:
    def __init__(self, root, *, initialize=False, migrate=True):
        self.root = Path(root)
        if not self.root.is_absolute():
            raise ValueError("数据目录必须使用绝对路径。")
        self.root = self.root.resolve()
        self.data_dir = self.root / "data"
        self.files_dir = self.data_dir / "files"
        self.database = self.data_dir / "workbench.sqlite"
        self.lock = threading.RLock()
        finish_pending_restore(self.root)
        if not self.database.is_file() and not initialize:
            raise ValueError(f"原数据库不存在，未新建空库：{self.database}")
        self.files_dir.mkdir(parents=True, exist_ok=True)
        if not self.database.exists():
            self._initialize()
        with self.connection(readonly=not migrate) as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            if version > SCHEMA_VERSION or version < 2:
                raise ValueError("数据库结构版本不兼容，原数据保留；请使用兼容程序或导入稿件 JSON 备份。")
            if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise ValueError("数据库完整性检查失败，请保留原数据并恢复备份。")
            required = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"desktop_workspace", "desktop_records", "files"} <= required:
                raise ValueError("数据库缺少稿件工作区，禁止用空白数据替换。")
            if version == 3 and not {"desktop_edges", "schema_migrations"} <= required:
                raise ValueError("数据库迁移记录缺失，已停止。")
            if version == 3 and connection.execute("PRAGMA foreign_key_check(desktop_edges)").fetchone():
                raise ValueError("数据库关联校验失败，原数据保留。")
            if migrate:
                connection.execute("PRAGMA journal_mode=WAL")
        self.load()  # Check images and records before reporting startup success.
        if version == 2 and migrate:
            self._migrate_v2()
        if version == 2 and not migrate:
            self.schema_version = 2
        else:
            self.schema_version = SCHEMA_VERSION

    @contextmanager
    def connection(self, *, readonly=False):
        uri = self.database.as_uri() + ("?mode=ro" if readonly else "?mode=rw")
        connection = sqlite3.connect(uri, uri=True, timeout=10, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=10000")
        if not readonly:
            connection.execute("PRAGMA synchronous=FULL")
        try:
            yield connection
        finally:
            connection.close()

    @contextmanager
    def transaction(self):
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                yield connection
                connection.execute("COMMIT")
            except BaseException:
                connection.execute("ROLLBACK")
                raise

    def _initialize(self):
        # Only the explicit first-install path can create a database.
        connection = sqlite3.connect(self.database, isolation_level=None)
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("CREATE TABLE desktop_workspace(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, metadata TEXT NOT NULL)")
            connection.execute("CREATE TABLE desktop_records(collection TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(collection,id))")
            connection.execute("CREATE TABLE files(hash TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL)")
            metadata = {key: value for key, value in initial_data().items() if key not in COLLECTIONS}
            connection.execute("INSERT INTO desktop_workspace VALUES(1,0,?)", (json_bytes(metadata).decode(),))
            self._add_schema_v3(connection)
            connection.execute("PRAGMA user_version=3")
            connection.execute("COMMIT")
        except BaseException:
            connection.execute("ROLLBACK")
            raise
        finally:
            connection.close()

    @staticmethod
    def _add_schema_v3(connection):
        connection.execute("CREATE TABLE desktop_edges(owner_collection TEXT NOT NULL,owner_id TEXT NOT NULL,slot TEXT NOT NULL,target_collection TEXT NOT NULL,target_id TEXT NOT NULL,PRIMARY KEY(owner_collection,owner_id,slot),FOREIGN KEY(owner_collection,owner_id) REFERENCES desktop_records(collection,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,FOREIGN KEY(target_collection,target_id) REFERENCES desktop_records(collection,id) DEFERRABLE INITIALLY DEFERRED)")
        connection.execute("CREATE INDEX desktop_edges_target ON desktop_edges(target_collection,target_id)")
        connection.execute("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL,description TEXT NOT NULL)")
        connection.execute("INSERT INTO schema_migrations VALUES(3,?,?)", (utc_stamp(), "电脑端关联外键与显式迁移记录；保留历史数据表"))

    def _migrate_v2(self):
        backup = self.backup("before-python-v3")
        try:
            data = self.load()["data"]
            with self.transaction() as connection:
                self._add_schema_v3(connection)
                self._edges(connection, data)
                connection.execute("PRAGMA user_version=3")
                if connection.execute("PRAGMA foreign_key_check(desktop_edges)").fetchone():
                    raise ValueError("迁移后的关联校验失败。")
        except Exception as error:
            raise ValueError(f"数据库迁移失败，已回滚；升级前备份：{backup}。{error}") from error

    def _load(self, connection):
        # The read transaction gives metadata, records and file references one revision.
        row = connection.execute("SELECT revision,metadata FROM desktop_workspace WHERE id=1").fetchone()
        if row is None:
            raise ValueError("稿件工作区缺失，禁止用空白数据覆盖。")
        data = json.loads(row["metadata"])
        for key in COLLECTIONS:
            data[key] = [json.loads(item[0]) for item in connection.execute("SELECT payload FROM desktop_records WHERE collection=? ORDER BY rowid", (key,))]
        for container, key in image_slots(data):
            reference = container[key]
            match = DISK_REFERENCE.fullmatch(reference) if isinstance(reference, str) else None
            if not match:
                raise ValueError("电脑端图片引用无效，原数据保留。")
            identifier = match[1]
            info = connection.execute("SELECT mime,size FROM files WHERE hash=?", (identifier,)).fetchone()
            content = (self.files_dir / identifier).read_bytes()
            if info is None or len(content) != info["size"] or file_id(info["mime"], content) != identifier:
                raise ValueError("图片缺失或摘要不匹配，请恢复完整备份。")
            container[key] = "data:image/svg+xml;charset=utf-8," + quote(content.decode("utf-8"), safe="~()*!.'-") if info["mime"] == "image/svg+xml" else "data:" + info["mime"] + ";base64," + base64.b64encode(content).decode("ascii")
        return {"revision": row["revision"], "data": validate_workspace(data)}

    def load(self):
        with self.lock, self.connection(readonly=True) as connection:
            connection.execute("BEGIN")
            try:
                return self._load(connection)
            finally:
                connection.execute("ROLLBACK")

    def revision(self):
        with self.connection(readonly=True) as connection:
            row = connection.execute("SELECT revision FROM desktop_workspace WHERE id=1").fetchone()
            if row is None:
                raise ValueError("工作区版本缺失。")
            return row[0]

    @staticmethod
    def _edges(connection, data):
        rows = []
        active = {client["id"] for client in data["clients"]}
        for key in ("clients", "archivedClients"):
            for client in data[key]:
                rows.extend((key, client["id"], f"platforms.{index}", "platforms", platform) for index, platform in enumerate(client["platforms"]))
        for key in ("orders", "templates"):
            for order in data[key]:
                rows.append((key, order["id"], "platform", "platforms", order["platform"]))
                if key == "orders":
                    rows.append((key, order["id"], "client", "clients" if order["client"] in active else "archivedClients", order["client"]))
        connection.executemany("INSERT INTO desktop_edges VALUES(?,?,?,?,?)", rows)

    def save(self, value, base_revision):
        if type(base_revision) is not int or base_revision < 0 or base_revision > 9007199254740991:
            raise ValueError("无效的数据版本。")
        data = validate_workspace(value)
        with self.lock:
            current = self.load()
            if current["revision"] != base_revision:
                raise Conflict("其他窗口已保存新记录，请导出当前内容再刷新；已取消覆盖。")
            if any({item["id"] for item in current["data"][key]} - {item["id"] for item in data[key]} for key in COLLECTIONS):
                self.backup("before-desktop-change")
            files = {}
            for container, key in image_slots(data):
                mime, content = decode_image(container[key])
                identifier = file_id(mime, content)
                target = self.files_dir / identifier
                if target.exists():
                    if target.read_bytes() != content:
                        raise ValueError("已有图片校验失败，已停止保存。")
                else:
                    pending = self.files_dir / (identifier + "." + uuid4().hex + ".pending")
                    write_durable(pending, content)
                    try:
                        os.replace(pending, target)
                    except OSError as error:
                        if error.errno != 18:
                            raise
                        if target.exists() and target.read_bytes() != content:
                            raise ValueError("图片写入冲突。") from error
                        shutil.copyfile(pending, target)
                        flush_file(target)
                        if target.read_bytes() != content:
                            raise ValueError("图片落盘校验失败。") from error
                        pending.unlink()
                files[identifier] = (mime, len(content))
                container[key] = "@disk:" + identifier
            metadata = {key: value for key, value in data.items() if key not in COLLECTIONS}
            with self.transaction() as connection:
                updated = connection.execute("UPDATE desktop_workspace SET revision=revision+1,metadata=? WHERE id=1 AND revision=?", (json_bytes(metadata).decode(), base_revision))
                if updated.rowcount != 1:
                    raise Conflict("数据已变化，已取消本次覆盖。")
                connection.execute("DELETE FROM desktop_edges")
                connection.execute("DELETE FROM desktop_records")
                connection.executemany("INSERT INTO desktop_records VALUES(?,?,?)", ((key, item["id"], json_bytes(item).decode()) for key in COLLECTIONS for item in data[key]))
                connection.executemany("INSERT OR IGNORE INTO files VALUES(?,?,?)", ((identifier, *info) for identifier, info in files.items()))
                self._edges(connection, data)
            return base_revision + 1

    def backup(self, label="manual"):
        if not re.fullmatch(r"[a-z0-9-]{1,60}", label):
            raise ValueError("备份标签不正确。")
        with self.lock:
            target = self.root / "backups" / (utc_stamp().replace(":", "-") + "-" + label + "-" + uuid4().hex[:8])
            (target / "files").mkdir(parents=True)
            snapshot = target / "workbench.sqlite"
            with self.connection(readonly=True) as source:
                destination = sqlite3.connect(snapshot)
                try:
                    source.backup(destination)
                    if destination.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                        raise ValueError("备份数据库完整性校验失败。")
                    version = destination.execute("PRAGMA user_version").fetchone()[0]
                    references = destination.execute("SELECT hash,mime,size FROM files").fetchall()
                finally:
                    destination.close()
            flush_file(snapshot)
            files = {"workbench.sqlite": digest(snapshot.read_bytes())}
            for identifier, mime, size in references:
                if not re.fullmatch(r"[a-f0-9]{64}", identifier):
                    raise ValueError("数据库附件编号无效。")
                content = (self.files_dir / identifier).read_bytes()
                if len(content) != size or file_id(mime, content) != identifier:
                    raise ValueError("备份附件摘要不匹配。")
                write_durable(target / "files" / identifier, content)
                files["files/" + identifier] = digest(content)
            write_durable(target / "backup.json", json_bytes({"appId": APP_ID, "format": 1, "schemaVersion": version, "createdAt": utc_stamp(), "files": files}))
            return str(target)


def finish_pending_restore(root):
    root = Path(root)
    journal = root / "restore-journal.json"
    if not journal.exists():
        return
    record = read_json(journal)
    if record.get("format") != 1 or not re.fullmatch(r"restore-[a-f0-9-]+", record.get("stage", "")) or not record.get("files", {}).get("workbench.sqlite"):
        raise ValueError("恢复日志不正确，原文件和备份保留。")
    stage = root / record["stage"] / "data"
    for name, checksum in record["files"].items():
        if name != "workbench.sqlite" and not re.fullmatch(r"files/[a-f0-9]{64}", name):
            raise ValueError("恢复文件路径无效。")
        if digest((stage / name).read_bytes()) != checksum:
            raise ValueError("恢复暂存文件损坏，原数据保留。")
    active = root / "data"
    (active / "files").mkdir(parents=True, exist_ok=True)
    for suffix in ("-wal", "-shm"):
        (active / ("workbench.sqlite" + suffix)).unlink(missing_ok=True)
    for name, checksum in sorted(record["files"].items(), key=lambda entry: entry[0] == "workbench.sqlite"):
        shutil.copyfile(stage / name, active / name)
        flush_file(active / name)
        if digest((active / name).read_bytes()) != checksum:
            raise ValueError("恢复写入校验失败，保留日志以供重试。")
    journal.unlink()


def restore_backup(root, source):
    """Caller must hold the service mutex and obtain explicit user confirmation."""
    root, source = Path(root).resolve(), Path(source).resolve()
    manifest = read_json(source / "backup.json")
    if manifest.get("appId") != APP_ID or manifest.get("format") != 1 or manifest.get("schemaVersion") not in (2, SCHEMA_VERSION) or "workbench.sqlite" not in manifest.get("files", {}):
        raise ValueError("备份格式或版本不兼容。")
    stage = root / ("restore-" + str(uuid4()))
    for name, checksum in manifest["files"].items():
        if name != "workbench.sqlite" and not re.fullmatch(r"files/[a-f0-9]{64}", name):
            raise ValueError("备份路径无效。")
        content = (source / name).read_bytes()
        if digest(content) != checksum:
            raise ValueError("备份摘要不匹配，未替换原数据。")
        write_durable(stage / "data" / name, content)
    candidate = Store(stage, migrate=False)
    candidate.load()
    if candidate.schema_version != manifest["schemaVersion"]:
        raise ValueError("备份清单与数据库实际版本不一致。")
    before = None
    if (root / "data/workbench.sqlite").exists():
        try:
            before = Store(root, migrate=False).backup("before-restore")
        except Exception as error:
            if "版本不兼容" in str(error):
                raise
            logging.warning("原数据无法完成校验，保留完整目录后恢复：%s", error)
    preserved = root / ("preserved-data-" + utc_stamp().replace(":", "-") + "-" + uuid4().hex[:8])
    active = root / "data"
    if active.exists():
        shutil.copytree(active, preserved, symlinks=False)
        for file in preserved.rglob("*"):
            if file.is_file():
                flush_file(file)
                if digest(file.read_bytes()) != digest((active / file.relative_to(preserved)).read_bytes()):
                    raise ValueError("恢复前目录复制校验失败。")
    replace_json(root / "restore-journal.json", {"format": 1, "stage": stage.name, "files": manifest["files"]})
    finish_pending_restore(root)
    Store(root)  # Explicit migrations after restoring an older supported backup.
    return {"before": before, "preserved": str(preserved) if preserved.exists() else None}
