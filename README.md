# Lotus · 电脑端创作者工作台

## 直接使用

到 [Releases](https://github.com/ATtasar/lotus/releases) 下载：

- **lotus-版本-setup-win64.exe**：双击安装，自动建立桌面和开始菜单入口。
- **lotus-版本-portable-win64.zip**：完整解压，双击 Lotus.exe。不要单独移动 EXE，必须保留 _internal 文件夹。

运行包**不需要安装 Python、Node.js、数据库服务器或其他开发工具**。启动后打开默认浏览器的 http://127.0.0.1:17841；安装完成后核心功能不需要联网。托盘右键可打开工作台、数据目录、备份目录、日志，执行备份或停止服务。

## 保留的功能

主页周历与当前稿件；稿件、单主、平台与费用；日历与实际/预测收入；稿件模板、自定义类别及流程；水印、小票、会员卡、例图排版、价目表、快捷回复及素材。稿件支持进行中/已结束分区和 20/50 条分页；周排期和月历可选择截止日或连续色条。关联跳转、面包屑、类别管理和版本检查继续保留。

桌面端延续现有布局与视觉风格，加入用户要求的功能修改。发布资源摘要记录在 [UI-MANIFEST.json](docs/UI-MANIFEST.json)，构建前自动核对。首次使用为空白，不自动填入示例业务数据。

## 数据和升级

数据固定保存在 **%LOCALAPPDATA%\Lotus-Workbench\data\workbench.sqlite**，图片位于同级 files；与程序安装目录分开。通过托盘“打开数据目录”直接查看。更新程序或卸载程序不主动删除用户数据。

兼容旧 Lotus-Workbench 的结构版本 2/3 数据库。升级前先完整备份，再用事务迁移到结构版本 4，补充关联外键与新组件记录；保留原记录、图片和历史表。迁移失败回滚并报错，不重置数据库。旧程序不能直接打开升级后的数据库。

设置中的完整备份、JSON 导出、确认导入和旧浏览器数据导入继续可用。完整备份包含数据库、全部附件和摘要清单。恢复需要确认，且先保留恢复前数据。设置中可主动检查 GitHub Releases 最新正式版本；本机版本只读取安装包内的 VERSION，检查不会自动安装、卸载或改写本地数据，断网也不影响离线功能。

详见 [Windows 使用说明](START-HERE-WINDOWS.md)、[架构与迁移](docs/ARCHITECTURE.md)、[参考项目说明与许可](THIRD-PARTY-NOTICES.md) 和 [实际验证记录](docs/VALIDATION.md)。

## 从源码安装或开发

普通用户优先下载运行包。开发者使用 Windows 10/11、64 位 Python 3.13+：

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python launcher.py install
```

也可双击 **Install-Local.cmd**。首次安装 Python 和依赖需要联网；以后 Start-Local.cmd 不安装依赖。停止服务使用 Stop-Local.cmd，重建图标使用 Create-DesktopShortcut.cmd。

构建发布版：安装 Inno Setup 6 后运行 Build-Windows.cmd；或在已准备依赖的环境执行 tools/build_windows.py。构建先运行数据测试和 UI 摘要检查，再生成 dist/版本/Lotus/Lotus.exe、便携 ZIP 和安装包。缺少 Inno 时只生成 EXE 与 ZIP，并明确报告安装包未生成。不会删除已有版本构建目录。

## 后续更新

修改功能 → 测试 → 递增 VERSION → 保存提交并安全合入 main → 推送 v* 标签 → GitHub Actions 构建和验证 → 发布安装包。本地预览和 main 的源码 ZIP 不会更新朋友已经安装的软件。

**朋友应从 [最新正式版本](https://github.com/ATtasar/lotus/releases/latest) 下载 setup-win64.exe。** 更新说明见 [RELEASE-NOTES.md](RELEASE-NOTES.md)。安装包 AppId 固定，升级沿用原目录和独立数据目录，无需卸载。构建记录源码提交与 UI 摘要；CI 全部通过后才发布完整 Release。已发布文件不以另一次构建静默覆盖。

测试和构建不使用用户真实业务数据；数据库、图片、配置、令牌、备份及构建环境不提交源码仓库。
