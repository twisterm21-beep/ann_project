param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^v[0-9]+\.[0-9]+\.[0-9]+$')]
    [string]$Version,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $projectPath
try {
    git rev-parse --verify "refs/tags/$Version" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unknown release: $Version" }
    $siteFiles = @('index.html', 'styles.css', 'script.js', 'VERSION')
    foreach ($siteFile in $siteFiles) {
        git cat-file -e "${Version}:$siteFile"
        if ($LASTEXITCODE -ne 0) { throw "Release is missing $siteFile" }
    }
    if ($CheckOnly) { Write-Output "Release $Version is available. No files changed."; return }
    $dirtyFiles = git status --porcelain
    if ($dirtyFiles) { throw 'Commit or save current changes before restoring a release.' }
    $archiveDir = Join-Path (Split-Path $projectPath -Parent) 'releases'
    New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null
    $archivePath = Join-Path $archiveDir ('before-restore-' + (Get-Date -Format 'yyyyMMdd-HHmmssfff') + '.zip')
    git archive --format=zip "--output=$archivePath" HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Could not archive current release.' }
    git restore "--source=$Version" -- @siteFiles
    if ($LASTEXITCODE -ne 0) { throw 'Restore failed.' }
    git add -- @siteFiles
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 1) {
        git commit -m "Restore site to $Version"
        if ($LASTEXITCODE -ne 0) { throw 'Restored files, but could not commit them.' }
    }
    Write-Output "Local site restored to $Version. Previous release archived at $archivePath. Production was not changed."
} finally { Pop-Location }
