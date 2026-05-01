import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import { getOutputPath, writeMarkdownFile } from "./index.js";
import { WriteError } from "../errors.js";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("getOutputPath", () => {
  it("returns correct file path", () => {
    expect(getOutputPath("./issue", 123, "fix-bug")).toBe(
      "issue/123-fix-bug.md",
    );
  });
});

describe("writeMarkdownFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("writes content to file", async () => {
    await writeMarkdownFile("# Hello", "./issue/1-test.md", false);

    expect(fs.mkdir).toHaveBeenCalledWith("./issue", { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(
      "./issue/1-test.md",
      "# Hello",
      "utf-8",
    );
  });

  it("outputs to stdout on dry-run", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await writeMarkdownFile("# Hello", "./issue/1-test.md", true);

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith("# Hello");

    stdoutSpy.mockRestore();
  });

  it("creates directory if not exists", async () => {
    await writeMarkdownFile("content", "./deep/nested/1-test.md", false);

    expect(fs.mkdir).toHaveBeenCalledWith("./deep/nested", {
      recursive: true,
    });
  });

  it("throws WriteError on write failure", async () => {
    vi.mocked(fs.writeFile).mockRejectedValueOnce(
      new Error("EACCES: permission denied"),
    );

    await expect(
      writeMarkdownFile("content", "./issue/1-test.md", false),
    ).rejects.toThrow(WriteError);
  });
});
