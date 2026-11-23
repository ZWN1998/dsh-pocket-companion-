import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECT_SCHEME, POCKET_PROXY_PORT, generateMeshConfig, buildConnectLink,
  parseConnectLink, buildEasyTierArgs, withTimeout, retry,
} from '../src/index.mjs';

test('generateMeshConfig produces valid mesh parameters', () => {
  const cfg = generateMeshConfig();
  assert.match(cfg.networkName, /^dsh-[a-z0-9]{6}$/);
  assert.equal(cfg.networkSecret.length, 12);
  const ip = Number(cfg.virtualIp.split('.').pop());
  assert.ok(ip >= 60 && ip <= 139);
});

test('connect link round-trips through parse', () => {
  const cfg = generateMeshConfig();
  const link = buildConnectLink(cfg, { host: '10.110.119.97', port: POCKET_PROXY_PORT, token: 'tok' }, 'pin123');
  assert.ok(link.startsWith(`${CONNECT_SCHEME}://connect?`));
  const parsed = parseConnectLink(link);
  assert.equal(parsed.networkName, cfg.networkName);
  assert.equal(parsed.networkSecret, cfg.networkSecret);
  assert.equal(parsed.host, '10.110.119.97');
  assert.equal(parsed.port, 3081);
  assert.equal(parsed.pin, 'pin123');
});

test('parseConnectLink rejects bad links', () => {
  assert.throws(() => parseConnectLink('http://example.com'), /scheme 错误/);
  assert.throws(() => parseConnectLink('dshpocket://connect?mesh=a'), /缺少必要参数/);
});

test('buildEasyTierArgs uses CLI flags only', () => {
  const cfg = generateMeshConfig();
  const args = buildEasyTierArgs(cfg);
  assert.ok(args.includes('--network-name'));
  assert.ok(args.includes(cfg.networkName));
  assert.ok(args.includes('-i'));
  assert.ok(args.includes(cfg.virtualIp));
  assert.ok(args.includes('-p'));
});

test('withTimeout rejects on timeout', async () => {
  await assert.rejects(() => withTimeout(new Promise(() => {}), 20, '测试'), /测试 超时/);
});

test('retry succeeds after transient failure', async () => {
  let n = 0;
  const result = await retry(async () => { if (++n < 2) throw new Error('flaky'); return 'ok'; }, { attempts: 3, delayMs: 1 });
  assert.equal(result, 'ok');
  assert.equal(n, 2);
});
