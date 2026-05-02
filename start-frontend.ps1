# start-frontend.ps1 - start the Graft Next.js frontend
# Usage: .\start-frontend.ps1
# Requires: Node 20+, npm

Set-Location $PSScriptRoot

Write-Host "==> Graft Frontend" -ForegroundColor Cyan

# Bootstrap apps\web\.env.local from root .env if missing
if (-not (Test-Path "apps\web\.env.local")) {
    Write-Host "  Creating apps\web\.env.local ..." -ForegroundColor Gray
    $rootEnv = if (Test-Path ".env") { Get-Content ".env" -Raw } else { "" }
    function Get-EnvVal($key) {
        if ($rootEnv -match "(?m)^$key\s*=\s*[`"']?([^`"'\r\n]+)[`"']?") { $Matches[1] } else { "" }
    }
    $lines = @(
        "NEXT_PUBLIC_API_URL=http://localhost:8000",
        "",
        "BETTER_AUTH_URL=http://localhost:3000",
        "BETTER_AUTH_SECRET=$(Get-EnvVal 'BETTER_AUTH_SECRET')",
        "",
        "DATABASE_URL=postgresql://graft:graft@localhost:5433/graft",
        "",
        "GOOGLE_CLIENT_ID=$(Get-EnvVal 'GOOGLE_CLIENT_ID')",
        "GOOGLE_CLIENT_SECRET=$(Get-EnvVal 'GOOGLE_CLIENT_SECRET')",
        "",
        "GITHUB_CLIENT_ID=$(Get-EnvVal 'GITHUB_CLIENT_ID')",
        "GITHUB_CLIENT_SECRET=$(Get-EnvVal 'GITHUB_CLIENT_SECRET')"
    )
    $lines -join "`n" | Set-Content "apps\web\.env.local" -Encoding utf8
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
