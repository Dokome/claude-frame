import { FetchError, NetworkError, RateLimitError } from "../errors.js";

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
  pull_request?: { url?: string; merged_at?: string };
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

const API_BASE = "https://api.github.com";
const PER_PAGE = 100;

const DEFAULT_HEADERS = {
  Accept: "application/vnd.github.v3+json",
};

function extractNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const allItems: T[] = [];
  let currentUrl: string | null = url;

  while (currentUrl) {
    let response: Response;
    try {
      response = await fetch(currentUrl, { headers: DEFAULT_HEADERS });
    } catch (err) {
      throw new NetworkError(
        err instanceof Error ? err.message : String(err),
      );
    }

    if (
      response.headers.get("X-RateLimit-Remaining") === "0" &&
      !response.ok
    ) {
      throw new RateLimitError();
    }

    if (!response.ok) {
      throw new FetchError(currentUrl, response.status);
    }

    const items: T[] = await response.json();
    allItems.push(...items);

    currentUrl = extractNextUrl(response.headers.get("Link"));
  }

  return allItems;
}

async function fetchSingle<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers: DEFAULT_HEADERS });
  } catch (err) {
    throw new NetworkError(
      err instanceof Error ? err.message : String(err),
    );
  }

  if (response.headers.get("X-RateLimit-Remaining") === "0") {
    throw new RateLimitError();
  }

  if (!response.ok) {
    throw new FetchError(url, response.status);
  }

  return response.json();
}

export async function fetchIssue(
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubIssue> {
  return fetchSingle<GitHubIssue>(
    `${API_BASE}/repos/${owner}/${repo}/issues/${number}`,
  );
}

export async function fetchComments(
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubComment[]> {
  return fetchAllPages<GitHubComment>(
    `${API_BASE}/repos/${owner}/${repo}/issues/${number}/comments?per_page=${PER_PAGE}`,
  );
}

export async function fetchCommits(
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubCommit[]> {
  return fetchAllPages<GitHubCommit>(
    `${API_BASE}/repos/${owner}/${repo}/pulls/${number}/commits?per_page=${PER_PAGE}`,
  );
}

export async function fetchFiles(
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubFile[]> {
  return fetchAllPages<GitHubFile>(
    `${API_BASE}/repos/${owner}/${repo}/pulls/${number}/files?per_page=${PER_PAGE}`,
  );
}

export async function fetchReviewComments(
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubReviewComment[]> {
  return fetchAllPages<GitHubReviewComment>(
    `${API_BASE}/repos/${owner}/${repo}/pulls/${number}/comments?per_page=${PER_PAGE}`,
  );
}
