# weread-sync

微信读书同步 CLI 预研项目，用来验证登录、书架探测、划线/书评抓取，以及 Markdown 导出这条链路是否可行。

## 当前提供的能力

- `login start`：申请一次登录会话，并在本地生成二维码 PNG
- `login wait`：轮询登录结果，成功后把登录态保存到本机
- `user-info`：读取当前账号的用户信息
- `notebooks`：列出有笔记/划线的书籍
- `book-probe`：抓取单本书的详情、阅读进度、划线、书评、章节信息
- `books-status`：按 `reading` / `finished` / `other` 对书籍做阅读状态分类
- `sync`：把选中的书籍导出为 Markdown
- `status`：查看当前登录状态和最近一次同步结果
- `logout`：清除本机保存的登录态

## 开发与运行

要求：

- Node.js `>= 20`

安装依赖：

```bash
npm install
```

开发模式运行：

```bash
npm run dev -- <command>
```

构建：

```bash
npm run build
```

构建后运行：

```bash
node dist/index.js <command>
```

## 常用流程

1. 生成登录二维码

```bash
npm run dev -- login start --json
```

默认会把二维码写到当前工作目录下的 `tmp/` 中；也可以用 `--qr-out <path>` 指定输出位置。

2. 等待扫码登录完成

```bash
npm run dev -- login wait --uid <uid> --json
```

3. 查看当前账号和同步状态

```bash
npm run dev -- status
```

4. 导出在读和已读书籍的 Markdown

```bash
npm run dev -- sync
```

只导出单本书：

```bash
npm run dev -- sync --book-id <bookId>
```

指定导出目录：

```bash
npm run dev -- sync --output-dir ./exports
```

强制重导：

```bash
npm run dev -- sync --force
```

## 本地状态与数据存放

登录态和同步状态默认保存在当前用户机器的系统状态目录，不写入仓库：

- macOS: `~/Library/Application Support/WereadSync`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/WereadSync`
- Windows: `%APPDATA%/WereadSync`

主要文件包括：

- `auth/auth.json`：保存登录态
- `state/sync-state.json`：保存每本书的同步指纹
- `state/last-result.json`：保存最近一次同步结果
- `exports/`：默认导出目录

如果在命令里显式传入 `--output-dir`，Markdown 会导出到指定目录。

## 公开仓库约定

这个仓库是公开的，以下内容不应该提交：

- `tmp/` 下的二维码、测试导出文件、临时截图
- 本地依赖目录 `node_modules/`
- `.env`、`.env.*`、`*.local` 这类个人配置文件
- 本机生成的登录态、cookie、token 或其他账号凭据

仓库当前只提交源码、构建产物和项目文档；个人数据应始终留在本机状态目录中。
