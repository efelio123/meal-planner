param([Parameter(Mandatory=$true)][string]$Sdk)
$ErrorActionPreference = 'Stop'
$statePath = Join-Path $env:TEMP 'widget-native-launcher-review.json'
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ([IO.Path]::GetFullPath($state.sdk) -ne [IO.Path]::GetFullPath($Sdk)) { throw 'SDK identity mismatch' }
if ([IO.Path]::GetFullPath($state.probeRoot) -ne [IO.Path]::GetFullPath($PSScriptRoot)) { throw 'Probe source identity mismatch' }
if ($state.name -notmatch '^MealPlannerWidgetGate-\d{14}$' -or $state.serial -notmatch '^emulator-\d{4,5}$') { throw 'Owned emulator identity missing' }
$adb = Join-Path $Sdk 'platform-tools/adb.exe'
$identity = & $adb -s $state.serial emu avd name
if ($identity[0] -ne $state.name) { throw 'Emulator identity mismatch; refusing cleanup' }
# Restore networking only on this disposable device before shutting it down.
& $adb -s $state.serial shell svc wifi enable
& $adb -s $state.serial shell svc data enable
$fixture = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.fixturePid)"
if ($fixture) {
    $fixturePath = Join-Path $PSScriptRoot 'fixture_server.py'
    if (!$fixture.CommandLine.Contains($fixturePath)) { throw 'Fixture PID was reused; refusing to stop another process' }
    Stop-Process -Id $state.fixturePid
}
& $adb -s $state.serial emu kill | Out-Null
$completed = Join-Path $env:TEMP ('widget-native-launcher-review-completed-' + (Get-Date -Format 'yyyyMMddHHmmss') + '.json')
Move-Item -LiteralPath $statePath -Destination $completed
Write-Output 'Only the verified disposable emulator and owned fictional fixture stopped. Existing AVDs, phones, Mac and consumer services untouched.'
