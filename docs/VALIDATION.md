# 实际验证记录

日期：2026-10-19。Windows 11 x64，Python 3.13.16，Flask 3.1.3，Pydantic 2.14.1，Waitress 3.0.2，PyInstaller 6.22.3，Inno Setup 6.7.3。只维护现有电脑端稿件工作台。

## 已实际执行

| 项目 | 结果 |
| --- | --- |
| 电脑端 UI | 原 desktop/ 全部文件逐字节复制，SHA-256 与 UI-MANIFEST.json 相同。HTML、CSS、JS、组件、字体、配色和页面结构未修改 |
| 后端与启动器测试 | pytest：31 项通过。包括保存/重读、进度、关联外键、归档、类别、图片去重、事务回滚、版本冲突、访问控制、配置恢复、单实例、缺库保护及备份恢复 |
| 迁移失败 | 注入迁移失败后回滚到结构 2，无半迁移表，原稿件与升级前备份保留 |
| 恢复中断 | 注入文件恢复中断，恢复日志保留，重开后完成此前已确认的恢复，原目录保留 |
| 原桌面完整交互 | Edge 实际创建/编辑/删除稿件、状态刷新、单主搜索、日历联动、图片、模板、自定义类别/流程、三个组件样式/拖动/导出、水印、JSON 导入及旧浏览器导入通过 |
| 实际 EXE 交互 | 原桌面完整交互测试同时对接真正打包的 EXE，通过；不只测试源码服务 |
| 保存失败 | HTTP 500 或缺少 revision 的 200 回执不显示成功，输入保留，SQLite 原提交不变 |
| 断网模拟 | Edge 阻断所有非本机 HTTP 请求后完成核心流程，未请求远程页面、字体、CDN 或 API |
| 源码服务重启 | 独立进程停止、重新启动后，稿件和图片一致；修改工作目录不改变数据路径 |
| 免环境 EXE | PATH 不含 Python 或 Node，实际 EXE 仍可安装隔离工作区、启动、创建稿件/图片并重启读取 |
| 桌面与开始菜单 | 运行包生成真实 Windows .lnk，分别冷启动服务，调用系统默认浏览器打开本机地址，重启后 SQLite 内容一致 |
| 真实旧库兼容 | 只读复制当前真实结构 2 数据库及图片到隔离目录，迁移副本到 3；原元数据、记录 JSON 和 revision 相同，图片校验通过。原数据库没有升级或覆盖 |
| 打包 | 已实际生成 Lotus.exe、便携 ZIP、Windows 安装包和 release.json 文件摘要；运行包不包含用户数据库、图片、配置或令牌 |
| 非桌面入口 | 不发布 mobile、Android、React 手机界面、LAN、云端后端或独立收纳代码；服务只绑定 127.0.0.1，相关历史路由不可访问 |

## 命令和产物

```text
python tools/check_ui.py
python -m pytest -q tests
python tools/build_windows.py
python tools/check_release.py --exe dist/1.1.0/Lotus/Lotus.exe
LOTUS_PYTHON=<开发测试 Python> LOTUS_EXE=<实际 EXE> node tests/ui.mjs

dist/1.1.0/Lotus/Lotus.exe
dist/1.1.0/lotus-1.1.0-portable-win64.zip
dist/1.1.0/lotus-1.1.0-setup-win64.exe
dist/1.1.0/release.json
```

上面的环境变量写法是测试含义说明；Windows 设置使用 PowerShell 的 $env:LOTUS_PYTHON 和 $env:LOTUS_EXE。Node 仅用于开发时的浏览器自动化，不是应用运行依赖。

测试截图、API/SQLite 结果和运行日志位于被忽略的 artifacts/。所有故障注入、恢复、迁移和安装工作区均隔离，不向真实用户数据库加入测试记录，不将真实业务数据上传 GitHub。

## 明确未验证

- 未实际重启用户电脑；服务重启和冷启动不能等同物理电脑重启。
- 未物理拔网线；离线验证是阻断全部外部 HTTP。
- 未在另一台物理 Windows 电脑或所有 Windows 10/11 版本上重测。
- 已编译安装包，但没有向用户的日常程序目录执行覆盖安装或卸载测试；真实快捷方式和 EXE 在隔离目录验证。
- GitHub Actions 配置已提供；不能在没有实际运行结果时宣称远程 CI 通过。
- 当前电脑的旧服务和真实结构 2 数据库保留，未自动切换到新版。安装/运行新发布版后，会先安全停止旧服务并备份，再升级数据结构。

## 参考与边界

审计 oimimo-scheduler 的提交 ffa5c3994139acc9982c8685ee6855223b321f88，采用其后端分层、本地 SQLite、单实例与 Windows 发布模式，完整 MIT 许可随源码和运行包保留。原 UI 和业务模型继续来自用户现有工作台；不把参考项目测试、历史 Node 测试或未运行的安装测试当作本次验证。
