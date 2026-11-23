/**
 * Host half of @dsh-pocket/companion.
 *
 * Registers ONE same-origin HTTP route that turns arbitrary text into a real,
 * scannable QR SVG. The settings page (client.js) already obtains the
 * credential-bearing link from dsh-pocket's public `pocket.status` RPC, so this
 * route is a PURE encoder: it only echoes text the same-origin caller supplied
 * and exposes no secret of its own. That is why it deliberately does not call
 * connection.requestRejection — there is no trust boundary to protect here,
 * and skipping it avoids the spurious 403s described in dsh-pocket issue #117.
 *
 * COMPLIANCE (three iron rules): this module only uses DSH's own `webServer`
 * slot and the public RPC channel of the separately installed dsh-pocket. It
 * does NOT import, copy, modify or bundle any GPL/LGPL source, and does NOT
 * embed DSH itself. The QR encoder is vendored MIT (qrcode-generator 1.4.4).
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const qrcode = require('./vendor/qrcode.cjs');

/** Host-side services this plugin needs from DSH. */
export const inject = ['webServer'];

export const QR_ROUTE = '/dshpocket/qr';

/** Render text -> QR SVG string (white bg, dark modules, 4-cell quiet zone). */
export function svgFor(text, { scale = 6, margin = 4, dark = '#0b0e13', light = '#ffffff', ec = 'M' } = {}) {
  const qr = qrcode(0, ec);
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  const dim = (n + margin * 2) * scale;
  const rects = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.isDark(y, x)) {
        rects.push(`<rect x="${(x + margin) * scale}" y="${(y + margin) * scale}" width="${scale}" height="${scale}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="pairing QR">`
    + `<rect width="${dim}" height="${dim}" fill="${light}"/>`
    + `<g fill="${dark}">${rects.join('')}</g></svg>`;
}

export function apply(ctx = {}) {
  const logger = ctx.logger?.('pocket-companion') ?? console;
  const webServer = ctx.webServer;
  if (!webServer || typeof webServer.register !== 'function') {
    logger.warn?.('pocket-companion: webServer unavailable — QR route disabled (settings page still shows link + PIN)');
    return () => {};
  }

  const registered = webServer.register({
    kind: 'prefix',
    path: QR_ROUTE,
    handler: (req, res) => {
      let text = '';
      try {
        text = new URL(req.url ?? '', 'http://localhost').searchParams.get('text') ?? '';
      } catch { /* empty */ }
      if (!text) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('missing text');
        return;
      }
      try {
        const svg = svgFor(text);
        res.writeHead(200, {
          'content-type': 'image/svg+xml; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': Buffer.byteLength(svg),
        });
        res.end(svg);
      } catch (err) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(String(err?.message ?? err));
      }
    },
  });

  // register may return a disposer, a Promise<disposer>, or undefined.
  if (typeof registered === 'function') return registered;
  if (registered && typeof registered.then === 'function') {
    let done = false;
    return async () => {
      if (done) return;
      done = true;
      try { const d = await registered; if (typeof d === 'function') d(); } catch { /* already cleaned */ }
    };
  }
  return () => {};
}
