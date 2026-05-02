# start-frontend.ps1 — start the Graft Next.js frontend
# Usage: .\start-frontend.ps1
# Requires: Node 20+, npm

Set-Location $PSScriptRoot

Write-Host "==> Graft Frontend" -ForegroundColor Cyan

# Check .env exists for NEXT_PUBLIC_API_URL
if (-not (Test-Path "apps\web\.env.local")) {
    Write-Host "  Creating apps\web\.env.local with default API URL ..." -ForegroundColor Gray
    Set-Content "apps\web\.env.local" "NEXT_PUBLIC_API_URL=http://localhost:8000"
}

Set-Location "apps\web"

# Install deps if node_modules missing
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing npm dependencies ..." -ForegroundColor Gray
    npm install
}

Write-Host ""
Write-Host "  Starting Next.js dev server on http://localhost:3000 ..." -ForegroundColor Green
Write-Host ""

npm run dev
