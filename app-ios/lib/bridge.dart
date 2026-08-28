import 'dart:convert';
import 'dart:typed_data' show BytesBuilder;
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
// photo_manager 의 것들은 wechat_assets_picker 가 다시 내보낸다
import 'package:wechat_assets_picker/wechat_assets_picker.dart';

/// 페이지가 부르는 이름. 웹쪽 분기가 이 한 이름만 안다.
const kChannel = 'PicBlogNative';

/// 검사 단계에 넘기는 앞부분 크기.
///
/// HEIC 는 64KB 만 있어도 exifr 가 GPS·DateTimeOriginal 을 다 찾는다(실측). 여유를 둬서
/// 256KB. 전 장을 넘기면 200장에 17초가 드는데, 검사는 헤더만 있으면 되므로 그걸 낼 이유가 없다.
const kHeaderBytes = 256 * 1024;

/// 페이지에 심는 브리지.
///
/// 프로토콜을 «네이티브가» 들고 있다. 웹에는 분기 몇 줄만 남고, 버전이 올라가도 앱만 고친다.
///
/// 🔴 바이트는 «필요할 때 한 장씩» 건너간다. 고르는 순간 전부 넘기면 200장 × 2.75MB 가
///    페이지 메모리에 뜬다 — 설계문서에 107MB 로 iOS 탭이 죽은 기록이 있는 그 자리다.
///    pick 은 목록(토큰·이름·크기)만 주고, 바이트는 readBlob 이 그때 가져온다.
String bootstrapJs() => '''
(() => {
  if (window.picblogNative) return;
  const waiting = new Map();
  let seq = 0;
  window.__picblogReply = (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const slot = waiting.get(msg.id);
    if (!slot) return;
    waiting.delete(msg.id);
    msg.ok ? slot.resolve(msg) : slot.reject(new Error(msg.error || '네이티브 오류'));
  };
  const send = (cmd, body) => new Promise((resolve, reject) => {
    const id = 'r' + (++seq);
    waiting.set(id, { resolve, reject });
    $kChannel.postMessage(JSON.stringify({ id, cmd, ...body }));
  });
  const toBlob = (b64, type) => {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type });
  };
  window.picblogNative = {
    version: 1,
    headerBytes: $kHeaderBytes,
    /* 고른 사진의 «목록»을 준다 — 바이트가 아니다 (위 🔴) */
    pick: (limit) => send('pick', { limit }).then((m) => m.photos),
    /* limit 를 주면 앞부분만. 검사에는 헤더만 있으면 된다. */
    readBlob: (token, limit) => send('read', { token, limit }).then((m) => toBlob(m.b64, m.type)),
    /* 다 쓴 사본을 지운다 — originFile 은 앱 캐시에 복사본을 남긴다 */
    release: (tokens) => send('release', { tokens }).then(() => undefined),
  };
})();
''';

class NativeBridge {
  NativeBridge(this.reply);

  /// 페이지에 답을 돌려주는 통로 (webview.runJavaScript)
  final Future<void> Function(String js) reply;

  final _rand = Random.secure();

  /// 토큰 → 원본 사본. 토큰은 순번이 아니라 난수다 — 페이지에 노출되는 손잡이이므로
  /// 세면 다른 사진을 짚을 수 있게 두지 않는다.
  final Map<String, File> _files = {};

  String _token() =>
      base64Url.encode(List<int>.generate(16, (_) => _rand.nextInt(256))).replaceAll('=', '');

  Future<void> handle(BuildContext context, String raw) async {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    final id = msg['id'] as String?;
    if (id == null) return;

    try {
      switch (msg['cmd']) {
        case 'pick':
          final limit = (msg['limit'] as num?)?.toInt() ?? 200;
          await _send(id, {'ok': true, 'photos': await _pick(context, limit)});
        case 'read':
          await _send(id, {'ok': true, ...await _read(msg)});
        case 'release':
          await _release((msg['tokens'] as List?)?.cast<String>() ?? const []);
          await _send(id, {'ok': true});
        default:
          await _send(id, {'ok': false, 'error': '알 수 없는 명령'});
      }
    } catch (e) {
      await _send(id, {'ok': false, 'error': '$e'});
    }
  }

  Future<void> _send(String id, Map<String, Object?> body) =>
      reply('window.__picblogReply(${jsonEncode(jsonEncode({'id': id, ...body}))})');

  Future<List<Map<String, Object?>>> _pick(BuildContext context, int limit) async {
    final permission = await PhotoManager.requestPermissionExtend();
    if (!permission.hasAccess) throw Exception('사진 접근이 허용되지 않았습니다');
    if (!context.mounted) return const [];

    final picked = await AssetPicker.pickAssets(
      context,
      pickerConfig: AssetPickerConfig(
        maxAssets: limit,
        requestType: RequestType.image,
        textDelegate: const KoreanAssetPickerTextDelegate(),
      ),
    );
    if (picked == null || picked.isEmpty) return const [];

    final out = <Map<String, Object?>>[];
    for (final asset in picked) {
      /*
       * 🔴 originFile 이어야 한다. file 은 iOS 가 호환 포맷(JPEG)으로 바꿔서 줄 수 있고,
       *    그러면 이 앱을 만든 이유가 사라진다 — 웹뷰 파일 입력이 하던 그 변환이
       *    이름만 바꿔 돌아온다.
       */
      final file = await asset.originFile;
      if (file == null) continue;
      final token = _token();
      _files[token] = file;
      out.add({
        'token': token,
        'name': await asset.titleAsync,
        'size': await file.length(),
      });
    }
    return out;
  }

  Future<Map<String, Object?>> _read(Map<String, dynamic> msg) async {
    final file = _files[msg['token'] as String? ?? ''];
    if (file == null || !file.existsSync()) throw Exception('사진을 찾을 수 없습니다');
    final limit = (msg['limit'] as num?)?.toInt();
    final total = await file.length();
    final end = limit == null || limit >= total ? total : limit;
    final bytes = await file.openRead(0, end).fold<BytesBuilder>(
          BytesBuilder(copy: false),
          (b, chunk) => b..add(chunk),
        );
    return {
      'b64': base64Encode(bytes.takeBytes()),
      // 확장자로 정한다 — 사진첩에 JPEG 로 저장된 것도 있다
      'type': file.path.toLowerCase().endsWith('.heic') || file.path.toLowerCase().endsWith('.heif')
          ? 'image/heic'
          : 'image/jpeg',
    };
  }

  Future<void> _release(List<String> tokens) async {
    for (final t in tokens) {
      final f = _files.remove(t);
      if (f != null && f.existsSync()) {
        try {
          await f.delete();
        } catch (_) {}
      }
    }
  }

  Future<void> releaseAll() => _release(_files.keys.toList());
}

/// 기본 델리게이트가 영어·중국어뿐이라 필요한 문구만 한국어로 덮는다.
class KoreanAssetPickerTextDelegate extends AssetPickerTextDelegate {
  const KoreanAssetPickerTextDelegate();

  @override
  String get languageCode => 'ko';
  @override
  String get confirm => '확인';
  @override
  String get cancel => '취소';
  @override
  String get edit => '편집';
  @override
  String get gifIndicator => 'GIF';
  @override
  String get loadFailed => '불러오지 못했습니다';
  @override
  String get original => '원본';
  @override
  String get preview => '미리보기';
  @override
  String get select => '선택';
  @override
  String get emptyList => '사진이 없습니다';
  @override
  String get unSupportedAssetType => '지원하지 않는 형식입니다';
  @override
  String get accessAllTip => '앱이 일부 사진에만 접근할 수 있습니다. 설정에서 전체 접근을 허용해 주세요.';
  @override
  String get goToSystemSettings => '설정으로 가기';
  @override
  String get accessLimitedAssets => '선택한 사진만 계속 보기';
  @override
  String get viewingLimitedAssetsTip => '앱이 볼 수 있는 사진만 표시합니다.';
  @override
  String get changeAccessibleLimitedAssets => '접근 가능한 사진 변경';
}
