# V1 Recovery Failure-Injection Rehearsal — 2026-04-21

**Status:** bounded failures recovered but depended on undocumented operator knowledge

## Source

- source repo path: `F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection`
- source commit SHA: `f66d2ab9f10ba9be1e81eff7586581b39d7c2e7e`
- restore ref: `feature/v1-recovery-rehearsal`
- restore ref commit SHA: `6641d090d9af4df7e1f349e7d40826e70070c0ba`
- backup path: `F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection\.local\recovery-failure-injection\2026-04-21-data-backup`
- restore target path: `F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21`
- `.env` handling: reused existing `.env` by copying `F:\ProcessoErgoSum\G_5.2\.env` into the restored clone as operator-local config

## Baseline Restore

- fresh restore target created by local `git clone` because `feature/v1-recovery-rehearsal` is not present on `origin`
- full `data/` backup restored from the main checkout into the fresh clone
- `.\scripts\operator-install.ps1` passed in the restored clone
- `pnpm validate:canon`, `pnpm validate:witness`, and `pnpm typecheck` passed in the restored clone
- one fresh P-E-S session was created in the restored clone:
  - session id: `490b98ea-5ea1-4cbd-99c5-ea32d8baafae`
  - turn id: `f065bdb9-c46f-4eed-9735-45a909d25a4e`
  - provider: `azure`
- one fresh Witness session was created in the restored clone:
  - witness id: `wit-debug-1776515475423`
  - session id: `81f66f35-b751-4e58-8a39-0eaf9427ce6f`
  - turn id: `343d0a14-0994-4db3-a96b-1011b3223d41`
  - testimony id: `6dab7888-b338-4da6-8d3e-b19c907b3f7d`
  - provider: `azure`
- one eval report was generated inside the restored clone using the mock-provider fallback:
  - report path: `packages/evals/reports/eval-report-2026-04-21T07-19-36-321Z.json`
  - provider: `mock`

## Commands Run

```powershell
git -C 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection' status --short --branch
git -C 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection' rev-parse HEAD
git -C 'F:\ProcessoErgoSum\G_5.2' rev-parse v1
New-Item -ItemType Directory -Force -Path 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection\.local\recovery-failure-injection\2026-04-21-data-backup'
robocopy 'F:\ProcessoErgoSum\G_5.2\data' 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection\.local\recovery-failure-injection\2026-04-21-data-backup' /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP

git clone 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection' 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21'
git -C 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21' checkout feature/v1-recovery-rehearsal
Copy-Item -LiteralPath 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection\.local\recovery-failure-injection\2026-04-21-data-backup\data' -Destination 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21' -Recurse -Force
Copy-Item -LiteralPath 'F:\ProcessoErgoSum\G_5.2\.env' -Destination 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\.env' -Force
pwsh -NoProfile -File .\scripts\operator-install.ps1
pnpm validate:canon
pnpm validate:witness
pnpm typecheck

Remove-Item Env:OPENROUTER_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:AZURE_OPENAI_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:AZURE_OPENAI_ENDPOINT -ErrorAction SilentlyContinue
Remove-Item Env:AZURE_OPENAI_DEPLOYMENT -ErrorAction SilentlyContinue
Remove-Item Env:AZURE_OPENAI_API_VERSION -ErrorAction SilentlyContinue
Remove-Item Env:AZURE_OPENAI_FALLBACK_MODEL -ErrorAction SilentlyContinue
Remove-Item Env:EVAL_PROVIDER -ErrorAction SilentlyContinue
pnpm evals -- canon

$env:DASHBOARD_PORT = '5026'
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator-start.ps1
Invoke-RestMethod -Uri 'http://localhost:5026/api/providers'
Invoke-RestMethod -Method Post -Uri 'http://localhost:5026/api/inquiry/turn' -ContentType 'application/json' -Body '{"product":"pes","mode":"dialogic","userMessage":"State the governing canon boundary in one short paragraph."}'
Invoke-RestMethod -Method Post -Uri 'http://localhost:5026/api/inquiry/turn' -ContentType 'application/json' -Body '{"product":"witness","witnessId":"wit-debug-1776515475423","mode":"dialogic","userMessage":"Acknowledge the restored witness record in one paragraph."}'
Invoke-RestMethod -Uri 'http://localhost:5026/api/reports'
Invoke-RestMethod -Uri 'http://localhost:5026/api/reports/eval-report-2026-04-21T07-19-36-321Z.json'

pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator-start.ps1
Stop-Process -Id 29608 -Force
$env:DASHBOARD_PORT = '5000'
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator-start.ps1
Invoke-WebRequest -Uri 'http://localhost:5000/' -UseBasicParsing -TimeoutSec 10

Add-Content -LiteralPath 'packages\canon\manifest.yaml' -Value "`nbroken_yaml: ["
pnpm validate:canon
git checkout HEAD -- packages/canon/manifest.yaml
pnpm validate:canon

New-Item -ItemType Directory -Force -Path 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection\.local\recovery-failure-injection\2026-04-21-data-backup\data\inquiry-sessions'
Copy-Item -LiteralPath 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\data\inquiry-sessions\490b98ea-5ea1-4cbd-99c5-ea32d8baafae.json' -Destination 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection\.local\recovery-failure-injection\2026-04-21-data-backup\data\inquiry-sessions' -Force
$env:DASHBOARD_PORT = '5027'
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator-start.ps1
Invoke-RestMethod -Uri 'http://localhost:5027/api/inquiry/sessions?product=pes'
Invoke-RestMethod -Uri 'http://localhost:5027/api/inquiry/sessions/490b98ea-5ea1-4cbd-99c5-ea32d8baafae?product=pes'
Remove-Item -LiteralPath 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\data\inquiry-sessions\490b98ea-5ea1-4cbd-99c5-ea32d8baafae.json' -Force
Invoke-RestMethod -Uri 'http://localhost:5027/api/inquiry/sessions?product=pes'
Invoke-WebRequest -Uri 'http://localhost:5027/api/inquiry/sessions/490b98ea-5ea1-4cbd-99c5-ea32d8baafae?product=pes' -SkipHttpErrorCheck
Copy-Item -LiteralPath 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection\.local\recovery-failure-injection\2026-04-21-data-backup\data\inquiry-sessions\490b98ea-5ea1-4cbd-99c5-ea32d8baafae.json' -Destination 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\data\inquiry-sessions\490b98ea-5ea1-4cbd-99c5-ea32d8baafae.json' -Force
Invoke-RestMethod -Uri 'http://localhost:5027/api/inquiry/sessions?product=pes'
Invoke-RestMethod -Uri 'http://localhost:5027/api/inquiry/sessions/490b98ea-5ea1-4cbd-99c5-ea32d8baafae?product=pes'

pnpm validate:witness
pnpm typecheck
Invoke-RestMethod -Uri 'http://localhost:5027/api/inquiry/sessions?product=witness'
Invoke-RestMethod -Uri 'http://localhost:5027/api/reports/eval-report-2026-04-21T07-19-36-321Z.json'
```

## Injected Failures

### 1. Port contention

- fault injected:
  - default dashboard port `5000` was already occupied by a lingering `node` listener (`PID 29608`)
- symptom observed:
  - `.\scripts\operator-start.ps1` failed with `EADDRINUSE: address already in use 0.0.0.0:5000`
  - wrapper terminated with `pnpm dashboard failed with exit code 1`
- recovery performed:
  - killed the conflicting listener with `Stop-Process -Id 29608 -Force`
  - reran `.\scripts\operator-start.ps1` on the same default port
- recovery confirmed:
  - wrapper banner again printed `Dashboard URL: http://localhost:5000/`
  - dashboard successfully bound and served on `http://localhost:5000/`

### 2. Canon corruption

- fault injected:
  - appended invalid YAML `broken_yaml: [` to `packages/canon/manifest.yaml` in the restored clone
- symptom observed:
  - `pnpm validate:canon` failed with:
    - `manifest.yaml: YAML parse error`
    - `Flow sequence in block collection must be sufficiently indented and end with a ]`
- recovery performed:
  - restored the file from git with `git checkout HEAD -- packages/canon/manifest.yaml`
- recovery confirmed:
  - rerun `pnpm validate:canon`
  - validation passed cleanly again

### 3. Session deletion

- fault injected:
  - deleted restored P-E-S session file `data/inquiry-sessions/490b98ea-5ea1-4cbd-99c5-ea32d8baafae.json`
- symptom observed:
  - `GET /api/inquiry/sessions?product=pes` returned `[]`
  - direct read returned `404` with body `{"error":"Session not found"}`
- recovery performed:
  - first copied that session JSON into the drill backup root because the original source backup contained no inquiry sessions
  - restored the deleted file from `F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-failure-injection\.local\recovery-failure-injection\2026-04-21-data-backup\data\inquiry-sessions\490b98ea-5ea1-4cbd-99c5-ea32d8baafae.json`
- recovery confirmed:
  - `GET /api/inquiry/sessions?product=pes` again listed session `490b98ea-5ea1-4cbd-99c5-ea32d8baafae`
  - direct session read returned the full restored session payload again

## Final Verification

- `pnpm validate:canon` — pass
- `pnpm validate:witness` — pass
- `pnpm typecheck` — pass
- dashboard start — pass
  - proven on recovered `5000` after the port-conflict fix and on `5027` during the session-deletion step
- normal inquiry/session path — pass
  - P-E-S session `490b98ea-5ea1-4cbd-99c5-ea32d8baafae` remained readable after deletion and restore
- Witness path — pass
  - Witness session `81f66f35-b751-4e58-8a39-0eaf9427ce6f` remained visible and testimony `6dab7888-b338-4da6-8d3e-b19c907b3f7d` remained readable
- eval-report inspection path — pass
  - `GET /api/reports/eval-report-2026-04-21T07-19-36-321Z.json` returned the generated mock report

## Friction and Undocumented Knowledge

- The restore target had to be cloned from the local repo context because `feature/v1-recovery-rehearsal` is not available on `origin`. A strict remote-only rehearsal is not currently possible for this branch-stacked flow.
- In scripted transient runs, killing the wrapper parent process does not reliably kill the child dashboard `node` listener. Manual listener cleanup was required again.
- The original source backup contained only Witness consent/runtime roots and no inquiry sessions. To make the session-deletion fault meaningful, I had to snapshot the newly created P-E-S session into the drill backup root before deleting it. That step was reasonable, but it was not already explicit in the plan or docs.
- The mock eval run generated the required report artifact, but it exited nonzero because the mock report contains expected failing cases. That is fine for report-surface proof, but the operator must understand that “report generation succeeded” and “eval suite passed” are not the same statement.

## Judgment

Bounded failures were recoverable, but the drill still depended on undocumented operator knowledge. The core recovery boundaries worked: git restored canon, backup artifacts restored runtime state, and the dashboard surfaces came back cleanly after each fault. But the branch availability constraint, the child-listener cleanup quirk, and the need to extend the backup root with a fresh session artifact were not yet fully spelled out.

## Next Changes

- clarify in future recovery-failure drills whether the restore ref must exist on `origin` or may be local-branch based
- consider documenting the scripted-start cleanup quirk separately from the normal operator-facing foreground path
- if session-deletion recovery is meant to be a standing drill, define whether the backup root should include a session artifact or a session export bundle before that fault is injected
