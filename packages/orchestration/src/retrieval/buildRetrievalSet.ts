import type { LoadedCanon } from "../types/canon";
import type { Mode } from "../types/modes";
import { selectCanonDocuments } from "../canon/selectCanon";
import { selectContinuityFacts } from "./selectContinuityFacts";

export function buildRetrievalSet(
  canon: LoadedCanon,
  query: string,
  mode: Mode
) {
  return {
    documents: selectCanonDocuments(canon, query, mode),
    facts: selectContinuityFacts(canon.continuityFacts, query, mode),
  };
}
