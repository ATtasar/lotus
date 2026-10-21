import copy
import json
from pathlib import Path

import pytest
from db import Store, restore_backup, SCHEMA_VERSION
from models import initial_data, validate_workspace
from workspace_models import WORKSPACE_COLLECTIONS
from test_storage import PNG, fixture


def workspace_fixture():
    data = fixture()
    data['rushStyles'] = {'24': '#123456', '48': '#654321'}
    data['orders'].append({**copy.deepcopy(data['orders'][0]), 'id': 'rush1', 'title': '限时测试', 'platform': '', 'client': '', 'category': '', 'rushHours': 24, 'start': '2026-10-22', 'due': '2026-10-23', 'startAt': '2026-10-22T04:00:00.123', 'dueAt': '2026-10-23T04:00:00.123'})
    data['portfolioFolders'] = [{'id': 'album1', 'name': '作品', 'parent': ''}, {'id': 'album2', 'name': '子册', 'parent': 'album1'}]
    data['portfolioImages'] = [{'id': 'image1', 'name': '图片', 'folder': 'album2', 'src': PNG, 'addedAt': '2026-10-22T04:00:00.000Z'}]
    data['portfolioCover'] = {'title': '', 'color': '#333333', 'image': PNG}
    data['lifeCategories'] = [{'id': 'category1', 'name': '事件类别', 'color': '#333333'}]
    data['lifeEvents'] = [{'id': 'event1', 'title': '日程', 'category': 'category1', 'start': '2026-10-22T10:00', 'end': '2026-10-23T12:00', 'content': '', 'notes': '', 'done': False}, {'id': 'event2', 'title': '未定时', 'category': '', 'start': '', 'end': '', 'content': '', 'notes': '', 'done': False}]
    data['healthWidgets'] = [{'id': 'widget1', 'name': '喝水记录', 'kind': 'water', 'unit': '杯', 'step': 1, 'icon': PNG}]
    data['healthLogs'] = [{'id': 'log1', 'widget': 'widget1', 'date': '2026-10-22', 'value': 2}]
    data['foodEntries'] = [{'id': 'food1', 'kind': 'delivery', 'name': '测试内容', 'rating': 4.5, 'notes': '', 'description': ''}]
    data['todoItems'] = [{'id': 'todo1', 'title': '想做的事情', 'done': True}]
    return data


def test_blank_has_no_personal_or_example_records():
    data = initial_data()
    assert all(data[key] == [] for key in WORKSPACE_COLLECTIONS)
    assert not data.get('rushStyles')
    assert not data.get('portfolioCover')


def test_workspace_persistence_files_relations_and_backup_restore(tmp_path):
    store = Store(tmp_path, initialize=True)
    data = workspace_fixture()
    store.save(data, 0)
    assert Store(tmp_path).load()['data'] == data
    with store.connection(readonly=True) as db:
        rows = db.execute("SELECT payload FROM desktop_records WHERE collection IN ('portfolioImages','healthWidgets')").fetchall()
        assert all('@disk:' in row[0] and 'base64' not in row[0] for row in rows)
        assert db.execute("SELECT COUNT(*) FROM desktop_edges WHERE owner_collection IN ('portfolioFolders','portfolioImages','lifeEvents','healthLogs')").fetchone()[0] == 4
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
    backup = store.backup()
    changed = copy.deepcopy(data)
    changed['portfolioImages'][0]['folder'] = ''
    changed['lifeEvents'][0]['done'] = True
    store.save(changed, 1)
    restore_backup(tmp_path, backup)
    assert Store(tmp_path).load()['data'] == data


@pytest.mark.parametrize('mutate', [
    lambda data: data['portfolioFolders'][0].update(parent='album2'),
    lambda data: data['portfolioImages'][0].update(folder='missing'),
    lambda data: data['lifeEvents'][0].update(category='missing'),
    lambda data: data['lifeEvents'][0].update(end='2026-10-20T10:00'),
    lambda data: data['healthLogs'][0].update(widget='missing'),
    lambda data: data['healthLogs'][0].update(value=-1),
    lambda data: data['healthLogs'].append(copy.deepcopy(data['healthLogs'][0])),
    lambda data: data['foodEntries'][0].update(rating=6),
    lambda data: data['orders'][1].update(dueAt='2026-10-22T04:00:00.000'),
    lambda data: data['orders'][1].update(rushHours=12),
    lambda data: data['healthWidgets'][0].update(icon='https://example.com/a.png'),
])
def test_invalid_workspace_changes_leave_database_untouched(tmp_path, mutate):
    store = Store(tmp_path, initialize=True)
    original = workspace_fixture()
    store.save(original, 0)
    invalid = copy.deepcopy(original)
    mutate(invalid)
    with pytest.raises((ValueError, TypeError)):
        store.save(invalid, 1)
    assert store.load() == {'revision': 1, 'data': original}


def test_v4_migration_keeps_exact_record_bytes_and_makes_backup(tmp_path):
    store = Store(tmp_path, initialize=True)
    data = fixture()
    store.save(data, 0)
    with store.connection() as db:
        db.execute('DELETE FROM schema_migrations WHERE version=5')
        db.execute('PRAGMA user_version=4')
        records = [tuple(row) for row in db.execute('SELECT * FROM desktop_records ORDER BY rowid')]
        metadata = tuple(db.execute('SELECT * FROM desktop_workspace').fetchone())
    upgraded = Store(tmp_path)
    assert upgraded.schema_version == SCHEMA_VERSION
    with upgraded.connection(readonly=True) as db:
        assert [tuple(row) for row in db.execute('SELECT * FROM desktop_records ORDER BY rowid')] == records
        assert tuple(db.execute('SELECT * FROM desktop_workspace').fetchone()) == metadata
    backup = next(path for path in (tmp_path / 'backups').iterdir() if 'before-workspace-v5' in path.name)
    assert json.loads((backup / 'backup.json').read_text(encoding='utf8'))['schemaVersion'] == 4
    restore_backup(tmp_path, backup)
    assert Store(tmp_path).load()['data'] == data


def test_ordinary_commission_cannot_lose_required_relationships():
    data = fixture()
    data['orders'][0]['client'] = ''
    with pytest.raises(ValueError):
        validate_workspace(data)


def test_v5_migration_failure_rolls_back_schema_and_records(tmp_path):
    store = Store(tmp_path, initialize=True)
    original = fixture()
    store.save(original, 0)
    with store.connection() as db:
        db.execute('DELETE FROM schema_migrations WHERE version=5')
        db.execute('PRAGMA user_version=4')
        db.execute("CREATE TRIGGER fail_v5 BEFORE INSERT ON schema_migrations WHEN NEW.version=5 BEGIN SELECT RAISE(ABORT,'simulated migration failure'); END")
    with pytest.raises(ValueError, match='已回滚'):
        Store(tmp_path)
    readonly = Store(tmp_path, migrate=False)
    assert readonly.schema_version == 4
    assert readonly.load() == {'revision': 1, 'data': original}
    assert any('before-workspace-v5' in path.name for path in (tmp_path / 'backups').iterdir())
