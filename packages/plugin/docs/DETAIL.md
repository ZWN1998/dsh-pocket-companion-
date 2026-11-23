# Phone Companion — 手机互通助手

在 DSH 设置页新增「手机互通」区块，读取本机 **dsh-pocket** 的公开状态，生成一张
**内嵌连接密码**的二维码。手机端 App 扫码后直接登录并访问这台电脑上的 DSH 对话。

## 前置条件

1. 用户已自行安装并启用 DSH（闭源商业软件，本插件**不打包** DSH）。
2. 已安装官方 `dsh-pocket@2.13.2`（GPL-2.0，单独安装/启用，本插件只通过公开 RPC 读取状态，
   **不复制、不修改、不与其合并编译**）。
3. dsh-pocket 代理已运行（默认 `127.0.0.1:3081`，上游 DSH Web `3080`）。

## 工作方式

- 设置页通过 `ctx.connection.rpc.call('/dsh-pocket', 'pocket.status')` 读取状态（只读）。
- 从返回的 `lanUrl` / `tunnelUrl` 与 `lanToken` / `accessToken` 拼出带 `?token=<pin>` 的直达链接。
- 二维码由宿主同源路由 `/dshpocket/qr?text=...` 用随包 vendored 的 MIT 库生成；
  该路由是纯编码器，不接触任何凭据之外的信息，也不碰浏览器 cookie。

## 合规声明

- 本插件 MIT 授权；仅调用 dsh-pocket 的公开 RPC 契约，不构成 GPL 衍生作品。
- 随包 QR 编码器：qrcode-generator 1.4.4（MIT，Kazuhiko Arase），源码随附于 `vendor/`。
- 不打包、不修改 DSH 本体。
