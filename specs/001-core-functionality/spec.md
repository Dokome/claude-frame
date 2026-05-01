# issue2md — 功能规格说明书

**版本**: 1.0.0
**日期**: 2026-05-01
**状态**: Draft

---

## 1. 用户故事

### 1.1 CLI 用户（MVP）

**作为一个** 经常需要归档 GitHub Issue 和 PR 的开发者，
**我希望** 通过一条命令将 GitHub Issue/PR 的完整内容转为本地 Markdown 文件，
**以便** 我可以在本地离线浏览、搜索和引用这些内容，而不需要每次手动复制粘贴。

### 1.2 Web 版用户（Future / TODO）

**作为一个** 偏好图形界面的用户，
**我希望** 通过浏览器粘贴 URL 并下载 Markdown 文件，
**以便** 我可以在不安装任何工具的情况下使用 issue2md 的核心能力。

---

## 2. 功能性需求

### 2.1 URL 识别与解析

工具必须接受一个 GitHub URL 作为输入，并自动识别其类型。

**支持的 URL 格式：**

| 类型 | URL 格式 | 说明 |
|------|---------|------|
| Issue | `https://github.com/{owner}/{repo}/issues/{number}` | 支持 `http` 和 `https` |
| Pull Request | `https://github.com/{owner}/{repo}/pull/{number}` | PR 本质也是 Issue，但需要额外获取 commits/diff/review |

**URL 解析规则：**
- 从 URL 中提取 `owner`、`repo`、`type`（issues/pull）、`number`
- 忽略 URL 中的锚点（`#issuecomment-xxx`）和查询参数（`?xxx`）
- 不识别的 URL 格式应打印明确的错误信息并退出

### 2.2 CLI 接口

```
npx issue2md <url> [options]
```

**必选参数：**

| 参数 | 说明 |
|------|------|
| `<url>` | GitHub Issue 或 Pull Request 的 URL |

**可选参数（Flags）：**

| Flag | 短写 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--output <dir>` | `-o` | string | `./issue` | 指定输出目录，覆盖默认的 `./issue` |
| `--no-comments` | — | boolean | `false` | 只导出正文，不包含评论 |
| `--dry-run` | — | boolean | `false` | 只打印解析结果到 stdout，不写文件 |

### 2.3 GitHub API 调用策略

- **认证**: MVP 阶段不要求认证，使用匿名请求（60 次/小时限制）
- **API 端点**:
  - Issue: `GET /repos/{owner}/{repo}/issues/{number}` + `GET /repos/{owner}/{repo}/issues/{number}/comments`
  - PR: 在 Issue API 基础上，额外请求:
    - `GET /repos/{owner}/{repo}/pulls/{number}/commits` — commits 列表
    - `GET /repos/{owner}/{repo}/pulls/{number}/files` — 文件变更
    - `GET /repos/{owner}/{repo}/pulls/{number}/comments` — review comments
- **分页**: 全部拉取，无上限。使用 `per_page=100` 并跟随 `Link` header 中的 `rel="next"` 分页
- **Rate limit 处理**: 检测 `X-RateLimit-Remaining` header，剩余不足时提前警告用户

### 2.4 Markdown 输出结构

#### 2.4.1 Frontmatter

```yaml
---
title: "Issue/PR 标题"
url: "https://github.com/owner/repo/issues/123"
author: username
date: 2026-05-01
type: issue | pull_request
state: open | closed
labels:
  - bug
  - priority-high
assignees:
  - user1
milestone: "v1.0"
---
```

**字段说明：**

| 字段 | 必选 | 说明 |
|------|------|------|
| `title` | 是 | Issue/PR 标题，用双引号包裹（防止 YAML 特殊字符问题） |
| `url` | 是 | 原始 GitHub URL |
| `author` | 是 | Issue/PR 创建者用户名 |
| `date` | 是 | 创建日期（ISO 8601 格式 `YYYY-MM-DD`） |
| `type` | 是 | `issue` 或 `pull_request` |
| `state` | 是 | `open` 或 `closed`（PR 可能还有 `merged`） |
| `labels` | 是 | 标签列表，无标签时为 `[]` |
| `assignees` | 否 | 负责人列表，无时为 `[]` |
| `milestone` | 否 | 里程碑标题，无时省略该字段 |

#### 2.4.2 正文区域

```markdown
# {title}

{原始正文，保留 GitHub Flavored Markdown 格式}
```

#### 2.4.3 评论区域

```markdown
---

## Comments

### @username (2026-05-01)

评论正文内容...

---

### @another-user (2026-05-02)

另一条评论内容...
```

**评论排序**: 按时间升序（从旧到新），与 GitHub 页面展示一致。

#### 2.4.4 PR 专属区域

对于 Pull Request，在评论区域之后追加：

```markdown
---

## Commits

| SHA | Author | Message | Date |
|-----|--------|---------|------|
| `abc1234` | @username | fix: resolve memory leak | 2026-05-01 |

---

## Changed Files

| File | Status | Additions | Deletions |
|------|--------|-----------|-----------|
| `src/main.ts` | modified | +12 | -3 |

---

## Review Comments

### @reviewer on `src/main.ts:42` (2026-05-01)

> ```typescript
> const result = processData(input);
> ```

这条代码有潜在的空值问题，建议加个 null check。
```

### 2.5 内容转换规则

GitHub API 返回的正文是 HTML 格式（通过 `body_html` 字段）或 Markdown 格式（通过 `body` 字段）。

**转换策略：**
- 优先使用 `body` 字段（原始 Markdown），直接保留
- 对于 GitHub 特有语法，原样保留：
  - `#123` Issue/PR 引用
  - `@username` 用户提及
  - `- [ ]` / `- [x]` 任务清单
  - 代码块、表格
  - emoji 和 reaction
  - 引用回复（`>` 引用块）
- 图片保持原始 GitHub 远程 URL，不下载到本地

### 2.6 文件保存行为

| 规则 | 说明 |
|------|------|
| 输出目录 | 默认 `./issue`，可通过 `-o` 指定 |
| 目录创建 | 若目录不存在，自动递归创建 |
| 文件名 | `{number}-{slug}.md`，其中 `slug` 为标题的 URL-safe 简写（小写，空格和特殊字符替换为 `-`，截断至 50 字符） |
| 文件冲突 | 直接覆盖，不提示 |
| 成功输出 | 打印保存路径：`✓ Saved to issue/123-fix-memory-leak.md` |

---

## 3. 非功能性需求

### 3.1 架构与解耦

项目应遵循清晰的分层架构，确保各模块职责单一、可独立测试：

```
src/
├── cli/           # CLI 入口与参数解析
├── api/           # GitHub API 请求层
├── parser/        # URL 解析与内容转换
├── formatter/     # Markdown 格式化输出
└── writer/        # 文件写入
```

**关键解耦点：**
- API 层与格式化层分离：数据获取和 Markdown 生成完全独立
- CLI 层与核心逻辑分离：核心函数可被其他入口（如未来的 Web 版）复用
- Writer 层可替换：`--dry-run` 时输出到 stdout，正常时写入文件

### 3.2 错误处理

所有错误必须打印清晰的错误信息到 stderr 并以非零退出码退出。

| 错误场景 | 退出码 | 错误信息示例 |
|---------|--------|-------------|
| 未提供 URL | 1 | `Error: Please provide a GitHub URL.` |
| URL 格式不正确 | 2 | `Error: Invalid GitHub URL: <url>. Expected format: https://github.com/{owner}/{repo}/issues/{number}` |
| Issue/PR 不存在 | 3 | `Error: Not found: https://github.com/owner/repo/issues/123 (404)` |
| 网络请求失败 | 4 | `Error: Network request failed: <reason>` |
| 文件写入失败 | 5 | `Error: Failed to write file: <path> (<reason>)` |
| Rate limit 不足 | 6 | `Error: GitHub API rate limit exceeded. Try again later or provide a token.` |

### 3.3 技术约束

- **运行时**: Node.js >= 18（使用内置 `fetch` API）
- **语言**: TypeScript (strict mode)
- **不引入不必要的依赖**: 优先使用 Node.js 内置 API
- **包管理**: pnpm
- **包名**: `issue2md`

---

## 4. 验收标准

### 4.1 基本功能

- [ ] **AC-1**: 输入合法的 Issue URL，在 `./issue` 目录下生成正确的 `.md` 文件
- [ ] **AC-2**: 输入合法的 PR URL，生成的 `.md` 文件包含 commits、changed files、review comments
- [ ] **AC-3**: 生成的 Markdown 文件包含完整的 frontmatter（title, url, author, date, type, state, labels）
- [ ] **AC-4**: 所有评论按时间升序包含在 Markdown 中
- [ ] **AC-5**: 评论全部分页拉取，无遗漏

### 4.2 CLI 参数

- [ ] **AC-6**: `npx issue2md <url> -o ./archive` 将文件保存到 `./archive` 目录
- [ ] **AC-7**: `npx issue2md <url> --no-comments` 生成的文件只包含正文，没有评论区域
- [ ] **AC-8**: `npx issue2md <url> --dry-run` 在 stdout 打印 Markdown 内容，不创建文件
- [ ] **AC-9**: `-o` 与 `--dry-run` 同时使用时，`--dry-run` 优先（不写文件）

### 4.3 错误处理

- [ ] **AC-10**: 不提供 URL 时，退出码为 1，stderr 显示错误信息
- [ ] **AC-11**: 提供非 GitHub URL 时，退出码为 2，stderr 显示格式提示
- [ ] **AC-12**: 访问不存在的 Issue/PR 时，退出码为 3，stderr 显示 404 错误
- [ ] **AC-13**: 断网环境下，退出码为 4，stderr 显示网络错误
- [ ] **AC-14**: 输出目录无写权限时，退出码为 5，stderr 显示写入失败

### 4.4 内容质量

- [ ] **AC-15**: Markdown 中的代码块、表格、任务清单等 GFM 语法正确保留
- [ ] **AC-16**: 图片链接保持原始远程 URL
- [ ] **AC-17**: 文件名格式为 `{number}-{slug}.md`，slug 正确生成

---

## 5. 输出格式示例

### 5.1 Issue 示例

````markdown
---
title: "Fix memory leak in WebSocket handler"
url: "https://github.com/vercel/next.js/issues/45678"
author: johndoe
date: 2026-04-28
type: issue
state: open
labels:
  - bug
  - area: runtime
assignees:
  - developer1
milestone: "v15.2"
---

# Fix memory leak in WebSocket handler

## Description

When using the WebSocket handler with long-lived connections, memory usage
keeps growing over time. After ~24h of uptime, the process can consume
up to 2GB of RAM.

### Steps to Reproduce

1. Create a WebSocket handler
2. Connect 100+ clients
3. Wait 24 hours
4. Observe memory usage via `process.memoryUsage()`

```typescript
const ws = new WebSocketHandler({
  maxConnections: 1000,
  heartbeatInterval: 30000,
});
```

### Expected Behavior

Memory should remain stable under 200MB.

### Environment

- Next.js: 15.1.0
- Node.js: 22.x
- OS: macOS 15

---

## Comments

### @developer1 (2026-04-28)

Thanks for the report! I can reproduce this locally. Looking into it now.

- [x] Reproduce the issue
- [ ] Identify root cause
- [ ] Implement fix
- [ ] Add regression test

---

### @contributor2 (2026-04-29)

> When using the WebSocket handler with long-lived connections

I'm seeing the same issue. Here's a memory profile screenshot:

![Memory Profile](https://user-images.githubusercontent.com/123456/memory-profile.png)

The leak appears to be in the `EventEmitter` cleanup path.

````

### 5.2 PR 示例

````markdown
---
title: "fix: resolve memory leak in WebSocket handler"
url: "https://github.com/vercel/next.js/pull/45679"
author: developer1
date: 2026-04-29
type: pull_request
state: closed
labels:
  - bug
  - area: runtime
assignees:
  - developer1
milestone: "v15.2"
---

# fix: resolve memory leak in WebSocket handler

## Summary

Fixes #45678

This PR addresses the memory leak in `WebSocketHandler` by properly
cleaning up event listeners when connections are closed.

## Changes

- Remove all event listeners in `disconnect()` handler
- Add `WeakMap`-based tracking for active connections
- Add regression test for long-running connections

---

## Comments

### @reviewer1 (2026-04-30)

LGTM overall! Just one question about the `WeakMap` approach.

---

### @developer1 (2026-04-30)

> Just one question about the WeakMap approach

Good point — I've added a comment explaining why `WeakMap` is safe here.

---

## Commits

| SHA | Author | Message | Date |
|-----|--------|---------|------|
| `a1b2c3d` | @developer1 | fix: resolve memory leak in WebSocket handler | 2026-04-29 |
| `e4f5g6h` | @developer1 | test: add regression test for long connections | 2026-04-30 |

---

## Changed Files

| File | Status | Additions | Deletions |
|------|--------|-----------|-----------|
| `src/server/websocket-handler.ts` | modified | +18 | -5 |
| `src/server/__tests__/websocket.test.ts` | modified | +42 | -0 |

---

## Review Comments

### @reviewer1 on `src/server/websocket-handler.ts:42` (2026-04-30)

> ```typescript
> this.connections = new WeakMap<WS, ConnectionContext>();
> ```

Why `WeakMap` instead of `Map` here? Won't this cause entries to be
garbage collected prematurely if there are no other references?

### @developer1 on `src/server/websocket-handler.ts:42` (2026-04-30)

Good question — the WS object is held by the server as long as the
connection is alive, so entries won't be GC'd until the connection closes.
That's exactly the behavior we want: automatic cleanup.
````

---

## 6. TODO（MVP 不包含）

- [ ] GitHub Discussion 支持（需 GraphQL API）
- [ ] GitHub Token 认证支持（支持私有仓库，提高 rate limit）
- [ ] 图片下载到本地并替换链接
- [ ] Web 版界面
- [ ] 批量处理（传入多个 URL 或从文件读取）
- [ ] 模板系统（自定义 Markdown 输出格式）
