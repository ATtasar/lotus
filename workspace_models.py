"""Additive desktop workspace validation; no initial personal records."""
from datetime import datetime
import re

WORKSPACE_COLLECTIONS = ('portfolioFolders', 'portfolioImages', 'lifeCategories', 'lifeEvents', 'healthWidgets', 'healthLogs', 'foodEntries', 'todoItems')


def validate_workspace_features(data):
    def text(value, limit=30000):
        return isinstance(value, str) and len(value) <= limit

    def color(value):
        return isinstance(value, str) and re.fullmatch(r'#[a-fA-F0-9]{6}', value)

    def identifier(value):
        return isinstance(value, str) and re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', value)

    def stamp(value):
        if not value:
            return
        if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?', value):
            raise ValueError('日期时间格式不正确。')
        datetime.fromisoformat(value.replace('Z', '+00:00'))

    for key in WORKSPACE_COLLECTIONS:
        data.setdefault(key, [])
        records = data[key]
        if not isinstance(records, list) or len(records) > 10000 or any(not isinstance(item, dict) or not identifier(item.get('id')) for item in records) or len({item['id'] for item in records}) != len(records):
            raise ValueError('工作空间记录编号或数量不正确：' + key)
    folders = {item['id']: item for item in data['portfolioFolders']}
    for folder in folders.values():
        if not text(folder.get('name'), 100) or not folder['name'].strip():
            raise ValueError('作品文件夹名称不能为空。')
        seen = {folder['id']}
        parent = folder.get('parent', '')
        while parent:
            if parent not in folders or parent in seen:
                raise ValueError('作品文件夹存在无效关联或循环。')
            seen.add(parent)
            parent = folders[parent].get('parent', '')
    for image in data['portfolioImages']:
        if not text(image.get('name'), 300) or not isinstance(image.get('src'), str) or image.get('folder', '') and image['folder'] not in folders:
            raise ValueError('作品图片信息或文件夹关联不正确。')
        stamp(image.get('addedAt', ''))
    categories = {item['id'] for item in data['lifeCategories']}
    for item in data['lifeCategories']:
        if not text(item.get('name'), 40) or not item['name'].strip() or not color(item.get('color')):
            raise ValueError('事件类别信息不正确。')
    for item in data['lifeEvents']:
        if not text(item.get('title'), 200) or not item['title'].strip() or not text(item.get('content')) or not text(item.get('notes')) or type(item.get('done')) is not bool or item.get('category', '') and item['category'] not in categories:
            raise ValueError('事件名称、内容或类别不正确。')
        stamp(item.get('start', ''))
        stamp(item.get('end', ''))
        if item.get('start') and item.get('end') and item['start'] > item['end']:
            raise ValueError('事件结束时间不能早于开始时间。')
    widgets = {item['id'] for item in data['healthWidgets']}
    for item in data['healthWidgets']:
        if not text(item.get('name'), 100) or not item['name'].strip() or item.get('kind') not in ('water', 'exercise', 'clean', 'custom') or not text(item.get('unit'), 20) or type(item.get('step')) not in (int, float) or not 0 < item['step'] <= 100000:
            raise ValueError('健康组件设置不正确。')
    seen = set()
    for item in data['healthLogs']:
        if item.get('widget') not in widgets or type(item.get('value')) not in (int, float) or not 0 <= item['value'] <= 10000000:
            raise ValueError('健康记录数值或组件关联不正确。')
        datetime.strptime(item.get('date', ''), '%Y-%m-%d')
        pair = (item['widget'], item['date'])
        if pair in seen:
            raise ValueError('同一个健康组件每天只能有一份汇总记录。')
        seen.add(pair)
    for item in data['foodEntries']:
        if item.get('kind') not in ('delivery', 'dish') or not text(item.get('name'), 100) or not item['name'].strip() or type(item.get('rating')) not in (int, float) or not 0 <= item['rating'] <= 5 or not text(item.get('notes')) or not text(item.get('description')):
            raise ValueError('转盘内容或评分不正确。')
    for item in data['todoItems']:
        if not text(item.get('title'), 300) or not item['title'].strip() or type(item.get('done')) is not bool:
            raise ValueError('待办名称或状态不正确。')
    styles = data.get('rushStyles', {})
    if not isinstance(styles, dict) or any(key not in ('24', '48') or not color(value) for key, value in styles.items()):
        raise ValueError('特殊模板颜色不正确。')
    cover = data.get('portfolioCover')
    if cover is not None and (not isinstance(cover, dict) or not text(cover.get('title', ''), 100) or not color(cover.get('color', '#242424'))):
        raise ValueError('作品封面设置不正确。')
    return data
