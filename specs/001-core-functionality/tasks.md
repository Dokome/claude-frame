# issue2md MVP 任务列表

**基于**: `plan.md` + `spec.md`
**约束**: 严格 TDD (Red → Green → Refactor)、TypeScript strict、零 `any`

---

## 阶段总览

| 阶段 | 名称 | 任务 | 范围 | 可并行 |
|------|------|------|------|--------|
| Phase 0 | 基础设施 | T01 | 错误类（所有模块的公共依赖） | — |
| Phase 1 | URL 解析 | T02, T03 | parser 模块 TDD | — |
| Phase 2 | GitHub API | T04, T05, T06 | API 类型 + 请求层 TDD | 与 Phase 1/3/4 并行 |
| Phase 3 | Markdown 格式化 | T07, T08, T09 | formatter 模块 TDD | 与 Phase 1/2/4 并行 |
| Phase 4 | 文件写入 | T10, T11 | writer 模块 TDD | 与 Phase 1/2/3 并行 |
| Phase 5 | CLI 入口 | T12, T13 | 参数解析 + 流程编排 | 需 Phase 1~4 全部完成 |
| Phase 6 | 集成与验证 | T14, T15 | 端到端测试 + 最终验证 | 需 Phase 5 完成 |

---

## 任务依赖图

```
Phase 0: T01 (errors) ──────────────────────────────────────┐
                                                             │
Phase 1: ├── T02 (parser tests) ──→ T03 (parser impl)       │
         │                                                   │
Phase 2: ├── T04 (api types) ──→ T05 (api tests) ──→ T06    │
         │                                                   │
Phase 3: ├── T07 (fmt types) ──→ T08 (fmt tests) ──→ T09    │
         │                                                   │
Phase 4: ├── T10 (writer tests) ──→ T11 (writer impl)       │
         │                                                   │
Phase 5: ├── T12 (cli tests) ──→ T13 (cli impl)  ←──────────┘
         │                        (依赖 Phase 1~4)
Phase 6: ├── T14 (集成测试)
         └── T15 (最终验证)
```

> **并行机会**: Phase 1/2/3/4 之间无依赖，可同时推进。T01 是所有阶段的公共前置。

---

## Phase 0: 基础设施

### T01: 创建自定义错误类

**文件**: `src/errors.ts`
**依赖**: 无
**验证**: `pnpm exec tsc --noEmit` 通过

创建统一错误类体系，供所有模块使用。每个错误类需 `export`，CLI 层通过 `instanceof` 判断类型来映射退出码。

**要求**:

1. 基类 `Issue2mdError extends Error`，设置 `this.name = "Issue2mdError"`
2. `ParseError extends Issue2mdError` — URL 解析失败
   - 构造参数: `(url: string)`
   - 消息格式: `Invalid GitHub URL: {url}. Expected format: https://github.com/{owner}/{repo}/issues/{number}`
3. `FetchError extends Issue2mdError` — HTTP 错误
   - 构造参数: `(url: string, statusCode: number)`
   - 只读属性: `statusCode: number`
   - 消息格式: `Not found: {url} ({statusCode})`
4. `NetworkError extends Issue2mdError` — 网络故障
   - 构造参数: `(reason: string)`
   - 消息格式: `Network request failed: {reason}`
5. `WriteError extends Issue2mdError` — 文件写入失败
   - 构造参数: `(filePath: string, reason: string)`
   - 消息格式: `Failed to write file: {filePath} ({reason})`
6. `RateLimitError extends Issue2mdError` — API 速率限制
   - 无构造参数
   - 消息固定: `GitHub API rate limit exceeded. Try again later or provide a token.`

所有子类需在构造函数中设置 `this.name` 为自身类名。

---

## Phase 1: URL 解析 (parser)

### T02: 编写 parser 测试 (Red)

**文件**: `src/parser/index.test.ts`
**依赖**: T01
**验证**: `pnpm test -- src/parser` 失败（因为实现尚未编写）

导入 `parseGitHubUrl` 和 `ParseError`，使用 `describe`/`it` 编写以下 10 个测试用例：

| # | 测试名 | 输入 | 断言 |
|---|--------|------|------|
| 1 | parses standard issue URL | `https://github.com/vercel/next.js/issues/45678` | 返回 `{owner: "vercel", repo: "next.js", type: "issues", number: 45678}` |
| 2 | parses standard PR URL | `https://github.com/vercel/next.js/pull/45679` | 返回 `{owner: "vercel", repo: "next.js", type: "pull", number: 45679}` |
| 3 | accepts http protocol | `http://github.com/owner/repo/issues/1` | 正常解析，owner="owner" |
| 4 | ignores URL hash/anchor | `https://github.com/o/r/issues/1#issuecomment-123` | 正常解析，忽略锚点 |
| 5 | ignores query parameters | `https://github.com/o/r/issues/1?foo=bar` | 正常解析，忽略参数 |
| 6 | handles trailing slash | `https://github.com/o/r/issues/1/` | 正常解析 |
| 7 | rejects non-GitHub domain | `https://gitlab.com/o/r/issues/1` | 抛出 `ParseError`，消息包含 `Invalid GitHub URL` |
| 8 | rejects missing type segment | `https://github.com/o/r/` | 抛出 `ParseError` |
| 9 | rejects non-numeric number | `https://github.com/o/r/issues/abc` | 抛出 `ParseError` |
| 10 | rejects invalid type | `https://github.com/o/r/releases/1` | 抛出 `ParseError` |

每个测试使用 `expect().toThrow()` 或 `expect().toEqual()` 断言。对错误类使用 `expect(() => fn()).toThrow(ParseError)` 验证错误类型。

---

### T03: 实现 parser 模块 (Green)

**文件**: `src/parser/index.ts`
**依赖**: T02
**验证**: `pnpm test -- src/parser` 全部通过

替换当前 TODO 占位内容，实现以下内容：

1. 保持并完善已有的 `ParsedUrl` 接口：
   ```typescript
   export interface ParsedUrl {
     owner: string;
     repo: string;
     type: "issues" | "pull";
     number: number;
   }
   ```

2. 实现 `parseGitHubUrl(url: string): ParsedUrl`：
   - 用 `new URL(url)` 解析（内置 API）
   - 校验 `hostname` 必须为 `github.com`，否则抛 `ParseError`
   - 用正则匹配 `pathname`: `/^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?$/`
   - 从捕获组提取 owner、repo、type、number
   - 正则不匹配时抛 `ParseError`

3. 从 `../errors.js` 导入 `ParseError`

完成后运行 `pnpm test -- src/parser`，确保全部 10 个测试通过。

---

## Phase 2: GitHub API 层 (api)

### T04: 定义 GitHub API 类型

**文件**: `src/api/index.ts`（替换当前 TODO 占位）
**依赖**: 无
**验证**: `pnpm exec tsc --noEmit` 通过

**只定义类型和函数签名**，不实现函数体（保持 `throw new Error("Not implemented")`）。这些类型供 T05 测试和 T06 实现使用。

需要定义的 `export` 类型：

```typescript
export interface GitHubIssue {
  title: string;
  html_url: string;
  user: { login: string } | null;
  created_at: string;
  state: "open" | "closed";
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  milestone: { title: string } | null;
  body: string | null;
  pull_request?: object;
}

export interface GitHubComment {
  id: number;
  user: { login: string } | null;
  created_at: string;
  body: string | null;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    author: { date: string };
    message: string;
  };
  author: { login: string } | null;
}

export interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface GitHubReviewComment {
  id: number;
  user: { login: string } | null;
  created_at: string;
  body: string | null;
  path: string;
  line?: number;
  diff_hunk?: string;
  in_reply_to_id?: number;
}
```

保持已有的函数签名占位，但更新 `GitHubIssue` 接口为以上完整定义。

---

### T05: 编写 API 层测试 (Red)

**文件**: `src/api/index.test.ts`
**依赖**: T01, T04
**验证**: `pnpm test -- src/api` 失败（实现尚未编写）

使用 `vi.fn()` mock 全局 `fetch`。在每个测试前 `vi.restoreAllMocks()`。

编写以下 7 个测试用例：

| # | 测试名 | Mock 设置 | 断言 |
|---|--------|----------|------|
| 1 | fetchIssue returns parsed issue | mock 200 + Issue JSON | 调用 `https://api.github.com/repos/o/r/issues/1`，返回正确类型 |
| 2 | fetchIssue throws on 404 | mock 404 响应 | 抛出 `FetchError`，含 statusCode=404 |
| 3 | fetchIssue throws on network error | mock fetch throw TypeError | 抛出 `NetworkError` |
| 4 | fetchComments single page | mock 200 + `[comment1, comment2]`，无 Link header | URL 含 `per_page=100`，返回 2 条 |
| 5 | fetchComments paginates via Link header | 第一次: 200 + `[c1]` + Link `rel="next"`；第二次: 200 + `[c2]`，无 Link | 合并返回 `[c1, c2]`，fetch 被调用 2 次 |
| 6 | fetchCommits/fetchFiles/fetchReviewComments call correct endpoints | 各 mock 200 + 数组 | 分别调用 `/pulls/1/commits`、`/pulls/1/files`、`/pulls/1/comments` |
| 7 | throws RateLimitError when remaining is 0 | mock 200 + `X-RateLimit-Remaining: 0` header | 抛出 `RateLimitError` |

**Link header 解析**:
```
<https://api.github.com/repos/o/r/issues/1/comments?page=2&per_page=100>; rel="next", <https://api.github.com/repos/o/r/issues/1/comments?page=5&per_page=100>; rel="last"
```

**Mock 示例**:
```typescript
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  headers: new Headers({ "X-RateLimit-Remaining": "60" }),
  json: () => Promise.resolve([...]),
});
vi.stubGlobal("fetch", mockFetch);
```

---

### T06: 实现 API 层 (Green)

**文件**: `src/api/index.ts`
**依赖**: T05
**验证**: `pnpm test -- src/api` 全部通过

实现以下函数：

1. **`fetchIssue(owner, repo, number)`**:
   - GET `https://api.github.com/repos/{owner}/{repo}/issues/{number}`
   - 检查 rate limit: `X-RateLimit-Remaining === "0"` → 抛 `RateLimitError`
   - `!response.ok` → 抛 `FetchError(url, status)`
   - `response.json()` 返回 `GitHubIssue`

2. **`fetchComments(owner, repo, number)`**:
   - 使用 `fetchAllPages<GitHubComment>()`
   - 基础 URL: `https://api.github.com/repos/{owner}/{repo}/issues/{number}/comments?per_page=100`

3. **`fetchAllPages<T>(url: string)`** — 通用分页:
   - 循环 fetch，每次检查 `Link` header
   - 从 `Link` header 提取 `rel="next"` URL
   - 无 `rel="next"` 时停止，返回合并结果
   - Link header 格式: `<url>; rel="next", <url>; rel="last"`

4. **`fetchCommits(owner, repo, number)`**:
   - 使用 `fetchAllPages<GitHubCommit>()`
   - 基础 URL: `.../pulls/{number}/commits?per_page=100`

5. **`fetchFiles(owner, repo, number)`**:
   - 使用 `fetchAllPages<GitHubFile>()`
   - 基础 URL: `.../pulls/{number}/files?per_page=100`

6. **`fetchReviewComments(owner, repo, number)`**:
   - 使用 `fetchAllPages<GitHubReviewComment>()`
   - 基础 URL: `.../pulls/{number}/comments?per_page=100`

所有函数需 `export`。导入 `FetchError`、`NetworkError`、`RateLimitError` 从 `../errors.js`。`try/catch` 包裹 fetch 调用，`TypeError`（网络错误）转为 `NetworkError`。

---

## Phase 3: Markdown 格式化 (formatter)

### T07: 定义 Formatter 类型

**文件**: `src/formatter/index.ts`（替换 TODO 占位）
**依赖**: 无
**验证**: `pnpm exec tsc --noEmit` 通过

**只定义类型和函数签名**，保持函数体为 `throw new Error("Not implemented")`。

```typescript
export interface IssueData {
  meta: {
    title: string;
    url: string;
    author: string;
    date: string;       // YYYY-MM-DD
    type: "issue" | "pull_request";
    state: "open" | "closed" | "merged";
    labels: string[];
    assignees: string[];
    milestone?: string;
  };
  body: string;
  comments: Array<{
    author: string;
    date: string;
    body: string;
  }>;
  pullRequest?: {
    commits: Array<{
      sha: string;
      author: string;
      message: string;
      date: string;
    }>;
    files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
    }>;
    reviewComments: Array<{
      author: string;
      path: string;
      line?: number;
      date: string;
      body: string;
      diffHunk?: string;
    }>;
  };
}
```

函数签名：
- `export function formatToMarkdown(data: IssueData, options?: { noComments?: boolean }): string`
- `export function generateSlug(title: string): string`

---

### T08: 编写 Formatter 测试 (Red)

**文件**: `src/formatter/index.test.ts`
**依赖**: T07
**验证**: `pnpm test -- src/formatter` 失败

编写以下 14 个测试用例。构造 `IssueData` 对象，调用 `formatToMarkdown()`，断言输出字符串。

**测试数据工厂函数**（在测试文件内定义）:
```typescript
function createIssueData(overrides?: Partial<IssueData>): IssueData
```
返回一个含默认值的完整 IssueData 对象（title="Test Issue"、type="issue"、state="open" 等）。

| # | 测试名 | 输入要点 | 断言 |
|---|--------|---------|------|
| 1 | generates complete issue markdown | 默认 IssueData + 2 条 comments | 输出含 `---` frontmatter + `# Test Issue` + `## Comments` + 两条 `### @user` |
| 2 | frontmatter has all required fields | 默认数据 | 用正则检查 `title:`、`url:`、`author:`、`date:`、`type:`、`state:`、`labels:` 都存在 |
| 3 | empty labels renders empty array | `labels: []` | frontmatter 含 `labels: []` |
| 4 | empty assignees renders empty array | `assignees: []` | frontmatter 含 `assignees: []` |
| 5 | no milestone omits field | `milestone: undefined` | frontmatter 中不含 `milestone:` |
| 6 | title with double quotes is escaped | `title: 'He said "hello"'` | frontmatter 中 title 值内 `"` 被转义 |
| 7 | comments sorted chronologically ascending | comments: 先新后旧传入 | 输出中旧评论在前（按 `### @` 出现顺序断言） |
| 8 | noComments=true omits comments section | `noComments: true` | 输出不含 `## Comments` |
| 9 | PR output includes commits/files/review sections | `pullRequest: { commits, files, reviewComments }` | 输出含 `## Commits`、`## Changed Files`、`## Review Comments` |
| 10 | PR tables have correct headers | PR 数据 | Commits 表含 `SHA\|Author\|Message\|Date`；Files 表含 `File\|Status\|Additions\|Deletions` |
| 11 | review comment includes code quote | reviewComment 带 `diffHunk: "const x = 1;"` | 输出含 `> ` + 代码块的引用格式 |
| 12 | generateSlug converts title | `generateSlug("Fix Memory Leak in Handler!")` | 返回 `fix-memory-leak-in-handler` |
| 13 | generateSlug truncates to 50 chars | 60 字符的标题 | 返回长度 ≤ 50 |
| 14 | null body renders empty content | `body: ""` | `# Title` 后紧跟 frontmatter 结束标记，无多余内容 |

---

### T09: 实现 Formatter 模块 (Green)

**文件**: `src/formatter/index.ts`
**依赖**: T08
**验证**: `pnpm test -- src/formatter` 全部通过

实现以下函数：

1. **`buildFrontmatter(meta)`** — 手动拼接 YAML:
   ```
   ---
   title: "{escaped_title}"
   url: "{url}"
   author: {author}
   date: {date}
   type: {type}
   state: {state}
   labels:
     - label1
     - label2
   assignees:
     - user1
   milestone: "milestone_title"
   ---
   ```
   - title 用双引号包裹，内部 `"` → `\"`
   - `milestone` 仅在存在时输出
   - `labels` 和 `assignees` 为空数组时输出 `[]`

2. **`formatToMarkdown(data, options)`**:
   - 拼接: frontmatter + 正文 + (评论区域) + (PR 专属区域)
   - 正文区: `\n# {title}\n\n{body}\n`
   - 评论区: `\n---\n\n## Comments\n\n` + 每条评论 `### @{author} ({date})\n\n{body}\n\n---\n\n`
   - PR commits: `\n---\n\n## Commits\n\n` + Markdown 表格
   - PR files: `\n---\n\n## Changed Files\n\n` + Markdown 表格
   - PR review comments: `\n---\n\n## Review Comments\n\n` + 每条 `### @{author} on {path}:{line} ({date})\n\n{diffHunk 引用块}\n{body}\n`
   - `noComments=true` 时跳过评论区域

3. **`generateSlug(title)`**:
   - 转小写
   - 非字母数字替换为 `-`
   - 合并连续 `-` 为单个
   - 截断至 50 字符
   - 去除首尾 `-`
   - 空字符串返回 `"untitled"`

---

## Phase 4: 文件写入 (writer)

### T10: 编写 Writer 测试 (Red)

**文件**: `src/writer/index.test.ts`
**依赖**: T01
**验证**: `pnpm test -- src/writer` 失败

使用 `vi.mock()` mock `node:fs/promises` 和 `node:path`。用 `vi.spyOn(process.stdout, "write")` 捕获 stdout。

| # | 测试名 | Mock/设置 | 断言 |
|---|--------|----------|------|
| 1 | writes content to file | mock `fs.writeFile` + `fs.mkdir` | `writeFile` 被调用，参数含正确路径和内容 |
| 2 | dry-run outputs to stdout | `dryRun=true` | `writeFile` 未被调用；`process.stdout.write` 被调用 |
| 3 | creates directory if not exists | mock `fs.mkdir` | `mkdir` 被调用，含 `{ recursive: true }` |
| 4 | getOutputPath returns correct format | `getOutputPath("./issue", 123, "fix-bug")` | 返回 `issue/123-fix-bug.md` |
| 5 | write error throws WriteError | mock `writeFile` throw | 抛出 `WriteError` |

---

### T11: 实现 Writer 模块 (Green)

**文件**: `src/writer/index.ts`
**依赖**: T10
**验证**: `pnpm test -- src/writer` 全部通过

实现以下函数：

1. **`getOutputPath(outputDir, number, slug)`**:
   - 使用 `path.join(outputDir, "{number}-{slug}.md")`
   - 返回完整文件路径字符串

2. **`writeMarkdownFile(content, outputPath, dryRun)`**:
   - `dryRun=true`: `process.stdout.write(content)`，直接 return
   - `dryRun=false`:
     - `fs.mkdir(path.dirname(outputPath), { recursive: true })`
     - `fs.writeFile(outputPath, content, "utf-8")`
     - 成功后 `console.log("✓ Saved to " + outputPath)`
   - 任何 I/O 错误捕获并抛 `WriteError`

导入 `fs` 从 `node:fs/promises`，`path` 从 `node:path`。导入 `WriteError` 从 `../errors.js`。

---

## Phase 5: CLI 入口 (cli)

### T12: 编写 CLI 测试 (Red)

**文件**: `src/cli/index.test.ts`
**依赖**: T01, T03, T06, T09, T11（所有模块已实现）
**验证**: `pnpm test -- src/cli` 失败

Mock 策略:
- `vi.mock("../api/index.js")` — mock 所有 fetch 函数
- `vi.mock("../writer/index.js")` — mock 文件写入
- `vi.spyOn(process, "exit")` — 捕获退出码（阻止真实退出）
- `vi.spyOn(console, "error")` — 捕获 stderr 输出

| # | 测试名 | 输入 argv | Mock 设置 | 断言 |
|---|--------|----------|----------|------|
| 1 | minimal valid call | `["n", "issue2md", "https://github.com/o/r/issues/1"]` | fetchIssue 正常返回 | writer 被调用，outputDir="./issue" |
| 2 | custom output directory | `[..., "-o", "./archive"]` | 同上 | writer outputDir="./archive" |
| 3 | short -o flag | `[..., "-o", "./out"]` | 同上 | outputDir="./out" |
| 4 | --no-comments flag | `[..., "--no-comments"]` | 同上 | formatter 被调用时 `noComments=true` |
| 5 | --dry-run flag | `[..., "--dry-run"]` | 同上 | writer 被调用时 `dryRun=true` |
| 6 | no URL exits with code 1 | `["n", "issue2md"]` | — | `process.exit(1)` 被调用 |
| 7 | invalid URL exits with code 2 | `[..., "https://example.com"]` | — | `process.exit(2)` 被调用 |
| 8 | dry-run takes priority over -o | `[..., "--dry-run", "-o", "./out"]` | 同上 | writer dryRun=true，文件未实际写入 |
| 9 | 404 exits with code 3 | 合法 URL | fetchIssue 抛 FetchError | `process.exit(3)` |
| 10 | network error exits with code 4 | 合法 URL | fetchIssue 抛 NetworkError | `process.exit(4)` |
| 11 | PR fetches extra data | PR URL | fetchIssue 返回含 `pull_request` 的对象 | fetchCommits、fetchFiles、fetchReviewComments 都被调用 |

---

### T13: 实现 CLI 模块 (Green)

**文件**: `src/cli/index.ts`
**依赖**: T12
**验证**: `pnpm test -- src/cli` 全部通过

替换当前 TODO 占位，实现：

1. **`parseArgs(argv)`** — 使用 commander:
   ```typescript
   import { Command } from "commander";

   export function parseArgs(argv: string[]): CliOptions {
     const program = new Command();
     program
       .argument("<url>", "GitHub Issue or PR URL")
       .option("-o, --output <dir>", "output directory", "./issue")
       .option("--no-comments", "exclude comments", false)
       .option("--dry-run", "print to stdout without writing file", false)
       .exitOverride() // 阻止 commander 自行调用 process.exit
       .parse(argv);

     return {
       url: program.args[0],
       output: program.opts().output,
       noComments: program.opts().noComments ?? false,
       dryRun: program.opts().dryRun ?? false,
     };
   }
   ```

2. **`run(argv?)`** — 编排主流程:
   ```
   try {
     const opts = parseArgs(argv ?? process.argv);
     const parsed = parseGitHubUrl(opts.url);
     const issue = await fetchIssue(parsed.owner, parsed.repo, parsed.number);
     const comments = opts.noComments ? [] : await fetchComments(...);

     // 判断是否为 PR: issue.pull_request 存在
     let prData;
     if (issue.pull_request) {
       const [commits, files, reviewComments] = await Promise.all([
         fetchCommits(...), fetchFiles(...), fetchReviewComments(...)
       ]);
       prData = { commits, files, reviewComments };
     }

     // 构造 IssueData
     const data = buildIssueData(issue, comments, prData);

     const markdown = formatToMarkdown(data, { noComments: opts.noComments });
     const slug = generateSlug(data.meta.title);
     const outputPath = getOutputPath(opts.output, parsed.number, slug);
     await writeMarkdownFile(markdown, outputPath, opts.dryRun);
   } catch (err) {
     if (err instanceof ParseError) { console.error(err.message); process.exit(2); }
     else if (err instanceof FetchError) { console.error(err.message); process.exit(3); }
     else if (err instanceof NetworkError) { console.error(err.message); process.exit(4); }
     else if (err instanceof WriteError) { console.error(err.message); process.exit(5); }
     else if (err instanceof RateLimitError) { console.error(err.message); process.exit(6); }
     else { console.error("Unexpected error"); process.exit(1); }
   }
   ```

3. 新增 `buildIssueData()` 辅助函数（在 cli/index.ts 内部）:
   - 将 `GitHubIssue` + `GitHubComment[]` + PR 数据 转为 `IssueData`
   - 日期提取: `created_at.slice(0, 10)` 得 `YYYY-MM-DD`
   - author: `issue.user?.login ?? "unknown"`
   - PR state 判断: `issue.state === "closed" && issue.pull_request?.merged_at` → `"merged"`
   - 排序 comments 按 `created_at` 升序

---

## Phase 6: 集成与验证

### T14: 编写集成测试

**文件**: `tests/integration.test.ts`（新建 `tests/` 目录）
**依赖**: T03 + T06 + T09 + T11 + T13
**验证**: `pnpm test` 全部通过

Mock 全局 `fetch`，模拟完整的 GitHub API 响应链。

**Mock 数据准备**:
- Issue JSON（含 title、body、labels、user 等）
- Comments JSON 数组
- PR 专属: Commits、Files、ReviewComments JSON

| # | 测试名 | 操作 | 断言 |
|---|--------|------|------|
| 1 | E2E issue export | 用 mock fetch 调用 `run()` | 检查写入文件路径格式为 `{dir}/{number}-{slug}.md` |
| 2 | E2E PR export | mock PR Issue + PR 数据 | 文件内容含 `## Commits`、`## Changed Files`、`## Review Comments` |
| 3 | custom output dir | `run(["n", "i", url, "-o", "./custom"])` | 文件写入 `./custom/` 目录 |
| 4 | no-comments flag | `run([..., "--no-comments"])` | 文件内容不含 `## Comments` |
| 5 | dry-run flag | `run([..., "--dry-run"])` | 无文件被写入，stdout 输出 markdown |
| 6 | dry-run priority over -o | `run([..., "--dry-run", "-o", "./out"])` | 无文件被写入 |
| 7 | error scenarios | 分别测试: 无 URL / 无效 URL / 404 / 网络错误 | 对应退出码 1/2/3/4 |

使用 `os.tmpdir()` + `fs.mkdtempSync()` 创建临时目录作为输出路径，测试后清理。

---

### T15: 最终验证

**文件**: 无新文件
**依赖**: T14
**验证**: 以下命令全部通过

按顺序执行：

1. **类型检查**: `pnpm exec tsc --noEmit` — 零错误
2. **全量测试**: `pnpm test` — 所有测试通过
3. **构建**: `pnpm run build` — 生成 `dist/` 目录，入口文件含 shebang
4. **手动冒烟测试**:
   - `node dist/index.js` — 显示错误（无 URL），退出码 1
   - `node dist/index.js https://example.com` — 显示无效 URL 错误，退出码 2
   - `node dist/index.js https://github.com/facebook/react/issues/1 --dry-run` — 输出 Markdown 到 stdout

---

## 验收标准映射

| 验收标准 | 覆盖任务 |
|---------|---------|
| AC-1: Issue URL → 正确 .md 文件 | T09, T14 |
| AC-2: PR URL → 含 commits/files/reviews | T09, T14 |
| AC-3: Frontmatter 完整 | T08, T09 |
| AC-4: 评论按时间升序 | T08, T09, T13 |
| AC-5: 分页全部拉取 | T05, T06 |
| AC-6: -o 自定义目录 | T10, T11, T12, T13, T14 |
| AC-7: --no-comments | T08, T09, T12, T13, T14 |
| AC-8: --dry-run stdout | T10, T11, T12, T13, T14 |
| AC-9: dry-run 优先于 -o | T12, T13, T14 |
| AC-10: 无 URL 退出码 1 | T12, T13 |
| AC-11: 无效 URL 退出码 2 | T02, T03, T12, T13 |
| AC-12: 404 退出码 3 | T05, T06, T12, T13 |
| AC-13: 网络错误退出码 4 | T05, T06, T12, T13 |
| AC-14: 写入权限错误退出码 5 | T10, T11, T12, T13 |
| AC-15: GFM 语法保留 | T08, T09 |
| AC-16: 图片保持远程 URL | T08, T09 |
| AC-17: 文件名格式正确 | T10, T11, T13 |
