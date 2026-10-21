"""Pydantic validation for the unchanged desktop model, including relationships."""
import copy
import math
import re
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from images import decode_image
from workspace_models import WORKSPACE_COLLECTIONS, validate_workspace_features

EXTRA_COLLECTIONS = ("priceEntries", "priceLists", "replyFolders", "replyTemplates")
COLLECTIONS = ("platforms", "clients", "archivedClients", "orders", "templates", "assets", "toolTemplates", *EXTRA_COLLECTIONS, *WORKSPACE_COLLECTIONS)
Identifier = Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")]
Text = Annotated[str, Field(max_length=30000)]
Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
Money = Annotated[float | int, Field(ge=0, le=10000000)]


class Record(BaseModel):
    model_config = ConfigDict(strict=True, extra="allow", allow_inf_nan=False)
    id: Identifier


class Platform(Record):
    name: Text
    color: Color
    fee: Annotated[float | int, Field(ge=0, le=100)]

    @field_validator("name")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("平台名称不能为空。")
        return value


class Client(Record):
    name: Text
    platforms: Annotated[list[Identifier], Field(min_length=1)]
    preferences: Text
    dislikes: Text
    requirements: Text
    notes: Text
    cn: Text = ""
    salutation: Text = ""
    platformLink: Text = ""

    @field_validator("platformLink")
    @classmethod
    def valid_link(cls, value):
        if value and not re.fullmatch(r"https?://[^\s]+", value, re.I):
            raise ValueError("平台链接必须使用 http 或 https。")
        return value


class Extra(BaseModel):
    model_config = ConfigDict(strict=True, extra="allow", allow_inf_nan=False)
    name: Text
    amount: Money


class Commission(Record):
    title: Text
    category: Text
    platform: Identifier | Literal[""]
    deposit: Money
    balance: Money
    fee: Annotated[float | int, Field(ge=0, le=100)]
    requirements: Text
    stages: Annotated[list[str], Field(min_length=3, max_length=30)]
    images: Annotated[list[str], Field(max_length=12)]
    extras: list[Extra]

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, value):
        if not value.strip():
            raise ValueError("稿件名称不能为空。")
        return value

    @field_validator("stages")
    @classmethod
    def valid_stages(cls, value):
        if value[0] != "未开始" or value[-2:] != ["成图", "完成"] or len(set(value)) != len(value) or any(not stage.strip() or len(stage) > 40 or stage == "退单" for stage in value):
            raise ValueError("稿件流程不正确。")
        return value


class Order(Commission):
    client: Identifier | Literal[""]
    rushHours: Literal[24, 48] | None = None
    startAt: str = ""
    dueAt: str = ""
    start: str
    due: str
    status: str
    paid: bool
    notes: Text

    @model_validator(mode="after")
    def order_state(self):
        for value in (self.start, self.due):
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) or date.fromisoformat(value).isoformat() != value:
                raise ValueError("稿件日期不正确。")
        if self.start > self.due or self.status not in self.stages + ["退单"]:
            raise ValueError("稿件日期或状态不正确。")
        if not self.rushHours and (not self.platform or not self.client):
            raise ValueError("普通稿件需要选择平台和单主。")
        if self.rushHours:
            from datetime import datetime
            begin, end = datetime.fromisoformat(self.startAt), datetime.fromisoformat(self.dueAt)
            if begin.date().isoformat() != self.start or end.date().isoformat() != self.due or end < begin:
                raise ValueError("特殊稿件的日期和具体时间不一致。")
        return self


class Asset(Record):
    name: Text
    src: str


class ToolTemplate(Record):
    name: Text
    kind: Literal["receipt", "card", "layout"]


class PriceEntry(Record):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    price: Money
    description: Text
    image: str = ""
    bg: Color
    color: Color
    fit: Literal["cover", "contain"]

    @field_validator("name")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("价目名称不能为空。")
        return value


class PriceList(Record):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    bg: Color
    backgroundImage: str = ""
    width: Annotated[int, Field(ge=600, le=2400)]
    columns: Annotated[int, Field(ge=1, le=4)]
    cardHeight: Annotated[int, Field(ge=280, le=900)]
    gap: Annotated[int, Field(ge=8, le=100)]
    padding: Annotated[int, Field(ge=20, le=120)]
    items: Annotated[list[PriceEntry], Field(max_length=100)]

    @model_validator(mode="after")
    def layout_valid(self):
        if not self.name.strip() or len({item.id for item in self.items}) != len(self.items) or self.padding * 2 + self.gap * (self.columns - 1) + self.columns * 80 > self.width:
            raise ValueError("价目表名称、条目编号或列宽不正确。")
        return self


class ReplyFolder(Record):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    parent: str = ""


class ReplyTemplate(Record):
    title: Annotated[str, Field(min_length=1, max_length=100)]
    body: Text
    parent: str = ""
    templateIds: list[Identifier]


class Profile(BaseModel):
    model_config = ConfigDict(strict=True, extra="allow")
    name: Text
    artist: Text
    tagline: Text


class Workspace(BaseModel):
    model_config = ConfigDict(strict=True, extra="allow", allow_inf_nan=False)
    version: Literal[1]
    scheduleView: Literal["deadline", "range"] = "deadline"
    profile: Profile
    platforms: Annotated[list[Platform], Field(max_length=10000)]
    clients: Annotated[list[Client], Field(max_length=10000)]
    archivedClients: Annotated[list[Client], Field(max_length=10000)] = []
    orders: Annotated[list[Order], Field(max_length=10000)]
    templates: Annotated[list[Commission], Field(max_length=10000)]
    assets: Annotated[list[Asset], Field(max_length=10000)]
    toolTemplates: Annotated[list[ToolTemplate], Field(max_length=10000)]
    priceEntries: Annotated[list[PriceEntry], Field(max_length=10000)] = []
    priceLists: Annotated[list[PriceList], Field(max_length=10000)] = []
    replyFolders: Annotated[list[ReplyFolder], Field(max_length=10000)] = []
    replyTemplates: Annotated[list[ReplyTemplate], Field(max_length=10000)] = []
    categories: Annotated[list[str], Field(max_length=10000)] = []

    @field_validator("categories")
    @classmethod
    def categories_valid(cls, value):
        if len(set(value)) != len(value) or any(not name or name != name.strip() or len(name) > 40 for name in value):
            raise ValueError("稿件类别记录不正确。")
        return value

    @model_validator(mode="after")
    def relationships(self):
        for key in COLLECTIONS:
            if key in WORKSPACE_COLLECTIONS:
                continue  # Validated below against the raw, additive workspace records.
            records = getattr(self, key)
            if len({item.id for item in records}) != len(records):
                raise ValueError("记录编号重复：" + key)
        platform_ids = {item.id for item in self.platforms}
        client_ids = {item.id for item in self.clients + self.archivedClients}
        for client in self.clients + self.archivedClients:
            if any(platform not in platform_ids for platform in client.platforms):
                raise ValueError("单主关联的平台不存在。")
        for item in self.orders + self.templates:
            if item.platform not in platform_ids and not (isinstance(item, Order) and item.rushHours and not item.platform):
                raise ValueError("稿件关联的平台不存在。")
        for item in self.orders:
            if item.client not in client_ids and not (item.rushHours and not item.client):
                raise ValueError("稿件关联的单主不存在。")
        folders = {item.id: item for item in self.replyFolders}
        for folder in self.replyFolders:
            if not folder.name.strip():
                raise ValueError("快捷回复分组名称不能为空。")
            seen = {folder.id}
            parent = folder.parent
            while parent:
                if parent not in folders or parent in seen:
                    raise ValueError("快捷回复分组缺失或循环嵌套。")
                seen.add(parent)
                parent = folders[parent].parent
        template_ids = {item.id for item in self.templates}
        for reply in self.replyTemplates:
            if not reply.title.strip() or reply.parent and reply.parent not in folders or len(set(reply.templateIds)) != len(reply.templateIds) or any(value not in template_ids for value in reply.templateIds):
                raise ValueError("快捷回复标题、分组或稿件模板关联不正确。")
        return self


def validate_design(state):
    def number(value, low, high):
        return type(value) in (int, float) and math.isfinite(value) and low <= value <= high

    def text(value, limit=30000):
        return isinstance(value, str) and len(value) <= limit

    def color(value):
        return isinstance(value, str) and re.fullmatch(r"#[a-f0-9]{6}", value, re.I)

    fonts = {"sans", "song", "kai", "hei", "mono"}
    bindings = {"brand", "subtitle", "customer", "membership", "cardNumber", "itemText", "amount", "date", "handle", "message"}
    if not isinstance(state, dict) or state.get("version", 1) != 1 or not number(state.get("width"), 200, 4000) or not number(state.get("height"), 200, 4000) or not color(state.get("bg")) or not isinstance(state.get("items"), list) or len(state["items"]) > 10000:
        raise ValueError("画布设置不正确。")
    for key, allowed in {"font": fonts, "style": {"classic", "minimal", "border", "ticket"}, "preset": {"classic", "centered", "left", "right"}}.items():
        if key in state and state[key] not in allowed:
            raise ValueError("画布外观不正确。")
    if "color" in state and not color(state["color"]):
        raise ValueError("画布文字颜色不正确。")
    if state.get("backgroundImage"):
        decode_image(state["backgroundImage"])
    for item in state["items"]:
        if not isinstance(item, dict) or not text(item.get("name")) or not number(item.get("x"), -8000, 8000) or not number(item.get("y"), -8000, 8000) or not number(item.get("rotation"), -180, 180) or ("visible" in item and type(item["visible"]) is not bool):
            raise ValueError("图层位置不正确。")
        if item.get("kind") == "text":
            if not text(item.get("text")) or item.get("binding") and item["binding"] not in bindings or not number(item.get("size"), 8, 300) or not number(item.get("width"), 20, 4000) or item.get("align") not in ("left", "center", "right") or item.get("font") and item["font"] not in fonts or item.get("color") and not color(item["color"]):
                raise ValueError("文字图层不正确。")
        else:
            if item.get("kind") not in (None, "image") or not number(item.get("scale"), 1, 200):
                raise ValueError("图片图层不正确。")
            decode_image(item.get("src"))


def validate_workspace(value):
    Workspace.model_validate(value)
    from images import image_slots
    data = copy.deepcopy(value)
    data.setdefault("archivedClients", [])
    data.setdefault("scheduleView", "deadline")
    for key in EXTRA_COLLECTIONS:
        data.setdefault(key, [])
    validate_workspace_features(data)
    for container, key in image_slots(data):
        decode_image(container[key])
    for template in data["toolTemplates"]:
        if template["kind"] == "layout":
            validate_design(template.get("layout"))
        else:
            if not isinstance(template.get("accent"), str) or not re.fullmatch(r"#[a-f0-9]{6}", template["accent"], re.I) or any(not isinstance(template.get(key), str) or len(template[key]) > 30000 for key in ("brand", "handle", "message", "subtitle")):
                raise ValueError("小票或会员卡模板不正确。")
            if any(key in template and (not isinstance(template[key], str) or len(template[key]) > 30000) for key in ("membership", "cardNumber", "itemText", "customer", "date", "amount")):
                raise ValueError("组件选填资料不正确。")
        if "design" in template:
            validate_design(template["design"])
    orders = data["orders"]
    if not any(item["id"] == data.get("current") for item in orders):
        data["current"] = orders[0]["id"] if orders else ""
    return data


def initial_data():
    return {"version": 1, "appearanceVersion": 2, "scheduleView": "deadline", "categories": [], **{key: [] for key in COLLECTIONS}, "current": "", "profile": {"name": "接稿工作台", "artist": "管理员", "tagline": ""}}
