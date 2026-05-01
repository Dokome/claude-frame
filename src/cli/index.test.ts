import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/index.js", () => ({
  fetchIssue: vi.fn(),
  fetchComments: vi.fn().mockResolvedValue([]),
  fetchCommits: vi.fn().mockResolvedValue([]),
  fetchFiles: vi.fn().mockResolvedValue([]),
  fetchReviewComments: vi.fn().mockResolvedValue([]),
}));

vi.mock("../writer/index.js", () => ({
  getOutputPath: vi.fn().mockReturnValue("issue/1-test-issue.md"),
  writeMarkdownFile: vi.fn().mockResolvedValue(undefined),
}));

import { fetchIssue, fetchComments, fetchCommits, fetchFiles, fetchReviewComments } from "../api/index.js";
import { writeMarkdownFile, getOutputPath } from "../writer/index.js";
import { run } from "./index.js";

const mockIssue = {
  title: "Test Issue",
  html_url: "https://github.com/o/r/issues/1",
  user: { login: "alice" },
  created_at: "2026-05-01T00:00:00Z",
  state: "open" as const,
  labels: [{ name: "bug" }],
  assignees: [],
  milestone: null,
  body: "body text",
};

describe("run", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fetchIssue).mockResolvedValue({ ...mockIssue });
    vi.mocked(fetchComments).mockResolvedValue([]);
    vi.mocked(fetchCommits).mockResolvedValue([]);
    vi.mocked(fetchFiles).mockResolvedValue([]);
    vi.mocked(fetchReviewComments).mockResolvedValue([]);
    vi.mocked(writeMarkdownFile).mockResolvedValue(undefined);
    vi.mocked(getOutputPath).mockReturnValue("issue/1-test-issue.md");
  });

  it("minimal valid call writes file", async () => {
    await run(["node", "issue2md", "https://github.com/o/r/issues/1"]);

    expect(fetchIssue).toHaveBeenCalledWith("o", "r", 1);
    expect(writeMarkdownFile).toHaveBeenCalled();
  });

  it("custom output directory via -o", async () => {
    await run([
      "node",
      "issue2md",
      "https://github.com/o/r/issues/1",
      "-o",
      "./archive",
    ]);

    expect(getOutputPath).toHaveBeenCalledWith(
      "./archive",
      1,
      expect.any(String),
    );
  });

  it("short -o flag", async () => {
    await run([
      "node",
      "issue2md",
      "https://github.com/o/r/issues/1",
      "-o",
      "./out",
    ]);

    expect(getOutputPath).toHaveBeenCalledWith(
      "./out",
      1,
      expect.any(String),
    );
  });

  it("exits with code 1 when no URL provided", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);

    await run(["node", "issue2md"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("exits with code 2 for invalid URL", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await run(["node", "issue2md", "https://example.com"]);

    expect(exitSpy).toHaveBeenCalledWith(2);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("exits with code 3 on 404", async () => {
    const { FetchError } = await import("../errors.js");
    vi.mocked(fetchIssue).mockRejectedValue(
      new FetchError("https://api.github.com/repos/o/r/issues/999", 404),
    );

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await run(["node", "issue2md", "https://github.com/o/r/issues/999"]);

    expect(exitSpy).toHaveBeenCalledWith(3);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("exits with code 4 on network error", async () => {
    const { NetworkError } = await import("../errors.js");
    vi.mocked(fetchIssue).mockRejectedValue(
      new NetworkError("Failed to fetch"),
    );

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await run(["node", "issue2md", "https://github.com/o/r/issues/1"]);

    expect(exitSpy).toHaveBeenCalledWith(4);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("PR fetches extra data", async () => {
    vi.mocked(fetchIssue).mockResolvedValue({
      ...mockIssue,
      pull_request: { merged_at: undefined },
    });

    await run(["node", "issue2md", "https://github.com/o/r/pull/1"]);

    expect(fetchCommits).toHaveBeenCalledWith("o", "r", 1);
    expect(fetchFiles).toHaveBeenCalledWith("o", "r", 1);
    expect(fetchReviewComments).toHaveBeenCalledWith("o", "r", 1);
  });

  it("dry-run calls writeMarkdownFile with dryRun=true", async () => {
    await run([
      "node",
      "issue2md",
      "https://github.com/o/r/issues/1",
      "--dry-run",
    ]);

    expect(writeMarkdownFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      true,
    );
  });

  it("no-comments skips fetchComments", async () => {
    await run([
      "node",
      "issue2md",
      "https://github.com/o/r/issues/1",
      "--no-comments",
    ]);

    expect(fetchComments).not.toHaveBeenCalled();
  });
});
