$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Description,

    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter()]
    [string[]]$ArgumentList = @()
  )

  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Invoke-NativeCapture {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Description,

    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter()]
    [string[]]$ArgumentList = @()
  )

  $output = & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }

  return ($output -join [Environment]::NewLine).Trim()
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$requiredPaths = @(
  "package.json",
  "README.md",
  "docs/operator-handbook.md",
  "packages/canon/changelog/0004-v1-release-gate.md",
  "scripts/operator-support.mjs"
)

foreach ($relativePath in $requiredPaths) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath)) {
    throw "Derived repo root is invalid. Missing required path: $relativePath"
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Missing prerequisite: node"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Missing prerequisite: git"
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw "Missing prerequisite: pnpm"
}

Push-Location $repoRoot
try {
  $releaseIdentityScript = @"
import { gitSha, readDeclaredV1ReleaseSha, summarizeReleaseIdentity } from "./scripts/operator-support.mjs";

const repoRoot = process.cwd();
const headSha = gitSha(repoRoot, "HEAD");

if (!headSha) {
  throw new Error("Unable to resolve HEAD SHA. Confirm this checkout has git metadata available.");
}

const declaredV1Sha = await readDeclaredV1ReleaseSha(repoRoot);
const localTagSha = gitSha(repoRoot, "refs/tags/v1");
const summary = summarizeReleaseIdentity({ headSha, declaredV1Sha, localTagSha });

process.stdout.write(JSON.stringify(summary));
"@

  $identityJson = Invoke-NativeCapture `
    -Description "Release identity lookup" `
    -FilePath "node" `
    -ArgumentList @("--input-type=module", "-e", $releaseIdentityScript)

  $identity = $identityJson | ConvertFrom-Json

  $steps = @(
    @{ Label = "pnpm install"; Arguments = @("install") },
    @{ Label = "pnpm validate:canon"; Arguments = @("validate:canon") },
    @{ Label = "pnpm validate:witness"; Arguments = @("validate:witness") },
    @{ Label = "pnpm typecheck"; Arguments = @("typecheck") },
    @{ Label = "pnpm test"; Arguments = @("test") },
    @{ Label = "pnpm smoke"; Arguments = @("smoke") }
  )

  foreach ($step in $steps) {
    Write-Host "==> $($step.Label)"
    Invoke-NativeCommand -Description $step.Label -FilePath "pnpm" -ArgumentList $step.Arguments
  }

  Write-Host ""
  Write-Host "Operator install succeeded."
  Write-Host "Current SHA: $($identity.headSha)"
  if ($identity.declaredV1Sha) {
    Write-Host "Declared v1 SHA: $($identity.declaredV1Sha)"
  }
  Write-Host "Release identity: $($identity.message)"
}
finally {
  Pop-Location
}
