# V1 Recovery Rehearsal — 2026-04-21

**Status:** succeeded from documented artifacts alone

## Source

- source repo path: `F:\ProcessoErgoSum\G_5.2`
- source commit SHA: `9a27a4a17703aedd0409852766c1b34397d89084`
- restore ref: `master`
- backup path: `F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-rehearsal\.local\recovery-rehearsal\2026-04-21-data-backup`
- restore target path: `F:\ProcessoErgoSum\G_5.2-recovery-rehearsal-2026-04-21`
- `.env` handling: reused existing `.env` by copying it into the restored clone as operator-local config
- declared `v1` SHA reported by wrappers: `6d34089`
- local `v1` tag SHA in the source checkout: `b044c7b512ae61154c8b840ba4740fd68db137f4`

## Commands run

```powershell
git -C 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-rehearsal' status --short --branch
git -C 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-rehearsal' rev-parse HEAD
git -C 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-rehearsal' rev-parse refs/tags/v1
New-Item -ItemType Directory -Force -Path 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-rehearsal\.local\recovery-rehearsal\2026-04-21-data-backup' | Out-Null
Copy-Item -LiteralPath 'F:\ProcessoErgoSum\G_5.2\data' -Destination 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-rehearsal\.local\recovery-rehearsal\2026-04-21-data-backup' -Recurse -Force

if (Test-Path 'F:\ProcessoErgoSum\G_5.2-recovery-rehearsal-2026-04-21') {
  Remove-Item -LiteralPath 'F:\ProcessoErgoSum\G_5.2-recovery-rehearsal-2026-04-21' -Recurse -Force
}
git clone . 'F:\ProcessoErgoSum\G_5.2-recovery-rehearsal-2026-04-21'
git -C 'F:\ProcessoErgoSum\G_5.2-recovery-rehearsal-2026-04-21' checkout master
git -C 'F:\ProcessoErgoSum\G_5.2-recovery-rehearsal-2026-04-21' rev-parse HEAD
Test-Path 'F:\ProcessoErgoSum\G_5.2-recovery-rehearsal-2026-04-21\data'

Copy-Item -LiteralPath 'F:\ProcessoErgoSum\G_5.2\.worktrees\v1-recovery-rehearsal\.local\recovery-rehearsal\2026-04-21-data-backup\data' -Destination 'F:\ProcessoErgoSum\G_5.2-recovery-rehearsal-2026-04-21' -Recurse -Force
Copy-Item -LiteralPath 'F:\ProcessoErgoSum\G_5.2\.env' -Destination 'F:\ProcessoErgoSum\G_5.2-recovery-rehearsal-2026-04-21\.env' -Force

pnpm validate:canon
pnpm validate:witness
pnpm typecheck
pwsh -NoProfile -File .\scripts\operator-install.ps1

$env:DASHBOARD_PORT = '5024'
$proc = Start-Process pwsh -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','.\\scripts\\operator-start.ps1' -WorkingDirectory 'F:\ProcessoErgoSum\G_5.2-recovery-rehearsal-2026-04-21' -RedirectStandardOutput '.local\recovery-start-5024.stdout.log' -RedirectStandardError '.local\recovery-start-5024.stderr.log' -PassThru
Invoke-WebRequest -Uri 'http://localhost:5024/' -UseBasicParsing -TimeoutSec 10
Invoke-WebRequest -Uri 'http://localhost:5024/inquiry.html' -UseBasicParsing -TimeoutSec 10
Invoke-RestMethod -Uri 'http://localhost:5024/api/reports' -TimeoutSec 10
Invoke-RestMethod -Uri 'http://localhost:5024/api/reports/eval-report-2026-04-20T22-32-47-983Z.json' -TimeoutSec 10
Invoke-RestMethod -Uri 'http://localhost:5024/api/inquiry/sessions?product=pes' -TimeoutSec 10
Invoke-RestMethod -Uri 'http://localhost:5024/api/inquiry/sessions/b91627b8-16eb-46c1-b9d2-be25d7aecdef' -TimeoutSec 10
Invoke-RestMethod -Uri 'http://localhost:5024/api/inquiry/sessions?product=witness' -TimeoutSec 10
Invoke-RestMethod -Uri 'http://localhost:5024/api/witness/consent?witnessId=wit-debug-1776515475423' -TimeoutSec 10
Invoke-RestMethod -Uri 'http://localhost:5024/api/witness/testimony?witnessId=wit-debug-1776515475423' -TimeoutSec 10
Stop-Process -Id 27836 -Force
```

## Verification results

- `pnpm validate:canon` — pass
- `pnpm validate:witness` — pass
- `pnpm typecheck` — pass
- `.\scripts\operator-install.ps1` — pass
- `.\scripts\operator-start.ps1` — pass
- normal inquiry path — pass
- Witness path — pass
- eval-report inspection path — pass

## Observed evidence

- restore clone commit: `9a27a4a17703aedd0409852766c1b34397d89084`
- `operator-install.ps1` output reported:
  - current SHA `9a27a4a`
  - declared `v1` SHA `6d34089`
  - release identity `Local v1 tag exists but does not match this checkout.`
- `operator-start.ps1` output reported:
  - dashboard URL `http://localhost:5024/`
- normal inquiry proof:
  - `GET /api/inquiry/sessions?product=pes` returned session `b91627b8-16eb-46c1-b9d2-be25d7aecdef`
  - `GET /api/inquiry/sessions/b91627b8-16eb-46c1-b9d2-be25d7aecdef` returned the restored turn with user message `What is the governing canon boundary for this system?`
- Witness proof:
  - `GET /api/inquiry/sessions?product=witness` returned session `de838e33-c878-4619-b1da-33854af188ed`
  - `GET /api/witness/consent?witnessId=wit-debug-1776515475423` returned both `conversational=granted` and `retention=granted`
  - `GET /api/witness/testimony?witnessId=wit-debug-1776515475423` returned testimony `3dc93e39-48d0-4182-92ca-464915889618` in state `retained`
- eval-report proof:
  - `GET /api/reports` returned `eval-report-2026-04-20T22-32-47-983Z.json`
  - `GET /api/reports/eval-report-2026-04-20T22-32-47-983Z.json` returned the restored report payload for commit `9a27a4a17703aedd0409852766c1b34397d89084`

## Friction and undocumented knowledge

- The execution worktree did not contain ignored runtime state, so the backup source for `data/` had to be the main checkout at `F:\ProcessoErgoSum\G_5.2\data`. This did not affect the restore boundary, but it is worth recording because rehearsals run from a git worktree do not automatically include ignored runtime roots.
- On a fresh clone, `pnpm validate:canon`, `pnpm validate:witness`, and `pnpm typecheck` fail until dependencies are installed. The supported operator path already includes `.\scripts\operator-install.ps1`, but `docs/recovery-and-backups.md` needed a clearer post-restore sequence so this does not look like a recovery failure.
- For a bounded scripted probe, stopping the wrapper parent process did not reliably stop the child dashboard `node` listener. The operator-facing foreground path is still fine; this only matters for scripted transient verification.

## Judgment

The restore succeeded from documented artifacts alone. A fresh clone plus the captured `data/` backup was enough to recover the system, and the restored dashboard served normal inquiry, Witness, and eval-report surfaces correctly. The drill did expose one documentation sequencing gap, but not a missing hidden step.

## Next changes

- clarify the post-restore order in `docs/recovery-and-backups.md` so fresh-clone restores run `.\scripts\operator-install.ps1` before validation commands
- keep failure injection for the next rehearsal pass
