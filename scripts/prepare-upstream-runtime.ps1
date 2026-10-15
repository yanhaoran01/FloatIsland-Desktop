param(
  [string]$CacheDirectory = (Join-Path $env:LOCALAPPDATA 'FloatIsland/build-cache/eIsland-26.7.4'),
  [string]$InstallerPath
)

$ErrorActionPreference = 'Stop'
$archiveTool = Get-Command 7z -ErrorAction Stop
$cacheRoot = [IO.Path]::GetFullPath($CacheDirectory)
New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
if (-not $InstallerPath) {
  $InstallerPath = Join-Path $cacheRoot 'eIsland-26.7.4-Setup.exe'
  if (-not (Test-Path -LiteralPath $InstallerPath)) {
    Invoke-WebRequest -Uri 'https://github.com/JNTMTMTM/eIsland/releases/download/v26.7.4/eIsland-26.7.4-Setup.exe' -OutFile $InstallerPath
  }
}
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
$expected = 'E1B239536B76E5EEF47C06AB8224FB047A5063F7C1FEBB75D1FDA7C6DF376702'
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expected) {
  throw 'The installer does not match the pinned eIsland v26.7.4 release.'
}
$installerContents = Join-Path $cacheRoot 'installer'
$application = Join-Path $cacheRoot 'application'
& $archiveTool.Source x $installer "-o$installerContents" '-y' '$PLUGINSDIR/app-64.7z' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not extract the upstream installer.' }
$applicationArchive = Join-Path $installerContents '$PLUGINSDIR/app-64.7z'
& $archiveTool.Source x $applicationArchive "-o$application" '-y' 'resources/*' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not extract the upstream resources.' }
$resources = Join-Path $application 'resources'
if (-not (Test-Path -LiteralPath (Join-Path $resources 'app.asar'))) {
  throw 'The upstream app.asar is missing.'
}
Write-Output $resources
