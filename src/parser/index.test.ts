import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "./index.js";
import { ParseError } from "../errors.js";

describe("parseGitHubUrl", () => {
  it("parses standard issue URL", () => {
    const result = parseGitHubUrl(
      "https://github.com/vercel/next.js/issues/45678",
    );
    expect(result).toEqual({
      owner: "vercel",
      repo: "next.js",
      type: "issues",
      number: 45678,
    });
  });

  it("parses standard PR URL", () => {
    const result = parseGitHubUrl(
      "https://github.com/vercel/next.js/pull/45679",
    );
    expect(result).toEqual({
      owner: "vercel",
      repo: "next.js",
      type: "pull",
      number: 45679,
    });
  });

  it("accepts http protocol", () => {
    const result = parseGitHubUrl("http://github.com/owner/repo/issues/1");
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      type: "issues",
      number: 1,
    });
  });

  it("ignores URL hash/anchor", () => {
    const result = parseGitHubUrl(
      "https://github.com/o/r/issues/1#issuecomment-123",
    );
    expect(result).toEqual({
      owner: "o",
      repo: "r",
      type: "issues",
      number: 1,
    });
  });

  it("ignores query parameters", () => {
    const result = parseGitHubUrl(
      "https://github.com/o/r/issues/1?foo=bar",
    );
    expect(result).toEqual({
      owner: "o",
      repo: "r",
      type: "issues",
      number: 1,
    });
  });

  it("handles trailing slash", () => {
    const result = parseGitHubUrl("https://github.com/o/r/issues/1/");
    expect(result).toEqual({
      owner: "o",
      repo: "r",
      type: "issues",
      number: 1,
    });
  });

  it("rejects non-GitHub domain", () => {
    expect(() =>
      parseGitHubUrl("https://gitlab.com/o/r/issues/1"),
    ).toThrow(ParseError);
    expect(() =>
      parseGitHubUrl("https://gitlab.com/o/r/issues/1"),
    ).toThrow("Invalid GitHub URL");
  });

  it("rejects missing type segment", () => {
    expect(() => parseGitHubUrl("https://github.com/o/r/")).toThrow(
      ParseError,
    );
  });

  it("rejects non-numeric number", () => {
    expect(() =>
      parseGitHubUrl("https://github.com/o/r/issues/abc"),
    ).toThrow(ParseError);
  });

  it("rejects invalid type", () => {
    expect(() =>
      parseGitHubUrl("https://github.com/o/r/releases/1"),
    ).toThrow(ParseError);
  });
});
