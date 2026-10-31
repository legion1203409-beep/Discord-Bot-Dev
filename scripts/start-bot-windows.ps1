$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $repoRoot ".env.local"
$exampleFile = Join-Path $repoRoot ".env.local.example"

Set-Location $repoRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js 20.6 or newer is required. Install Node.js, then reopen PowerShell."
  exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Error "pnpm is required. Enable it with Corepack or install pnpm, then reopen PowerShell."
  exit 1
}

if (-not (Test-Path $envFile)) {
  Copy-Item $exampleFile $envFile
  Write-Host "Created .env.local. Fill DATABASE_URL and DISCORD_TOKEN, then run this command again."
  exit 1
}

$checkEnv = 'const missing = ["DATABASE_URL", "DISCORD_TOKEN"].filter((key) => !process.env[key]?.trim()); if (missing.length) { console.error("Missing values in .env.local: " + missing.join(", ")); process.exit(1); }'
& node "--env-file=$envFile" -e $checkEnv
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "This process will connect to the database configured in .env.local."
Write-Host "If that is the production database, bot actions will change live game data."
$liveDataConfirmation = Read-Host "Continue? (type YES)"
if ($liveDataConfirmation -cne "YES") {
  Write-Host "Cancelled."
  exit 0
}

Write-Warning "Stop the Replit VM deployment before starting the local bot to avoid duplicate instances."
$deploymentConfirmation = Read-Host "Have you stopped the Replit deployment? (type YES)"
if ($deploymentConfirmation -cne "YES") {
  Write-Host "Cancelled. Stop the deployment first."
  exit 0
}

$env:NODE_ENV = "development"
$env:DISCORD_BOT_IN_DEVELOPMENT = "true"
$env:HOST = "127.0.0.1"
$env:PORT = "8080"

pnpm --filter @workspace/api-server run build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Starting the bot and local API. Press Ctrl+C to stop."
& node "--env-file=$envFile" --enable-source-maps "artifacts/api-server/dist/index.mjs"
exit $LASTEXITCODE
