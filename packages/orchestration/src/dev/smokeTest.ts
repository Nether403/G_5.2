import path from "node:path";
import { fileURLToPath } from "node:url";
import { MockProvider } from "../providers/mock";
import { runTurn } from "../pipeline/runTurn";
import { logSection } from "../utils/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const canonRoot = path.join(repoRoot, "packages/canon");

  const provider = new MockProvider();

  const result = await runTurn(provider, {
    canonRoot,
    mode: "analytic",
    userMessage: "Why is the Emergence document not governing canon?",
    recentMessages: [],
  });

  logSection("DRAFT", result.draft);
  logSection("CRITIQUE", result.critique);
  logSection("REVISION", result.revision);
  logSection("MEMORY DECISION", JSON.stringify(result.memoryDecision, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
