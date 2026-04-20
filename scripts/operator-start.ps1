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
  "pnpm-lock.yaml",
  "apps/dashboard/src/server.ts",
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

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules"))) {
  throw "Dependencies do not appear to be installed. Run .\scripts\operator-install.ps1 first."
}

Push-Location $repoRoot
try {
  $releaseIdentityScript = @"
import { gitSha, readDeclaredV1ReleaseSha, shortSha, summarizeReleaseIdentity } from './scripts/operator-support.mjs';

const repoRoot = process.cwd();
const headSha = gitSha(repoRoot, 'HEAD');

if (!headSha) {
  throw new Error('Unable to resolve HEAD SHA. Confirm this checkout has git metadata available.');
}

const declaredV1Sha = await readDeclaredV1ReleaseSha(repoRoot);
const localTagSha = gitSha(repoRoot, 'refs/tags/v1');
const summary = summarizeReleaseIdentity({ headSha, declaredV1Sha, localTagSha });
summary.headShortSha = shortSha(headSha);
summary.declaredV1ShortSha = shortSha(declaredV1Sha);

process.stdout.write(JSON.stringify(summary));
"@

  $identityJson = Invoke-NativeCapture `
    -Description "Release identity lookup" `
    -FilePath "node" `
    -ArgumentList @("--input-type=module", "-e", $releaseIdentityScript)

  $identity = $identityJson | ConvertFrom-Json

  $envPath = Join-Path $repoRoot ".env"
  if (Test-Path -LiteralPath $envPath) {
    $loadEnvScript = @"
import { applyEnvDefaults, readDotEnvFile } from './scripts/operator-support.mjs';

const parsed = await readDotEnvFile(process.argv[1]);
const merged = applyEnvDefaults(process.env, parsed);
process.stdout.write(JSON.stringify(merged));
"@

    $envJson = Invoke-NativeCapture `
      -Description ".env parsing" `
      -FilePath "node" `
      -ArgumentList @("--input-type=module", "-e", $loadEnvScript, $envPath)

    $parsedEnv = $envJson | ConvertFrom-Json
    if ($parsedEnv) {
      foreach ($property in $parsedEnv.PSObject.Properties) {
        [Environment]::SetEnvironmentVariable(
          $property.Name,
          [string]$property.Value,
          "Process"
        )
      }
    }
  } else {
    Write-Warning ".env not found. Dashboard can still start, but live provider calls may be unavailable."
  }

  $dashboardPort = if ($env:DASHBOARD_PORT) { $env:DASHBOARD_PORT } else { "5000" }

  Write-Host "Current SHA: $($identity.headShortSha)"
  if ($identity.declaredV1ShortSha) {
    Write-Host "Declared v1 SHA: $($identity.declaredV1ShortSha)"
  }
  Write-Host "Release identity: $($identity.message)"
  Write-Host "Dashboard URL: http://localhost:$dashboardPort/"
  Write-Host ""

  Invoke-NativeCommand -Description "pnpm dashboard" -FilePath "pnpm" -ArgumentList @("dashboard")
}
finally {
  Pop-Location
}
