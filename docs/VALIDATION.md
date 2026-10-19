# 实际验证记录

## 1.3.0 发布更新（2026-10-20）

已合并 1.2.0 main 的更新检查、面包屑和关联导航，再加入本地预览中的收入、分页、价目表、快捷回复及排期样式。合并后 54 项 pytest 全部通过；`tests/ui.mjs`、`tests/preview-ui.mjs`、`tests/calendar-ui.mjs` 三套 Edge 浏览器测试通过，两个模型规则测试通过。

浏览器测试直接核对 SQLite，验证原有组件、PNG 剪贴板、JPG 导出、文字复制、多对多关联、安全删除、20/50 分页、样式切换、跨周跨月、服务重启和失败提示。测试数据隔离，所有非本机 HTTP 均阻断，版本检查使用受控响应。

Windows 构建通过 GitHub Actions 在实际 EXE 上重复运行这些交互测试，并运行 `tools/check_release.py`。`release.json` 与 `BUILD-INFO.json` 记录构建提交、版本和桌面资源摘要；正式发布状态以对应标签的 Actions 成功记录和实际下载摘要为准。电脑物理重启和其他物理电脑不属于已验证项目。

以下为旧版本历史验证记录，保留供追溯。

日期：2026-10-20。Windows 11 x64，Python 3.13.16，Flask 3.1.3，Pydantic 2.14.1，Waitress 3.0.2，PyInstaller 6.22.3。只维护现有电脑端稿件工作台。

## 已实际执行

| 项目 | 结果 |
| --- | --- |
| 电脑端 UI | 延续现有布局、组件、字体和交互风格；只增加版本检查、类别管理、关联详情与面包屑，并修正排期和平台颜色。发布资源 SHA-256 与 UI-MANIFEST.json 相同 |
| 后端与启动器测试 | pytest：39 项通过。包括版本比较与网络错误、保存/重读、进度、关联外键、归档、类别、图片去重、事务回滚、版本冲突、访问控制、配置恢复、单实例、缺库保护及备份恢复 |
| 迁移失败 | 注入迁移失败后回滚到结构 2，无半迁移表，原稿件与升级前备份保留 |
| 恢复中断 | 注入文件恢复中断，恢复日志保留，重开后完成此前已确认的恢复，原目录保留 |
| 桌面完整交互 | Edge 实际创建/编辑/删除稿件，验证平台颜色持久化、仅截止日排期、类别增删、稿件/单主层级跳转、更新面板，以及状态、日历、图片、模板、组件、备份与导入流程 |
| 实际 EXE 交互 | 上述桌面完整交互测试同时对接真正打包的 1.2.0 EXE，通过；不只测试源码服务 |
| 保存失败 | HTTP 500 或缺少 revision 的 200 回执不显示成功，输入保留，SQLite 原提交不变 |
| 断网与更新错误 | Edge 阻断所有非本机 HTTP 后完成核心流程；版本检查网络失败单测返回可读错误且不写数据库。更新面板用本机模拟 Releases 响应验证版本、说明和下载按钮 |
| 源码服务重启 | 独立进程停止、重新启动后，稿件和图片一致；修改工作目录不改变数据路径 |
| 免环境 EXE | PATH 不含 Python 或 Node，实际 EXE 仍可安装隔离工作区、启动、创建稿件/图片并重启读取 |
| 桌面与开始菜单 | 运行包生成真实 Windows .lnk，分别冷启动服务，调用系统默认浏览器打开本机地址，重启后 SQLite 内容一致 |
| 真实旧库兼容 | 只读复制当前真实结构 2 数据库及图片到隔离目录，迁移副本到 3；原元数据、记录 JSON 和 revision 相同，图片校验通过。原数据库没有升级或覆盖 |
| 打包 | 已实际生成 1.2.0 Lotus.exe、便携 ZIP 和 release.json，并在隔离目录验证；当前机器缺少 Inno Setup，未在本地生成 setup，GitHub Actions 会安装 Inno 后生成。运行包不包含用户数据库、图片、配置或令牌 |
| 非桌面入口 | 不发布 mobile、Android、React 手机界面、LAN、云端后端或独立收纳代码；服务只绑定 127.0.0.1，相关历史路由不可访问 |

## 命令和产物

```text
python tools/check_ui.py
python -m pytest -q tests
python tools/build_windows.py
python tools/check_release.py --exe dist/1.2.0/Lotus/Lotus.exe
LOTUS_PYTHON=<开发测试 Python> LOTUS_EXE=<实际 EXE> node tests/ui.mjs

dist/1.2.0/Lotus/Lotus.exe
dist/1.2.0/lotus-1.2.0-portable-win64.zip
dist/1.2.0/release.json
```

上面的环境变量写法是测试含义说明；Windows 设置使用 PowerShell 的 $env:LOTUS_PYTHON 和 $env:LOTUS_EXE。Node 仅用于开发时的浏览器自动化，不是应用运行依赖。

测试截图、API/SQLite 结果和运行日志位于被忽略的 artifacts/。所有故障注入、恢复、迁移和安装工作区均隔离，不向真实用户数据库加入测试记录，不将真实业务数据上传 GitHub。

## 明确未验证

- 未实际重启用户电脑；服务重启和冷启动不能等同物理电脑重启。
- 未物理拔网线；离线验证是阻断全部外部 HTTP。
- 未在另一台物理 Windows 电脑或所有 Windows 10/11 版本上重测。
- 当前机器没有 Inno Setup，因此未在本地生成或执行 setup 安装包；真实快捷方式、EXE 和便携包已在隔离目录验证，GitHub Actions 的 setup 产物需以远程运行结果为准。
- 当前 GitHub 仓库为私有时，桌面程序不嵌入访问令牌，匿名 Releases API 会显示失败；仓库公开后可直接读取。无论成功或失败都不影响离线业务功能。
- GitHub Actions 配置已提供；不能在没有实际运行结果时宣称远程 CI 通过。
- 当前电脑的旧服务和真实结构 2 数据库保留，未自动切换到新版。安装/运行新发布版后，会先安全停止旧服务并备份，再升级数据结构。

## 参考与边界

审计 oimimo-scheduler 的提交 ffa5c3994139acc9982c8685ee6855223b321f88，采用其后端分层、本地 SQLite、单实例与 Windows 发布模式，完整 MIT 许可随源码和运行包保留。原 UI 和业务模型继续来自用户现有工作台；不把参考项目测试、历史 Node 测试或未运行的安装测试当作本次验证。
