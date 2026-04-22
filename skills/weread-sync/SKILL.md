---
name: weread-sync
description: Use this skill when the user asks about WeRead/微信读书 notes, highlights, reviews, reading history, or syncing/exporting their library with the local weread-sync CLI. Follow a local-first workflow: verify login, prefer synced Markdown exports (including a user-provided output directory when given), run sync when local data is missing or stale, and use targeted live fetch only for single-book drill-down.
---

# WeRead Sync

Use this skill for local WeRead analysis powered by the `weread-sync` CLI in the current workspace.

This skill is intentionally lightweight:

- It does not add new code paths.
- It does not perform its own reasoning about books or themes.
- It does not require helper scripts.
- It tells the outer model how to use the existing CLI safely and consistently.

## When to use

Trigger this skill when the user asks to:

- inspect highlights, notes, or reviews from WeRead
- check whether they ever wrote or highlighted something related to a topic
- list books they have read or are reading
- refresh or sync WeRead notes to local Markdown
- drill into one specific book's current notes

## Core workflow

Always follow this order unless the user explicitly asks for something narrower.

### 1. Check login first

Start by checking current auth and sync status:

```bash
npm run dev -- status --json
```

If the user has specified an export directory, include it:

```bash
npm run dev -- status --output-dir <path> --json
```

If `loggedIn` is false, stop and guide the user through login before any further query:

```bash
npm run dev -- login start --json
npm run dev -- login wait --uid <uid> --json
```

Do not continue with notebook lookup, probing, or sync if login has not completed.

### 2. Prefer local exports

For cross-book questions, prefer local Markdown exports over live API fetches.

Examples:

- "Have I ever highlighted something about long-termism?"
- "Which books mention the same topic?"
- "What have I read?"

Use the export directory in this priority order:

1. a user-provided output directory
2. the output directory returned by `status`
3. the platform default export directory used by the CLI

The outer model may inspect the Markdown files directly with normal shell or file tools. This skill does not require a dedicated local search command from the CLI.

### 3. Sync when local data is missing or stale

Run sync when:

- there is no local export yet
- the user explicitly asks to refresh
- the local export is clearly outdated for the task

Default sync:

```bash
npm run dev -- sync
```

Sync to a user-chosen directory:

```bash
npm run dev -- sync --output-dir <path>
```

Useful variants:

```bash
npm run dev -- sync --book-id <bookId>
npm run dev -- sync --include-statuses reading,finished,other
npm run dev -- sync --force
```

Treat sync as a refresh step for the local knowledge base, not as the answer itself.

### 4. Use live fetch only for targeted single-book drill-down

When the user asks for the latest details of one specific book, prefer a targeted live request:

```bash
npm run dev -- book-probe --book-id <bookId> --json
```

Use this for:

- "Show me the highlights from this book"
- "Fetch the latest notes for book X"
- "What comments do I have in this one book?"

Avoid using live fetch as the default strategy for broad multi-book analysis.

## Command reference

### Login and status

```bash
npm run dev -- status --json
npm run dev -- login start --json
npm run dev -- login wait --uid <uid> --json
npm run dev -- logout --json
```

### Library discovery

```bash
npm run dev -- notebooks --json
npm run dev -- books-status --json
```

### Single-book inspection

```bash
npm run dev -- book-probe --book-id <bookId> --json
```

### Local export refresh

```bash
npm run dev -- sync --json
npm run dev -- sync --output-dir <path> --json
```

## Working rules

- Login is mandatory. If the user is not logged in, help them log in first.
- For cross-book retrieval and topic comparison, use local exports first.
- Respect a user-provided output directory whenever one is given.
- If no output directory is given, use the CLI's existing directory resolution.
- Use sync to refresh local exports, not as a substitute for targeted analysis.
- Use live fetch only when the task is about one specific book or when local exports are insufficient.
- Let the outer model handle semantic interpretation, topic grouping, comparison, and answer writing.

## Limits

This skill does not claim that the CLI can natively solve semantic search on its own.

The CLI provides:

- login
- sync
- library listing
- single-book data fetch
- local Markdown exports

The outer model is responsible for:

- choosing search terms
- reading local files
- grouping similar passages
- comparing books
- deciding whether multiple books are discussing the same idea

## Source handling

When answering the user, prefer to keep traceability:

- mention the book title
- mention the export file path when using local Markdown
- mention the command used when the data came from a live fetch
- include short supporting excerpts when useful
