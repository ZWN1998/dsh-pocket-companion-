/**
 * Client half of @dsh-pocket/companion — a single DSH settings section.
 *
 * Renders the phone-pairing QR from dsh-pocket's own public `pocket.status`
 * RPC (read-only). It takes the base LAN/tunnel URL and the PIN that the RPC
 * already returns, appends `?token=<pin>` so the phone lands authenticated,
 * and asks the host QR route (/dshpocket/qr) to encode that link.
 *
 * No iframe, no cross-origin fetch, no cookie handling, no other Harness
 * Client packages — only `react` plus the slots/connection/locale services.
 */
window.__ModuleLoader__.load({
  id: '@dsh-pocket/companion',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, useCallback } = React;
    const h = React.createElement;

    const NS = 'pocket-companion';
    const CHANNEL = '/dsh-pocket';
    const STATUS = 'pocket.status';

    const DICT = {
      zh: {
        section: '手机互通',
        title: '扫码连接手机',
        desc: '用手机扫描下方二维码，即可通过加密 P2P 直接访问这台电脑上的 DSH 对话。',
        notReady: '尚未就绪：请确认 dsh-pocket 已安装且代理正在运行（端口 3081）。',
        loading: '正在读取连接状态…',
        error: '读取状态失败：',
        retry: '重试',
        lan: '局域网地址',
        pin: '连接密码（PIN）',
        tunnel: '公网地址',
        copy: '复制链接',
        copied: '已复制',
        scan: '用手机扫一扫',
        note: '二维码已内嵌连接密码，手机扫码后自动登录，无需手动输入。',
        proxy: '代理状态',
        running: '运行中',
        stopped: '未运行',
        noLink: '暂无可用的连接地址，请先在 dsh-pocket 中启动局域网或公网访问。',
      },
      en: {
        section: 'Phone Companion',
        title: 'Scan to connect your phone',
        desc: 'Scan the QR below to reach this computer’s DSH conversations over encrypted P2P.',
        notReady: 'Not ready: make sure dsh-pocket is installed and its proxy is running (port 3081).',
        loading: 'Reading connection status…',
        error: 'Failed to read status: ',
        retry: 'Retry',
        lan: 'LAN address',
        pin: 'Access PIN',
        tunnel: 'Public address',
        copy: 'Copy link',
        copied: 'Copied',
        scan: 'Scan with your phone',
        note: 'The PIN is embedded in the QR, so your phone signs in automatically.',
        proxy: 'Proxy',
        running: 'Running',
        stopped: 'Stopped',
        noLink: 'No address available yet — enable LAN or public access in dsh-pocket first.',
      },
    };

    /** Build the deep link the phone App handles, with the PIN embedded. */
    function buildLink(status) {
      if (!status) return null;
      const useTunnel = !status.lanUrl && status.tunnelUrl;
      const base = status.lanUrl || status.tunnelUrl;
      if (!base) return null;
      const pin = useTunnel ? status.accessToken : status.lanToken;
      try {
        const u = new URL(base);
        if (pin) u.searchParams.set('token', String(pin));
        return u.toString();
      } catch {
        return base + (pin ? (base.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(pin) : '');
      }
    }

    function CompanionSection({ rpcCall, t }) {
      const [status, setStatus] = useState(null);
      const [error, setError] = useState('');
      const [loading, setLoading] = useState(true);
      const [copied, setCopied] = useState(false);

      const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
          const res = await rpcCall(CHANNEL, STATUS, {});
          if (!res || !res.ok) throw new Error((res && res.error && res.error.message) || 'RPC failed');
          setStatus(res.value || {});
        } catch (err) {
          setError(String(err && err.message ? err.message : err));
        } finally {
          setLoading(false);
        }
      }, [rpcCall]);

      useEffect(() => { load(); }, [load]);

      // Refresh every 10s so a freshly started proxy / new PIN shows up.
      useEffect(() => {
        const id = setInterval(() => { load(); }, 10000);
        return () => clearInterval(id);
      }, [load]);

      const link = buildLink(status);
      const qrSrc = link ? ('/dshpocket/qr?text=' + encodeURIComponent(link)) : null;

      const copy = async () => {
        if (!link) return;
        try {
          await navigator.clipboard.writeText(link);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = link;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch { /* ignore */ }
          document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      };

      const card = {
        border: '1px solid var(--dsw-alias-line, #242A36)',
        borderRadius: 16,
        background: 'var(--dsw-alias-surface, #141821)',
        padding: '18px 20px',
        margin: '12px 0',
      };
      const row = { display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', flexWrap: 'wrap' };
      const label = { color: 'var(--dsw-alias-text-muted, #8892A4)', fontSize: 13, minWidth: 92 };
      const value = { color: 'var(--dsw-alias-text, #E9EDF3)', fontSize: 13, wordBreak: 'break-all' };
      const btn = {
        border: 'none', borderRadius: 8, cursor: 'pointer', padding: '7px 14px',
        background: 'var(--dsw-alias-accent, #00D4B8)', color: '#04120f', fontWeight: 600, fontSize: 13,
      };
      const pin = {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 18, letterSpacing: 3, color: 'var(--dsw-alias-accent, #00D4B8)', fontWeight: 700,
      };

      return h('div', { style: { maxWidth: 560 } },
        h('h3', { style: { margin: '4px 0 6px', fontSize: 16 } }, t('title')),
        h('p', { style: { margin: '0 0 12px', fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-text-muted, #8892A4)' } }, t('desc')),
        loading && !status
          ? h('div', { style: card }, t('loading'))
          : null,
        error
          ? h('div', { style: Object.assign({}, card, { color: 'var(--dsw-alias-danger, #F0716E)' }) },
              t('error') + error,
              h('button', { style: Object.assign({}, btn, { marginTop: 10 }), onClick: load }, t('retry')))
          : null,
        status && !status.proxyRunning
          ? h('div', { style: Object.assign({}, card, { color: 'var(--dsw-alias-warning, #F5B445)' }) }, t('notReady'))
          : null,
        status && status.proxyRunning && !link
          ? h('div', { style: card }, t('noLink'))
          : null,
        link
          ? h('div', { style: card },
              h('div', { style: { textAlign: 'center', marginBottom: 12 } },
                h('img', {
                  src: qrSrc, alt: t('scan'), width: 180, height: 180,
                  style: { background: '#fff', padding: 8, borderRadius: 12, display: 'inline-block' },
                })),
              h('p', { style: { textAlign: 'center', fontSize: 12, color: 'var(--dsw-alias-text-muted, #8892A4)', margin: '0 0 14px' } }, t('note')),
              h('div', { style: row },
                h('span', { style: label }, t('proxy')),
                h('span', { style: Object.assign({}, value, { color: 'var(--dsw-alias-accent, #00D4B8)' }) },
                  t(status.proxyRunning ? 'running' : 'stopped') + (status.proxyPort ? ' · :' + status.proxyPort : ''))),
              status.lanUrl
                ? h('div', { style: row }, h('span', { style: label }, t('lan')), h('span', { style: value }, status.lanUrl))
                : null,
              status.tunnelUrl
                ? h('div', { style: row }, h('span', { style: label }, t('tunnel')), h('span', { style: value }, status.tunnelUrl))
                : null,
              status.lanToken
                ? h('div', { style: row }, h('span', { style: label }, t('pin')), h('span', { style: pin }, status.lanToken))
                : null,
              h('div', { style: Object.assign({}, row, { marginTop: 14 }) },
                h('button', { style: btn, onClick: copy }, copied ? t('copied') : t('copy'))),
              h('div', { style: Object.assign({}, value, { marginTop: 12, fontSize: 11, opacity: 0.7 }) }, link))
          : null
      );
    }

    return {
      inject: ['slots', 'connection', 'locale'],
      apply(ctx) {
        const rpcCall = (endpoint, payload, signal) =>
          ctx.connection.rpc.call(CHANNEL, endpoint, payload, signal);
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, DICT), 'pocket-companion: locale');
        ctx.slots.inject('settings.section', () => ctx.slots.register(
          {
            name: 'settings.section',
            id: 'pocket-companion',
            order: 2,
            label: () => t('section'),
            inject: () => ({ rpcCall, t }),
          },
          CompanionSection
        ));
      },
    };
  },
});
