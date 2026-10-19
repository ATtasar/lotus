"""Create demonstration records only in a new, explicitly selected preview root."""
import copy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import Store
from models import initial_data


def picture(style=0):
    shades = ['#d2d0ca', '#c6cbd0', '#bfc8c2', '#d2c6bd']
    shade = shades[style % len(shades)]
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="700" height="800" viewBox="0 0 700 800"><rect width="700" height="800" fill="{shade}"/><rect x="54" y="54" width="592" height="692" rx="280" fill="#f0ede7"/><ellipse cx="350" cy="340" rx="126" ry="150" fill="{shade}"/><path d="M160 670 C160 430 540 430 540 670" fill="{shade}"/><path d="M54 680h592M350 54v90" fill="none" stroke="#ffffff" stroke-width="2"/><circle cx="570" cy="128" r="18" fill="#ffffff"/></svg>'
    return 'data:image/svg+xml;charset=utf-8,' + quote(svg, safe="~()*!.'-")


def demo_data(*, many=False):
    data = initial_data()
    data['profile'] = {'name': '接稿工作台', 'artist': '预览', 'tagline': ''}
    data['platforms'] = [{'id': 'p1', 'name': '米画师', 'color': '#373737', 'fee': 5}, {'id': 'p2', 'name': '个人委托', 'color': '#9c9c9c', 'fee': 0}, {'id': 'p3', 'name': '约稿平台', 'color': '#d2d2d2', 'fee': 3}]
    current = date.today()
    stamp = datetime.now(timezone.utc)
    for index, name in enumerate(['单主甲', '单主乙', '单主丙', '单主丁']):
        data['clients'].append({'id': f'c{index}', 'name': name, 'cn': '', 'salutation': '', 'platformLink': '', 'platforms': [data['platforms'][index % 3]['id']], 'preferences': '背景留白，配色以参考图为准', 'dislikes': '', 'requirements': '', 'notes': '', 'createdAt': (stamp - timedelta(days=12-index)).isoformat()})
    categories = ['头像', '半身插画', '人物立绘']
    for index in range(9):
        data['templates'].append({'id': f't{index}', 'title': ['头像委托', '半身插画', '人物立绘'][index % 3] + (' · 简版' if index < 3 else ' · 标准' if index < 6 else ' · 细化'), 'category': categories[index % 3], 'platform': data['platforms'][index // 3]['id'], 'deposit': 100, 'balance': [160, 320, 580][index % 3], 'fee': data['platforms'][index // 3]['fee'], 'requirements': '确认草稿后进入细化。', 'stages': ['未开始', '草稿', '配色确认', '成图', '完成'], 'extras': [], 'images': [], 'showImages': False})
    count_active, count_ended = (23, 53) if many else (6, 3)
    for index in range(count_active + count_ended):
        template = data['templates'][index % 9]
        client = data['clients'][index % 4]
        closed = index >= count_active
        order = {**copy.deepcopy(template), 'id': f'o{index}', 'title': f'{template["title"]} {index + 1:02}', 'platform': client['platforms'][0], 'client': client['id'], 'start': (current - timedelta(days=10)).isoformat(), 'due': (current + timedelta(days=index % 12) if not closed else current - timedelta(days=index % 10)).isoformat(), 'status': '完成' if closed else ['未开始', '草稿', '配色确认'][index % 3], 'paid': closed, 'notes': '', 'createdAt': (stamp - timedelta(days=5-index % 3)).isoformat()}
        if closed:
            order['endedAt'] = order['completedAt'] = (stamp - timedelta(hours=index)).isoformat()
        data['orders'].append(order)
    data['current'] = 'o0'
    for index in range(4):
        data['priceEntries'].append({'id': f'pe{index}', 'name': ['头像委托', '半身插画', '人物立绘', '双人插画'][index], 'price': [260, 420, 680, 860][index], 'description': '价格与具体要求确认后执行', 'image': picture(index), 'bg': '#ffffff', 'color': '#242424', 'fit': 'cover'})
    data['priceLists'] = [{'id': 'pl1', 'name': '稿件价目表', 'width': 1200, 'columns': 2, 'cardHeight': 540, 'gap': 24, 'padding': 48, 'bg': '#e9e9e9', 'backgroundImage': '', 'items': copy.deepcopy(data['priceEntries'][:2])}]
    data['replyFolders'] = [{'id': 'rf1', 'name': '订单回复', 'parent': ''}, {'id': 'rf2', 'name': '需求确认', 'parent': 'rf1'}, {'id': 'rf3', 'name': '首页介绍', 'parent': ''}, {'id': 'rf4', 'name': '评价模板', 'parent': ''}, {'id': 'rf5', 'name': '回答模板', 'parent': ''}]
    data['replyTemplates'] = [{'id': 'rt1', 'title': '确认稿件需求', 'body': '请确认以下内容：\n1. 稿件用途与尺寸。\n2. 人物设定及参考图。\n3. 交付日期与文件格式。\n确认后按所选稿件流程制作。', 'parent': 'rf2', 'templateIds': ['t0', 't1']}, {'id': 'rt2', 'title': '稿件交付说明', 'body': '稿件已完成，请核对附件及文件格式。\n如需按约定调整，请集中列出修改内容。', 'parent': 'rf1', 'templateIds': ['t0', 't1', 't2']}, {'id': 'rt3', 'title': '接稿范围与说明', 'body': '稿件类型、价格和制作流程以当前价目表与订单记录为准。', 'parent': 'rf3', 'templateIds': []}]
    return data


if __name__ == '__main__':
    root = Path(sys.argv[1]).resolve()
    if (root / 'data/workbench.sqlite').exists():
        raise SystemExit('Preview database already exists; refusing to overwrite.')
    store = Store(root, initialize=True)
    store.save(demo_data(many='--many' in sys.argv), 0)
    print(root)
