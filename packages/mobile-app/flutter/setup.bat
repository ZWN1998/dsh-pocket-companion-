@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo  口袋 DSH - Android APK 一键构建
echo ============================================
echo.

REM --- 0. Flutter 检查 ---
where flutter >nul 2>nul
if errorlevel 1 (
  echo [错误] 找不到 flutter 命令。请先安装 Flutter SDK 并把 flutter\bin 加入 Path。
  echo        详见 BUILD_GUIDE.md 第一节。
  pause
  exit /b 1
)

REM --- 1. 探测 JDK 17/21，仅在本脚本进程内临时启用（不改全局 JAVA_HOME）---
REM    说明：bat 里的 set 只对当前脚本和它启动的子进程生效，脚本结束即失效。
REM          你本机全局 JAVA_HOME 仍指向 JDK 1.8，其它工作不受任何影响。
REM          构建只需 Java 17 或更高；本机已有的 JDK 21 完全可用。
set "BUILD_JDK_HOME="
if defined DSH_JAVA_HOME set "BUILD_JDK_HOME=%DSH_JAVA_HOME%"
if defined DSH_JDK17_HOME set "BUILD_JDK_HOME=%DSH_JDK17_HOME%"
if not defined BUILD_JDK_HOME (
  for /d %%D in (
    "C:\Program Files\Java\jdk-21*"
    "C:\Program Files\Java\jdk-17*"
    "C:\Program Files\Microsoft\jdk-17*"
    "C:\Program Files\Microsoft\jdk-21*"
    "C:\Program Files\Eclipse Adoptium\jdk-17*"
    "C:\Program Files\Eclipse Adoptium\jdk-21*"
    "C:\Program Files\ojdkbuild\java-17*"
    "C:\Program Files\Zulu\zulu-17*"
    "C:\Program Files\Zulu\zulu-21*"
  ) do (
    if exist "%%~D\bin\java.exe" set "BUILD_JDK_HOME=%%~D"
  )
)
if not defined BUILD_JDK_HOME (
  echo [错误] 找不到 JDK 17 或 21。请手动指定路径后重跑：
  echo        set DSH_JAVA_HOME=C:\你的\jdk17或21\路径
  echo        setup.bat
  echo.
  echo  注意：不需要也不应该去改全局 JAVA_HOME。
  pause
  exit /b 1
)
set "JAVA_HOME=%BUILD_JDK_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo [环境] 本脚本临时使用 JDK: %BUILD_JDK_HOME%
echo        全局 JAVA_HOME 未改动，你本机的 JDK 1.8 照常使用。
echo.

REM --- 2. 备份自定义 manifest ---
if exist "android\app\src\main\AndroidManifest.xml" (
  copy /Y "android\app\src\main\AndroidManifest.xml" "AndroidManifest.custom.xml" >nul
  echo [1/4] 已备份自定义 AndroidManifest.xml
) else (
  echo [1/4] 无现有 manifest，跳过备份
)

REM --- 3. 补脚手架（不覆盖已有 lib/main.dart 与 pubspec.yaml）---
REM    先删掉旧的 android 目录，让 flutter create 生成全新且自洽的 Gradle 配置
REM    （包名 com.dshpocket.dshpocket，避免旧 build.gradle 变量未定义的隐患）。
echo [2/4] 生成 Android 脚手架（flutter create）...
if exist "android" rmdir /S /Q "android"
call flutter create --org com.dshpocket --project-name dshpocket --platforms=android .
if errorlevel 1 (
  echo [错误] flutter create 失败。请检查 Flutter 安装。
  pause
  exit /b 1
)

REM --- 4. 恢复自定义 manifest（深链 + cleartext）---
if exist "AndroidManifest.custom.xml" (
  copy /Y "AndroidManifest.custom.xml" "android\app\src\main\AndroidManifest.xml" >nul
  del "AndroidManifest.custom.xml"
  echo [3/4] 已恢复自定义 AndroidManifest.xml（含 dshpocket:// 深链）
) else (
  echo [3/4] 无备份可恢复
)

REM --- 4.5 提高 compileSdk 到 37（部分插件传递依赖要求 37）---
if exist "android\gradle.properties" (
  echo flutter.compileSdkVersion=37>> "android\gradle.properties"
  echo flutter.targetSdkVersion=37>> "android\gradle.properties"
)

REM --- 5. 拉依赖并构建 ---
echo [4/4] 拉取依赖并构建 Release APK...
call flutter pub get
if errorlevel 1 (
  echo [错误] flutter pub get 失败，可能依赖版本过期，详见 BUILD_GUIDE.md 第五节。
  pause
  exit /b 1
)
call flutter build apk --release
if errorlevel 1 (
  echo [错误] 构建失败。请看上方日志，常见原因见 BUILD_GUIDE.md 第五节。
  pause
  exit /b 1
)

echo.
echo ============================================
echo  构建成功！
echo  APK 位置：
echo  build\app\outputs\flutter-apk\app-release.apk
echo ============================================
echo.
echo 安装到手机：adb install build\app\outputs\flutter-apk\app-release.apk
echo.
pause
