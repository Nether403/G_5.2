# G_5.2

G_5.2 is a structured inquiry system built around a versioned authored persona.

This repository is organized around a canon-first architecture:
- **canon** defines identity
- **orchestration** builds responses
- **memory** is selective
- **outputs** require explicit promotion to become canon

The first goal is coherence, not theatrical complexity.

---

## What this is

G_5.2 is not a freeform roleplay chatbot.
It is a runtime for a maintained, versioned persona with:
- a canonical identity layer
- retrieval over canon and prior reflections
- multi-pass response generation (draft → critique → revision)
- explicit continuity rules
- auditable revision and memory flows

---

## Repository structure

```
G_5.2/
├─ packages/
│  ├─ canon/              # source-of-truth identity layer
│  ├─ orchestration/      # response pipeline (commit 2)
│  ├─ db/                 # schema, migrations (commit 2)
│  ├─ evals/              # eval harness (commit 2)
│  └─ shared/             # types, utils (commit 2)
│
├─ apps/
│  └─ web/                # inquiry + archive UI (commit 3)
│
├─ docs/
│  ├─ product-brief.md
│  └─ decision-log/
│
├─ AGENTS.md
└─ README.md
```

---

## Related projects

G_5.2 shares origins with [The Witness Protocol Foundation](https://thewprotocol.online) and the [P-E-S archive](https://processoergosum.info). See `docs/product-brief.md` and `continuity-facts.yaml` (CF-035) for the full lineage.

---

## Canon-first

The `packages/canon` directory is committed first, before orchestration or UI.
The persona must be reconstructible from files, not from folklore.

See `packages/canon/README.md` for governance rules.
See `AGENTS.md` for implementation constraints.
