# 第三方组件声明 (Third-Party Notices)

本项目（dsh-pocket-companion，MIT）在实现过程中调用 / 引用下列第三方组件。
为遵守「不改 GPL/LGPL 源码、不打包 DSH 本体」三条铁律，特此声明。

## 1. dsh-pocket — GPL-2.0

- 用途：电脑端的 pocket 代理与 Web RPC 服务（3081 端口），本项目**仅通过公开接口调用**。
- 调用方式：
  - DSH 插件通过 `ctx.connection.rpc.call('/dsh-pocket', 'pocket.status', …)` 读取状态；
  - 手机经 pocket 代理的 `http://host:3081/?token=PIN` 访问 DSH Web；
  - 编排核心通过 `dsh plugin add dsh-pocket@2.13.2` 触发官方安装，不内置安装包。
- 合规：不修改、不反编译改造、不与其合并编译、不将其源码复制进本项目仓库；仅作独立组件调用。
- 上游：https://github.com/InterlaceHQ/agentpilot （以实际项目地址为准）；许可证：GPL-2.0。

## 2. EasyTier — LGPL-3.0

- 用途：组网 / P2P 打洞，建立 `10.110.119.0/24` 虚拟网段。
- 调用方式：编排核心以**独立进程**启动 `easytier-core.exe`，仅通过 CLI 参数
  （`--network-name` / `--network-secret` / `-d --dhcp` / `-p` / `-i` 等）配置；不静态链接、不修改源码。
- 合规：动态/进程级调用，不修改库本身，不合并编译；符合 LGPL-3.0 的独立使用要求。
- 上游：https://github.com/EasyTier/EasyTier；许可证：LGPL-3.0。

## 3. qrcode-generator — MIT（vendored）

- 用途：在 Node 与浏览器端生成真实二维码矩阵/SVG。
- 版本：1.4.4；作者：Kazuhiko Arase。
- 许可证：MIT。以 `vendor/qrcode.cjs`（orchestrator-core 与 plugin 各一份）形式随包分发。
- 上游：https://github.com/kazuhikoarase/qrcode-generator

## 4. DSH / DeepSeek Harness — 闭源商业（用户自备）

- 本项目是 DSH 的**第三方配套插件 + 独立手机端**，不打包、不分发、不破解 DSH 本体。
- 用户须自行合法安装 DSH Desktop/Web，本项目仅在用户授权下通过其插件机制与公开接口协作。
- 项目定位为「软件授权 / 生产力工具」，不是对 DSH 服务的转售或代理。

## 5. Flutter / React / mobile_scanner / webview_flutter 等

- 手机壳与前端 UI 依赖的常规开源库，按其各自许可证（多为 MIT/BSD/Apache-2.0）使用，
  通过 pub / npm 正常包管理引入，不修改源码。
