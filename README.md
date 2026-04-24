# weread-sync

微信读书同步命令行工具，用于登录、书架探测、划线与书评抓取，以及 Markdown 导出。

当前实现参考了 [obsidian-weread-plugin](https://github.com/zhaohongxuan/obsidian-weread-plugin) 的相关能力，并将其中可复用的链路整理为独立的本地命令行工具与 skill 说明。

## 安装

要求 Node.js >= 20。

发布到 npm 后可以全局安装：

```bash
npm install -g weread-sync
weread-sync --version
```

也可以直接用 npx 运行：

```bash
npx weread-sync status
```

本地开发时：

```bash
npm install
npm run build
npm link          # 注册全局命令，之后可直接使用 weread-sync
```

## 开发与校验

```bash
npm run build     # TypeScript 编译并复制 demo 静态资源到 dist/
npm run ci        # CI 校验命令，目前等同于 npm run build
npm run dev -- status
```

本地预览 demo：

```bash
npm run build
node dist/index.js demo
```

## 命令一览
以下命令均以 `weread-sync` 为前缀。

| 命令 | 说明 |
|------|------|
| `login` | 显示二维码并等待扫码登录（一步完成） |
| `status` | 查看登录状态、同步状态和已同步书籍数量 |
| `export-dir` | 查看本地导出目录及是否有数据 |
| `notebooks` | 列出有笔记/划线的书籍 |
| `books-status` | 按阅读状态分类书籍（reading/finished/other） |
| `book-probe` | 实时拉取单本书的详情、划线、书评、章节 |
| `sync` | 将书籍导出为本地 Markdown |
| `demo` | 启动本地可视化页面，浏览已同步书籍和 Markdown 笔记 |
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

### 打开本地 demo 页面

```bash
weread-sync demo
```

demo 会启动本地网页“微信读书评论”，优先读取本地缓存和 Markdown 导出；没有缓存时页面会展示登录二维码，扫码后自动同步并展示书籍列表。已有缓存时页面右上角会显示更新按钮。

常用选项：

```bash
weread-sync demo --port 5177        # 指定端口
weread-sync demo --open             # 启动后用默认浏览器打开
weread-sync demo --output-dir ./exports
```

页面会使用本地缓存的封面图；同步或点击封面接口时会尽量把封面下载到本地缓存目录。首页展示书籍封面列表，点击进入对应 Markdown 笔记详情页。

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
- `cache/demo/covers/`：demo 使用的本地封面缓存

使用 `--output-dir` 可以指定其他导出目录。
