/**
 * 二维码渲染：使用随包 vendored 的 qrcode-generator（MIT，kazuhikoarase）。
 * 生成真实可扫描的 QR SVG，不是原型里的假格子。
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const qrcode = require('../vendor/qrcode.cjs');

/** 返回 { modules, size }，modules[y][x] 为 0/1。 */
export function encodeQR(text, errorCorrection = 'M') {
  const typeNumber = 0; // 0 = 自动选择最小版本
  const qr = qrcode(typeNumber, errorCorrection);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const modules = [];
  for (let y = 0; y < count; y++) {
    const row = [];
    for (let x = 0; x < count; x++) row.push(qr.isDark(y, x) ? 1 : 0);
    modules.push(row);
  }
  return { modules, size: count };
}

/** 渲染为 SVG 字符串（白底黑码，静默区 4 格）。 */
export function qrToSvg(text, { scale = 6, margin = 4, dark = '#0b0e13', light = '#ffffff', ec = 'M' } = {}) {
  const { modules, size } = encodeQR(text, ec);
  const dim = (size + margin * 2) * scale;
  const rects = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) {
        rects.push(`<rect x="${(x + margin) * scale}" y="${(y + margin) * scale}" width="${scale}" height="${scale}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="配置二维码">`
    + `<rect width="${dim}" height="${dim}" fill="${light}"/>`
    + `<g fill="${dark}">${rects.join('')}</g></svg>`;
}

/** 渲染为终端 ASCII（供 CLI 直接显示，无需图片查看器）。 */
export function qrToAscii(text) {
  const { modules } = encodeQR(text);
  return modules.map((row) => row.map((v) => (v ? '██' : '  ')).join('')).join('\n');
}
