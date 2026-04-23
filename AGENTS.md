# 命令一览

所有命令均以 `weread-sync` 为前缀，支持 `--json` 参数输出 JSON 格式。

| 命令 | 说明 |
|------|------|
| `weread-sync login` | 显示二维码并等待扫码登录（一步完成） |
| `weread-sync status` | 查看登录状态、同步状态和已同步书籍数量 |
| `weread-sync export-dir` | 查看本地导出目录及是否有数据 |
| `weread-sync notebooks` | 列出有笔记/划线的书籍 |
| `weread-sync books-status` | 按阅读状态分类书籍（reading/finished/other） |
| `weread-sync book-probe` | 实时拉取单本书的详情、划线、书评、章节 |
| `weread-sync sync` | 将书籍导出为本地 Markdown |
| `weread-sync logout` | 清除本机登录态 |

# 使用流程

1. 先执行 `weread-sync login` 扫码登录微信读书，登录态保存在本地
2. 执行 `weread-sync sync` 拉取笔记并导出为 Markdown 文件
3. sync 采用增量同步：通过指纹（笔记数、书评数、进度等）判断书籍是否有变化，无变化则跳过；使用 `--force` 可强制重新导出全部

# 本地数据目录

- macOS: `~/Library/Application Support/WereadSync/`
- Windows: `%APPDATA%/WereadSync/`
- Linux: `~/.local/state/WereadSync/`

子目录结构：

| 目录/文件 | 用途 |
|-----------|------|
| `auth/auth.json` | 登录凭证 |
| `state/sync-state.json` | 同步状态与指纹记录 |
| `state/last-result.json` | 上次同步结果摘要 |
| `exports/` | 默认 Markdown 导出目录（可通过 `--output-dir` 覆盖） |
