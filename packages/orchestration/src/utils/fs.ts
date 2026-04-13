import { readFile } from "node:fs/promises";

export async function readUtf8(path: string): Promise<string> {
  return readFile(path, "utf8");
}
