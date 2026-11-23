# 从零打包 Android APK — 完整指南

这台机器当前状态（已检测）：Flutter 未装、Android Studio/SDK 未装、Java 1.8（不够，Flutter 需 17）。
本指南按 **方案 A（本地打包）** 组织，目标是装完工具后一条命令出 APK。

---

## 一、需要下载的 3 样东西（合计约 5 GB）

| # | 工具 | 用途 | 大小 | winget 命令（推荐） | 官网备选 |
|---|------|------|------|---------------------|----------|
| 1 | Flutter SDK 3.x | Dart 编译 + 构建编排 | ~1 GB | `winget install Flutter.Flutter`* | https://docs.flutter.dev/get-started/install/windows |
| 2 | Android Studio | 自带 Android SDK + SDK Manager | ~1 GB | `winget install Google.AndroidStudio` | https://developer.android.com/studio |
| 3 | JDK 17 或 21 | Flutter 编译要求 Java 17+ | ~200 MB | **本机已有 JDK 21，此项已满足，无需下载** | https://learn.microsoft.com/java/openjdk/download |

> ✅ **检测结果：本机 `C:\Program Files\Java\jdk-21` 已安装且可用（openjdk 21）。JDK 无需再装。**
> `setup.bat` 会自动找到它。你只需装 Flutter 和 Android Studio 两样。
> 但要留意本机 winget 的 JDK17 / Android Studio 安装似乎没成功（install_tools.bat 点完后没检测到），
> 若 Android Studio 也没装上，请手动装或重跑时留意 UAC 弹窗点"是"。

\* 本机 winget 源当前没搜到 Flutter 包，若命令失败就走官网下载 zip，解压到例如 `C:\src\flutter`。Android Studio 安装时在向导里勾选 **Android SDK**（默认会装），它带的 SDK 就是构建所需的。

> 也可用 `winget install ojdkbuild.openjdk.17.jdk`（本机源能搜到）作为 JDK 备选。

---

## 二、安装与环境变量（重要：保留你的 JDK 1.8）

> **本机要继续用 JDK 1.8，所以【不要改全局 JAVA_HOME】。**
> `setup.bat` 会在构建时**仅在它自己的进程里**临时把 JAVA_HOME 指向 JDK 17，
> 脚本一结束就失效，全局和其他软件完全不受影响。你只需装好 JDK 17 并让它能被找到即可。

1. **装 JDK 17**，保持全局 `JAVA_HOME` 指向你原来的 JDK 1.8，不要动。
   记住 JDK 17 的安装路径，例如 `C:\Program Files\Microsoft\jdk-17.0.13.11-hotspot`（下称 `<JDK17路径>`）。

2. **装 Flutter SDK**：解压后把 `flutter\bin` 加入 `Path`。
   例：`C:\src\flutter\bin`

3. **装 Android Studio + SDK**：安装向导会装 SDK。记下 SDK 路径（默认 `C:\Users\<你>\AppData\Local\Android\Sdk`）：
   - 新建系统变量 `ANDROID_HOME` = 该 SDK 路径
   - `Path` 加 `%ANDROID_HOME%\platform-tools`

4. **接受 SDK 许可证**（管理员 PowerShell 执行一次，此时用 JDK 1.8 也可通过）：
   ```powershell
   flutter doctor --android-licenses
   ```
   一路 `y` 回车。（`--android-licenses` 只接受许可，不构建，不受 JDK 版本影响。）

5. **重开终端**，自检：
   ```bash
   flutter --version
   flutter doctor       # Android SDK / Android Studio 打勾即可；
   ```
   `flutter doctor` 若报 Java 版本问题可忽略——`setup.bat` 会在真正构建时临时切成 JDK 17。

6. **让 setup.bat 找到 JDK 17**（二选一）：
   - 若 JDK 17 装在常见路径（`C:\Program Files\Microsoft\jdk-17*` 等），脚本会自动找到，无需操作；
   - 否则在构建前指定一次：
     ```bat
     set DSH_JDK17_HOME=<JDK17路径>
     setup.bat
     ```

---

## 三、一键构建

在本目录（`.../mobile-app/flutter/`）打开终端，双击或运行：

```bat
setup.bat
```

它会自动完成 4 件事：
1. 备份我们自定义的 `AndroidManifest.xml`（含 `dshpocket://` 深链、允许明文局域网访问）
2. 运行 `flutter create --org com.dshpocket --project-name dshpocket --platforms=android .` 补齐完整 Android 脚手架（gradlew、MainActivity.kt、图标等——这些二进制/模板文件必须靠官方命令生成，无法手写）
3. 恢复自定义 manifest
4. `flutter pub get` 后 `flutter build apk --release`

产物：`build\app\outputs\flutter-apk\app-release.apk`（约 15-30 MB），传到手机即可安装。

---

## 四、手动构建（脚本失败时按此逐步走）

```bash
# 1. 备份自定义 manifest
copy android\app\src\main\AndroidManifest.xml AndroidManifest.custom.xml

# 2. 补脚手架（--org/--project-name 决定包名 com.dshpocket.dshpocket）
flutter create --org com.dshpocket --project-name dshpocket --platforms=android .

# 3. 恢复自定义 manifest（深链 + cleartext 不能丢）
copy /Y AndroidManifest.custom.xml android\app\src\main\AndroidManifest.xml

# 4. 拉依赖 + 构建
flutter pub get
flutter build apk --release
```

> `flutter create` **不会覆盖**已有的 `lib/main.dart` 和 `pubspec.yaml`，只会补齐缺失的 `android/`、`test/` 等目录，所以我们的代码是安全的。
> 它生成的 `MainActivity.kt` 包名是 `com.dshpocket.dshpocket`，与脚手架 build.gradle 的 namespace 自动一致，无需手改。

---

## 五、常见问题

- **`flutter pub get` 报某依赖版本找不到**：说明 pubspec.yaml 里写死的版本号过期了。把对应行的 `^x.y.z` 改成 pub.dev 上的最新版，或删掉版本号让 pub 取最新，再重试。
- **Gradle 下载卡住**：首次构建 Gradle 会从境外下载依赖。配置国内镜像：在 `~/.gradle/gradle.properties` 加
  `distributionUrl` 指向腾讯/阿里镜像，或给 Android Studio 配代理。
- **`flutter doctor` Android licenses 未接受**：执行 `flutter doctor --android-licenses` 全部 `y`。
- **Java 版本不对 / Gradle 报 Java version**：构建需要 JDK 17，但你全局是 JDK 1.8。不要改全局 `JAVA_HOME`，改用 `set DSH_JDK17_HOME=你的jdk17路径` 后重跑 `setup.bat`（详见第二节第 6 步）。
- **想换 App 图标**：替换 `android/app/src/main/res/mipmap-*/ic_launcher.png`（flutter create 生成的默认 Flutter 图标）。

---

## 六、深链验证（装到手机后）

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "dshpocket://connect?mesh=dsh-abc123&secret=xxxxxxxxxxxx&host=10.110.119.97&port=3081&token=12345678"
```

扫电脑上的二维码或直接点配置链接，App 会被唤起并自动配对。
