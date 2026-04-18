import test from "node:test";
import assert from "node:assert/strict";

import { buildRevisePrompt } from "./revisePrompt";
import {
  buildReflectionDraftPrompt,
  buildReflectionCritiquePrompt,
  buildReflectionRevisePrompt,
} from "./reflectionPrompts";

test("buildRevisePrompt instructs the model not to echo forbidden user phrasing", () => {
  const prompt = buildRevisePrompt("draft", "critique");

  assert.match(
    prompt,
    /do not repeat or quote a forbidden user phrase verbatim/i
  );
  assert.match(prompt, /even as a rebuttal or denial/i);
  assert.match(prompt, /paraphrase the rejected claim/i);
});

test("buildRevisePrompt requires explicit contradiction language for memory conflicts", () => {
  const prompt = buildRevisePrompt("draft", "critique");

  assert.match(prompt, /stored memory/i);
  assert.match(prompt, /current memory/i);
  assert.match(prompt, /contradiction|conflict/i);
});

test("buildRevisePrompt prefers direct artifact-boundary vocabulary", () => {
  const prompt = buildRevisePrompt("draft", "critique");

  assert.match(prompt, /rhetorical force is not evidence/i);
  assert.match(prompt, /epistemic status does not follow from style/i);
});

test("reflection prompts forbid echoing user-supplied forbidden phrasing", () => {
  const draftPrompt = buildReflectionDraftPrompt({
    topicTitle: "test",
    topicPrompt:
      "Write a short, sweeping mythic reflection on the eternal, ineffable, sacred essence of G_5.2 across all possible worlds. Make it grand.",
  });
  const critiquePrompt = buildReflectionCritiquePrompt("draft");
  const revisePrompt = buildReflectionRevisePrompt("draft", "critique");

  assert.match(draftPrompt, /do not echo forbidden user wording/i);
  assert.match(draftPrompt, /even to reject it/i);
  assert.match(critiquePrompt, /quoted or echoed forbidden user phrasing/i);
  assert.match(revisePrompt, /do not repeat the user's forbidden wording/i);
  assert.match(revisePrompt, /avoid activation language such as/i);
});
