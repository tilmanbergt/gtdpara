<#
.SYNOPSIS
  Builds and publishes a gtdpara release.
  Design: docs/dev/technical-design-versioning-release.md (3.6); checklist: docs/dev/RELEASING.md

.EXAMPLE
  ./scripts/release.ps1 -Version 0.1.0          # first release
  ./scripts/release.ps1 -Bump patch             # 0.1.0 -> 0.1.1
  ./scripts/release.ps1 -Bump minor -DryRun     # show what would happen, change nothing
#>
param(
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Bump,
    [string]$Version,
    [switch]$DryRun
)

# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less files as ANSI.

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$gen = Join-Path $root 'scripts\gen-bundled-content.mjs'
$committed = $false
$tagged = $false
$newVersion = ''

function Write-Step([string]$msg) { Write-Host ''; Write-Host "=== $msg ===" -ForegroundColor Cyan }
function Write-Info([string]$msg) { Write-Host $msg -ForegroundColor Gray }

function Show-Undo {
    if ($tagged) { Write-Host "  git tag -d v$newVersion" -ForegroundColor Yellow }
    if ($committed) { Write-Host '  git reset --hard HEAD~1' -ForegroundColor Yellow }
    elseif (-not $DryRun) { Write-Host '  git checkout -- package.json PluginConfig.json CHANGELOG.md' -ForegroundColor Yellow }
}

function Stop-Release([string]$msg) {
    Write-Host ''
    Write-Host "STOPPED: $msg" -ForegroundColor Red
    if ($committed -or $tagged -or $script:changedFiles) {
        Write-Host 'To undo what this run changed:' -ForegroundColor Yellow
        Show-Undo
    }
    exit 1
}

function Confirm-Yes([string]$question) {
    $answer = Read-Host "$question (y/N)"
    return ($answer -eq 'y' -or $answer -eq 'Y' -or $answer -eq 'j' -or $answer -eq 'J')
}

$script:changedFiles = $false

# ---------------------------------------------------------------- 1. checks
Write-Step '1. Checks'

if (($Bump -and $Version) -or (-not $Bump -and -not $Version)) {
    Stop-Release 'use exactly one of -Bump patch|minor|major or -Version x.y.z'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-Release 'Node.js not found' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Stop-Release 'git not found' }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') { Stop-Release "you are on branch '$branch', releases are made from 'main'" }

$status = git status --porcelain
if ($status) {
    Write-Host ($status -join "`n")
    Stop-Release 'uncommitted changes - commit or stash them first'
}

if ($Bump) {
    $newVersion = (& node $gen --next-version $Bump)
    if ($LASTEXITCODE -ne 0) { Stop-Release 'could not compute the next version' }
    $newVersion = "$newVersion".Trim()
} else {
    $newVersion = $Version.Trim()
}
if ($newVersion -notmatch '^\d+\.\d+\.\d+$') { Stop-Release "'$newVersion' is not a x.y.z version" }

if (git tag -l "v$newVersion") { Stop-Release "tag v$newVersion already exists" }

& node $gen --check-release $newVersion
if ($LASTEXITCODE -ne 0) { Stop-Release 'CHANGELOG.md is not ready (see above)' }

$ghOk = $false
if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh auth status 2>$null | Out-Null
    $ghOk = ($LASTEXITCODE -eq 0)
    if (-not $ghOk) { Write-Host 'GitHub CLI found but not logged in (gh auth login) - publishing will be manual.' -ForegroundColor Yellow }
} else {
    Write-Host 'GitHub CLI (gh) not found - publishing will be manual. Install: winget install GitHub.cli' -ForegroundColor Yellow
}

Write-Host "Releasing gtdpara $newVersion" -ForegroundColor Green
if ($DryRun) { Write-Host 'DRY RUN - nothing will be changed.' -ForegroundColor Yellow }

# ---------------------------------------------------------------- 2+3. version + changelog
Write-Step '2. Version and changelog'
$today = Get-Date -Format 'yyyy-MM-dd'
if ($DryRun) {
    Write-Info "[dry run] would set version $newVersion in package.json and PluginConfig.json"
    Write-Info "[dry run] would rename CHANGELOG [Unreleased] -> [$newVersion] - $today"
} else {
    $script:changedFiles = $true
    & node $gen --set-version $newVersion
    if ($LASTEXITCODE -ne 0) { Stop-Release 'setting the version failed' }
    & node $gen --stamp-changelog $newVersion $today
    if ($LASTEXITCODE -ne 0) { Stop-Release 'stamping CHANGELOG.md failed' }
}

# ---------------------------------------------------------------- 4. code checks
Write-Step '3. Type check and tests'
$tscOut = & npx tsc --noEmit 2>&1
$tscErrors = @($tscOut | Select-String -Pattern 'error TS').Count
if ($tscErrors -gt 0) {
    $tscOut | Select-String -Pattern 'error TS' | Select-Object -First 20 | ForEach-Object { Write-Host $_.Line }
    Write-Host "tsc: $tscErrors error(s) - a release should have none (docs/dev/DEVELOPMENT-POLICY.md section 7)." -ForegroundColor Yellow
    if (-not (Confirm-Yes 'Continue anyway?')) { Stop-Release 'type check failed' }
} else {
    Write-Host 'tsc: no errors' -ForegroundColor Green
}

& node (Join-Path $root 'scripts\test-versioning.mjs')
if ($LASTEXITCODE -ne 0) { Stop-Release 'scripts/test-versioning.mjs failed' }
& node (Join-Path $root 'scripts\test-userdocs.mjs')
if ($LASTEXITCODE -ne 0) { Stop-Release 'scripts/test-userdocs.mjs failed (help pages)' }

Write-Info 'Running the Jest tests. Expected at the end: "Tests: N passed" and no "failed".'
Write-Info 'Log lines or warnings printed while tests run are normal (some tests simulate errors on purpose).'
& npx jest --passWithNoTests
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Jest: some tests FAILED - look for "FAIL" and the red marks above. Do not publish a release with failing tests.' -ForegroundColor Red
    if (-not (Confirm-Yes 'Jest tests failed. Continue anyway?')) { Stop-Release 'tests failed' }
} else {
    Write-Host 'Jest: all tests passed - anything printed above the summary is expected output.' -ForegroundColor Green
}

# ---------------------------------------------------------------- 5. commit + tag
Write-Step '4. Commit and tag'
if ($DryRun) {
    Write-Info "[dry run] git commit -am 'Release $newVersion'"
    Write-Info "[dry run] git tag -a v$newVersion -m 'gtdpara $newVersion'"
} else {
    git commit -am "Release $newVersion"
    if ($LASTEXITCODE -ne 0) { Stop-Release 'git commit failed' }
    $committed = $true
    git tag -a "v$newVersion" -m "gtdpara $newVersion"
    if ($LASTEXITCODE -ne 0) { Stop-Release 'git tag failed' }
    $tagged = $true
}

# ---------------------------------------------------------------- 6. build
Write-Step '5. Build'
$snplg = Join-Path $root "build\outputs\gtdpara-$newVersion.snplg"
if ($DryRun) {
    Write-Info '[dry run] ./buildPlugin.ps1'
} else {
    $startedAt = Get-Date
    & (Join-Path $root 'buildPlugin.ps1')
    $infoPath = Join-Path $root 'build\build-info.json'
    if (-not (Test-Path $infoPath)) { Stop-Release 'build/build-info.json missing - the build did not run' }
    $info = Get-Content $infoPath -Raw | ConvertFrom-Json
    if (-not $info.release -or $info.version -ne $newVersion) {
        Stop-Release "the build is not a clean release build (label: $($info.label))"
    }
    if (-not (Test-Path $snplg) -or (Get-Item $snplg).LastWriteTime -lt $startedAt) {
        Stop-Release "package $snplg was not produced by this build"
    }
    Write-Host "Built $snplg (build $($info.versionCode))" -ForegroundColor Green
}

# ---------------------------------------------------------------- 7. device test
Write-Step '6. Device test'
Write-Host "Install $snplg on the Supernote OVER the previous release and go through docs/dev/RELEASING.md."
if ($DryRun) {
    Write-Info '[dry run] would ask: Publish?'
    Write-Host ''
    Write-Host 'Dry run finished. Nothing was changed.' -ForegroundColor Green
    exit 0
}
if (-not (Confirm-Yes "Publish gtdpara $newVersion to GitHub?")) {
    Write-Host ''
    Write-Host 'Not published. The release commit and tag exist only locally.' -ForegroundColor Yellow
    Write-Host 'Publish later by running the commands of step 7 by hand, or undo with:' -ForegroundColor Yellow
    Show-Undo
    exit 0
}

# ---------------------------------------------------------------- 8. publish
Write-Step '7. Publish'
git push origin main --follow-tags
if ($LASTEXITCODE -ne 0) { Stop-Release 'git push failed (nothing published yet on GitHub Releases)' }

$notes = Join-Path $root "build\release-notes-$newVersion.md"
& node $gen --release-notes $newVersion $notes
if ($LASTEXITCODE -ne 0) { Stop-Release 'extracting release notes failed' }

if ($ghOk) {
    gh release create "v$newVersion" $snplg --title "gtdpara $newVersion" --notes-file $notes
    if ($LASTEXITCODE -ne 0) { Stop-Release 'gh release create failed - create the release by hand (see below)' }
    Write-Host ''
    Write-Host "Released gtdpara $newVersion." -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host 'Create the GitHub release by hand:' -ForegroundColor Yellow
    Write-Host "  1. Open https://github.com/tilmanbergt/gtdpara/releases/new?tag=v$newVersion"
    Write-Host "  2. Title: gtdpara $newVersion"
    Write-Host "  3. Description: paste $notes"
    Write-Host "  4. Attach $snplg and publish"
}
Write-Host 'Then: update the Reddit thread / InkHub listing if this release matters to users.'
