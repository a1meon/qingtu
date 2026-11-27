param([Parameter(Mandatory)][string] $Executable)
$ErrorActionPreference = 'Stop'
$appPath = (Resolve-Path -LiteralPath $Executable).Path
$processName = [IO.Path]::GetFileNameWithoutExtension($appPath)
$profilePath = Join-Path $env:TEMP ("qingtu-instance-" + [guid]::NewGuid())
$profileArg = '--user-data-dir="' + $profilePath + '"'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowState {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int command);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
}
'@

function Wait-Until([scriptblock] $Check, [string] $Description) {
  $deadline = (Get-Date).AddSeconds(60)
  do {
    if (& $Check) { return }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $Description"
}

function Get-AppWindows {
  Get-Process -Name $processName -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq $appPath -and $_.MainWindowHandle -ne 0
  }
}

function Start-Qingtu {
  Start-Process -FilePath $appPath -ArgumentList $profileArg -PassThru
}

try {
  $first = Start-Qingtu
  Wait-Until { @(Get-AppWindows).Count -eq 1 } 'initial window'
  $window = @(Get-AppWindows)[0]
  if ($window.Id -ne $first.Id) { throw 'Initial window opened in an unexpected process' }
  $handle = $window.MainWindowHandle
  [void][WindowState]::ShowWindowAsync($handle, 6)
  Wait-Until { [WindowState]::IsIconic($handle) } 'minimization'
  $launches = @(1..4 | ForEach-Object { Start-Qingtu })
  Wait-Until { @($launches | Where-Object { -not $_.HasExited }).Count -eq 0 } 'redundant processes to exit'
  Wait-Until { -not [WindowState]::IsIconic($handle) } 'restoration'
  $remaining = @(Get-AppWindows)
  if ($remaining.Count -ne 1 -or $remaining[0].Id -ne $first.Id -or $remaining[0].MainWindowHandle -ne $handle) {
    throw 'Repeated launch replaced or duplicated the first window'
  }
  [void]$remaining[0].CloseMainWindow()
  Wait-Until { $first.HasExited } 'normal quit'
  $next = Start-Qingtu
  Wait-Until { @(Get-AppWindows | Where-Object Id -eq $next.Id).Count -eq 1 } 'relaunch after quit'
  [void]$next.CloseMainWindow()
  Wait-Until { $next.HasExited } 'final quit'
  Write-Output 'Windows: four repeat launches restored the original window; reopening after quit passed.'
} finally {
  if (Test-Path -LiteralPath $profilePath) { Remove-Item -LiteralPath $profilePath -Recurse -Force }
}
