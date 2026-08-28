import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'bridge.dart';
import 'picker_theme.dart';

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
        /*
         * 🔴 웹 콘텐츠 프로세스가 죽으면 WKWebView 는 «빈 화면을 그대로 둔다».
         *    우리 배경이 어두워서 「검은 화면에서 안 바뀐다」로 보이고, 아무도 아무 말을
         *    하지 않는다. 사진 수백 장을 한 번에 처리하면 실제로 그 압력에 죽을 수 있다.
         *    그때는 다시 세운다 — 조용히 멈춰 있는 것보다 낫다.
         *
         *    (webview_flutter 는 이 사건을 별도 콜백이 아니라 errorType 으로 알려준다.)
         */
        onWebResourceError: (e) {
          debugPrint('[web] error ${e.errorType} ${e.errorCode} ${e.description}');
          if (e.errorType == WebResourceErrorType.webContentProcessTerminated) {
            debugPrint('[web] 콘텐츠 프로세스가 죽었다 — 다시 세운다');
            _web.loadRequest(Uri.parse(kSite));
          }
        },
      ))
      ..loadRequest(Uri.parse(kSite));

    /*
     * 가장자리 스와이프로 뒤로 가는 것을 끈다.
     *
     * 웹앱은 한 화면 안에서 단계를 오가고(사진 선택 → 포인트 경계 → 업로드) 편집 화면은
     * 저장 안 된 초안을 들고 있다. 스와이프 한 번에 그게 통째로 날아가면 안 된다.
     * 되돌아갈 길은 화면 좌측 상단의 ← 가 맡는다 — 그쪽은 단계를 알고 움직인다.
     */
    final platform = _web.platform;
    if (platform is WebKitWebViewController) {
      platform.setAllowsBackForwardNavigationGestures(false);
    }
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
