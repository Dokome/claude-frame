import { Command } from "commander";
import { parseGitHubUrl } from "../parser/index.js";
import {
  fetchIssue,
  fetchComments,
  fetchCommits,
  fetchFiles,
  fetchReviewComments,
} from "../api/index.js";
import type { GitHubIssue, GitHubComment } from "../api/index.js";
import { formatToMarkdown, generateSlug } from "../formatter/index.js";
import type { IssueData } from "../formatter/index.js";
import { getOutputPath, writeMarkdownFile } from "../writer/index.js";
import {
  ParseError,
  FetchError,
  NetworkError,
  WriteError,
  RateLimitError,
} from "../errors.js";

export interface CliOptions {
  url: string;
  output: string;
  noComments: boolean;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const program = new Command();
  program
    .argument("<url>", "GitHub Issue or PR URL")
    .option("-o, --output <dir>", "output directory", "./issue")
    .option("--no-comments", "exclude comments")
    .option("--dry-run", "print to stdout without writing file")
    .exitOverride()
    .parse(argv);

  const opts = program.opts();
  return {
    url: program.args[0] ?? "",
    output: opts.output ?? "./issue",
    noComments: opts.comments === false,
    dryRun: opts.dryRun === true,
  };
}

function buildIssueData(
  issue: GitHubIssue,
  comments: GitHubComment[],
  prData?: {
    commits: Awaited<ReturnType<typeof fetchCommits>>;
    files: Awaited<ReturnType<typeof fetchFiles>>;
    reviewComments: Awaited<ReturnType<typeof fetchReviewComments>>;
  },
): IssueData {
  const isMerged =
    issue.state === "closed" && !!issue.pull_request?.merged_at;

  return {
    meta: {
      title: issue.title,
      url: issue.html_url,
      author: issue.user?.login ?? "unknown",
      date: issue.created_at.slice(0, 10),
      type: issue.pull_request ? "pull_request" : "issue",
      state: isMerged ? "merged" : issue.state,
      labels: issue.labels.map((l) => l.name),
      assignees: issue.assignees.map((a) => a.login),
      milestone: issue.milestone?.title,
    },
    body: issue.body ?? "",
    comments: comments
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => ({
        author: c.user?.login ?? "unknown",
        date: c.created_at.slice(0, 10),
        body: c.body ?? "",
      })),
    pullRequest: prData
      ? {
          commits: prData.commits.map((c) => ({
            sha: c.sha,
            author: c.author?.login ?? "unknown",
            message: c.commit.message,
            date: c.commit.author.date.slice(0, 10),
          })),
          files: prData.files.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
          })),
          reviewComments: prData.reviewComments.map((r) => ({
            author: r.user?.login ?? "unknown",
            path: r.path,
            line: r.line,
            date: r.created_at.slice(0, 10),
            body: r.body ?? "",
            diffHunk: r.diff_hunk,
          })),
        }
      : undefined,
  };
}

export async function run(argv?: string[]): Promise<void> {
  try {
    const opts = parseArgs(argv ?? process.argv);
    const parsed = parseGitHubUrl(opts.url);

    const issue = await fetchIssue(parsed.owner, parsed.repo, parsed.number);

    const comments =
      opts.noComments
        ? []
        : await fetchComments(parsed.owner, parsed.repo, parsed.number);

    let prData: Parameters<typeof buildIssueData>[2] = undefined;
    if (issue.pull_request) {
      const [commits, files, reviewComments] = await Promise.all([
        fetchCommits(parsed.owner, parsed.repo, parsed.number),
        fetchFiles(parsed.owner, parsed.repo, parsed.number),
        fetchReviewComments(parsed.owner, parsed.repo, parsed.number),
      ]);
      prData = { commits, files, reviewComments };
    }

    const data = buildIssueData(issue, comments, prData);
    const markdown = formatToMarkdown(data, {
      noComments: opts.noComments,
    });
    const slug = generateSlug(data.meta.title);
    const outputPath = getOutputPath(opts.output, parsed.number, slug);

    await writeMarkdownFile(markdown, outputPath, opts.dryRun);
  } catch (err) {
    if (err instanceof ParseError) {
      console.error(err.message);
      process.exit(2);
    } else if (err instanceof FetchError) {
      console.error(err.message);
      process.exit(3);
    } else if (err instanceof NetworkError) {
      console.error(err.message);
      process.exit(4);
    } else if (err instanceof WriteError) {
      console.error(err.message);
      process.exit(5);
    } else if (err instanceof RateLimitError) {
      console.error(err.message);
      process.exit(6);
    } else if (err instanceof Error && err.message.includes("error:")) {
      // commander argument missing error
      console.error("Error: Please provide a GitHub URL.");
      process.exit(1);
    } else {
      throw err;
    }
  }
}
