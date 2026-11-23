# 口袋 DSH · 手机互通 (dsh-pocket-companion)

通过**扫码配对 + 加密 P2P**，在手机上查看和操作电脑上的 DSH 对话。

> 本仓库为第三方配套项目：一个 DSH 插件（bundle）+ 手机端（PWA / Flutter 壳）+ 编排核心。
> 遵守三条铁律：**不改 GPL/LGPL 源码、不打包 DSH 本体、分发附许可证与源码地址**。
> 详见 [COMPLIANCE.md](COMPLIANCE.md) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

## 目录结构

```
dsh-pocket-companion/
├── packages/
│   ├── shared/               # 共享协议：配置链接、mesh 配置、CLI 参数、超时/重试（MIT）
│   ├── orchestrator-core/    # 桌面编排核心 + dshpocket CLI（MIT）
│   │   └── vendor/qrcode.cjs #   vendored qrcode-generator 1.4.4 MIT
│   ├── plugin/               # DSH 插件 bundle：设置页 + RPC 读状态 + 带 PIN 二维码（MIT）
│   │   ├── index.js          #   Host：/dshpocket/qr 同源 QR 编码器
│   │   ├── client.js         #   UI：settings.section React 页
│   │   ├── cordis.patch.yml  #   bundle patch 声明
│   │   ├── locale/           #   en.json / zh.json
│   │   └── docs/DETAIL.md    #   插件详情页 + 合规声明
│   └── mobile-app/           # 手机端
│       ├── pwa/              #   可运行的 PWA（五页 / 扫码 / 签到 / Web 容器）
│       ├── serve.mjs         #   局域网预览服务器（零依赖）
│       └── flutter/          #   Android APK 原生壳源码（完整可构建）
├── LICENSE                   # 本项目 MIT
├── THIRD_PARTY_NOTICES.md    # 第三方组件声明
└── COMPLIANCE.md             # 合规清单
```

## 快速开始

### 1. 桌面编排核心（已可运行）

环境：Node ≥ 22。

```bash
cd packages/orchestrator-core
node src/cli.mjs wizard --dry-run     # 6 步向导演练（含真实可扫描二维码）
node src/cli.mjs env                  # 环境检测
node src/cli.mjs pair                 # 生成配对链接与二维码
```

`--dry-run` 不发真实安装/启动命令，用于验证流程；去掉后执行真实操作
（调用 `dsh plugin add`、启动 EasyTier、探测 3081 端口）。

### 2. 手机端 PWA（已可运行）

```bash
cd packages/mobile-app
node serve.mjs                        # 默认 0.0.0.0:4173
# 手机访问 http://<电脑IP>:4173/
```

覆盖连接 / 流量 / 会员 / 我的 四个 tab + 对话二级页；扫码或粘贴配对链接后自动配 mesh、
模拟 P2P 连接，并可在「对话」页通过 WebView 容器打开配对后的 DSH Web（带 token 直达）。

### 3. DSH 插件（bundle，源码就绪）

`packages/plugin/` 为标准 DSH bundle。安装方式（在 DSH 环境中）：

- 通过编排核心 `installOurPlugin()`；或
- 使用插件管理接口 install_bundle 指向该目录。

安装后 DSH 设置页出现「口袋 DSH」分区，显示 LAN/tunnel URL、PIN、带 token 的二维码，
扫码即可在手机端一键配对。

### 4. Android APK（源码就绪，需本地工具链）

```bash
cd packages/mobile-app/flutter
flutter pub get
flutter build apk --release
```

本机当前无 Flutter / Android SDK，交付完整源码；构建步骤见 `flutter/README.md`。

## 测试

```bash
# 各包独立运行（node ≥ 22）
cd packages/shared && node --test test/*.test.mjs
cd packages/orchestrator-core && node --test test/*.test.mjs
cd packages/plugin && node --test test/*.test.mjs
cd packages/mobile-app && node --test test/*.test.mjs
```

当前：shared 6/6、orchestrator-core 4/4、plugin 6/6、mobile-app 4/4 全部通过。

## 配对链接协议

```
dshpocket://connect?mesh=dsh-xxxxxx&secret=<12位>&host=10.110.119.97&port=3081&token=<8位PIN>&pin=<8位PIN>
```

- `mesh/secret/host`：EasyTier 虚拟网配置，手机端据此配网。
- `token/pin`：pocket 代理的 8 位 PIN，拼进 `http://host:3081/?token=PIN` 实现扫码直达（原版二维码为裸 URL，需手输 PIN；本项目自行拼接）。

## 上游与许可证

| 组件 | 许可证 | 源码 |
|------|--------|------|
| 本项目 | MIT | 本仓库 |
| dsh-pocket | GPL-2.0 | 用户提供（仅调用公开 RPC） |
| EasyTier | LGPL-3.0 | https://github.com/EasyTier/EasyTier |
| qrcode-generator | MIT | https://github.com/kazuhikoarase/qrcode-generator |
| DSH / DeepSeek Harness | 闭源商业 | 用户自备，不打包 |

## 里程碑

M0 原型 ✅ → M1 共享协议 ✅ → M2 编排核心 ✅ → M3 DSH 插件 ✅ → M4 手机端 ✅ → M5 中继/服务端（后置）。
