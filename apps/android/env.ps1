# 便携 Android 开发环境（免安装、全部在仓库 .tooling/ 内）
# 用法：在仓库根目录执行一次  . .\apps\android\env.ps1  之后即可使用 gradlew / sdkmanager / adb
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:JAVA_HOME = "$repoRoot\.tooling\jdk21"
$env:ANDROID_HOME = "$repoRoot\.tooling\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = "$repoRoot\.tooling\gradle-home"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$repoRoot\.tooling\gradle-dist\gradle-8.14.3\bin;$env:Path"
Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
Write-Host "GRADLE_USER_HOME=$env:GRADLE_USER_HOME"
