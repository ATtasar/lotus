"""Flask API adapter for the original desktop HTML/CSS/JavaScript."""
import json
import logging
import os
from pathlib import Path
import re
import secrets
import sys

from flask import Flask, Response, jsonify, request, send_from_directory
from pydantic import ValidationError
from werkzeug.exceptions import HTTPException

from db import APP_ID, SCHEMA_VERSION, Conflict, Store

DESKTOP_FILES = {"index.html", "styles.css", "app.js", "api.js", "storage.js", "model.js", "design-model.js", "designer.js", "workbench.ico", "workbench-model.js", "tools-extra.js"}
MAX_REQUEST_BYTES = 128 * 1024 * 1024


def resource_dir():
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def create_app(root, *, port=17841, instance="source", initialize=False, web=None):
    root = Path(root)
    if not root.is_absolute():
        raise ValueError("数据目录必须为绝对路径。")
    root = root.resolve()
    if type(port) is not int or not 1024 <= port <= 65535:
        raise ValueError("本机端口必须在 1024–65535 范围。")
    web = Path(web) if web else resource_dir() / "desktop"
    if not all((web / name).is_file() for name in DESKTOP_FILES):
        raise ValueError("电脑端页面资源不完整，请重新解压完整程序。")
    api_base = os.environ.get("LOTUS_API_BASE_URL", "/local-api/")
    if not re.fullmatch(r"/[a-zA-Z0-9_-][a-zA-Z0-9_/-]*/?", api_base) or "//" in api_base:
        raise ValueError("API 必须使用本机同源路径，不允许远程服务器地址。")
    api_base = api_base.rstrip("/") + "/"
    app = Flask(__name__, static_folder=None)
    app.config.update(MAX_CONTENT_LENGTH=MAX_REQUEST_BYTES, PROPAGATE_EXCEPTIONS=False)
    app.json.ensure_ascii = False
    app.json.sort_keys = False
    store = Store(root, initialize=initialize)
    token = secrets.token_hex(32)
    origin = f"http://127.0.0.1:{port}"
    app.extensions["lotus"] = {"store": store, "token": token, "instance": instance, "apiBase": api_base, "port": port, "closing": False, "shutdown": None}

    @app.before_request
    def guard():
        if request.host != f"127.0.0.1:{port}" or request.remote_addr not in ("127.0.0.1", None):
            return jsonify(message="工作台仅允许本机访问。"), 403
        if request.headers.get("Origin") not in (None, origin) or request.headers.get("Sec-Fetch-Site") == "cross-site":
            return jsonify(message="拒绝跨站访问电脑数据。"), 403
        if app.extensions["lotus"]["closing"]:
            return jsonify(message="服务正在停止，修改尚未确认保存。"), 503

    @app.after_request
    def headers(response):
        response.headers["Cache-Control"] = "no-store" if request.path.startswith(api_base) or request.path.startswith("/local-api/") or request.path == "/runtime-config.js" else "no-cache"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"
        return response

    def api(endpoint):
        if endpoint == "health" and request.method == "GET":
            return jsonify(appId=APP_ID, instance=instance, status="ok", ui="desktop-blank", protocol=4, engine="flask", profile="desktop-only", pid=os.getpid(), apiBase=api_base, port=port, dataRoot=str(root), databasePath=str(store.database), web=str(web.resolve()), schemaVersion=SCHEMA_VERSION)
        if request.headers.get("X-Lotus-Local") != "1":
            return jsonify(message="无效的工作台请求。"), 403
        if endpoint == "session" and request.method == "GET":
            return jsonify(token=token, localAccess=True)
        if not secrets.compare_digest(request.headers.get("X-Lotus-Token", ""), token):
            return jsonify(message="服务连接已更新，请刷新页面后再保存。"), 403
        if request.method == "GET":
            if endpoint == "desktop-workspace":
                return jsonify(store.load())
            if endpoint == "revision":
                return jsonify(revision=store.revision())
            if endpoint == "info":
                return jsonify(profile="desktop-only", databasePath=str(store.database), filesPath=str(store.files_dir), backupsPath=str(root / "backups"), engine="flask", schemaVersion=SCHEMA_VERSION)
            return jsonify(message="电脑端接口不存在。"), 404
        if request.method != "POST":
            return jsonify(message="请求类型不正确。"), 405
        if request.mimetype != "application/json":
            return jsonify(message="请求必须使用 JSON。"), 415
        body = request.get_json()
        if not isinstance(body, dict):
            return jsonify(message="请求资料必须为对象。"), 400
        if endpoint == "desktop-workspace":
            return jsonify(revision=store.save(body.get("data"), body.get("baseRevision")))
        if endpoint == "backup":
            return jsonify(path=store.backup())
        if endpoint == "stop":
            shutdown = app.extensions["lotus"]["shutdown"]
            if shutdown is None:
                return jsonify(message="服务停止入口尚未准备完成。"), 503
            import threading
            threading.Timer(0.2, shutdown).start()
            return jsonify(stopping=True)
        return jsonify(message="电脑端接口不存在。"), 404

    app.add_url_rule(api_base + "<path:endpoint>", "api", api, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
    if api_base != "/local-api/":
        app.add_url_rule("/local-api/<path:endpoint>", "local_alias", api, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])

    @app.get("/runtime-config.js")
    def runtime_config():
        return Response("window.LOTUS_CONFIG=" + json.dumps({"apiBase": api_base, "localAccess": True, "desktopOnly": True, "pollIntervalMs": 3000}) + ";", mimetype="text/javascript")

    @app.get("/")
    @app.get("/<path:name>")
    def desktop(name="index.html"):
        if name not in DESKTOP_FILES:
            return jsonify(message="电脑端页面资源不存在。"), 404
        return send_from_directory(web, name)

    @app.errorhandler(Conflict)
    def conflict(error):
        return jsonify(message=str(error)), 409

    @app.errorhandler(ValidationError)
    def validation(error):
        first = error.errors(include_input=False, include_url=False)[0]
        names = {"platforms": "平台", "clients": "单主", "archivedClients": "历史单主", "orders": "稿件", "templates": "稿件模板", "assets": "素材", "toolTemplates": "组件模板", "profile": "工作室资料", "categories": "稿件类别"}
        section = names.get(str(first["loc"][0]), "工作台") if first["loc"] else "工作台"
        detail = str(first.get("ctx", {}).get("error", "字段、数值或格式不符合要求，请检查填写内容。"))
        return jsonify(message=section + "资料校验失败：" + detail), 400

    @app.errorhandler(ValueError)
    def invalid(error):
        return jsonify(message=str(error)), 400

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(message={400: "请求格式不正确。", 404: "电脑端资源不存在。", 405: "请求方法不正确。", 413: "请求超过 128 MB 限制。"}.get(error.code, "操作失败。")), error.code

    @app.errorhandler(Exception)
    def unexpected(error):
        logging.exception("本机数据操作失败")
        return jsonify(message="本次操作失败，未确认保存。请保留页面并查看本机日志；原数据不会被重置。"), 500

    return app
