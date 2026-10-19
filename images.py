"""Private image files; the desktop's existing JSON contract stays unchanged."""
import base64
import binascii
import hashlib
import re
from urllib.parse import unquote

MAX_IMAGE_BYTES = 16 * 1024 * 1024
DISK_REFERENCE = re.compile(r"^@disk:([a-f0-9]{64})$")


def decode_image(value: str) -> tuple[str, bytes]:
    if not isinstance(value, str):
        raise ValueError("图片格式不正确。")
    svg_prefix = "data:image/svg+xml;charset=utf-8,"
    if value.startswith(svg_prefix):
        text = unquote(value[len(svg_prefix):], errors="strict")
        checked = re.sub(r"url\(\s*#[a-z0-9_-]+\s*\)", "", text.replace("http://www.w3.org/2000/svg", ""), flags=re.I)
        if not text.startswith("<svg ") or re.search(r"script|foreignObject|href\s*=|on\w+\s*=|https?:|url\s*\(", checked, re.I):
            raise ValueError("SVG 图片包含不允许的内容。")
        mime, content = "image/svg+xml", text.encode("utf-8")
    else:
        match = re.fullmatch(r"data:(image/(?:png|jpeg|webp|gif|bmp));base64,([a-z0-9+/=\r\n]+)", value, re.I)
        if not match:
            raise ValueError("图片必须是本地上传的受支持格式。")
        encoded = match[2].replace("\r", "").replace("\n", "")
        if len(encoded) > (MAX_IMAGE_BYTES + 2) // 3 * 4:
            raise ValueError("单张图片不得超过 16 MB。")
        try:
            content = base64.b64decode(encoded, validate=True)
        except binascii.Error as error:
            raise ValueError("图片编码损坏。") from error
        if base64.b64encode(content).decode("ascii") != encoded:
            raise ValueError("图片编码不规范。")
        mime = match[1].lower()
    if len(content) > MAX_IMAGE_BYTES:
        raise ValueError("单张图片不得超过 16 MB。")
    return mime, content


def file_id(mime: str, content: bytes) -> str:
    return hashlib.sha256(mime.encode("utf-8") + b"\0" + content).hexdigest()


def image_slots(data: dict):
    for entry in data.get("priceEntries", []):
        if entry.get("image"):
            yield entry, "image"
    for listing in data.get("priceLists", []):
        if listing.get("backgroundImage"):
            yield listing, "backgroundImage"
        for entry in listing["items"]:
            if entry.get("image"):
                yield entry, "image"
    for item in data["orders"] + data["templates"]:
        for index in range(len(item["images"])):
            yield item["images"], index
    for item in data["assets"]:
        yield item, "src"
    for template in data["toolTemplates"]:
        if template.get("image"):
            yield template, "image"
        for design in [template.get("layout") if template["kind"] == "layout" else None, template.get("design")]:
            if design:
                if design.get("backgroundImage"):
                    yield design, "backgroundImage"
                for item in design["items"]:
                    if item.get("kind") != "text":
                        yield item, "src"
    if data.get("watermarkMark"):
        yield data, "watermarkMark"
