import * as fs from "node:fs/promises";
import * as path from "node:path";
import { WriteError } from "../errors.js";

export function getOutputPath(
  outputDir: string,
  number: number,
  slug: string,
): string {
  return path.join(outputDir, `${number}-${slug}.md`);
}

export async function writeMarkdownFile(
  content: string,
  outputPath: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    process.stdout.write(content);
    return;
  }

  try {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, content, "utf-8");
    console.log(`✓ Saved to ${outputPath}`);
  } catch (err) {
    throw new WriteError(
      outputPath,
      err instanceof Error ? err.message : String(err),
    );
  }
}
