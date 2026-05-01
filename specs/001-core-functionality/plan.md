# issue2md MVP 实施计划

**基于规格**: `specs/001-core-functionality/spec.md`
**技术栈**: TypeScript (strict) / Node.js >= 18 / pnpm / commander / tsup / vitest
**开发方法**: TDD (Red-Green-Refactor)，严格遵循项目宪法

---

## 实施阶段总览

```
Phase 1: URL 解析 (parser)        — 无外部依赖，纯函数，最易测试
Phase 2: GitHub API 层 (api)      — 定义类型 + HTTP 请求 + 分页
Phase 3: Markdown 格式化 (formatter) — 数据结构 → Markdown 文本
Phase 4: 文件写入 (writer)        — 磁盘 I/O + dry-run stdout 输出
Phase 5: CLI 入口 (cli)           — 参数解析 + 流程编排
Phase 6: 集成验证                  — 端到端测试 + 验收标准检查
```

各模块依赖关系：

```
parser ←── api ←── formatter ←── writer ←── cli
  (纯函数)   (网络)     (格式化)      (I/O)     (编排)
```

每阶段严格遵循 TDD：先写失败测试 → 实现通过 → 重构。

---

## Phase 1: URL 解析 (parser)

**目标**: 实现 `parseGitHubUrl()`，从 URL 中提取 `owner`、`repo`、`type`、`number`。
**对应规格**: §2.1 URL 识别与解析
**对应验收**: AC-11（非 GitHub URL 报错退出码 2）

### 文件

- `src/parser/index.ts` — 实现
- `src/parser/index.test.ts` — 测试

### 测试用例 (Red 先行)

| # | 测试场景 | 输入 | 期望结果 |
|---|---------|------|---------|
| 1 | 标准 Issue URL | `https://github.com/vercel/next.js/issues/45678` | `{owner: "vercel", repo: "next.js", type: "issues", number: 45678}` |
| 2 | 标准 PR URL | `https://github.com/vercel/next.js/pull/45679` | `{owner: "vercel", repo: "next.js", type: "pull", number: 45679}` |
| 3 | http 协议 | `http://github.com/owner/repo/issues/1` | 正常解析 |
| 4 | 带锚点的 URL | `https://github.com/o/r/issues/1#issuecomment-123` | 忽略锚点，正常解析 |
| 5 | 带查询参数的 URL | `https://github.com/o/r/issues/1?foo=bar` | 忽略参数，正常解析 |
| 6 | 尾部斜杠 | `https://github.com/o/r/issues/1/` | 正常解析 |
| 7 | 无效域名 | `https://gitlab.com/o/r/issues/1` | 抛出错误，消息含格式提示 |
| 8 | 缺少 type 段 | `https://github.com/o/r/` | 抛出错误 |
| 9 | number 非数字 | `https://github.com/o/r/issues/abc` | 抛出错误 |
| 10 | 非法 type | `https://github.com/o/r/releases/1` | 抛出错误 |

### 实现要点

- 使用 `URL` 构造函数解析（内置 API，无依赖）
- 正则验证 `pathname`: `/^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/`
- 错误统一抛出自定义错误类 `ParseError`，便于 CLI 层区分退出码

---

## Phase 2: GitHub API 层 (api)

**目标**: 实现 GitHub REST API 调用，支持 Issue/PR 数据获取 + 自动分页。
**对应规格**: §2.3 GitHub API 调用策略
**对应验收**: AC-5（全部分页拉取无遗漏）

### 文件

- `src/api/index.ts` — 实现与类型导出
- `src/api/index.test.ts` — 测试（mock fetch）

### 类型定义

```typescript
// Issue 相关
interface GitHubIssue {
  title: string;
  html_url: string;
  user: { login: string } | null;
  created_at: string;
  state: "open" | "closed";
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  milestone: { title: string } | null;
  body: string | null;
  pull_request?: object; // 存在时表示这是 PR
}

interface GitHubComment {
  user: { login: string } | null;
  created_at: string;
  body: string | null;
}

// PR 专属
interface GitHubCommit {
  sha: string;
  commit: {
    author: { date: string; name?: string };
    message: string;
  };
  author: { login: string } | null;
}

interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

interface GitHubReviewComment {
  user: { login: string } | null;
  created_at: string;
  body: string | null;
  path: string;
  line?: number;
  original_line?: number;
  in_reply_to_id?: number;
  diff_hunk?: string;
}
```

### 函数签名

```typescript
// 核心请求函数（带分页）
function fetchAllPages<T>(url: string): Promise<T[]>

// Issue 数据
function fetchIssue(owner: string, repo: string, number: number): Promise<GitHubIssue>
function fetchComments(owner: string, repo: string, number: number): Promise<GitHubComment[]>

// PR 额外数据
function fetchCommits(owner: string, repo: string, number: number): Promise<GitHubCommit[]>
function fetchFiles(owner: string, repo: string, number: number): Promise<GitHubFile[]>
function fetchReviewComments(owner: string, repo: string, number: number): Promise<GitHubReviewComment[]>
```

### 测试用例 (Red 先行)

| # | 测试场景 | 验证点 |
|---|---------|------|
| 1 | fetchIssue 正常返回 | 调用正确 URL，返回解析后的 JSON |
| 2 | fetchIssue 404 | 抛出含 404 状态的错误 |
| 3 | fetchIssue 网络错误 | 抛出网络错误 |
| 4 | fetchComments 单页 | per_page=100，返回数组 |
| 5 | fetchComments 多页分页 | 检查 Link header，跟随 rel="next"，合并所有页结果 |
| 6 | fetchCommits / fetchFiles / fetchReviewComments | 各自调用正确的 API 端点 |
| 7 | Rate limit 检测 | X-RateLimit-Remaining=0 时抛出 rate limit 错误 |

### 实现要点

- 使用内置 `fetch` API（Node >= 18）
- 通用分页函数 `fetchAllPages<T>()`，解析 `Link` header 中的 `rel="next"`
- 统一错误处理：HTTP 状态码 404 → `FetchError`，网络失败 → `NetworkError`，rate limit → `RateLimitError`
- 不引入任何 HTTP 库

---

## Phase 3: Markdown 格式化 (formatter)

**目标**: 将 GitHub API 返回的数据结构转换为符合规格的 Markdown 文本。
**对应规格**: §2.4 Markdown 输出结构, §2.5 内容转换规则
**对应验收**: AC-3（frontmatter 完整）, AC-4（评论按时间升序）, AC-15（GFM 语法保留）, AC-16（图片保持远程 URL）

### 文件

- `src/formatter/index.ts` — 实现与类型导出
- `src/formatter/index.test.ts` — 测试

### 类型定义

```typescript
interface IssueData {
  meta: {
    title: string;
    url: string;
    author: string;
    date: string;       // ISO 8601 YYYY-MM-DD
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
  // PR 专属字段
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

### 函数签名

```typescript
function formatToMarkdown(data: IssueData, options?: { noComments?: boolean }): string
function generateSlug(title: string): string
function buildFrontmatter(meta: IssueData["meta"]): string
```

### 测试用例 (Red 先行)

| # | 测试场景 | 验证点 |
|---|---------|------|
| 1 | Issue 完整输出 | frontmatter + 正文 + 评论，格式符合 §2.4 |
| 2 | Frontmatter 字段完整 | title/url/author/date/type/state/labels 全部存在 |
| 3 | 无标签时 labels 为 `[]` | YAML 输出 `labels: []` |
| 4 | 无 assignees 时为 `[]` | YAML 输出 `assignees: []` |
| 5 | 无 milestone 时省略字段 | frontmatter 中不出现 `milestone:` |
| 6 | 标题含双引号 | frontmatter 中双引号正确转义 |
| 7 | 评论按时间升序排列 | 先旧后新 |
| 8 | `noComments=true` | 输出不含评论区域 |
| 9 | PR 输出包含 commits/files/review comments | 三个专属区域都存在 |
| 10 | PR 专属表格格式 | 表头和数据行正确 |
| 11 | Review comment 含代码引用 | diff_hunk 以引用块格式输出 |
| 12 | slug 生成 | 小写、连字符、截断 50 字符 |
| 13 | body 为 null | 正文区域为空 |
| 14 | 评论 body 为 null | 该评论正文为空 |

### 实现要点

- Frontmatter 使用手动拼接字符串（避免引入 YAML 库，保持简单性原则）
- title 字段用双引号包裹，内部双引号转义为 `\"`
- 日期从 ISO 8601 字符串提取 `YYYY-MM-DD` 部分
- PR 的 `state`: API 返回 `closed` + `merged` 字段存在时 → `merged`
- slug 生成: 小写 → 非字母数字替换为 `-` → 合并连续 `-` → 截断 50 字符 → 去除首尾 `-`

---

## Phase 4: 文件写入 (writer)

**目标**: 实现 Markdown 文件写入磁盘，支持 dry-run 模式输出到 stdout。
**对应规格**: §2.6 文件保存行为
**对应验收**: AC-6（自定义输出目录）, AC-8（dry-run 不写文件）, AC-14（写入权限错误退出码 5）

### 文件

- `src/writer/index.ts` — 实现
- `src/writer/index.test.ts` — 测试

### 函数签名

```typescript
function getOutputPath(outputDir: string, number: number, slug: string): string
function writeMarkdownFile(content: string, outputPath: string, dryRun: boolean): Promise<void>
```

### 测试用例 (Red 先行)

| # | 测试场景 | 验证点 |
|---|---------|------|
| 1 | 正常写入 | 文件写入到指定路径，内容正确 |
| 2 | dry-run=true | 不创建文件，内容输出到 stdout |
| 3 | 输出目录不存在 | 自动递归创建目录 |
| 4 | 路径生成 | 格式为 `{dir}/{number}-{slug}.md` |
| 5 | 写入权限不足 | 抛出 `WriteError` |

### 实现要点

- 使用 `fs.mkdir(path, { recursive: true })` 创建目录
- 使用 `fs.writeFile()` 写入文件
- dry-run 时使用 `process.stdout.write()`
- 目录创建和文件写入的错误分别捕获并包装为 `WriteError`
- 成功时打印 `✓ Saved to <path>` 到 stdout

---

## Phase 5: CLI 入口 (cli)

**目标**: 使用 commander 解析命令行参数，编排整个流程。
**对应规格**: §2.2 CLI 接口, §3.2 错误处理
**对应验收**: AC-6~AC-14（所有 CLI 相关验收标准）

### 文件

- `src/cli/index.ts` — 实现
- `src/cli/index.test.ts` — 测试

### 函数签名

```typescript
function parseArgs(argv: string[]): CliOptions
async function run(argv?: string[]): Promise<void>
```

### 测试用例 (Red 先行)

| # | 测试场景 | 输入 | 期望结果 |
|---|---------|------|---------|
| 1 | 最小合法调用 | `["node", "issue2md", "https://github.com/o/r/issues/1"]` | 解析成功，默认 output="./issue" |
| 2 | 自定义输出目录 | `[..., "-o", "./archive"]` | output="./archive" |
| 3 | 短写 -o | `[..., "-o", "./out"]` | 同上 |
| 4 | --no-comments | `[..., "--no-comments"]` | noComments=true |
| 5 | --dry-run | `[..., "--dry-run"]` | dryRun=true |
| 6 | 无 URL 参数 | `["node", "issue2md"]` | 退出码 1，stderr 含错误信息 |
| 7 | 无效 URL | `[..., "https://example.com"]` | 退出码 2 |
| 8 | dry-run 与 -o 同时使用 | `[..., "--dry-run", "-o", "./out"]` | dry-run 优先，不写文件 |
| 9 | Issue 不存在（404） | 合法 URL 但 404 | 退出码 3 |

### 实现要点

- 使用 `commander` 的 `Command` 类解析参数
- `run()` 函数编排流程: parseArgs → parseGitHubUrl → fetchIssue → fetchComments → (PR额外获取) → formatToMarkdown → writeMarkdownFile
- 错误类型到退出码的映射:
  - `ParseError` → 2
  - `FetchError` (404) → 3
  - `NetworkError` → 4
  - `WriteError` → 5
  - `RateLimitError` → 6
  - 无 URL → 1
- 所有错误信息输出到 stderr，成功信息输出到 stdout
- `process.exit()` 仅在 `run()` 顶层调用，不在子模块中调用

---

## Phase 6: 集成验证

**目标**: 端到端测试，确保所有模块协同工作，满足全部验收标准。

### 文件

- `tests/integration.test.ts` — 集成测试（使用 mock server）

### 测试用例

| # | 测试场景 | 验证验收标准 |
|---|---------|------------|
| 1 | 端到端 Issue 导出 | AC-1, AC-3, AC-4, AC-15, AC-16, AC-17 |
| 2 | 端到端 PR 导出 | AC-2 |
| 3 | 自定义输出目录 | AC-6 |
| 4 | --no-comments | AC-7 |
| 5 | --dry-run | AC-8 |
| 6 | dry-run 优先于 -o | AC-9 |
| 7 | 错误场景（无 URL / 无效 URL / 404 / 网络错误） | AC-10~AC-14 |

### 实现要点

- 不引入真实 HTTP server，通过 mock fetch 函数模拟 API 响应
- 验证生成的 `.md` 文件内容是否符合 spec 中的示例格式
- 验证文件名格式 `{number}-{slug}.md`

---

## 错误类设计

为支持 CLI 层的退出码映射，定义统一的自定义错误类：

```typescript
// src/errors.ts
class Issue2mdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Issue2mdError";
  }
}

class ParseError extends Issue2mdError {
  constructor(message: string) { super(message); this.name = "ParseError"; }
}

class FetchError extends Issue2mdError {
  readonly statusCode: number;
  constructor(url: string, statusCode: number) {
    super(`Not found: ${url} (${statusCode})`);
    this.name = "FetchError";
    this.statusCode = statusCode;
  }
}

class NetworkError extends Issue2mdError {
  constructor(reason: string) {
    super(`Network request failed: ${reason}`);
    this.name = "NetworkError";
  }
}

class WriteError extends Issue2mdError {
  constructor(path: string, reason: string) {
    super(`Failed to write file: ${path} (${reason})`);
    this.name = "WriteError";
  }
}

class RateLimitError extends Issue2mdError {
  constructor() {
    super("GitHub API rate limit exceeded. Try again later or provide a token.");
    this.name = "RateLimitError";
  }
}
```

**新建文件**: `src/errors.ts`

---

## 文件结构总览（实施完成后）

```
src/
├── errors.ts                    # 自定义错误类（新增）
├── index.ts                     # 入口（已有，导出 run）
├── cli/
│   ├── index.ts                 # CLI 参数解析 + 流程编排
│   └── index.test.ts            # CLI 测试
├── api/
│   ├── index.ts                 # GitHub API 请求 + 类型定义
│   └── index.test.ts            # API 测试（mock fetch）
├── parser/
│   ├── index.ts                 # URL 解析
│   └── index.test.ts            # URL 解析测试
├── formatter/
│   ├── index.ts                 # Markdown 格式化 + 类型定义
│   └── index.test.ts            # 格式化测试
└── writer/
    ├── index.ts                 # 文件写入
    └── index.test.ts            # 写入测试
```

---

## 预计规模

| 模块 | 实现行数（估算） | 测试行数（估算） |
|------|----------------|----------------|
| errors.ts | ~40 | — |
| parser | ~30 | ~80 |
| api | ~120 | ~150 |
| formatter | ~150 | ~200 |
| writer | ~40 | ~60 |
| cli | ~80 | ~100 |
| **合计** | **~460** | **~590** |

---

## 关键决策记录

1. **不引入 YAML 库** — Frontmatter 使用手动字符串拼接，因为字段固定且简单，不需要通用 YAML 序列化
2. **使用内置 fetch** — Node >= 18 内置 fetch API，不需要 axios/node-fetch
3. **commander 作为唯一外部依赖** — CLI 参数解析是 commander 的核心能力，不值得自己实现
4. **测试中 mock fetch** — 使用 `vi.fn()` mock 全局 fetch，不引入 msw 等库
5. **错误类继承体系** — 统一继承 `Issue2mdError`，便于 CLI 层 `instanceof` 判断 + 退出码映射
