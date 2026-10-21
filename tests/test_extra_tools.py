import copy
import json

import pytest
from pydantic import ValidationError

from db import Store, restore_backup, SCHEMA_VERSION
from models import validate_workspace, EXTRA_COLLECTIONS
from test_storage import fixture, PNG


def extras_fixture():
    data = fixture()
    data['templates'] = [{**copy.deepcopy(data['orders'][0]), 'id': 'template1'}]
    entry = {'id': 'entry1', 'name': '头像', 'price': 330, 'description': '半身构图', 'image': PNG, 'bg': '#ffffff', 'color': '#222222', 'fit': 'cover'}
    data['priceEntries'] = [entry]
    data['priceLists'] = [{'id': 'list1', 'name': '十月价目表', 'width': 1200, 'columns': 2, 'cardHeight': 540, 'gap': 24, 'padding': 48, 'bg': '#eeeeee', 'backgroundImage': PNG, 'items': [copy.deepcopy(entry)]}]
    data['replyFolders'] = [{'id': 'folder1', 'name': '订单回复', 'parent': ''}, {'id': 'folder2', 'name': '确认要求', 'parent': 'folder1'}]
    data['replyTemplates'] = [{'id': 'reply1', 'title': '确认稿件要求', 'body': '请确认构图与参考图。', 'parent': 'folder2', 'templateIds': ['template1']}]
    return data


def test_extra_images_relations_persist_backup_and_restore(tmp_path):
    store = Store(tmp_path, initialize=True)
    data = extras_fixture()
    store.save(data, 0)
    assert Store(tmp_path).load()['data'] == data
    with store.connection(readonly=True) as db:
        raw = db.execute("SELECT payload FROM desktop_records WHERE collection='priceLists'").fetchone()[0]
        assert 'base64' not in raw and '@disk:' in raw
        assert db.execute("SELECT COUNT(*) FROM desktop_edges WHERE owner_collection='replyTemplates'").fetchone()[0] == 2
        assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    backup = store.backup()
    edited = copy.deepcopy(data)
    edited['priceLists'][0]['items'][0]['price'] = 888
    store.save(edited, 1)
    restore_backup(tmp_path, backup)
    assert Store(tmp_path).load()['data'] == data


@pytest.mark.parametrize('mutate', [
    lambda data: data['replyFolders'][0].update(parent='folder2'),
    lambda data: data['replyTemplates'][0].update(templateIds=['missing']),
    lambda data: data['replyTemplates'][0].update(parent='missing'),
    lambda data: data['priceLists'][0]['items'].append(copy.deepcopy(data['priceLists'][0]['items'][0])),
    lambda data: data['priceLists'][0].update(columns=8),
    lambda data: data['priceEntries'][0].update(image='https://example.com/image.jpg'),
])
def test_bad_extra_data_never_changes_last_commit(tmp_path, mutate):
    store = Store(tmp_path, initialize=True)
    original = extras_fixture()
    store.save(original, 0)
    invalid = copy.deepcopy(original)
    mutate(invalid)
    with pytest.raises((ValueError, ValidationError)):
        store.save(invalid, 1)
    assert store.load() == {'revision': 1, 'data': original}


def test_old_backups_and_schema3_are_additive(tmp_path):
    legacy = fixture()
    for key in EXTRA_COLLECTIONS:
        legacy.pop(key)
    upgraded = validate_workspace(legacy)
    assert all(upgraded[key] == [] for key in EXTRA_COLLECTIONS)
    store = Store(tmp_path, initialize=True)
    store.save(legacy, 0)
    assert Store(tmp_path).load()['data'] == upgraded
    assert store.revision() == 1


def test_schema3_upgrade_is_backed_up_and_keeps_record_bytes(tmp_path):
    store = Store(tmp_path, initialize=True)
    store.save(extras_fixture(), 0)
    with store.connection() as db:
        db.execute('DELETE FROM schema_migrations WHERE version>=4')
        db.execute('PRAGMA user_version=3')
        records = [tuple(row) for row in db.execute('SELECT * FROM desktop_records ORDER BY rowid')]
    upgraded = Store(tmp_path)
    assert upgraded.schema_version == SCHEMA_VERSION
    assert upgraded.load() == {'revision': 1, 'data': extras_fixture()}
    with upgraded.connection(readonly=True) as db:
        assert db.execute('PRAGMA user_version').fetchone()[0] == SCHEMA_VERSION
        assert [tuple(row) for row in db.execute('SELECT * FROM desktop_records ORDER BY rowid')] == records
    backup = next(path for path in (tmp_path / 'backups').iterdir() if 'before-desktop-tools-v4' in path.name)
    assert json.loads((backup / 'backup.json').read_text(encoding='utf-8'))['schemaVersion'] == 3
    restore_backup(tmp_path, backup)
    assert Store(tmp_path).load()['data'] == extras_fixture()


def test_schema4_failure_rolls_back_without_touching_records(tmp_path, monkeypatch):
    store = Store(tmp_path, initialize=True)
    data = extras_fixture()
    store.save(data, 0)
    with store.connection() as db:
        db.execute('DELETE FROM schema_migrations WHERE version>=4')
        db.execute('PRAGMA user_version=3')
    def fail(*_):
        raise ValueError('simulated relation write failure')
    with monkeypatch.context() as patch:
        patch.setattr(Store, '_edges', fail)
        with pytest.raises(ValueError, match='已回滚'):
            Store(tmp_path)
    readonly = Store(tmp_path, migrate=False)
    assert readonly.schema_version == 3
    assert readonly.load()['data'] == data
