export class Issue2mdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Issue2mdError";
  }
}

export class ParseError extends Issue2mdError {
  constructor(url: string) {
    super(
      `Invalid GitHub URL: ${url}. Expected format: https://github.com/{owner}/{repo}/issues/{number}`,
    );
    this.name = "ParseError";
  }
}

export class FetchError extends Issue2mdError {
  readonly statusCode: number;

  constructor(url: string, statusCode: number) {
    super(`Not found: ${url} (${statusCode})`);
    this.name = "FetchError";
    this.statusCode = statusCode;
  }
}

export class NetworkError extends Issue2mdError {
  constructor(reason: string) {
    super(`Network request failed: ${reason}`);
    this.name = "NetworkError";
  }
}

export class WriteError extends Issue2mdError {
  constructor(filePath: string, reason: string) {
    super(`Failed to write file: ${filePath} (${reason})`);
    this.name = "WriteError";
  }
}

export class RateLimitError extends Issue2mdError {
  constructor() {
    super(
      "GitHub API rate limit exceeded. Try again later or provide a token.",
    );
    this.name = "RateLimitError";
  }
}
