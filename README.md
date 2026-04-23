# weread-sync

微信读书同步命令行工具，用于登录、书架探测、划线与书评抓取，以及 Markdown 导出。

当前实现参考了 [obsidian-weread-plugin](https://github.com/zhaohongxuan/obsidian-weread-plugin) 的相关能力，并将其中可复用的链路整理为独立的本地命令行工具与 skill 说明。

## 安装

要求 Node.js >= 20。

```bash
npm install
npm run build
npm link          # 注册全局命令，之后可直接使用 weread-sync
```

## 命令一览
以下命令均以weread-sync为前缀。
| 命令 | 说明 |
|------|------|
| `login` | 显示二维码并等待扫码登录（一步完成） |
| `status` | 查看登录状态、同步状态和已同步书籍数量 |
| `export-dir` | 查看本地导出目录及是否有数据 |
| `notebooks` | 列出有笔记/划线的书籍 |
| `books-status` | 按阅读状态分类书籍（reading/finished/other） |
| `book-probe` | 实时拉取单本书的详情、划线、书评、章节 |
| `sync` | 将书籍导出为本地 Markdown |
| `logout` | 清除本机登录态 |

所有命令都支持 `--json` 参数输出 JSON 格式。

## 常用流程

### 登录

```bash
weread-sync login
```

终端会显示二维码，用微信扫码确认即可。登录态自动保存到本机。

### 查看状态

```bash
weread-sync status
```

### 同步书籍到本地 Markdown

```bash
weread-sync sync
```

常用选项：

```bash
weread-sync sync --book-id <bookId>          # 只同步一本书
weread-sync sync --output-dir ./exports      # 指定导出目录
weread-sync sync --include-statuses reading,finished,other  # 指定纳入范围
weread-sync sync --force                     # 强制重新导出
```

### 查看本地导出目录

```bash
weread-sync export-dir
```

有数据时输出目录路径，没有数据时提示先执行 sync。

### 查看阅读状态

```bash
weread-sync books-status
```

### 查看单本书详情

```bash
weread-sync book-probe --book-id <bookId>
```

## 本地状态与数据存放

登录态和同步状态保存在系统状态目录，不写入仓库：

- macOS: `~/Library/Application Support/WereadSync`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/WereadSync`
- Windows: `%APPDATA%/WereadSync`

主要文件：

- `auth/auth.json`：登录态
- `state/sync-state.json`：每本书的同步指纹
- `state/last-result.json`：最近一次同步结果
- `exports/`：默认导出目录

使用 `--output-dir` 可以指定其他导出目录。
