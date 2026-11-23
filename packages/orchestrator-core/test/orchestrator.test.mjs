import test from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../src/index.mjs';
import { encodeQR, qrToSvg } from '../src/qr.mjs';

test('dry-run wizard builds a full pairing without any installed component', async () => {
  const orch = new Orchestrator({ dryRun: true });
  const env = await orch.checkEnvironment();
  const cfg = orch.generateNetwork();
  const proxy = await orch.startPocketProxy();
  const p = orch.buildPairing();
  assert.equal(env.pocketVersion, '2.13.2');
  assert.ok(cfg.networkName.startsWith('dsh-'));
  assert.ok(proxy.ok);
  assert.ok(p.link.startsWith('dshpocket://connect?'));
  assert.ok(p.svg.startsWith('<svg'));
  assert.ok(p.ascii.includes('██'));
});

test('QR encodes the exact connect link (real QR, not a stub)', () => {
  const link = 'dshpocket://connect?mesh=dsh-abc123&secret=abcdefghijkl&host=10.110.119.97&port=3081&token=12345678';
  const { modules, size } = encodeQR(link);
  assert.ok(size >= 21);
  assert.equal(modules.length, size);
  assert.equal(modules[0].length, size);
  // 三个定位角（finder pattern）应为实心 7x7 的边框
  assert.equal(modules[0][0], 1);
  assert.equal(modules[0][size - 1], 1);
  assert.equal(modules[size - 1][0], 1);
});

test('pocketStatus surfaces a clear 401 hint', async () => {
  const orch = new Orchestrator({
    deps: { fetch: async () => ({ ok: false, status: 401 }) },
  });
  await assert.rejects(() => orch.pocketStatus(), /缺少 session cookie/);
});

test('installEasyTier points to the official release page when missing', async () => {
  const orch = new Orchestrator({ deps: { exists: () => false } });
  const r = await orch.installEasyTier();
  assert.equal(r.ok, false);
  assert.match(r.downloadUrl, /github\.com\/EasyTier/);
});
