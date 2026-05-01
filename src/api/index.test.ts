import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchIssue,
  fetchComments,
  fetchCommits,
  fetchFiles,
  fetchReviewComments,
} from "./index.js";
import { FetchError, NetworkError, RateLimitError } from "../errors.js";

const API_BASE = "https://api.github.com";

function createHeaders(init?: Record<string, string>): Headers {
  const headers = new Headers();
  if (init) {
    for (const [key, value] of Object.entries(init)) {
      headers.set(key, value);
    }
  }
  return headers;
}

function mockResponse(body: unknown, options?: { ok?: boolean; status?: number; headers?: Record<string, string> }) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    headers: createHeaders(options?.headers),
    json: () => Promise.resolve(body),
  } as Response;
}

describe("fetchIssue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed issue on 200", async () => {
    const issue = {
      title: "Bug",
      html_url: "https://github.com/o/r/issues/1",
      user: { login: "alice" },
      created_at: "2026-05-01T00:00:00Z",
      state: "open",
      labels: [],
      assignees: [],
      milestone: null,
      body: "desc",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(issue, {
          headers: { "X-RateLimit-Remaining": "60" },
        }),
      ),
    );

    const result = await fetchIssue("o", "r", 1);
    expect(result).toEqual(issue);
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/repos/o/r/issues/1`,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("throws FetchError on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(null, {
          ok: false,
          status: 404,
          headers: { "X-RateLimit-Remaining": "59" },
        }),
      ),
    );

    await expect(fetchIssue("o", "r", 999)).rejects.toThrow(FetchError);
    await expect(fetchIssue("o", "r", 999)).rejects.toThrow("404");
  });

  it("throws NetworkError on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(fetchIssue("o", "r", 1)).rejects.toThrow(NetworkError);
  });

  it("throws RateLimitError when remaining is 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(null, {
          ok: true,
          status: 200,
          headers: { "X-RateLimit-Remaining": "0" },
        }),
      ),
    );

    await expect(fetchIssue("o", "r", 1)).rejects.toThrow(RateLimitError);
  });
});

describe("fetchComments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns comments from single page", async () => {
    const comments = [
      { id: 1, user: { login: "a" }, created_at: "2026-05-01T00:00:00Z", body: "hi" },
      { id: 2, user: { login: "b" }, created_at: "2026-05-02T00:00:00Z", body: "there" },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(comments, {
          headers: { "X-RateLimit-Remaining": "58" },
        }),
      ),
    );

    const result = await fetchComments("o", "r", 1);
    expect(result).toEqual(comments);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("per_page=100"),
      expect.any(Object),
    );
  });

  it("paginates via Link header", async () => {
    const page1 = [{ id: 1, user: { login: "a" }, created_at: "2026-05-01T00:00:00Z", body: "first" }];
    const page2 = [{ id: 2, user: { login: "b" }, created_at: "2026-05-02T00:00:00Z", body: "second" }];

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse(page1, {
          headers: {
            "X-RateLimit-Remaining": "58",
            Link: '<https://api.github.com/repos/o/r/issues/1/comments?page=2&per_page=100>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse(page2, {
          headers: { "X-RateLimit-Remaining": "57" },
        }),
      );

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchComments("o", "r", 1);
    expect(result).toEqual([...page1, ...page2]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("PR-specific fetches", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchCommits calls correct endpoint", async () => {
    const commits = [{ sha: "abc", commit: { author: { date: "2026-05-01T00:00:00Z" }, message: "fix" }, author: { login: "dev" } }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockResponse(commits, { headers: { "X-RateLimit-Remaining": "55" } }),
    ));

    const result = await fetchCommits("o", "r", 1);
    expect(result).toEqual(commits);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/pulls/1/commits"),
      expect.any(Object),
    );
  });

  it("fetchFiles calls correct endpoint", async () => {
    const files = [{ filename: "src/main.ts", status: "modified", additions: 5, deletions: 2 }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockResponse(files, { headers: { "X-RateLimit-Remaining": "54" } }),
    ));

    const result = await fetchFiles("o", "r", 1);
    expect(result).toEqual(files);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/pulls/1/files"),
      expect.any(Object),
    );
  });

  it("fetchReviewComments calls correct endpoint", async () => {
    const reviews = [{ id: 1, user: { login: "r" }, created_at: "2026-05-01T00:00:00Z", body: "nit", path: "a.ts", line: 10 }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockResponse(reviews, { headers: { "X-RateLimit-Remaining": "53" } }),
    ));

    const result = await fetchReviewComments("o", "r", 1);
    expect(result).toEqual(reviews);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/pulls/1/comments"),
      expect.any(Object),
    );
  });
});
