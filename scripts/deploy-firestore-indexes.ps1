Param(
  [string]$ProjectId = "laptopmanager-49103",
  [string]$IndexesJsonPath = "firestore.indexes.json"
)

Write-Host "=== Deploy Firestore Indexes ===" -ForegroundColor Cyan

# Ensure working directory is the repo root where firestore.indexes.json lives
try {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  Set-Location (Join-Path $scriptDir "..")
} catch {
  Write-Host "Warning: could not change directory. Continuing in current location..." -ForegroundColor Yellow
}

# Check Firebase CLI
function Ensure-FirebaseCLI {
  Write-Host "Checking firebase-tools installation..." -ForegroundColor Cyan
  $firebaseVersion = $null
  try {
    $firebaseVersion = (& firebase --version) 2>$null
  } catch {
    $firebaseVersion = $null
  }
  if (-not $firebaseVersion) {
    Write-Host "firebase-tools not found. Installing globally via npm..." -ForegroundColor Yellow
    npm i -g firebase-tools
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to install firebase-tools via npm."
    }
  } else {
    Write-Host "firebase-tools version: $firebaseVersion" -ForegroundColor Green
  }
}

# Validate index JSON
function Validate-IndexesJson {
  Write-Host "Validating indexes JSON at '$IndexesJsonPath'..." -ForegroundColor Cyan
  if (-not (Test-Path $IndexesJsonPath)) {
    throw "Indexes file not found at '$IndexesJsonPath'"
  }
  try {
    $json = Get-Content $IndexesJsonPath -Raw | ConvertFrom-Json
    $count = ($json.indexes | Measure-Object).Count
    Write-Host "Indexes JSON is valid. Found $count indexes." -ForegroundColor Green
  } catch {
    throw "Invalid JSON in '$IndexesJsonPath': $($_.Exception.Message)"
  }
}

# Login and select project
function Ensure-FirebaseLoginAndProject {
  Write-Host "Starting 'firebase login' (answer the Gemini prompt as you prefer)..." -ForegroundColor Cyan
  firebase login
  if ($LASTEXITCODE -ne 0) {
    throw "Firebase login failed. Please retry."
  }
  Write-Host "Selecting project '$ProjectId'..." -ForegroundColor Cyan
  firebase use $ProjectId
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to select project '$ProjectId'"
  }
}

# Deploy indexes
function Deploy-Indexes {
  Write-Host "Deploying Firestore indexes from '$IndexesJsonPath'..." -ForegroundColor Cyan
  firebase deploy --only firestore:indexes
  if ($LASTEXITCODE -ne 0) {
    throw "Firestore indexes deploy failed."
  }
}

try {
  Ensure-FirebaseCLI
  Validate-IndexesJson
  Ensure-FirebaseLoginAndProject
  Deploy-Indexes
  Write-Host "Success: Firestore indexes deployed." -ForegroundColor Green
  Write-Host 'It may take 1-3 minutes to become READY.' -ForegroundColor Yellow
  $indexesUrl = "https://console.firebase.google.com/project/$ProjectId/firestore/indexes"
  Write-Host ('Open: ' + $indexesUrl) -ForegroundColor Cyan
  try {
    Start-Process $indexesUrl | Out-Null
  } catch {
    Write-Host "Could not auto-open browser. Please visit the URL above." -ForegroundColor Yellow
  }
} catch {
  Write-Host ('Error: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}