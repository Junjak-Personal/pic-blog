import 'dart:convert';
import 'dart:typed_data' show BytesBuilder;
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
// photo_manager 의 것들은 wechat_assets_picker 가 다시 내보낸다
import 'package:wechat_assets_picker/wechat_assets_picker.dart';

import 'album_grid.dart';
import 'picker_theme.dart';

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
    /* 고르고 나서 원본을 꺼내는 동안 네이티브가 부른다. 페이지가 채워 넣는다. */
    onPickProgress: null,
    headerBytes: $kHeaderBytes,
    /* 방금 고르기에서 «원본을 못 꺼낸» 사진 이름. pick 이 끝난 뒤에 읽는다. */
    lastPickFailed: [],
    /*
     * 고른 사진의 «목록»을 준다 — 바이트가 아니다 (위 🔴).
     *
     * 🔴 반환 모양을 바꾸지 마라. 껍데기는 «기기에 설치돼» 있고 웹은 따로 배포되므로
     *    둘의 버전은 언제든 어긋난다. 한때 이것을 배열에서 { photos, failed } 로 바꿨다가,
     *    옛 웹이 photos.map() 을 부르며 죽어 「사진을 가져오는 중」에서 멈췄다.
     *    새 정보는 «따로 난 창»(lastPickFailed)으로 준다 — 모르는 쪽은 그냥 안 읽는다.
     */
    pick: (limit) => send('pick', { limit }).then((m) => {
      window.picblogNative.lastPickFailed = m.failed || [];
      return m.photos;
    }),
    /*
     * limit  — 원본의 앞부분만 (검사: EXIF 는 헤더면 충분하다)
     * render — PhotoKit 이 그 크기로 그린 JPEG (변환: 원본을 통째로 넘기면 브리지가 비싸다)
     */
    readBlob: (token, opts) => send('read', { token, ...(opts || {}) }).then((m) => toBlob(m.b64, m.type)),
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

  /// 토큰 → 고른 사진. 토큰은 순번이 아니라 난수다 — 페이지에 노출되는 손잡이이므로
  /// 세면 다른 사진을 짚을 수 있게 두지 않는다.
  ///
  /// 원본 사본(file)과 에셋(asset)을 둘 다 들고 있다. 검사는 «원본 헤더»에서 좌표·시각을
  /// 읽어야 하고(렌더된 JPEG 은 그 정보를 잃을 수 있다), 변환은 PhotoKit 이 «렌더한»
  /// 작은 것을 받아야 브리지가 싸다.
  final Map<String, ({File file, AssetEntity asset})> _files = {};

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
          final photos = await _pick(context, limit);
          await _send(id, {'ok': true, 'photos': photos, 'failed': _lastPickFailed});
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

    /*
     * pickAssets 대신 델리게이트를 직접 넘긴다 — 앨범 고르개만 그리드로 갈아끼우기
     * 위해서다 (album_grid.dart). 나머지(사진 그리드·끌어서 선택·미리보기)는 기본 것 그대로다.
     */
    final picked = await AssetPicker.pickAssetsWithDelegate<AssetEntity, AssetPathEntity,
        DefaultAssetPickerProvider, DefaultAssetPickerBuilderDelegate>(
      context,
      delegate: AlbumGridPickerDelegate(
        provider: DefaultAssetPickerProvider(
          maxAssets: limit,
          requestType: RequestType.image,
          /*
           * 앨범 커버 크기. 기본값이 80px 정사각인데 우리 카드는 화면 반쪽(≈570px @3x)이라
           * 뭉개져 보였다. 앨범 수만큼만 뽑는 것이라 400 이어도 비싸지 않다.
           */
          pathThumbnailSize: const ThumbnailSize.square(400),
        ),
        initialPermission: permission,
        pickerTheme: pickerTheme(),
        textDelegate: const KoreanAssetPickerTextDelegate(),
        /*
         * 🔴 수백 장을 하나씩 탭하게 두면 안 된다. 기본값도 켜짐이지만(접근성 내비게이션이
         *    켜져 있으면 꺼진다) 이 앱에서는 «고르는 것»이 곧 용도라 명시로 못 박는다.
         */
        dragToSelect: true,
      ),
    );
    if (picked == null || picked.isEmpty) return const [];

    /*
     * 여기가 예전에 통째로 조용하던 구간이다. 500장이면 원본 사본을 500번 만들고,
     * 그동안 페이지는 아무것도 모른 채 기다렸다. 한 장 끝날 때마다 알려준다 —
     * 「되고 있는 건지 모르겠다」가 이 앱을 만든 이유 중 하나였다.
     */
    final out = <Map<String, Object?>>[];
    /*
     * 🔴 못 꺼낸 사진을 조용히 버리지 않는다 (설계문서 §8).
     *    originFile 은 원본을 앱 캐시로 «통째로» 복사한다 — 360장이면 2GB 다. 저장 공간이
     *    모자라면 여기서 null 이 돌아오는데, 예전에는 그냥 건너뛰어서 「고른 360장 중
     *    340장만 올라갔다」가 아무 말 없이 일어날 수 있었다. 이름을 모아 페이지로 넘긴다.
     */
    final failed = <String>[];
    for (var i = 0; i < picked.length; i++) {
      final asset = picked[i];
      /*
       * 🔴 originFile 이어야 한다. file 은 iOS 가 호환 포맷(JPEG)으로 바꿔서 줄 수 있고,
       *    그러면 이 앱을 만든 이유가 사라진다 — 웹뷰 파일 입력이 하던 그 변환이
       *    이름만 바꿔 돌아온다.
       */
      File? file;
      try {
        file = await asset.originFile;
      } catch (_) {
        file = null;
      }
      if (file != null) {
        final token = _token();
        _files[token] = (file: file, asset: asset);
        out.add({
          'token': token,
          'name': await asset.titleAsync,
          'size': await file.length(),
        });
      } else {
        failed.add(await asset.titleAsync);
      }
      await _pickProgress(i + 1, picked.length);
    }
    _lastPickFailed = failed;
    return out;
  }

  /// 방금 고르기에서 못 꺼낸 사진 이름들 — pick 응답에 함께 실린다
  List<String> _lastPickFailed = const [];

  /// 답이 아니라 «중간 보고»다 — id 없이 페이지의 훅을 직접 부른다.
  Future<void> _pickProgress(int done, int total) =>
      reply('window.picblogNative?.onPickProgress?.($done, $total)');

  Future<Map<String, Object?>> _read(Map<String, dynamic> msg) async {
    final entry = _files[msg['token'] as String? ?? ''];
    if (entry == null) throw Exception('사진을 찾을 수 없습니다');

    /*
     * render 가 오면 PhotoKit 에 그 크기로 그려 달라고 한다.
     *
     * 🔴 크기를 여기서 정하지 않는다 — 웹의 DISPLAY_MAX 가 그대로 넘어온다. 앱이 자기
     *    상수를 갖는 순간 「화면 크기」가 두 곳에 생기고, 한쪽만 바뀌는 날이 온다.
     *
     * 이게 이 앱에서 제일 큰 이득이다. 48MP 원본을 브리지로 넘기면 장당 519ms 인데
     * (브리지 257 + 디코딩 213 + 캔버스 49), 2048px 로 그리면 147ms 다
     * (브리지 100 + 디코딩 15 + 캔버스 31). 원본이 24MP 든 48MP 든 결과가 같아진다. 실측.
     */
    final render = (msg['render'] as num?)?.toInt();
    if (render != null && render > 0) {
      final data = await entry.asset.thumbnailDataWithOption(
        ThumbnailOption.ios(
          size: ThumbnailSize.square(render),
          // fit = 긴 변 기준. 웹의 scaleTo 와 같은 규칙이라야 결과가 어긋나지 않는다.
          resizeContentMode: ResizeContentMode.fit,
          // 🔴 opportunistic 은 «저화질 임시본»을 먼저 줄 수 있다. 한 번만 받는 자리라 그러면 그게 최종본이 된다.
          deliveryMode: DeliveryMode.highQualityFormat,
          resizeMode: ResizeMode.exact,
          // 웹이 다시 0.82 로 인코딩한다 — 그 앞단계는 손실이 거의 없어야 한다
          quality: 95,
        ),
      );
      if (data == null) throw Exception('사진을 그리지 못했습니다');
      return {'b64': base64Encode(data), 'type': 'image/jpeg'};
    }

    // render 가 없으면 원본. 검사는 limit 만큼 앞부분만 읽는다.
    final file = entry.file;
    if (!file.existsSync()) throw Exception('사진을 찾을 수 없습니다');
    final limit = (msg['limit'] as num?)?.toInt();
    final total = await file.length();
    final end = limit == null || limit >= total ? total : limit;
    final bytes = await file.openRead(0, end).fold<BytesBuilder>(
          BytesBuilder(copy: false),
          (b, chunk) => b..add(chunk),
        );
    final path = file.path.toLowerCase();
    return {
      'b64': base64Encode(bytes.takeBytes()),
      // 확장자로 정한다 — 사진첩에 JPEG 로 저장된 것도 있다
      'type': path.endsWith('.heic') || path.endsWith('.heif') ? 'image/heic' : 'image/jpeg',
    };
  }

  Future<void> _release(List<String> tokens) async {
    for (final t in tokens) {
      final e = _files.remove(t);
      if (e != null && e.file.existsSync()) {
        try {
          await e.file.delete();
        } catch (_) {}
      }
    }
  }

  Future<void> releaseAll() => _release(_files.keys.toList());
}

