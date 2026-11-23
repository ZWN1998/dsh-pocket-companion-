import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:app_links/app_links.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// 口袋 DSH — Flutter 原生壳
/// 职责：深链(dshpocket://)唤起、扫码、配对配置持久化、内嵌 WebView 加载
/// 配对后的 DSH Web（http://host:port/?token=PIN）。UI 设计语言与 PWA 一致。
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // 兜底：任何未捕获的 build 异常显示可见错误页，而不是 release 黑屏，便于定位问题
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
  };
  ErrorWidget.builder = (details) {
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Container(
        color: const Color(0xFF0A0C10),
        alignment: Alignment.center,
        padding: const EdgeInsets.all(24),
        child: Text('界面出错：${details.exception}',
            style: const TextStyle(color: Color(0xFFF0716E), fontSize: 14)),
      ),
    );
  };
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Color(0xFF0A0C10),
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF0E1117),
  ));
  runApp(const PocketApp());
}

// ---------- 设计 token ----------
const bg = Color(0xFF0A0C10);
const stage = Color(0xFF0E1117);
const surface = Color(0xFF141821);
const surface2 = Color(0xFF1B202B);
const line = Color(0xFF242A36);
const textMain = Color(0xFFE9EDF3);
const muted = Color(0xFF8892A4);
const muted2 = Color(0xFF5E6879);
const accent = Color(0xFF00D4B8);
const amber = Color(0xFFF5B445);

const connectScheme = 'dshpocket';
const storeKey = 'dshpocket.state';

class PairConfig {
  final String host;
  final int port;
  final String token;
  final String mesh;
  final String secret;
  PairConfig({required this.host, required this.port, required this.token,
    required this.mesh, required this.secret});

  String get endpoint => 'http://$host:$port';
  String get webUrl => token.isEmpty
      ? endpoint
      : '$endpoint/?token=${Uri.encodeComponent(token)}';

  Map<String, dynamic> toMap() => {
    'host': host, 'port': port, 'token': token, 'mesh': mesh, 'secret': secret};
  factory PairConfig.fromMap(Map<String, dynamic> m) => PairConfig(
    host: m['host'] ?? '', port: m['port'] ?? 3081, token: m['token'] ?? '',
    mesh: m['mesh'] ?? '', secret: m['secret'] ?? '');
}

/// 配对链接解析：dshpocket://connect?mesh=&secret=&host=&port=&token=
/// 或带 token 的 http(s)://host:port/?token=PIN
PairConfig parsePairLink(String raw) {
  raw = raw.trim();
  if (raw.isEmpty) throw const FormatException('链接为空');
  Uri u;
  try {
    u = Uri.parse(raw);
  } catch (_) {
    u = Uri.parse('http://$raw');
  }
  final q = u.queryParameters;
  final token = q['token'] ?? q['pin'] ?? '';
  if (u.scheme == connectScheme) {
    final host = q['host'];
    final mesh = q['mesh'];
    final secret = q['secret'];
    if (host == null || mesh == null || secret == null) {
      throw const FormatException('配置缺少必要参数（mesh / secret / host）');
    }
    return PairConfig(host: host, port: int.tryParse(q['port'] ?? '3081') ?? 3081,
      token: token, mesh: mesh, secret: secret);
  }
  final host = u.host;
  if (host.isEmpty) throw const FormatException('无法识别的主机');
  return PairConfig(host: host, port: u.port == 0 ? 3081 : u.port,
    token: token, mesh: q['mesh'] ?? '', secret: q['secret'] ?? '');
}

class AppState extends ChangeNotifier {
  PairConfig? config;
  bool connected = false;
  int latency = 23;
  int balanceMb = 1200;
  String lastCheckin = '';
  int streak = 0;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(storeKey);
    if (raw != null) {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      final cfg = m['config'];
      if (cfg != null) config = PairConfig.fromMap(Map<String, dynamic>.from(cfg));
      connected = m['connected'] ?? false;
      latency = m['latency'] ?? 23;
      balanceMb = m['balanceMb'] ?? 1200;
      lastCheckin = m['lastCheckin'] ?? '';
      streak = m['streak'] ?? 0;
    }
    notifyListeners();
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(storeKey, jsonEncode({
      'config': config?.toMap(), 'connected': connected, 'latency': latency,
      'balanceMb': balanceMb, 'lastCheckin': lastCheckin, 'streak': streak,
    }));
  }

  Future<void> applyPair(PairConfig cfg) async {
    config = cfg;
    connected = false;
    await save();
    notifyListeners();
    await Future.delayed(const Duration(milliseconds: 1400));
    connected = true;
    latency = 18 + (DateTime.now().millisecond % 16);
    await save();
    notifyListeners();
  }

  String today() {
    final n = DateTime.now();
    return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
  }

  Future<bool> checkin() async {
    if (lastCheckin == today()) return false;
    final y = DateTime.now().subtract(const Duration(days: 1));
    final ystr = '${y.year}-${y.month.toString().padLeft(2, '0')}-${y.day.toString().padLeft(2, '0')}';
    streak = lastCheckin == ystr ? streak + 1 : 1;
    lastCheckin = today();
    final bonus = streak % 7 == 0 ? 500 : 100;
    balanceMb += bonus;
    await save();
    notifyListeners();
    return true;
  }
}

class PocketApp extends StatefulWidget {
  const PocketApp({super.key});
  @override
  State<PocketApp> createState() => _PocketAppState();
}

class _PocketAppState extends State<PocketApp> {
  final state = AppState();
  StreamSubscription? _linkSub;

  @override
  void initState() {
    super.initState();
    state.load();
    _initLinks();
  }

  void _initLinks() async {
    final links = AppLinks();
    final initial = await links.getInitialLink();
    if (initial != null) _handleLink(initial.toString());
    _linkSub = links.uriLinkStream.listen((uri) => _handleLink(uri.toString()));
  }

  void _handleLink(String raw) {
    try {
      state.applyPair(parsePairLink(raw));
    } catch (e) {
      // ignore: invalid_use_of_visible_for_testing_member
      debugPrint('link error: $e');
    }
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: state,
      builder: (context, _) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: '口袋 DSH',
        theme: ThemeData(
          brightness: Brightness.dark,
          scaffoldBackgroundColor: bg,
          colorScheme: const ColorScheme.dark(primary: accent),
          fontFamily: '.SF Pro Text',
        ),
        home: HomeScreen(state: state, onLink: _handleLink),
      ),
    );
  }
}

// ---------- 主壳：底部 4 tab ----------
class HomeScreen extends StatefulWidget {
  final AppState state;
  final void Function(String) onLink;
  const HomeScreen({super.key, required this.state, required this.onLink});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  bool _conversation = false;

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_conversation) {
      body = ConversationScreen(state: widget.state, onBack: () => setState(() => _conversation = false));
    } else {
      body = switch (_tab) {
        0 => ConnectTab(state: widget.state, onScan: _scan, onOpen: () => setState(() => _conversation = true)),
        1 => const TrafficTab(),
        2 => const MemberTab(),
        _ => const ProfileTab(),
      };
    }
    return Scaffold(
      body: SafeArea(child: body),
      bottomNavigationBar: _conversation
          ? const SizedBox.shrink()
          : NavigationBar(
              backgroundColor: stage,
              indicatorColor: accent.withOpacity(.12),
              selectedIndex: _tab,
              onDestinationSelected: (i) => setState(() => _tab = i),
              destinations: const [
                NavigationDestination(icon: Icon(Icons.link), label: '连接'),
                NavigationDestination(icon: Icon(Icons.data_usage), label: '流量'),
                NavigationDestination(icon: Icon(Icons.workspace_premium), label: '会员'),
                NavigationDestination(icon: Icon(Icons.person), label: '我的'),
              ],
            ),
    );
  }

  void _scan() async {
    final result = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const ScanScreen()),
    );
    if (result != null) widget.onLink(result);
  }
}

// ---------- 连接页 ----------
class ConnectTab extends StatelessWidget {
  final AppState state;
  final VoidCallback onScan;
  final VoidCallback onOpen;
  const ConnectTab({super.key, required this.state, required this.onScan, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    final connected = state.connected;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Column(
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Row(children: [
              Icon(Icons.send, color: accent, size: 22),
              SizedBox(width: 8),
              Text('口袋 DSH', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ]),
            IconButton(onPressed: onScan, icon: const Icon(Icons.qr_code_scanner, color: muted)),
          ]),
          const Spacer(),
          SizedBox(
            width: 206, height: 206,
            child: Stack(alignment: Alignment.center, children: [
              Container(decoration: BoxDecoration(shape: BoxShape.circle,
                border: Border.all(color: connected ? accent.withOpacity(.25) : line))),
              Container(margin: const EdgeInsets.all(22), decoration: BoxDecoration(shape: BoxShape.circle,
                border: Border.all(color: connected ? accent.withOpacity(.5) : line, style: BorderStyle.solid))),
              Container(margin: const EdgeInsets.all(44), decoration: BoxDecoration(shape: BoxShape.circle,
                color: connected ? accent.withOpacity(.12) : Colors.transparent,
                border: Border.all(color: connected ? accent.withOpacity(.45) : line))),
              Column(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 14, height: 14, decoration: BoxDecoration(shape: BoxShape.circle,
                  color: connected ? accent : muted2)),
                const SizedBox(height: 12),
                Text(connected ? '已连接' : '未连接', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
                const SizedBox(height: 5),
                Text(connected ? 'P2P 直连 · 加密' : '等待扫码配对',
                  style: TextStyle(fontSize: 12, color: connected ? accent : muted2, fontWeight: FontWeight.w600)),
              ]),
            ]),
          ),
          const SizedBox(height: 16),
          if (state.config != null)
            Text('手机 → 中继发现 → 电脑 · ${state.config!.host}',
              style: const TextStyle(fontSize: 11, color: muted)),
          const Spacer(),
          SizedBox(width: double.infinity, height: 56, child: ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: accent, foregroundColor: const Color(0xFF04120F),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
            onPressed: connected ? onOpen : onScan,
            child: Text(connected ? '打开 DSH 对话' : '扫一扫，连接电脑'),
          )),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: OutlinedButton.icon(onPressed: onScan,
              icon: const Icon(Icons.qr_code_scanner, size: 16), label: const Text('扫一扫'))),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton.icon(onPressed: () {},
              icon: const Icon(Icons.swap_horiz, size: 16), label: const Text('切换中继'))),
          ]),
          const SizedBox(height: 18),
          Container(width: double.infinity, padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(16),
              border: Border.all(color: line)),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('本月剩余流量', style: TextStyle(color: muted, fontSize: 13)),
              Text('${(state.balanceMb / 1024).toStringAsFixed(2)} GB',
                style: const TextStyle(fontWeight: FontWeight.bold)),
            ])),
        ],
      ),
    );
  }
}

// ---------- 扫码页 ----------
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});
  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final _ctrl = MobileScannerController();
  final _text = TextEditingController();
  bool _doneOnce = false; // 防止相机每帧重复识别导致对已销毁 context 再次 pop（release 黑屏）

  void _done(String? code) {
    if (_doneOnce) return; // 只处理第一次识别
    if (code == null || code.isEmpty) return;
    _doneOnce = true;
    if (!mounted) return;
    Navigator.of(context).pop(code);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: stage,
      appBar: AppBar(title: const Text('扫一扫'), backgroundColor: stage,
        leading: IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close))),
      body: SingleChildScrollView(
        child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [
        SizedBox(height: 260, child: ClipRRect(borderRadius: BorderRadius.circular(16),
          child: MobileScanner(controller: _ctrl, onDetect: (c) {
            final codes = c.barcodes;
            if (codes.isNotEmpty) _done(codes.first.rawValue);
          }))),
        const SizedBox(height: 18),
        const Text('或粘贴配对链接', style: TextStyle(color: muted, fontSize: 12)),
        const SizedBox(height: 8),
        TextField(controller: _text, style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
          decoration: InputDecoration(filled: true, fillColor: surface,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: line)),
            hintText: 'dshpocket://connect?...')),
        const SizedBox(height: 10),
        SizedBox(width: double.infinity, height: 46, child: ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: accent, foregroundColor: const Color(0xFF04120F)),
          onPressed: () => _done(_text.text), child: const Text('识别配置'))),
        ])),
      ),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _text.dispose();
    super.dispose();
  }
}

// ---------- 流量页 ----------
class TrafficTab extends StatelessWidget {
  const TrafficTab({super.key});
  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16), children: [
      const Text('流量', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
      const SizedBox(height: 18),
      _card(const BoxDecoration(
        gradient: LinearGradient(colors: [surface2, surface]),
        borderRadius: BorderRadius.all(Radius.circular(20))), [
        const Text('账户余额', style: TextStyle(color: muted, fontSize: 12)),
        const Text('1.20 GB', style: TextStyle(fontSize: 44, fontWeight: FontWeight.w800)),
        const Text('每月 5 GB · P2P 直连不消耗流量', style: TextStyle(color: muted2, fontSize: 12)),
      ]),
      const SizedBox(height: 16),
      const Text('签到领流量', style: TextStyle(fontWeight: FontWeight.bold)),
      const SizedBox(height: 10),
      _card(null, [
        Row(children: [
          const Icon(Icons.star, color: amber, size: 18),
          const SizedBox(width: 8),
          const Text('签到领流量', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const Spacer(),
          Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(color: amber.withOpacity(.12), borderRadius: BorderRadius.circular(8)),
            child: const Text('+100 MB / 天', style: TextStyle(color: amber, fontSize: 12, fontWeight: FontWeight.bold))),
        ]),
        const SizedBox(height: 12),
        ElevatedButton(onPressed: () {}, style: ElevatedButton.styleFrom(
          backgroundColor: amber.withOpacity(.12), foregroundColor: amber,
          side: BorderSide(color: amber.withOpacity(.4))),
          child: const Text('签到领取 100 MB')),
      ]),
    ]);
  }

  Widget _card(BoxDecoration? deco, List<Widget> children) => Container(
    padding: const EdgeInsets.all(20),
    decoration: deco ??
        BoxDecoration(color: surface, borderRadius: BorderRadius.circular(20), border: Border.all(color: line)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
  );
}

// ---------- 会员页 ----------
class MemberTab extends StatelessWidget {
  const MemberTab({super.key});
  @override
  Widget build(BuildContext context) {
    final perks = ['不限设备数', '每月 5 GB 高速流量', '优先中继节点', '端到端加密', '签到加倍'];
    return ListView(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16), children: [
      const Text('会员', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
      const SizedBox(height: 18),
      Container(padding: const EdgeInsets.all(24), decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0x1A00D4B8), surface], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(20), border: Border.all(color: line)),
        child: Column(children: [
          Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: const BoxDecoration(gradient: LinearGradient(colors: [accent, Color(0xFF008F7D)]),
              borderRadius: BorderRadius.all(Radius.circular(99))),
            child: const Text('PRO', style: TextStyle(color: Color(0xFF04120F), fontWeight: FontWeight.w800, fontSize: 11))),
          const SizedBox(height: 14),
          const Text('口袋 DSH 会员', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          const Text('解锁全部设备与流量，随时随地访问你的电脑',
            textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 12)),
          const SizedBox(height: 16),
          const Text.rich(TextSpan(children: [
            TextSpan(text: '¥9.9', style: TextStyle(fontSize: 40, fontWeight: FontWeight.w800)),
            TextSpan(text: ' / 月', style: TextStyle(color: muted, fontSize: 14)),
          ])),
          const SizedBox(height: 18),
          SizedBox(width: double.infinity, height: 52, child: ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: accent, foregroundColor: const Color(0xFF04120F)),
            onPressed: () {}, child: const Text('立即开通'))),
        ])),
      const SizedBox(height: 22),
      const Text('会员权益', style: TextStyle(fontWeight: FontWeight.bold)),
      const SizedBox(height: 10),
      ...perks.map((p) => Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: line)),
        child: Row(children: [
          Container(width: 30, height: 30, decoration: BoxDecoration(color: accent.withOpacity(.12),
            borderRadius: BorderRadius.circular(9)), child: const Icon(Icons.check, color: accent, size: 16)),
          const SizedBox(width: 12), Text(p, style: const TextStyle(fontSize: 13)),
        ]))),
    ]);
  }
}

// ---------- 我的页 ----------
class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});
  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16), children: [
      const Text('我的', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
      const SizedBox(height: 18),
      Container(padding: const EdgeInsets.all(18), decoration: BoxDecoration(color: surface,
        borderRadius: BorderRadius.circular(20), border: Border.all(color: line)),
        child: const Row(children: [
          CircleAvatar(radius: 26, backgroundColor: accent, child: Text('D',
            style: TextStyle(color: Color(0xFF04120F), fontSize: 24, fontWeight: FontWeight.w800))),
          SizedBox(width: 14),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('DSH 用户', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
            Text('软件授权版', style: TextStyle(color: muted2, fontSize: 11)),
          ]),
        ])),
      const SizedBox(height: 14),
      Container(padding: const EdgeInsets.all(18), decoration: BoxDecoration(color: surface,
        borderRadius: BorderRadius.circular(20), border: Border.all(color: line)),
        child: const Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('已连接设备', style: TextStyle(fontSize: 13)),
          Text('0 台', style: TextStyle(color: accent, fontWeight: FontWeight.bold)),
        ])),
    ]);
  }
}

// ---------- 对话页（内嵌 WebView 加载真实 DSH Web） ----------
class ConversationScreen extends StatefulWidget {
  final AppState state;
  final VoidCallback onBack;
  const ConversationScreen({super.key, required this.state, required this.onBack});
  @override
  State<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<ConversationScreen> {
  late final WebViewController _web;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(onPageFinished: (_) {
        setState(() => _ready = true);
      }))
      ..loadRequest(Uri.parse(widget.state.config?.webUrl ?? 'about:blank'));
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Container(height: 46, padding: const EdgeInsets.symmetric(horizontal: 4),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: line))),
        child: Row(children: [
          SizedBox(width: 36, height: 36, child: IconButton(
            onPressed: widget.onBack,
            icon: const Icon(Icons.arrow_back, color: muted, size: 18),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          )),
          Expanded(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Text('重构登录模块', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              overflow: TextOverflow.ellipsis),
            Text('通过加密 P2P 连接 · ${widget.state.latency} ms',
              style: const TextStyle(color: accent, fontSize: 9)),
          ])),
          const SizedBox(width: 36),
        ])),
      if (!_ready && widget.state.config == null)
        const Expanded(child: Center(child: Text('请先扫码连接电脑', style: TextStyle(color: muted)))),
      Expanded(child: WebViewWidget(controller: _web)),
    ]);
  }
}
