export function decideMemory(finalText: string) {
  const candidates: string[] = [];

  if (/prefer|decision|agreed|future/i.test(finalText)) {
    candidates.push("Contains possible durable preference or decision.");
  }

  return {
    shouldStore: candidates.length > 0,
    reason: candidates.length
      ? "Potential durable information detected."
      : "No obvious durable memory candidate.",
    candidates,
  };
}
