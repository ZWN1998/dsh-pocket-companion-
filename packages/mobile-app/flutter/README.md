# 口袋 DSH — Flutter 原生壳

本目录是 Android APK 的 Flutter 壳源码。当前开发机无 Flutter SDK / Android SDK，无法本地编译，交付的是完整可构建源码。

> **从零到 APK 的完整步骤见 [BUILD_GUIDE.md](BUILD_GUIDE.md)。**
> 本机要保留 JDK 1.8：构建脚本会在自己进程内临时使用 JDK 17，不改动全局 `JAVA_HOME`。

## 与 PWA 的分工

- `lib/main.dart`：原生侧负责深链（`dshpocket://connect`）、扫码（`mobile_scanner`）、配对配置持久化（`shared_preferences`）、内嵌 WebView（`webview_flutter`）加载配对后的 DSH Web。
- `assets/pwa/`：与 `../pwa/` 相同的静态资源，随 App 打包，可离线展示引导页。
- 设计 token、页面结构与 PWA 原型保持一致（深色 + 青绿 accent）。

## 快速构建（装好工具后）

1. 双击 `install_tools.bat` 装 JDK 17 + Android Studio；Flutter 按提示手动装。
2. 按 `BUILD_GUIDE.md` 配好 `ANDROID_HOME`，**全局 `JAVA_HOME` 保持指向你的 JDK 1.8，不要动**。
3. 双击 `setup.bat`：
   - 若 JDK 17 在常见路径会自动找到；否则先 `set DSH_JDK17_HOME=<jdk17路径>` 再运行。
   - 脚本会临时切到 JDK 17 → `flutter create` 补脚手架 → 恢复自定义 manifest → `pub get` → 构建。
   - 脚本结束后一切环境恢复原样。

产物：`build/app/outputs/flutter-apk/app-release.apk`

## 深链测试

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "dshpocket://connect?mesh=dsh-abc123&secret=xxxxxxxxxxxx&host=10.110.119.97&port=3081&token=12345678"
```

App 收到后自动解析配置、写入本地、发起 P2P 连接，并在对话页用 WebView 打开 `http://10.110.119.97:3081/?token=12345678`。
