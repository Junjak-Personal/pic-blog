import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'bridge.dart';

/// 웹앱이 사는 곳. 이 껍데기는 «사진 고르기»만 가져가고 나머지는 전부 웹이 한다.
///
/// 왜 이 앱이 있는가: 웹뷰의 <input type=file> 로 사진을 받으면 iOS 가 HEIC 를 24MP JPEG 으로
/// 변환해서 넘긴다. 200장이면 그것만 62초고, 우리는 그 24MP JPEG 을 곧바로 2048px 로 줄여
/// 버린다 — 순수한 낭비다. accept 를 어떻게 줘도 끌 수 없다(실측). PhotoKit 으로 직접 고르면
/// 원본 HEIC 이 그대로 오고, WebKit 의 createImageBitmap 이 HEIC 를 디코딩할 수 있다(실측).
const kSite = String.fromEnvironment(
  'SITE',
  defaultValue: 'https://pic-blog.jun-devlog.win',
);

/// 사이트의 --s0. 상태바 뒤가 이 색이어야 웹뷰와 이어져 보인다.
const kGround = Color(0xFF040408);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarBrightness: Brightness.dark,
    statusBarIconBrightness: Brightness.light,
  ));
  runApp(const PicBlogApp());
}

class PicBlogApp extends StatelessWidget {
  const PicBlogApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'pic-blog',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(brightness: Brightness.dark, scaffoldBackgroundColor: kGround),
        home: const Shell(),
      );
}

class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  late final WebViewController _web;
  late final NativeBridge _bridge;

  @override
  void initState() {
    super.initState();
    _bridge = NativeBridge((js) => _web.runJavaScript(js));
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(kGround)
      ..setOnConsoleMessage((m) => debugPrint('[web] ${m.message}'))
      ..addJavaScriptChannel(
        kChannel,
        onMessageReceived: (m) {
          if (mounted) _bridge.handle(context, m.message);
        },
      )
      ..setNavigationDelegate(NavigationDelegate(
        /*
         * 🔴 페이지가 설 때마다 다시 심어야 한다. SPA 라 대부분 한 번이면 되지만,
         *    새로고침이나 외부 복귀로 문서가 새로 서면 window 가 비어 브리지가 사라진다.
         */
        onPageFinished: (url) async {
          await _web.runJavaScript(bootstrapJs());
          debugPrint('[diag] bridge ready on $url');
        },
        onWebResourceError: (e) => debugPrint('[web] error ${e.errorCode} ${e.description}'),
      ))
      ..loadRequest(Uri.parse(kSite));
  }

  @override
  void dispose() {
    _bridge.releaseAll();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: kGround,
        /*
         * SafeArea 가 상단 인셋을 맡는다. 웹앱의 --top-inset 은 홈 화면 PWA(standalone)에서
         * 시스템이 상단 밴드의 터치를 가져가는 문제를 피하려는 값인데, 껍데기 안에서는
         * 웹뷰가 그 밴드까지 올라가지 않으므로 env(safe-area-inset-top) 이 0 이 되고
         * 그 보정도 자연히 0 이 된다. 상태바 뒤는 Scaffold 의 배경색이 채운다.
         */
        body: SafeArea(
          bottom: false,
          child: PopScope(
            canPop: false,
            onPopInvokedWithResult: (didPop, _) async {
              if (didPop) return;
              if (await _web.canGoBack()) await _web.goBack();
            },
            child: WebViewWidget(controller: _web),
          ),
        ),
      );
}
