param(
  [string]$Profile = 'desktop',
  [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh'),
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
if ($Profile -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Invalid profile name.' }
$profileRoot = Join-Path $DshHome "profiles\$Profile"
$patchFile = Join-Path $profileRoot 'cordis.patch.yml'
if (-not (Test-Path -LiteralPath $patchFile)) { throw "Profile not found: $profileRoot" }
$original = [IO.File]::ReadAllText($patchFile)
$begin = '# FUSIONISLAND:BEGIN managed bridge'
$end = '# FUSIONISLAND:END managed bridge'
$pattern = '(?ms)^' + [regex]::Escape($begin) + '\r?\n.*?^' + [regex]::Escape($end) + '\r?\n?'
$clean = [regex]::Replace($original, $pattern, '')
$backup = Join-Path $DshHome ('backups\fusion-island\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -LiteralPath $patchFile -Destination (Join-Path $backup 'cordis.patch.yml')
if ($Uninstall) {
  $next = $clean
} else {
  $pluginRoot = Join-Path $DshHome 'local-plugins\fusion-island-bridge'
  New-Item -ItemType Directory -Path $pluginRoot -Force | Out-Null
  foreach ($file in @('index.mjs', 'package.json')) {
    $target = Join-Path $pluginRoot $file
    if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination (Join-Path $backup $file) }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $target -Force
  }
  $module = (Join-Path $pluginRoot 'index.mjs').Replace('\', '/').Replace("'", "''")
  $connection = (Join-Path $env:LOCALAPPDATA 'FusionIsland\dsh-bridge.json').Replace('\', '/').Replace("'", "''")
  $entry = @"
$begin
- insert:
    - id: fusion-island-bridge
      name: '$module'
      config:
        connectionFile: '$connection'
$end
"@
  $clean = [regex]::Replace($clean, '(?m)^\s*\[\]\s*$', '')
  $next = $clean.TrimEnd() + [Environment]::NewLine + $entry + [Environment]::NewLine
}
if ([IO.File]::ReadAllText($patchFile) -ne $original) { throw 'Profile changed concurrently; backup preserved, retry installation.' }
[IO.File]::WriteAllText($patchFile, $next, [Text.UTF8Encoding]::new($false))
# Remove our obsolete direct entry only; dsh composes new entries from insert patches.
$runtimeFile = Join-Path $profileRoot 'cordis.yml'
if (Test-Path -LiteralPath $runtimeFile) {
  $runtimeOriginal = [IO.File]::ReadAllText($runtimeFile)
  Copy-Item -LiteralPath $runtimeFile -Destination (Join-Path $backup 'cordis.yml')
  $runtimeClean = [regex]::Replace($runtimeOriginal, $pattern, '')
  $runtimeNext = $runtimeClean
  if (-not ([regex]::Replace($runtimeNext, '(?m)^\s*#.*$', '').Trim())) { $runtimeNext += [Environment]::NewLine + '[]' + [Environment]::NewLine }
  if ([IO.File]::ReadAllText($runtimeFile) -ne $runtimeOriginal) { throw 'Runtime profile changed concurrently.' }
  [IO.File]::WriteAllText($runtimeFile, $runtimeNext, [Text.UTF8Encoding]::new($false))
}
[pscustomobject]@{ Profile=$Profile; Installed=(-not $Uninstall); Backup=$backup; Patch=$patchFile } | ConvertTo-Json

