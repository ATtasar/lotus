# 参考项目与第三方许可

本项目后端分层、本地 SQLite、Windows 单实例/托盘启动及 PyInstaller + Inno Setup 打包流程，参考：

- 项目：https://github.com/mimo9708/oimimo-scheduler
- 审计提交：ffa5c3994139acc9982c8685ee6855223b321f88
- 作者标识与许可：Copyright (c) 2026 oimimo，MIT。
- 完整许可保留于 [docs/OIMIMO-LICENSE.txt](docs/OIMIMO-LICENSE.txt)。

原稿件工作台的 desktop/ UI 来自 ATtasar/Lotus-Workbench 的现有电脑端版本，没有复制 oimimo 的网页、CSS、主题、模板、图标、截图、个人资料或示例业务数据。

## 实际采用与适配

| 参考机制 | Lotus 实现 |
| --- | --- |
| Flask 路由 + Pydantic 校验 + SQLite 分层 | app.py、models.py、db.py；通过原 API 适配现有 UI，未改成 HTMX 页面 |
| WAL、连接级外键、事务 | 每个连接开启外键，写入 BEGIN IMMEDIATE，提交失败整体回滚 |
| 显式迁移和升级前备份 | 结构 2 → 3，备份后增加关联表和迁移记录，保留原表 |
| 原图独立文件与打包资源分离 | 保留原图字节和 SHA-256 去重，文件固定保存在用户数据目录，不自动压缩或删除 |
| 单实例与托盘 | 按数据目录确定 Windows 命名互斥体；托盘打开工作台、数据、备份、日志和停止服务 |
| 本地网页与 Windows 独立运行包 | PyInstaller onedir + Inno Setup；所有页面资源包含在运行包中 |
| 隔离测试 | 临时数据库和端口；不把参考项目测试或旧版本测试当作新实现验证 |

## 保留自身要求的差异

- 数据独立于程序安装目录，更新和卸载不主动删除业务数据。
- 使用 Waitress 提供 Windows WSGI 服务，不启用 Flask 调试服务器。
- 仅监听 127.0.0.1，不包含参考项目的日历 LAN 监听或手机功能。
- 原稿件模型、平台费用、可选字段、组件及自定义流程保持原有行为；不引入参考项目的陌生业务模块或改动 UI。
- 保留 Lotus 旧备份读取和 CAS 版本冲突保护；恢复前确认并保留原数据。

第三方 Python 依赖保留各自许可，版本固定在 requirements 文件。Python、Flask、Pydantic、Waitress、Pillow、pystray、PyInstaller 和 Inno Setup 的许可各自适用。编译器本身不随应用运行包分发。
