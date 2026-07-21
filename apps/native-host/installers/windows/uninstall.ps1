$registryPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\org.mozilla.open_assistant"
if (Test-Path $registryPath) { Remove-Item $registryPath -Force }
$manifestPath = Join-Path $env:LOCALAPPDATA "OpenAssistant\org.mozilla.open_assistant.json"
if (Test-Path $manifestPath) { Remove-Item $manifestPath -Force }
Write-Output "Native manifest removed. Remove the Open Assistant credential from Windows Credential Manager separately if desired."
