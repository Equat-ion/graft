# start-backend.ps1 - start the Graft FastAPI backend
# Usage: .\start-backend.ps1
# Requires: Python 3.11+, PostgreSQL running, .env at repo root

Set-Location $PSScriptRoot

Write-Host "==> Graft Backend" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
    Write-Host "  [WARN] .env not found - copying from .env.example" -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "  Edit .env and add your LLM_API_KEY, then re-run." -ForegroundColor Yellow
    exit 1
}

# Validate DATABASE_URL uses asyncpg driver
$envContent = Get-Content ".env" -Raw
if ($envContent -match 'DATABASE_URL\s*=\s*postgresql://') {
    Write-Host ""
    Write-Host "  [ERROR] DATABASE_URL uses 'postgresql://' — must be 'postgresql+asyncpg://'" -ForegroundColor Red
    Write-Host "  Fix your .env:" -ForegroundColor Red
    Write-Host "    DATABASE_URL=postgresql+asyncpg://graft:graft@localhost:5432/graft" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$venvPy = "apps\agent\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "  Creating virtualenv in apps\agent\.venv ..." -ForegroundColor Gray
    python -m venv "apps\agent\.venv"
}

Write-Host "  Installing / syncing dependencies ..." -ForegroundColor Gray
& "apps\agent\.venv\Scripts\pip.exe" install -q -e "apps\agent[dev]"
# psycopg2-binary is needed by Alembic's sync migration runner
& "apps\agent\.venv\Scripts\pip.exe" install -q psycopg2-binary asyncpg

Write-Host "  Running Alembic migrations ..." -ForegroundColor Gray
$env:PYTHONPATH = "$PSScriptRoot\apps\agent"
& "apps\agent\.venv\Scripts\alembic.exe" --config "apps\agent\alembic.ini" upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  [ERROR] Migrations failed — is PostgreSQL running?" -ForegroundColor Red
    Write-Host "  Check DATABASE_URL in .env and ensure postgres is up." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "  Starting uvicorn on http://localhost:8000 ..." -ForegroundColor Green
Write-Host "  Docs: http://localhost:8000/docs" -ForegroundColor Gray
Write-Host ""

$env:PYTHONPATH = "$PSScriptRoot\apps\agent"
$uvicorn = "apps\agent\.venv\Scripts\uvicorn.exe"
& $uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir "apps\agent\backend"
