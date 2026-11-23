import test from 'node:test';
import assert from 'node:assert/strict';
import { svgFor, apply, inject, QR_ROUTE } from '../index.js';

test('inject declares webServer only (no GPL source, no cookie handling)', () => {
  assert.deepEqual(inject, ['webServer']);
});

test('svgFor produces a real scannable QR SVG for a credential link', () => {
  const link = 'http://10.110.119.97:3081/?token=12345678';
  const svg = svgFor(link);
  assert.match(svg, /^<svg /);
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<rect width="\d+" height="\d+" fill="#ffffff"\/>/);
  // At least one dark module must be present for a non-trivial link.
  const dark = (svg.match(/<rect x=/g) || []).length;
  assert.ok(dark > 50, `expected many dark modules, got ${dark}`);
  assert.match(svg, /<\/svg>$/);
});

test('svgFor encodes different links into different images', () => {
  const a = svgFor('http://10.110.119.97:3081/?token=11111111');
  const b = svgFor('http://10.110.119.97:3081/?token=22222222');
  assert.notEqual(a, b);
});

test('apply registers a prefix route and returns a disposer', () => {
  let registeredRoute = null;
  const ctx = {
    webServer: {
      register(route) {
        registeredRoute = route;
        return () => {};
      },
    },
  };
  const dispose = apply(ctx);
  assert.equal(typeof dispose, 'function');
  assert.ok(registeredRoute);
  assert.equal(registeredRoute.kind, 'prefix');
  assert.equal(registeredRoute.path, QR_ROUTE);
  assert.equal(typeof registeredRoute.handler, 'function');
  dispose();
});

test('apply without webServer degrades gracefully', () => {
  const dispose = apply({});
  assert.equal(typeof dispose, 'function');
  dispose();
});

test('route handler: 400 on missing text, 200 + SVG on valid text', () => {
  let handler;
  apply({
    webServer: { register(route) { handler = route.handler; return () => {}; } },
  });
  const mkRes = () => ({ code: 0, body: '', writeHead(c) { this.code = c; }, end(b) { this.body = b; } });

  const bad = mkRes();
  handler({ url: QR_ROUTE }, bad);
  assert.equal(bad.code, 400);

  const good = mkRes();
  const link = encodeURIComponent('http://10.110.119.97:3081/?token=87654321');
  handler({ url: QR_ROUTE + '?text=' + link }, good);
  assert.equal(good.code, 200);
  assert.match(good.body, /^<svg /);
});
