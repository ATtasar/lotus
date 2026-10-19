# Lotus · 电脑端创作者工作台

## 直接使用

到 [Releases](https://github.com/ATtasar/lotus/releases) 下载：

- **lotus-版本-setup-win64.exe**：双击安装，自动建立桌面和开始菜单入口。
- **lotus-版本-portable-win64.zip**：完整解压，双击 Lotus.exe。不要单独移动 EXE，必须保留 _internal 文件夹。

运行包**不需要安装 Python、Node.js、数据库服务器或其他开发工具**。启动后打开默认浏览器的 http://127.0.0.1:17841；安装完成后核心功能不需要联网。托盘右键可打开工作台、数据目录、备份目录、日志，执行备份或停止服务。

## 保留的功能

主页周历与当前稿件；稿件、单主、平台与费用；日历与收入统计；稿件模板、自定义类别及流程；水印、小票、会员卡、例图排版及素材。表单、筛选、搜索、画布拖动、模板切换、导入导出保持现有交互。

所有 desktop/ 文件都与改造前逐字节相同，摘要记录在 [UI-MANIFEST.json](docs/UI-MANIFEST.json)。构建前自动检查，后端升级不修改页面资源。

## 数据和升级

数据固定保存在 **%LOCALAPPDATA%\Lotus-Workbench\data\workbench.sqlite**，图片位于同级 files；与程序安装目录分开。通过托盘“打开数据目录”直接查看。更新程序或卸载程序不主动删除用户数据。

兼容旧 Lotus-Workbench 的结构版本 2 数据库。首次升级先完整备份，再用事务迁移到结构版本 3，补充关系外键与迁移记录；保留原记录、图片和历史表。迁移失败回滚并报错，不重置数据库。新的空白安装不创建示例业务数据。

设置中的完整备份、JSON 导出、确认导入和旧浏览器数据导入继续可用。完整备份包含数据库、全部附件和摘要清单。恢复需要确认，且先保留恢复前数据。

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

修改功能 → 测试 → 递增 VERSION → 构建 → 上传新版本。安装包 AppId 固定；更新前停止已识别的旧服务，保留独立数据目录。源码的 GitHub Actions 可手动构建，v* 标签也会构建并附加 Windows 文件到 Release。

测试和构建不使用用户真实业务数据；数据库、图片、配置、令牌、备份及构建环境不提交源码仓库。
