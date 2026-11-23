/* 口袋 DSH — PWA 前端逻辑（纯静态，可离线运行）
 * 配对链接协议与 orchestrator-core / plugin 共用：
 *   dshpocket://connect?mesh=..&secret=..&host=..&port=3081&token=..&pin=..
 *   或 http(s)://host:port/?token=PIN  （pocket 代理带 token 直达）
 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var STORE_KEY = 'dshpocket.state.v1';

  var DEFAULT = {
    connected: false,
    endpoint: '',        // e.g. http://10.110.119.97:3081
    host: '',
    token: '',
    mesh: '',
    secret: '',
    latency: 23,
    deviceCount: 0,
    balanceMB: 1200,
    usedMB: 3800,
    totalMB: 5000,
    checkin: { last: '', streak: 0, claimed: [] }
  };

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return clone(DEFAULT);
      var parsed = JSON.parse(raw);
      return Object.assign(clone(DEFAULT), parsed);
    } catch (e) { return clone(DEFAULT); }
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- utils ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function fmtMB(mb) {
    return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb + ' MB';
  }

  /* ---------- navigation ---------- */
  var TAB_OF = { 's-connect': 0, 's-traffic': 1, 's-member': 2, 's-profile': 3 };
  function show(id) {
    $$('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    $$('.tabbar .tab').forEach(function (t) {
      t.classList.toggle('active', TAB_OF[id] === $$('.tabbar .tab').indexOf(t));
    });
    if (id === 's-conv') renderMessages();
    if (id === 's-traffic') renderTraffic();
    if (id === 's-profile') renderProfile();
    if (id === 's-connect') renderConnect();
  }

  /* ---------- connect ---------- */
  function renderConnect() {
    var wrap = $('#ring-wrap');
    wrap.classList.toggle('off', !state.connected);
    $('#conn-title').textContent = state.connected ? '已连接' : '未连接';
    $('#conn-sub').textContent = state.connected ? 'P2P 直连 · 加密' : '等待扫码配对';
    $('#path-pc').textContent = state.host || '电脑';
    $('#path-pc').style.display = state.host ? '' : 'none';
    $('#conn-hint').textContent = state.connected
      ? '已连接至 ' + (state.endpoint || state.host) + ' · ' + state.latency + ' ms'
      : '连接后可在「对话」页查看电脑上的 DSH 会话';
    $('#btn-main').firstChild.textContent = state.connected ? '打开 DSH 对话 ' : '扫一扫，连接电脑 ';
    $('#monthly-left').textContent = fmtMB(state.balanceMB);
    $('#monthly-bar').style.width = Math.max(4, Math.min(100, (state.balanceMB / state.totalMB) * 100)) + '%';
  }

  // 解析配对链接，支持 dshpocket:// 与带 token 的 http(s)://
  function parsePairLink(raw) {
    raw = (raw || '').trim();
    if (!raw) throw new Error('链接为空');
    var u;
    try {
      u = new URL(raw);
    } catch (e) {
      // 允许直接粘贴 host:port
      try { u = new URL('http://' + raw); } catch (e2) { throw new Error('无法识别的链接'); }
    }
    var q = u.searchParams;
    var host, port = 3081, token = q.get('token') || q.get('pin') || '';
    if (u.protocol === 'dshpocket:') {
      host = q.get('host');
      port = parseInt(q.get('port') || '3081', 10);
      var mesh = q.get('mesh'), secret = q.get('secret');
      if (!host || !mesh || !secret) throw new Error('配置缺少必要参数（mesh / secret / host）');
      return { host: host, port: port, token: token, mesh: mesh, secret: secret,
        endpoint: 'http://' + host + ':' + port };
    }
    host = u.hostname;
    port = parseInt(u.port || '3081', 10);
    if (!host) throw new Error('无法识别的主机');
    return { host: host, port: port, token: token, mesh: q.get('mesh') || '', secret: q.get('secret') || '',
      endpoint: u.protocol + '//' + host + ':' + port };
  }

  function applyPair(cfg) {
    state.host = cfg.host;
    state.endpoint = cfg.endpoint;
    state.token = cfg.token;
    state.mesh = cfg.mesh || '';
    state.secret = cfg.secret || '';
    save();
    closeScan();
    show('s-connect');
    // 模拟 P2P 连接建立
    var wrap = $('#ring-wrap');
    wrap.classList.add('off');
    $('#conn-title').textContent = '连接中';
    $('#conn-sub').textContent = '正在建立 P2P 连接…';
    toast('已识别配置，正在连接 ' + cfg.host);
    setTimeout(function () {
      state.connected = true;
      state.deviceCount = Math.max(1, state.deviceCount);
      state.latency = 18 + Math.floor(Math.random() * 16);
      save();
      renderConnect();
      renderProfile();
      toast('已连接 · P2P 直连 ' + state.latency + ' ms');
    }, 1400);
  }

  /* ---------- scan sheet ---------- */
  function openScan() { $('#scan-mask').classList.add('show'); }
  function closeScan() { $('#scan-mask').classList.remove('show'); }
  function importScan() {
    var val = $('#scan-input').value;
    try {
      var cfg = parsePairLink(val);
      applyPair(cfg);
      $('#scan-input').value = '';
    } catch (e) { toast(e.message || '链接无效'); }
  }

  /* ---------- traffic / checkin ---------- */
  function renderTraffic() {
    $('#balance-num').innerHTML = (state.balanceMB / 1024).toFixed(2) + '<small>GB</small>';
    $('#balance-bar').style.width = Math.max(2, (state.balanceMB / state.totalMB) * 100) + '%';
    $('#balance-meta').textContent = '余额 ' + fmtMB(state.balanceMB) + ' · 每月 ' + (state.totalMB / 1024).toFixed(0) + ' GB';
    var done = state.checkin.last === today();
    var btn = $('#btn-checkin');
    btn.textContent = done ? '✓ 今日已签到 · +100 MB' : '签到领取 100 MB';
    btn.classList.toggle('done', done);
    $('#checkin-desc').textContent = done
      ? '今日已领取 100 MB，明天再来吧 · 已连续 ' + state.checkin.streak + ' 天'
      : '每日签到领取 100 MB，连续 7 天额外奖励 500 MB';
    var streak = $('#streak');
    var days = ['一', '二', '三', '四', '五', '六', '日'];
    streak.innerHTML = days.map(function (d, i) {
      var on = i < Math.min(7, state.checkin.streak);
      return '<div class="day' + (on ? ' on' : '') + '">' +
        (on ? '<svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>' : '<span>·</span>') +
        '<span>周' + d + '</span></div>';
    }).join('');
    renderTiers();
  }
  function renderTiers() {
    var tiers = [
      { b: '日包 1 GB', p: '适合临时应急 · 当日有效', price: '¥1.9', hot: false },
      { b: '月包 5 GB', p: '日常使用 · 30 天有效', price: '¥9.9', hot: true },
      { b: '月包 20 GB', p: '重度用户 · 30 天有效', price: '¥29.9', hot: false }
    ];
    $('#tiers').innerHTML = tiers.map(function (t) {
      return '<div class="tier' + (t.hot ? ' hot' : '') + '">' +
        '<div class="ic"><svg viewBox="0 0 24 24"><path d="M4 7h16v12H4zM4 7l16 10M20 7L4 17"/></svg></div>' +
        '<div class="tinfo"><b>' + t.b + '</b><p>' + t.p + '</p></div>' +
        '<div class="tprice">' + t.price + '</div></div>';
    }).join('');
  }
  function checkin() {
    if (state.checkin.last === today()) { toast('今天已经签到过啦'); return; }
    var t = today();
    var yesterday = new Date(Date.now() - 86400000);
    var y = yesterday.getFullYear() + '-' + ('0' + (yesterday.getMonth() + 1)).slice(-2) + '-' + ('0' + yesterday.getDate()).slice(-2);
    state.checkin.streak = (state.checkin.last === y) ? (state.checkin.streak + 1) : 1;
    state.checkin.last = t;
    state.checkin.claimed.push(t);
    var bonus = state.checkin.streak % 7 === 0 ? 500 : 100;
    state.balanceMB += bonus;
    save();
    renderTraffic();
    toast('签到成功 +' + bonus + ' MB' + (bonus > 100 ? '（连续 7 天奖励）' : ''));
  }

  /* ---------- member ---------- */
  function renderMember() {
    var perks = [
      { b: '不限设备数', p: '手机、平板、多台电脑随时连接' },
      { b: '每月 5 GB 高速流量', p: 'P2P 直连优先，速率不受限' },
      { b: '优先中继节点', p: '跨网络也能稳定连接' },
      { b: '端到端加密', p: '对话内容仅你的设备可见' },
      { b: '签到加倍', p: '会员每日签到额外 +50 MB' }
    ];
    $('#perks').innerHTML = perks.map(function (p, i) {
      var icons = [
        '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/>',
        '<path d="M4 20V10M10 20V4M16 20v-7"/>',
        '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>',
        '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
        '<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 3z"/>'
      ];
      return '<div class="perk"><div class="pic"><svg viewBox="0 0 24 24">' + icons[i] + '</svg></div>' +
        '<div><b>' + p.b + '</b><p>' + p.p + '</p></div></div>';
    }).join('');
  }

  /* ---------- profile ---------- */
  function renderProfile() {
    $('#device-count').textContent = state.deviceCount + ' 台';
    var box = $('#devices');
    if (!state.connected || state.deviceCount === 0) {
      box.innerHTML = '<div class="empty">暂无设备，扫码连接后显示在这里</div>';
    } else {
      box.innerHTML = '<div class="device"><div class="dlogo">💻</div><div><div class="dname">' +
        (state.host || '我的电脑') + '</div><div class="dmeta">P2P 直连 · ' + state.latency + ' ms</div></div>' +
        '<span class="live">在线</span></div>';
    }
    $('#profile-id').textContent = 'ID: ' + shortId();
  }
  function shortId() {
    var s = state.endpoint || 'dshpocket';
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h.toString(16).toUpperCase().slice(0, 6).padStart(6, '0');
  }
  function renderMenu() {
    var items = [
      { ic: '<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 3z"/>', t: '会员中心', fn: function () { show('s-member'); } },
      { ic: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M4 8h16M8 20h8"/>', t: '连接管理', fn: function () { openScan(); } },
      { ic: '<path d="M12 16v-4M12 8h.01"/><circle cx="12" cy="12" r="9"/>', t: '关于与帮助', fn: function () { toast('口袋 DSH · 软件授权版'); } },
      { ic: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>', t: '清除本地数据', fn: function () {
          localStorage.removeItem(STORE_KEY); state = clone(DEFAULT); renderAll(); toast('已清除');
        } }
    ];
    $('#profile-menu').innerHTML = items.map(function (it, i) {
      return '<div class="menu-item" data-i="' + i + '"><svg viewBox="0 0 24 24">' + it.ic + '</svg>' +
        '<span>' + it.t + '</span><svg class="arr" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></div>';
    }).join('');
    $$('#profile-menu .menu-item').forEach(function (el) {
      el.addEventListener('click', function () { items[+el.dataset.i].fn(); });
    });
  }

  /* ---------- conversation demo ---------- */
  var seedMessages = [
    { who: 'user', text: '帮我重构一下登录模块，把 session 校验抽出来' },
    { who: 'agent', html: '好的，我先看一下现有的 session 实现。' +
      '<div class="tool"><div class="th"><svg viewBox="0 0 24 24"><path d="M4 7h16v12H4z"/></svg>读取文件</div>' +
      '<code>src/auth/session.mjs</code></div>' +
      '发现校验逻辑和路由耦合在一起，我建议抽成独立的 <code>verifySession()</code>。' },
    { who: 'user', text: '可以，动手改吧' },
    { who: 'agent', html: '已修改，主要变更：\n• 新增 <code>verifySession(token)</code>\n• 路由仅调用校验函数\n' +
      '<div class="tool"><div class="th"><svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18"/></svg>写入文件</div>' +
      '<code>src/auth/session.mjs  +18 -7</code></div>', typing: false }
  ];
  function renderMessages() {
    var box = $('#messages');
    box.innerHTML = seedMessages.map(function (m) {
      var body = m.html ? m.html.replace(/\n/g, '<br>') : escapeHtml(m.text || '');
      return '<div class="msg ' + (m.who === 'user' ? 'user' : '') + '">' +
        '<div class="mav">' + (m.who === 'user' ? '我' : 'D') + '</div>' +
        '<div class="bubble">' + body + '</div></div>';
    }).join('');
    $('#conv-latency').textContent = '通过加密 P2P 连接 · ' + state.latency + ' ms';
    $('#conv-notice').style.display = state.connected ? 'none' : '';
    setTimeout(function () { box.scrollTop = box.scrollHeight; }, 30);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function sendMessage(e) {
    e.preventDefault();
    var input = $('#msg-input');
    var text = input.value.trim();
    if (!text) return;
    seedMessages.push({ who: 'user', text: text });
    seedMessages.push({ who: 'agent', html: '<span class="typing"><i></i><i></i><i></i></span>' });
    input.value = '';
    renderMessages();
    setTimeout(function () {
      seedMessages[seedMessages.length - 1] = {
        who: 'agent', html: '收到。这是界面演示消息 —— 连接电脑后，这里会显示 DSH 的真实回复。'
      };
      renderMessages();
    }, 1200);
  }

  /* ---------- web container ---------- */
  function openWeb(url) {
    if (!url) { toast('尚未配置连接地址'); return; }
    $('#web-host').textContent = state.host || 'DSH Web';
    $('#web-url').textContent = url;
    var frame = $('#web-frame');
    // 带 token 直达：pocket 代理接受 ?token= 种 cookie
    var finalUrl = url;
    if (state.token && finalUrl.indexOf('token=') === -1) {
      finalUrl += (finalUrl.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(state.token);
    }
    frame.src = finalUrl;
    show('s-web');
  }

  /* ---------- wire up ---------- */
  function bind() {
    $$('.tabbar .tab').forEach(function (t) {
      t.addEventListener('click', function () { show(t.dataset.screen); });
    });
    $('#btn-main').addEventListener('click', function () {
      if (state.connected) show('s-conv'); else openScan();
    });
    $('#btn-scan').addEventListener('click', openScan);
    $('#btn-scan-top').addEventListener('click', openScan);
    $('#btn-switch').addEventListener('click', function () {
      toast('当前中继：默认（海外 P2P）');
    });
    $('#btn-scan-close').addEventListener('click', closeScan);
    $('#scan-mask').addEventListener('click', function (e) {
      if (e.target === $('#scan-mask')) closeScan();
    });
    $('#btn-scan-import').addEventListener('click', importScan);
    $('#scan-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') importScan(); });

    $('#btn-checkin').addEventListener('click', checkin);
    $('#btn-buy').addEventListener('click', function () { toast('演示界面：支付将在正式版接入'); });
    $('#btn-conv-back').addEventListener('click', function () { show('s-connect'); });
    $('#composer').addEventListener('submit', sendMessage);
    $('#btn-conv-reload').addEventListener('click', function () { renderMessages(); toast('已刷新会话'); });
    $('#btn-web-back').addEventListener('click', function () { show(state.connected ? 's-conv' : 's-connect'); });
    $('#btn-web-demo').addEventListener('click', function () { toast('连接电脑后可在此操作真实 DSH Web'); });
    $('#btn-traffic-info').addEventListener('click', function () { toast('流量用于中继转发；P2P 直连不消耗流量'); });
    $('#btn-settings').addEventListener('click', function () { toast('口袋 DSH · 设置'); });

    // 点击连接页路径中的电脑节点 -> 打开真实 Web 容器
    $('#path-pc').addEventListener('click', function () { openWeb(state.endpoint); });
    $('#path-pc').style.cursor = 'pointer';

    // 处理从系统/浏览器以 dshpocket:// 或带 token 的 http 链接唤起
    handleIncomingLink();
    window.addEventListener('hashchange', handleIncomingLink);
  }
  function handleIncomingLink() {
    var h = location.hash || '';
    if (h.indexOf('#connect=') === 0) {
      try { applyPair(parsePairLink(decodeURIComponent(h.slice(9)))); }
      catch (e) { toast(e.message); }
      history.replaceState(null, '', location.pathname);
    }
  }

  function renderAll() {
    renderConnect(); renderTraffic(); renderMember(); renderProfile(); renderMenu(); renderMessages();
  }

  function clock() {
    var d = new Date();
    $('#clock').textContent = d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  // PWA service worker（可选，离线缓存）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    renderAll();
    clock();
    setInterval(clock, 30000);
  });
})();
