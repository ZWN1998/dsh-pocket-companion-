/**
 * @dsh-pocket/orchestrator-core — 桌面启动器与服务端的唯一编排层。
 *
 * 合规：本模块只通过「子进程 + HTTP/RPC」调用 dsh-pocket 与 EasyTier，
 * 绝不 import 其源码、不修改其文件、不打包 DSH 本体（三条铁律）。
 * 可注入 dependencies（spawn/fetch/ping/exists），便于在没装组件的环境测试。
 */
import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  DSH_POCKET_VERSION, EASYTIER_VERSION, POCKET_PROXY_PORT, DSH_WEB_UPSTREAM_PORT,
  DEFAULT_PEERS, generateMeshConfig, buildConnectLink, buildEasyTierArgs,
  withTimeout, retry, randomToken,
} from '@dsh-pocket/shared';
import { qrToSvg, qrToAscii } from './qr.mjs';

/** 默认依赖，可被构造参数替换（测试/干跑）。 */
const defaultDeps = {
  spawn: nodeSpawn,
  fetch: (...a) => globalThis.fetch(...a),
  exists: (p) => fs.existsSync(p),
  // Windows 用 ping -n，其它用 ping -c；实际执行由 pingCommand 决定
  pingCommand: (host) => process.platform === 'win32'
    ? { cmd: 'ping', args: ['-n', '1', '-w', '1000', host] }
    : { cmd: 'ping', args: ['-c', '1', '-W', '1', host] },
  log: () => {},
};

/** 默认可执行的 EasyTier 路径（本机实测），可被覆盖。 */
const DEFAULT_ET_PATH = 'D:/WWwVPN/easytier-win/easytier-core.exe';

export class Orchestrator {
  constructor(options = {}) {
    this.deps = { ...defaultDeps, ...(options.deps || {}) };
    this.dryRun = options.dryRun ?? false;
    this.easyTierPath = options.easyTierPath || DEFAULT_ET_PATH;
    this.dshHost = options.dshHost || '127.0.0.1';
    this.dshGuiPort = options.dshGuiPort || 13995;
    this._children = new Map();
    this._meshConfig = null;
    this._endpoint = null;
    this._link = null;
  }

  /** TCP 端口是否可连接。 */
  async _portOpen(host, port, timeout = 800) {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      const done = (v) => { socket.destroy(); resolve(v); };
      socket.setTimeout(timeout);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });
  }

  /** 4.1 步骤 1：环境体检。 */
  async checkEnvironment() {
    const { exists, log } = this.deps;
    log('checkEnvironment: 开始体检');
    const [dshWeb, dshGui, pocket, easyTier] = await Promise.all([
      this._portOpen(this.dshHost, DSH_WEB_UPSTREAM_PORT),
      this._portOpen(this.dshHost, this.dshGuiPort),
      this._portOpen('0.0.0.0', POCKET_PROXY_PORT).catch(() => false),
      Promise.resolve(exists(this.easyTierPath)),
    ]);
    return {
      dshWeb: { ok: dshWeb, port: DSH_WEB_UPSTREAM_PORT },
      dshGui: { ok: dshGui, port: this.dshGuiPort },
      pocketProxy: { ok: pocket, port: POCKET_PROXY_PORT },
      easyTier: { ok: easyTier, path: this.easyTierPath, version: EASYTIER_VERSION },
      pocketVersion: DSH_POCKET_VERSION,
    };
  }

  /** 调用 dsh 插件安装（两次 add：先 dsh-pocket，再我们的插件）。 */
  async _dshAdd(packageName) {
    if (this.dryRun) {
      this.deps.log(`[dry-run] dsh plugin add ${packageName}`);
      return { ok: true, dryRun: true };
    }
    // 用 dsh CLI；若没在 PATH 里，调用方应捕获错误并引导用户点 GUI。
    const result = await new Promise((resolve) => {
      const child = this.deps.spawn('dsh', ['plugin', 'add', packageName], { stdio: 'pipe' });
      let out = '';
      child.stdout?.on('data', (d) => { out += d.toString(); });
      child.stderr?.on('data', (d) => { out += d.toString(); });
      child.once('error', (e) => resolve({ ok: false, error: e.message }));
      child.once('exit', (code) => resolve({ ok: code === 0, code, output: out.slice(-2000) }));
    });
    if (!result.ok) {
      throw new Error(`安装 ${packageName} 失败：${result.error ?? result.output ?? result.code}\n`
        + '若本机无 dsh CLI，请在 DSH Web 的插件管理里手动添加本地目录。');
    }
    return result;
  }

  /** 4.1 步骤 2a：安装锁版本的原版 dsh-pocket（不动源码）。 */
  async installDshPocket(version = DSH_POCKET_VERSION) {
    return this._dshAdd(`dsh-pocket@${version}`);
  }

  /** 4.1 步骤 2b：安装我们的编排插件（bundle 目录，由调用方传路径）。 */
  async installOurPlugin(pluginPath) {
    return this._dshAdd(pluginPath || path.resolve('packages/plugin'));
  }

  /** 4.1 步骤 2c：EasyTier 检测/引导下载（这里只检测并回报，不自动下载未知来源二进制）。 */
  async installEasyTier() {
    const ok = this.deps.exists(this.easyTierPath);
    if (!ok) {
      return {
        ok: false,
        path: this.easyTierPath,
        message: '未找到 easytier-core，请从官方发布页下载并放到此路径，或在启动器里点“打开下载页”。',
        downloadUrl: 'https://github.com/EasyTier/EasyTier/releases',
      };
    }
    return { ok: true, path: this.easyTierPath, version: EASYTIER_VERSION };
  }

  /** 4.1 步骤 3：生成 mesh 配置。 */
  generateNetwork(options = {}) {
    this._meshConfig = options.config || generateMeshConfig(options);
    return this._meshConfig;
  }

  /** 4.1 步骤 4a：拉起 EasyTier 独立进程。 */
  async startMesh(cfg = this._meshConfig) {
    if (!cfg) throw new Error('请先 generateNetwork()');
    this._meshConfig = cfg;
    if (this.dryRun) {
      this.deps.log(`[dry-run] startMesh ${buildEasyTierArgs(cfg).join(' ')}`);
      return { ok: true, pid: 0, dryRun: true, args: buildEasyTierArgs(cfg) };
    }
    const args = buildEasyTierArgs(cfg);
    const child = this.deps.spawn(this.easyTierPath, args, { stdio: 'ignore', detached: false });
    child.once('error', (e) => this.deps.log(`EasyTier 进程错误: ${e.message}`));
    this._children.set('easytier', child);
    await new Promise((r) => setTimeout(r, 500));
    return { ok: true, pid: child.pid, args };
  }

  /** 4.1 步骤 4b：确认 dsh-pocket 代理在 3081 监听，返回 endpoint。 */
  async startPocketProxy(options = {}) {
    const host = this._meshConfig?.virtualIp || '127.0.0.1';
    const port = POCKET_PROXY_PORT;
    this._endpoint = { host, port, pin: options.pin || '' };
    if (!this.dryRun) {
      const listening = await this._portOpen('127.0.0.1', port);
      if (!listening) {
        return {
          ok: false,
          message: `dsh-pocket 代理未在 127.0.0.1:${port} 监听。请先确认插件已安装且 DSH Web 已启动。`,
          endpoint: this._endpoint,
        };
      }
    }
    return { ok: true, endpoint: this._endpoint };
  }

  /** 调 pocket.status RPC（需在浏览器 session 内；外部直连返回 unauthorized）。 */
  async pocketStatus({ sessionCookie, baseUrl } = {}) {
    const url = `${baseUrl || `http://127.0.0.1:${DSH_WEB_UPSTREAM_PORT}`}/dsh-pocket/pocket.status`;
    const headers = sessionCookie ? { cookie: sessionCookie } : {};
    const res = await this.deps.fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`pocket.status 返回 ${res.status}${res.status === 401 ? '（缺少 session cookie，需在浏览器 session 内调用）' : ''}`);
    }
    return res.json();
  }

  /** 检测 P2P：能不能 ping 通对端 mesh IP。 */
  async detectP2P(peerIp) {
    if (!peerIp) throw new Error('缺少对端 mesh IP');
    if (this.dryRun) return 'p2p';
    const { cmd, args } = this.deps.pingCommand(peerIp);
    return new Promise((resolve) => {
      const child = this.deps.spawn(cmd, args, { stdio: 'ignore' });
      child.once('error', () => resolve('relay'));
      child.once('exit', (code) => resolve(code === 0 ? 'p2p' : 'relay'));
    });
  }

  /** 4.1 步骤 5：生成带凭证配置链接 + 真实可扫描二维码。 */
  buildPairing(options = {}) {
    if (!this._meshConfig) throw new Error('请先 generateNetwork()');
    const endpoint = this._endpoint || { host: this._meshConfig.virtualIp, port: POCKET_PROXY_PORT, token: randomToken(12) };
    const link = buildConnectLink(this._meshConfig, endpoint, options.pin || endpoint.pin || '');
    this._link = link;
    return {
      link,
      svg: qrToSvg(link),
      ascii: qrToAscii(link),
      endpoint,
    };
  }

  async getStatus() {
    return {
      mesh: this._meshConfig,
      endpoint: this._endpoint,
      mode: this._lastMode || 'p2p',
      connectLink: this._link,
      children: [...this._children.keys()],
    };
  }

  async stopAll() {
    for (const [name, child] of this._children) {
      try { child.kill(); } catch { /* 已退出 */ }
      this._children.delete(name);
    }
  }
}

/** CLI 使用的默认实例工厂。 */
export function createOrchestrator(options) {
  return new Orchestrator(options);
}

export { qrToSvg, qrToAscii };
