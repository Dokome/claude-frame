import { describe, it, expect } from "vitest";
import { formatToMarkdown, generateSlug } from "./index.js";
import type { IssueData } from "./index.js";

const DEFAULT_META: IssueData["meta"] = {
  title: "Test Issue",
  url: "https://github.com/o/r/issues/1",
  author: "alice",
  date: "2026-05-01",
  type: "issue",
  state: "open",
  labels: ["bug"],
  assignees: ["alice"],
  milestone: "v1.0",
};

type DeepPartialMeta = Partial<IssueData["meta"]>;

interface TestOverrides {
  meta?: DeepPartialMeta;
  body?: string;
  comments?: IssueData["comments"];
  pullRequest?: IssueData["pullRequest"];
}

function createIssueData(overrides?: TestOverrides): IssueData {
  const meta = overrides?.meta
    ? { ...DEFAULT_META, ...overrides.meta }
    : { ...DEFAULT_META };
  return {
    meta,
    body: overrides?.body ?? "This is the body.",
    comments: overrides?.comments ?? [
      { author: "bob", date: "2026-05-02", body: "First comment" },
      { author: "carol", date: "2026-05-03", body: "Second comment" },
    ],
    pullRequest: overrides?.pullRequest,
  };
}

describe("formatToMarkdown", () => {
  it("generates complete issue markdown", () => {
    const data = createIssueData();
    const md = formatToMarkdown(data);

    expect(md).toContain("---");
    expect(md).toContain("# Test Issue");
    expect(md).toContain("This is the body.");
    expect(md).toContain("## Comments");
    expect(md).toContain("### @bob (2026-05-02)");
    expect(md).toContain("First comment");
    expect(md).toContain("### @carol (2026-05-03)");
    expect(md).toContain("Second comment");
  });

  it("includes all required frontmatter fields", () => {
    const md = formatToMarkdown(createIssueData());

    expect(md).toMatch(/title:/);
    expect(md).toMatch(/url:/);
    expect(md).toMatch(/author:/);
    expect(md).toMatch(/date:/);
    expect(md).toMatch(/type:/);
    expect(md).toMatch(/state:/);
    expect(md).toMatch(/labels:/);
  });

  it("renders empty labels as []", () => {
    const md = formatToMarkdown(createIssueData({ meta: { labels: [] } }));
    expect(md).toContain("labels: []");
  });

  it("renders empty assignees as []", () => {
    const md = formatToMarkdown(
      createIssueData({ meta: { assignees: [] } }),
    );
    expect(md).toContain("assignees: []");
  });

  it("omits milestone field when undefined", () => {
    const md = formatToMarkdown(
      createIssueData({
        meta: { labels: [], assignees: [], milestone: undefined },
      }),
    );
    expect(md).not.toContain("milestone:");
  });

  it("escapes double quotes in title", () => {
    const md = formatToMarkdown(
      createIssueData({ meta: { title: 'He said "hello"' } }),
    );
    // The frontmatter title value should have escaped quotes
    expect(md).toMatch(/title:.*\\"hello\\"/);
  });

  it("sorts comments chronologically ascending", () => {
    const data = createIssueData({
      comments: [
        { author: "new", date: "2026-05-10", body: "later" },
        { author: "old", date: "2026-05-01", body: "earlier" },
      ],
    });
    const md = formatToMarkdown(data);
    const oldIdx = md.indexOf("### @old");
    const newIdx = md.indexOf("### @new");
    expect(oldIdx).toBeLessThan(newIdx);
  });

  it("omits comments section when noComments=true", () => {
    const md = formatToMarkdown(createIssueData(), { noComments: true });
    expect(md).not.toContain("## Comments");
  });

  it("includes PR-specific sections", () => {
    const data = createIssueData({
      meta: { type: "pull_request" },
      pullRequest: {
        commits: [
          { sha: "abc1234", author: "alice", message: "fix bug", date: "2026-05-01" },
        ],
        files: [
          { filename: "src/main.ts", status: "modified", additions: 10, deletions: 2 },
        ],
        reviewComments: [
          { author: "bob", path: "src/main.ts", line: 42, date: "2026-05-02", body: "nit", diffHunk: "const x = 1;" },
        ],
      },
    });
    const md = formatToMarkdown(data);

    expect(md).toContain("## Commits");
    expect(md).toContain("## Changed Files");
    expect(md).toContain("## Review Comments");
  });

  it("renders PR tables with correct headers", () => {
    const data = createIssueData({
      meta: { type: "pull_request" },
      pullRequest: {
        commits: [
          { sha: "abc1234", author: "alice", message: "fix bug", date: "2026-05-01" },
        ],
        files: [
          { filename: "src/main.ts", status: "modified", additions: 10, deletions: 2 },
        ],
        reviewComments: [],
      },
    });
    const md = formatToMarkdown(data);

    // Commits table
    expect(md).toMatch(/\| SHA \| Author \| Message \| Date/);
    expect(md).toContain("`abc1234`");
    // Files table
    expect(md).toMatch(/\| File \| Status \| Additions \| Deletions/);
    expect(md).toContain("src/main.ts");
  });

  it("includes code quote in review comments", () => {
    const data = createIssueData({
      meta: { type: "pull_request" },
      pullRequest: {
        commits: [],
        files: [],
        reviewComments: [
          { author: "bob", path: "a.ts", line: 5, date: "2026-05-01", body: "nit", diffHunk: "const x = 1;" },
        ],
      },
    });
    const md = formatToMarkdown(data);

    expect(md).toContain("> ");
    expect(md).toContain("const x = 1;");
  });

  it("handles empty body", () => {
    const md = formatToMarkdown(createIssueData({ body: "" }));
    // Should still have the title heading
    expect(md).toContain("# Test Issue");
  });
});

describe("generateSlug", () => {
  it("converts title to slug", () => {
    expect(generateSlug("Fix Memory Leak in Handler!")).toBe(
      "fix-memory-leak-in-handler",
    );
  });

  it("truncates to 50 characters", () => {
    const longTitle =
      "This is a very long title that exceeds fifty characters easily and keeps going";
    const slug = generateSlug(longTitle);
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it("returns untitled for empty string", () => {
    expect(generateSlug("")).toBe("untitled");
    expect(generateSlug("!!!")).toBe("untitled");
  });
});
