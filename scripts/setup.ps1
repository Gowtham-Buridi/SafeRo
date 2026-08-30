# SafeRo Setup Script (PowerShell)
# Run from the project root: .\scripts\setup.ps1

Write-Host "=== SafeRo Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

$nodeVersion = node --version 2>$null
if (-not $nodeVersion) { Write-Host "ERROR: Node.js not found" -ForegroundColor Red; exit 1 }
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

$pythonVersion = py --version 2>$null
if (-not $pythonVersion) { Write-Host "ERROR: Python not found" -ForegroundColor Red; exit 1 }
Write-Host "  Python: $pythonVersion" -ForegroundColor Green

$gitVersion = git --version 2>$null
if (-not $gitVersion) { Write-Host "ERROR: Git not found" -ForegroundColor Red; exit 1 }
Write-Host "  Git: $gitVersion" -ForegroundColor Green

Write-Host ""

# Copy .env if not exists
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example" -ForegroundColor Green
} else {
    Write-Host ".env already exists" -ForegroundColor Yellow
}

# Install Node.js dependencies
Write-Host ""
Write-Host "Installing Node.js dependencies..." -ForegroundColor Yellow
npm install

# Setup Python ML environment
Write-Host ""
Write-Host "Setting up Python ML environment..." -ForegroundColor Yellow
Push-Location ml
if (-not (Test-Path ".venv")) {
    py -m venv .venv
    Write-Host "Created Python virtual environment" -ForegroundColor Green
}
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\pip install -e ".[dev]"
Pop-Location

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Start PostgreSQL:  docker compose up -d" -ForegroundColor White
Write-Host "  2. Start API:         npm run dev:api" -ForegroundColor White
Write-Host "  3. Start Frontend:    npm run dev:web" -ForegroundColor White
