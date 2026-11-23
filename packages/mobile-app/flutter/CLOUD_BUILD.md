# 云端打包 APK（GitHub Actions）— 无需本地装 Flutter

Flutter 下载太慢，用云端构建：把代码推到 GitHub，云端自动装 Flutter + 构建 APK，然后把 APK 下载到手机。全程本地不用装 Flutter / Android Studio / JDK。

## 前提

- 一个 GitHub 账号（免费即可）
- 本机装了 git（或用 GitHub 网页上传）
- 仓库设为 Public（免费额度无限；Private 也可，只是 Actions 分钟数有限）

## 已配好的文件

- `.github/workflows/build-apk.yml`（在仓库根目录 `dsh-pocket-companion/` 下）
- `pubspec.yaml`（依赖用 `any`，让云端自动解析兼容版本）

## 步骤

### 1. 创建 GitHub 仓库并推送

在 GitHub 新建一个空仓库（例如 `dsh-pocket-companion`），然后在本机项目根目录执行：

```bash
cd D:\JAVA_Business\DSH-APP\DSH-Pocket-手机互通\dsh-pocket-companion

git init
git add .
git commit -m "初始提交：口袋 DSH 插件+手机端+编排核心"
git branch -M main
git remote add origin https://github.com/你的用户名/dsh-pocket-companion.git
git push -u origin main
```

> 若本机没配 git 账号，先执行：
> ```
> git config --global user.name "你的名字"
> git config --global user.email "你的邮箱"
> ```

### 2. 让云端开始构建

推送后有两种触发方式：

- **自动**：push 到 main 分支且改动了 `packages/mobile-app/flutter/**` → 自动构建
- **手动**：打开仓库的 **Actions** 标签 → 左侧选「构建口袋 DSH APK」→ 右侧 **Run workflow** → 绿色按钮

### 3. 等待并下载 APK

1. 在 Actions 页面点进正在运行的构建（或已完成的那次）
2. 等出现绿色 ✅（约 5-10 分钟，首次更久）
3. 页面底部 **Artifacts** 区域 → 下载 `dshpocket-release-apk`（zip 包）
4. 解压得到 `app-release.apk`，传到手机安装

传到手机的方式：微信文件传输助手 / 数据线 / 手机浏览器访问一个临时链接均可。手机需开启「允许安装未知来源应用」。

## 常见问题

- **构建失败红色 ❌**：点进去看日志，把最后几十行报错发我，我帮你改。
  - 最常见：`flutter pub get` 依赖冲突 —— 我已用 `any`，一般不出现；若出现需按报错调 pubspec。
  - 其次：`flutter create` 相关 —— workflow 里先 `rm -rf android` 再 create，保证干净。
- **找不到 Actions 页面**：仓库 Settings → Actions → General → 确认 "Allow all actions" 已开。
- **下载需要登录**：GitHub 网页登录状态即可下载 artifact。
- **APK 安装被拦**：手机设置里搜「未知来源」或「安装未知应用」，给文件管理器/浏览器授权。

## 与本地方案的关系

云端出的是 `app-release.apk`，用 debug 签名（和本地 `setup.bat` 一样）。可用于安装测试。正式上架应用商店需要换成自己的签名密钥，那时再单独配置。

## 注意

- 二维码/配对链接里的 PIN 是敏感信息，测试时别把真实 PIN 的二维码截图发到公开仓库的 issue 里。
- 每次改 Flutter 代码后 `git push` 就会触发新构建，不用手动操作。
