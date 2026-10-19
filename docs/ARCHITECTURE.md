# 电脑端架构与维护

```text
Lotus.exe / launcher.py
  ├─ Windows 数据目录与命名互斥体
  ├─ 后台服务、健康检查、默认浏览器、系统托盘
  └─ Flask app.py + Waitress（127.0.0.1）
       ├─ desktop/ 原有 HTML / CSS / JavaScript（无前端构建）
       ├─ Pydantic models.py（字段、金额、日期、流程与业务关联）
       └─ db.py → SQLite WAL + data/files + backups
```

## API 兼容

沿用 /local-api/session、health、desktop-workspace、revision、info、backup、stop。会话提供仅本机使用的随机令牌，写操作验证自定义请求头、令牌、Host 和 Origin。CSP 只允许本机资源；拒绝跨来源请求，不配置任意来源 CORS。正文上限 128 MB，单图上限 16 MB。

desktop-workspace 保存需携带 baseRevision。后端在写事务中执行条件 UPDATE，只允许基于当前 revision 的提交；后续记录、图片索引和关联写入同一个事务。出现错误回滚，不返回成功回执。前端原有严格 revision 回执检查保持不变。

## SQLite 结构

- desktop_workspace：当前 revision 和工作室、类别、当前稿件等元数据。
- desktop_records：稿件、单主、归档单主、平台、模板、素材、组件模板；保留原 JSON 模型。
- files：原图 MIME、大小及内容摘要。SQLite 中只记录 @disk 引用，图片不存入 localStorage。
- desktop_edges：稿件→单主/平台、模板→平台、单主→平台的显式外键，事务提交时检查关联。
- schema_migrations：显式结构迁移记录。

旧库内其他历史表保留，不提供独立业务路由。全新数据库只建电脑端表，不复制历史手机/收纳模型。schemaVersion 与网页业务 version 分开管理，不能直接修改数据库 user_version 来降级。

## 文件与备份

图片以 SHA-256(MIME + NUL + 原始字节) 命名。先写暂存并 fsync，再提升为稳定文件；已有文件内容不一致时停止保存。重复图片去重。删除记录前备份，不自动清理历史图片。

完整备份用 SQLite backup API 获取一致快照，拷贝所有索引附件，再最后写入带 SHA-256 的 backup.json 作为完成标记。恢复先校验暂存、保留原目录，再写入持久恢复日志；中断后只继续此前已确认的恢复。恢复暂存、备份和恢复前目录不自动删除。

## 版本 2 → 3

1. 读取并验证原稿件和图片，拒绝损坏或未来版本数据库。
2. 完整 before-python-v3 备份。
3. BEGIN IMMEDIATE 创建关系表与迁移记录，从原稿件关系构建外键。
4. foreign_key_check 通过后设置 user_version=3 并 COMMIT；失败 ROLLBACK。

迁移不修改原元数据、业务记录 JSON 或 revision，不删除旧表。旧程序仅认识版本 2，回退需要升级前备份。

## 发布

源码本身不依赖 Node。Python 开发环境安装 requirements-build.txt，修改功能后递增 VERSION，运行 Build-Windows.cmd 或 tools/build_windows.py。构建检查 UI 摘要、执行 pytest、打包独立 EXE、ZIP 和可选安装包，并写 release.json 摘要。

GitHub Actions 仅在手动或 v* 标签触发。Windows 运行包内包含 Python 和依赖；不捆绑用户数据、开发环境、测试、移动端或服务器部署。安装包 AppId 固定，卸载只移除程序，数据目录独立保留。打包版本目前未配置商业代码签名。
