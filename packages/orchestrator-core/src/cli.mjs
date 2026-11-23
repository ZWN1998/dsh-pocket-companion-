#!/usr/bin/env node
/** dshpocket CLI — 电脑端 6 步向导的可运行实现（dry-run 模式无需装任何组件即可演示）。 */
import { createOrchestrator } from './index.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const asJson = args.includes('--json');
const asSvg = args.includes('--svg');
const command = args.find((a) => !a.startsWith('--')) || 'wizard';

const orch = createOrchestrator({ dryRun });
const log = (...a) => { if (!asJson) console.log(...a); };

function step(n, title) { log(`\n=== STEP ${n}/6 ${title} ===`); }

async function wizard() {
  step(1, '环境检测');
  const env = await orch.checkEnvironment();
  log('  宿主 Web:', env.dshWeb.ok ? '已就绪' : '未就绪', `(端口 ${env.dshWeb.port})`);
  log('  dsh-pocket:', env.pocketVersion);
  log('  EasyTier:', env.easyTier.ok ? '已就绪' : '需安装', env.easyTier.path);

  step(2, '组件安装');
  if (!dryRun) {
    await orch.installDshPocket();
    log('  dsh-pocket: 已安装（锁版本）');
  } else {
    log('  [dry-run] 串行两次 add: dsh-pocket@2.13.2 → 我们的插件');
  }
  const et = await orch.installEasyTier();
  log('  EasyTier:', et.ok ? `已就绪 ${et.version}` : et.message);

  step(3, '生成网络');
  const cfg = orch.generateNetwork();
  log('  网络名:', cfg.networkName);
  log('  密钥:', cfg.networkSecret.slice(0, 6) + '••••••');
  log('  虚拟 IP:', cfg.virtualIp);

  step(4, '启动服务');
  const mesh = await orch.startMesh(cfg);
  log('  EasyTier 进程:', mesh.ok ? `运行中 (pid=${mesh.pid})` : '启动失败');
  const proxy = await orch.startPocketProxy();
  log('  dsh-pocket 代理:', proxy.ok ? `监听中 ${proxy.endpoint.host}:${proxy.endpoint.port}` : proxy.message);

  step(5, '扫码配对');
  const pairing = orch.buildPairing();
  log('  配置链接:', pairing.link);
  if (asSvg) log(pairing.svg);
  else log(pairing.ascii);

  step(6, '连接成功');
  log('  手机扫码后即可通过 P2P 直连查看 DSH 对话。');
  if (asJson) console.log(JSON.stringify({ env, cfg, pairing }, null, 2));
}

async function main() {
  try {
    switch (command) {
      case 'wizard': await wizard(); break;
      case 'env': console.log(JSON.stringify(await orch.checkEnvironment(), null, 2)); break;
      case 'pair': {
        const cfg = orch.generateNetwork();
        await orch.startMesh(cfg);
        await orch.startPocketProxy();
        const p = orch.buildPairing();
        console.log(asJson ? JSON.stringify(p, null, 2) : p.link);
        if (asSvg && !asJson) console.log(p.svg);
        break;
      }
      case 'stop': await orch.stopAll(); console.log('已停止所有托管进程'); break;
      default:
        console.error(`未知命令: ${command}\n用法: dshpocket [--dry-run] [--json] [--svg] [wizard|env|pair|stop]`);
        process.exit(1);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
main();
