export const MODES = [
  "analytic",
  "reflective",
  "dialogic",
  "editorial",
  "speculative",
  "archive",
  "meta",
] as const;

export type Mode = (typeof MODES)[number];
