param(
    [Parameter(Mandatory=$true)][string]$Sdk,
    [Parameter(Mandatory=$true)][string]$TemplateConfig,
    [Parameter(Mandatory=$true)][string]$Python
)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$adb = Join-Path $Sdk 'platform-tools/adb.exe'
$emulator = Join-Path $Sdk 'emulator/emulator.exe'
$taskName = 'MealPlannerWidgetGate-' + (Get-Date -Format 'yyyyMMddHHmmss')
$avdRoot = Join-Path $env:USERPROFILE '.android/avd'
$taskAvd = Join-Path $avdRoot ($taskName + '.avd')
$taskIni = Join-Path $avdRoot ($taskName + '.ini')
$port = 5582
$serial = "emulator-$port"
$fixtureProcess = $null
$emulatorProcess = $null
if (Test-Path $taskAvd) { throw 'Owned emulator already exists; inspect instead of overwriting' }
if (Get-NetTCPConnection -LocalPort $port,($port+1),43817 -State Listen -ErrorAction SilentlyContinue) { throw 'Disposable gate ports already in use' }
New-Item -ItemType Directory -Path $taskAvd | Out-Null
$config = Get-Content -LiteralPath $TemplateConfig
$config = $config | Where-Object { $_ -notmatch '^(AvdId=|avd.ini.displayname=|hw.cpu.ncore=|disk.dataPartition.size=|fastboot\.|hw.camera\.|hw.gpu.mode=)' }
$config += @("AvdId=$taskName", "avd.ini.displayname=$taskName", 'hw.cpu.ncore=4', 'disk.dataPartition.size=2G', 'fastboot.forceColdBoot=yes', 'hw.camera.back=none', 'hw.camera.front=none', 'hw.gpu.mode=swiftshader_indirect')
$config | Set-Content -LiteralPath (Join-Path $taskAvd 'config.ini')
@('avd.ini.encoding=UTF-8', "path=$taskAvd", "path.rel=avd/$taskName.avd", 'target=android-37.0') | Set-Content -LiteralPath $taskIni
try {
    $fixtureProcess = Start-Process -FilePath $Python -ArgumentList ('"' + (Join-Path $taskRoot 'fixture_server.py') + '"') -WindowStyle Hidden -PassThru
    $emulatorProcess = Start-Process -FilePath $emulator -ArgumentList @('-avd',$taskName,'-no-window','-no-audio','-no-snapshot','-port',"$port",'-gpu','swiftshader_indirect') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $env:TEMP 'widget-gate-emulator.log') -RedirectStandardError (Join-Path $env:TEMP 'widget-gate-emulator-error.log')
    $ready = $false
    for ($attempt=0; $attempt -lt 150; $attempt++) {
        if ($emulatorProcess.HasExited) { throw 'Disposable emulator exited; inspect widget-gate-emulator-error.log' }
        $boot = & $adb -s $serial shell getprop sys.boot_completed 2>$null
        if ($boot -match '^1') { $ready=$true; break }
        Start-Sleep -Seconds 2
    }
    if (!$ready) { throw 'Disposable emulator did not finish booting' }
    $identity = & $adb -s $serial emu avd name
    if ($identity[0] -ne $taskName) { throw 'Emulator identity mismatch; refusing to install' }
    $app = Join-Path $taskRoot 'android-probe/app/build/outputs/apk/debug/app-debug.apk'
    $tests = Join-Path $taskRoot 'android-probe/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
    & $adb -s $serial install $app
    if ($LASTEXITCODE) { throw 'Probe install failed' }
    & $adb -s $serial install $tests
    if ($LASTEXITCODE) { throw 'Probe test install failed' }
    $result = & $adb -s $serial shell am instrument -w -r com.example.mealplanner.nativewidgetprobe.test/androidx.test.runner.AndroidJUnitRunner
    $result | Set-Content (Join-Path $env:TEMP 'widget-native-android-tests.log')
    $result | Write-Output
    if (($result -join "`n") -notmatch 'OK \(3 tests\)') { throw 'Native gate tests did not all pass' }
} finally {
    if ($fixtureProcess -and !$fixtureProcess.HasExited) { Stop-Process -Id $fixtureProcess.Id }
    if ($emulatorProcess -and !$emulatorProcess.HasExited) {
        $identity = & $adb -s $serial emu avd name 2>$null
        if ($identity[0] -eq $taskName) { & $adb -s $serial emu kill | Out-Null }
        else { Stop-Process -Id $emulatorProcess.Id }
    }
    Write-Output "Disposable emulator retained for inspection at $taskAvd; no existing AVD was modified."
}
