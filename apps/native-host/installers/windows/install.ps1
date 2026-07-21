param([Parameter(Mandatory=$true)][string]$BinaryPath)
$manifestDir = Join-Path $env:LOCALAPPDATA "OpenAssistant"
$manifestPath = Join-Path $manifestDir "org.mozilla.open_assistant.json"
New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null
$template = Get-Content (Join-Path $PSScriptRoot "..\..\native-manifest.json") -Raw
$template.Replace("__ABSOLUTE_BINARY_PATH__", ($BinaryPath -replace '\\', '\\')) | Set-Content -Encoding UTF8 $manifestPath
New-Item -Path "HKCU:\Software\Mozilla\NativeMessagingHosts\org.mozilla.open_assistant" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Mozilla\NativeMessagingHosts\org.mozilla.open_assistant" -Name "(default)" -Value $manifestPath
