import { ParseError } from "../errors.js";

export interface ParsedUrl {
  owner: string;
  repo: string;
  type: "issues" | "pull";
  number: number;
}

const GITHUB_PATH_PATTERN =
  /^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?$/;

export function parseGitHubUrl(url: string): ParsedUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ParseError(url);
  }

  if (parsed.hostname !== "github.com") {
    throw new ParseError(url);
  }

  const match = GITHUB_PATH_PATTERN.exec(parsed.pathname);
  if (!match) {
    throw new ParseError(url);
  }

  return {
    owner: match[1],
    repo: match[2],
    type: match[3] as "issues" | "pull",
    number: Number(match[4]),
  };
}
