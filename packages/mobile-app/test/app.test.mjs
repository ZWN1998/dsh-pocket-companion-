import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PWA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pwa');
const read = (f) => readFile(path.join(PWA, f), 'utf8');

test('PWA 五页结构齐全', async () => {
  const html = await read('index.html');
  for (const id of ['s-connect', 's-traffic', 's-member', 's-profile', 's-conv', 's-web']) {
    assert.match(html, new RegExp(`id="${id}"`), `缺少页面 ${id}`);
  }
  // 底部 4 tab
  const tabs = [...html.matchAll(/data-screen="(s-[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ['s-connect', 's-traffic', 's-member', 's-profile']);
});

test('设计 token 与原型一致', async () => {
  const css = await read('styles.css');
  for (const token of ['--accent:#00D4B8', '--amber:#F5B445', '--bg:#0A0C10', '--surface:#141821']) {
    assert.ok(css.includes(token), `缺少 token ${token}`);
  }
});

test('配对链接解析同时支持 dshpocket:// 与带 token 的 http', async () => {
  const js = await read('app.js');
  assert.match(js, /dshpocket:/);
  assert.match(js, /q\.get\('token'\)/);
  assert.match(js, /searchParams/);
  // 签到持久化
  assert.match(js, /localStorage/);
  assert.match(js, /今天已经签到过啦/);
});

test('manifest 与 service worker 存在', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#0A0C10');
  const sw = await read('sw.js');
  assert.match(sw, /dshpocket-shell/);
  assert.match(sw, /url\.origin !== self\.location\.origin/); // 跨域透传，不缓存用户数据
});
