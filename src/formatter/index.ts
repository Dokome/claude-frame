export interface IssueData {
  meta: {
    title: string;
    url: string;
    author: string;
    date: string;
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

function escapeTitle(title: string): string {
  return title.replace(/"/g, '\\"');
}

function buildFrontmatter(meta: IssueData["meta"]): string {
  const lines: string[] = ["---"];
  lines.push(`title: "${escapeTitle(meta.title)}"`);
  lines.push(`url: "${meta.url}"`);
  lines.push(`author: ${meta.author}`);
  lines.push(`date: ${meta.date}`);
  lines.push(`type: ${meta.type}`);
  lines.push(`state: ${meta.state}`);

  if (meta.labels.length === 0) {
    lines.push("labels: []");
  } else {
    lines.push("labels:");
    for (const label of meta.labels) {
      lines.push(`  - ${label}`);
    }
  }

  if (meta.assignees.length === 0) {
    lines.push("assignees: []");
  } else {
    lines.push("assignees:");
    for (const assignee of meta.assignees) {
      lines.push(`  - ${assignee}`);
    }
  }

  if (meta.milestone) {
    lines.push(`milestone: "${meta.milestone}"`);
  }

  lines.push("---");
  return lines.join("\n");
}

function buildCommentsSection(
  comments: IssueData["comments"],
): string {
  if (comments.length === 0) return "";

  const sorted = [...comments].sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  const parts: string[] = ["\n---\n\n## Comments\n"];
  for (const comment of sorted) {
    parts.push(`\n### @${comment.author} (${comment.date})\n`);
    parts.push(`\n${comment.body}\n`);
    parts.push("\n---\n");
  }
  return parts.join("");
}

function buildCommitsTable(
  commits: NonNullable<IssueData["pullRequest"]>["commits"],
): string {
  if (commits.length === 0) return "";

  const header = "| SHA | Author | Message | Date |";
  const separator = "|-----|--------|---------|------|";
  const rows = commits.map(
    (c) =>
      `| \`${c.sha}\` | @${c.author} | ${c.message} | ${c.date} |`,
  );
  return `\n---\n\n## Commits\n\n${header}\n${separator}\n${rows.join("\n")}\n`;
}

function buildFilesTable(
  files: NonNullable<IssueData["pullRequest"]>["files"],
): string {
  if (files.length === 0) return "";

  const header = "| File | Status | Additions | Deletions |";
  const separator = "|------|--------|-----------|-----------|";
  const rows = files.map(
    (f) =>
      `| \`${f.filename}\` | ${f.status} | +${f.additions} | -${f.deletions} |`,
  );
  return `\n---\n\n## Changed Files\n\n${header}\n${separator}\n${rows.join("\n")}\n`;
}

function buildReviewCommentsSection(
  comments: NonNullable<IssueData["pullRequest"]>["reviewComments"],
): string {
  if (comments.length === 0) return "";

  const parts: string[] = [`\n---\n\n## Review Comments\n`];
  for (const comment of comments) {
    const location = comment.line
      ? `${comment.path}:${comment.line}`
      : comment.path;
    parts.push(`\n### @${comment.author} on \`${location}\` (${comment.date})\n`);

    if (comment.diffHunk) {
      parts.push(`\n> \`\`\`\n> ${comment.diffHunk}\n> \`\`\`\n`);
    }

    parts.push(`\n${comment.body}\n`);
  }
  return parts.join("");
}

export function formatToMarkdown(
  data: IssueData,
  options?: { noComments?: boolean },
): string {
  const sections: string[] = [];

  // Frontmatter
  sections.push(buildFrontmatter(data.meta));

  // Body
  sections.push(`\n# ${data.meta.title}\n\n${data.body}\n`);

  // Comments (unless noComments)
  if (!options?.noComments) {
    sections.push(buildCommentsSection(data.comments));
  }

  // PR-specific sections
  if (data.pullRequest) {
    sections.push(buildCommitsTable(data.pullRequest.commits));
    sections.push(buildFilesTable(data.pullRequest.files));
    sections.push(
      buildReviewCommentsSection(data.pullRequest.reviewComments),
    );
  }

  return sections.join("");
}

export function generateSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");

  return slug || "untitled";
}
