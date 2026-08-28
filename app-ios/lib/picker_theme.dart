import 'package:flutter/material.dart';
import 'package:wechat_assets_picker/wechat_assets_picker.dart';

/// pic-blog 의 토큰 (app/assets/css/tokens.css). 껍데기가 그리는 화면은 웹앱과 같은 색이어야
/// 「앱 안의 다른 앱」처럼 보이지 않는다.
///
/// 🔴 웹 팔레트가 세이지(163°)에서 틸(192°)로 옮겨갈 때 이 다섯 값도 같이 옮겼다.
///    CSS 변수가 여기까지 오지 않으므로 한쪽만 바꾸면 껍데기와 웹앱이 조용히 어긋난다.
const kGround = Color(0xFF040408); // --s0
const kPanel = Color(0xFF0B0E12); // --s1
const kInk = Color(0xFFE8EBEA); // --ink
const kMid = Color(0xFFB1C2C7); // --mid
const kAcc = Color(0xFF92ACB2); // --acc

/// 피커를 우리 색으로 입힌다.
///
/// 🔴 이 피커를 두 번 갈아엎었다가 되돌아왔다 — iOS 기본 피커(끌어서 선택이 없다)와
///    웹뷰에서 직접 그린 그리드(1만 장짜리 사진첩과 스케일이 안 맞는다). 앨범이
///    드롭다운인 것 하나가 아쉬웠고, 그건 판을 엎지 않고 델리게이트 한 메서드로 해결했다
///    (album_grid.dart). 근거와 실측은 아래 문서에 있다 — 같은 길로 다시 가기 전에 읽을 것:
///
///      _docs/complete/native-shell/2026-08-28-native-shell.md
///
ThemeData pickerTheme() {
  final base = AssetPicker.themeData(kAcc, light: false);
  return base.copyWith(
    scaffoldBackgroundColor: kGround,
    canvasColor: kGround,
    cardColor: kPanel,
    dividerColor: const Color(0x24B1C2C7), // --hair
    colorScheme: base.colorScheme.copyWith(
      surface: kGround,
      primary: kAcc,
      secondary: kAcc,
      onPrimary: kGround,
      onSurface: kInk,
    ),
    appBarTheme: base.appBarTheme.copyWith(
      backgroundColor: kGround,
      foregroundColor: kInk,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    bottomAppBarTheme: base.bottomAppBarTheme.copyWith(color: kPanel),
    textTheme: base.textTheme.apply(bodyColor: kInk, displayColor: kInk),
    iconTheme: const IconThemeData(color: kMid),
  );
}
