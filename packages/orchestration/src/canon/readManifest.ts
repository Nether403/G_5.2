import { readFile } from "node:fs/promises";
import YAML from "yaml";
import type { CanonManifest } from "../types/canon";

export async function readManifest(path: string): Promise<CanonManifest> {
  const raw = await readFile(path, "utf8");
  return YAML.parse(raw) as CanonManifest;
}
