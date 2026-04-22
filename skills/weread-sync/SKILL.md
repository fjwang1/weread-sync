---
name: weread-sync
description: 当用户想查看微信读书的划线、笔记、书评、阅读记录，或希望通过本地 weread-sync CLI 同步和导出数据时使用这个 skill。遵循本地优先的流程：先检查登录状态，优先使用已经同步到本地的 Markdown 导出目录，在本地数据缺失或过旧时执行 sync，只在单本书深查时使用实时拉取。
---

# 微信读书同步

这个 skill 用于指导外层模型在当前工作区中使用 `weread-sync` CLI 完成微信读书相关查询。

这是一份纯说明型 skill：

- 不增加新的代码路径
- 不承担主题理解或语义推理
- 不依赖任何辅助脚本
- 只约定外层模型应如何稳定地使用现有 CLI

## 适用场景

当用户提出下面这类问题时，应该触发这个 skill：

- 查看微信读书中的划线、笔记或书评
- 询问自己是否写过或划过某类内容
- 查看自己读过哪些书，或正在读哪些书
- 将微信读书内容同步并导出到本地 Markdown
- 深入查看某一本书当前的笔记内容

## 核心流程

除非用户明确要求更窄的操作，否则默认按下面顺序执行。

### 1. 先检查登录状态

先查看当前登录状态和同步状态：

```bash
npm run dev -- status --json
```

如果用户明确提供了导出目录，就把目录也带上：

```bash
npm run dev -- status --output-dir <path> --json
```

如果 `loggedIn` 为 `false`，就先引导用户完成登录，不要继续后续查询：

```bash
npm run dev -- login start --json
npm run dev -- login wait --uid <uid> --json
```

在登录完成之前，不要继续执行 `notebooks`、`book-probe` 或 `sync`。

### 2. 优先使用本地导出结果

对于跨书检索类问题，优先读取本地已经同步好的 Markdown 导出目录，而不是默认走实时接口。

典型问题包括：

- “我有没有划过跟长期主义相关的话？”
- “哪些书都在谈同一个主题？”
- “我看过哪些书？”

导出目录按下面优先级选择：

1. 用户明确提供的目录
2. `status` 返回的输出目录
3. CLI 默认使用的平台输出目录

外层模型可以直接使用普通的 shell 或文件工具读取本地 Markdown 文件。这个 skill 不要求 CLI 额外提供本地搜索命令。

### 3. 本地数据缺失或过旧时执行同步

遇到下面这些情况时执行 `sync`：

- 本地还没有导出结果
- 用户明确要求刷新
- 当前本地数据明显不够新

默认同步命令：

```bash
npm run dev -- sync
```

同步到用户指定目录：

```bash
npm run dev -- sync --output-dir <path>
```

常用变体：

```bash
npm run dev -- sync --book-id <bookId>
npm run dev -- sync --include-statuses reading,finished,other
npm run dev -- sync --force
```

`sync` 的作用是刷新本地知识底座，不应把“执行了同步”本身当成答案。

### 4. 单本书深查时再走实时拉取

当用户关心某一本书当前的最新笔记、划线、评论时，优先使用单书实时拉取：

```bash
npm run dev -- book-probe --book-id <bookId> --json
```

适合的场景包括：

- “把这本书的划线给我看看”
- “拉一下这本书最新的笔记”
- “我在这一本书里写过哪些评论？”

不要把实时拉取当成默认策略去做大范围跨书分析。

## 命令参考

### 登录与状态

```bash
npm run dev -- status --json
npm run dev -- login start --json
npm run dev -- login wait --uid <uid> --json
npm run dev -- logout --json
```

### 书库探测

```bash
npm run dev -- notebooks --json
npm run dev -- books-status --json
```

### 单本书查看

```bash
npm run dev -- book-probe --book-id <bookId> --json
```

### 本地导出刷新

```bash
npm run dev -- sync --json
npm run dev -- sync --output-dir <path> --json
```

## 使用约定

- 登录是前置条件。未登录时，先帮助用户完成登录。
- 跨书检索、主题归纳、阅读记录查询，优先使用本地导出结果。
- 用户明确提供了输出目录时，始终优先使用该目录。
- 用户没有提供目录时，使用 CLI 现有的目录解析逻辑。
- `sync` 用于刷新本地数据，不替代具体分析。
- 只有在单本书定点查询，或本地结果明显不足时，才使用实时拉取。
- 语义理解、主题聚类、结果总结、答案组织，都交给外层模型完成。

## 能力边界

这个 skill 不声称 CLI 自身可以直接完成语义搜索。

CLI 负责提供：

- 登录
- 同步
- 书库列表
- 单本书数据拉取
- 本地 Markdown 导出

外层模型负责：

- 选择搜索词
- 读取本地文件
- 归并相似片段
- 比较不同书籍
- 判断多本书是否在讨论同一件事

## 来源与引用

向用户回答时，尽量保留来源信息：

- 标明书名
- 如果使用了本地 Markdown，标明导出文件路径
- 如果使用了实时拉取，标明使用了哪条命令
- 需要时附上简短摘录，方便追溯
