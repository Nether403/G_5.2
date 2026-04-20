# G_5.2 Operator Quickstart

Supported Windows-first bootstrap path for the v1 release line.

## Supported shell

- PowerShell 7+ preferred
- Windows PowerShell 5.1 supported

If script execution is blocked on your host, run the wrapper with a
process-local bypass:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator-install.ps1
```

## Prerequisites

- Node `>=20`
- pnpm `>=9`
- git

## First install

```powershell
Copy-Item .env.example .env
.\scripts\operator-install.ps1
```

`.env` is optional at start time; the wrapper warns when it is missing, and
explicit process environment variables take precedence over `.env` defaults.

## Start

```powershell
.\scripts\operator-start.ps1
```

## Update an existing checkout

```powershell
git pull
.\scripts\operator-install.ps1
.\scripts\operator-start.ps1
```

## What to expect

Both wrappers print the current short SHA, the declared `v1` SHA when available,
and the release identity state before continuing.

To confirm this checkout is exactly `v1`, compare the current short SHA to the
declared `v1` SHA printed by the wrappers. They must match.

Use `docs/operator-handbook.md` next for day-to-day operator workflows.
