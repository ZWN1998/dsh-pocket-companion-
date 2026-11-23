/**
 * @dsh-pocket/shared — 口袋 DSH 三端共享的协议、常量与类型（JSDoc）。
 *
 * 纯 ESM、零依赖；Node >= 18 与浏览器均可直接 import。
 * 不 import 任何 dsh-pocket / EasyTier / DSH 代码（合规隔离，三条铁律之一）。
 */

/** 自定义 scheme：二维码携带“带凭证的配置链接”，纯网址做不到自动配 mesh。 */
export const CONNECT_SCHEME = 'dshpocket';

/** 桌面启动器固定端口（产品定义 §6，已实测）。 */
export const POCKET_PROXY_PORT = 3081;
export const DSH_WEB_UPSTREAM_PORT = 3080;

/** 锁死版本，避免上游个人项目更新导致不兼容（产品定义 §11.1 第 1 层防御）。 */
export const DSH_POCKET_VERSION = '2.13.2';
export const EASYTIER_VERSION = '2.6.4';

/** 虚拟 IP 池：避开已用地址，从 60~139 中选（开发说明 §3.3）。 */
export const MESH_IP_RANGE = { start: 60, end: 139, base: '10.110.119' };

/** 默认中继/发现节点（用户本机实测配置，可被覆盖）。 */
export const DEFAULT_PEERS = ['tcp://47.103.35.100:11010'];

/** 状态枚举。 */
export const MeshMode = Object.freeze({ P2P: 'p2p', RELAY: 'relay' });
export const InstallState = Object.freeze({
  MISSING: 'missing',
  INSTALLING: 'installing',
  READY: 'ready',
  ERROR: 'error',
});

/**
 * @typedef {object} MeshConfig
 * @property {string} networkName     'dsh-' + 随机串
 * @property {string} networkSecret   随机密钥
 * @property {string} virtualIp       10.110.119.60~139
 * @property {string[]} [peers]       中继/引导节点（打洞失败时用）
 */

/**
 * @typedef {object} PocketEndpoint
 * @property {string} host            mesh 虚拟 IP，如 10.110.119.97
 * @property {number} port            3081
 * @property {string} pin             LAN PIN（若 pocket.status 未返回则留空，由用户在验证页输入）
 */

/**
 * @typedef {object} Status
 * @property {string} env             环境体检摘要
 * @property {string} mesh            mesh 状态
 * @property {'p2p'|'relay'} mode     当前模式
 * @property {number} connectedDevices 已连接设备数
 * @property {string} connectLink     当前配置链接
 */

const B36 = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 生成网络安全随机串（优先 crypto.getRandomValues，Node 与浏览器通用）。 */
export function randomToken(length = 12) {
  const bytes = new Uint8Array(length);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    // Node 18 在无 globalThis.crypto 的环境下的兜底（仅开发脚本使用）
    const nodeCrypto = globalThis.process?.versions?.node ? require('node:crypto') : null;
    if (nodeCrypto) nodeCrypto.randomFillSync(bytes);
    else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < length; i++) out += B36[bytes[i] % B36.length];
  return out;
}

/** 生成 mesh 配置（网络名 dsh-xxxxxx / 12 位密钥 / 池内虚拟 IP）。 */
export function generateMeshConfig({ peers = DEFAULT_PEERS } = {}) {
  const suffix = randomToken(6);
  const hostPart = MESH_IP_RANGE.start + Math.floor(Math.random() * (MESH_IP_RANGE.end - MESH_IP_RANGE.start + 1));
  return {
    networkName: `dsh-${suffix}`,
    networkSecret: randomToken(12),
    virtualIp: `${MESH_IP_RANGE.base}.${hostPart}`,
    peers: [...peers],
  };
}

/** 生成 EasyTier 启动参数（只用命令行参数，不手写 toml；开发说明 §5.2）。 */
export function buildEasyTierArgs(cfg) {
  const args = [
    '--network-name', cfg.networkName,
    '--network-secret', cfg.networkSecret,
    '-i', cfg.virtualIp,
    '-m', `dshpocket-${cfg.networkName}`,
    '-l', '0.0.0.0:0',
  ];
  for (const peer of cfg.peers ?? []) args.push('-p', peer);
  return args;
}

/**
 * 生成配置链接（二维码内容）。
 * 注意 token 在这里是 mesh 凭证的校验摘要占位；真实部署应替换为设备凭证。
 * pin 可能为空——dsh-pocket 的 LAN PIN 由用户在验证页输入，不在链接里泄露更多。
 */
export function buildConnectLink(cfg, endpoint, pin = '') {
  const url = new URL(`${CONNECT_SCHEME}://connect`);
  url.searchParams.set('mesh', cfg.networkName);
  url.searchParams.set('secret', cfg.networkSecret);
  url.searchParams.set('host', endpoint.host);
  url.searchParams.set('port', String(endpoint.port ?? POCKET_PROXY_PORT));
  url.searchParams.set('token', endpoint.token ?? randomToken(12));
  if (pin) url.searchParams.set('pin', pin);
  return url.toString();
}

/** 解析配置链接；不合法时抛出明确错误。 */
export function parseConnectLink(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    throw new Error('配置链接格式错误：不是合法 URL');
  }
  if (url.protocol !== `${CONNECT_SCHEME}:`) {
    throw new Error(`配置链接 scheme 错误：期望 ${CONNECT_SCHEME}://，实际 ${url.protocol}`);
  }
  if (url.hostname !== 'connect') {
    throw new Error(`配置链接 host 错误：期望 connect，实际 ${url.hostname}`);
  }
  const get = (k) => url.searchParams.get(k) ?? undefined;
  const mesh = get('mesh');
  const secret = get('secret');
  const host = get('host');
  if (!mesh || !secret || !host) {
    throw new Error('配置链接缺少必要参数（mesh / secret / host）');
  }
  return {
    networkName: mesh,
    networkSecret: secret,
    host,
    port: Number(get('port') || POCKET_PROXY_PORT),
    token: get('token'),
    pin: get('pin') || '',
    peers: get('peers') ? get('peers').split(',') : [],
  };
}

/** 轮询重试封装：超时/重试都有明确边界，避免向导死等。 */
export async function withTimeout(promise, ms, label = '操作') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function retry(fn, { attempts = 3, delayMs = 500, label = '操作' } = {}) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastError = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`${label} 失败（重试 ${attempts} 次）：${lastError?.message ?? lastError}`);
}
