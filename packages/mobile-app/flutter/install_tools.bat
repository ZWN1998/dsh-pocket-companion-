@echo off
chcp 65001 >nul
setlocal
echo ============================================
echo  口袋 DSH - 构建工具安装（winget）
echo ============================================
echo.
echo 重要：本脚本【不会修改你的全局 JAVA_HOME】。
echo       你本机要继续用 JDK 1.8，保持原样即可。
echo.

echo [1/3] 检查 JDK（构建需要 Java 17+）...
if exist "C:\Program Files\Java\jdk-21\bin\java.exe" (
  echo   已检测到本机 JDK 21，无需安装，直接跳过此项。
) else (
  echo   未检测到 JDK 17/21，尝试安装 JDK 17 ...
  winget install -e --id Microsoft.OpenJDK.17 --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    winget install -e --id ojdkbuild.openjdk.17.jdk --accept-source-agreements --accept-package-agreements
  )
)

echo.
echo [2/3] 安装 Android Studio（含 Android SDK）...
winget install -e --id Google.AndroidStudio --accept-source-agreements --accept-package-agreements

echo.
echo [3/3] Flutter SDK 需手动安装：
echo   1) 打开 https://docs.flutter.dev/get-started/install/windows
echo   2) 下载 Flutter SDK 稳定版 zip，解压到 C:\src\flutter
echo   3) 把 C:\src\flutter\bin 加入系统 Path
echo.
echo   或者用 git 克隆（需已装 git）：
echo     git clone https://github.com/flutter/flutter.git -b stable C:\src\flutter
echo.

echo ============================================
echo 安装脚本执行完毕。
echo 接下来按 BUILD_GUIDE.md 配置环境变量（注意 JAVA_HOME 保持你原来的 JDK 1.8 不动）。
echo 然后重开终端运行 setup.bat 出包；若自动找不到 JDK 17，用：
echo   set DSH_JDK17_HOME=你的jdk17路径
echo   setup.bat
echo ============================================
pause
