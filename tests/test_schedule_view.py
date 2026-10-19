import copy

import pytest
from pydantic import ValidationError

from db import Store
from models import validate_workspace
from test_storage import fixture


def test_saved_schedule_choice_survives_reopen_without_changing_orders_or_images(tmp_path):
    store = Store(tmp_path, initialize=True)
    original = fixture()
    store.save(original, 0)
    files_before = {file.name: file.read_bytes() for file in store.files_dir.iterdir()}
    changed = copy.deepcopy(original)
    changed['scheduleView'] = 'range'
    store.save(changed, 1)
    assert Store(tmp_path).load() == {'revision': 2, 'data': changed}
    assert {file.name: file.read_bytes() for file in store.files_dir.iterdir()} == files_before
    legacy = copy.deepcopy(original)
    legacy.pop('scheduleView')
    assert validate_workspace(legacy) == original


@pytest.mark.parametrize('invalid', ['all', '', None, 42])
def test_invalid_schedule_choice_never_replaces_last_commit(tmp_path, invalid):
    store = Store(tmp_path, initialize=True)
    original = fixture()
    store.save(original, 0)
    changed = copy.deepcopy(original)
    changed['scheduleView'] = invalid
    with pytest.raises(ValidationError):
        store.save(changed, 1)
    assert store.load() == {'revision': 1, 'data': original}
