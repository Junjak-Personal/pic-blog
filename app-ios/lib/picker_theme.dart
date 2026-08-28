import 'package:flutter/material.dart';
import 'package:wechat_assets_picker/wechat_assets_picker.dart';

/// pic-blog 의 토큰 (app/assets/css/tokens.css). 껍데기가 그리는 화면은 웹앱과 같은 색이어야
/// 「앱 안의 다른 앱」처럼 보이지 않는다.
const kGround = Color(0xFF040408); // --s0
const kPanel = Color(0xFF0B0E12); // --s1
const kInk = Color(0xFFE8EBE9); // --ink
const kMid = Color(0xFFB1C7C1); // --mid
const kAcc = Color(0xFF92B2A9); // --acc

/// 피커를 우리 색으로 입힌다.
///
/// 🔴 이 피커를 두 번 갈아엎었다가 되돌아왔다. 남겨 둔다:
///
///  - iOS 기본 피커(PHPickerViewController)로 바꿔 봤다. 익숙한 화면은 얻었지만
///    «끌어서 선택»이 없다 — PHPicker.h 에 drag/pan/select-all API 가 아예 없고,
///    시스템 UI 가 별도 프로세스에서 도니 제스처를 얹을 수도 없다. 200장을 하나씩
///    탭하게 만드는 건 이 앱의 용도에 맞지 않는다.
///
///  - 그리드를 웹뷰에서 직접 그려 봤다. 앨범을 별도 페이지로 만들 수 있었지만,
///    사진첩이 «1만 장»인 기기에서 스크롤에 맞춰 썸네일을 브리지로 나르는 구조였다.
///    시스템이 이미 갖고 있는 썸네일을 JPEG 으로 다시 뽑아 base64 로 옮기는 셈이라
///    스케일이 맞지 않았고, 동시 요청이 겹치면서 그림이 찢어졌다.
///    브리지를 건너야 하는 건 «고른 200장»이지 «보유한 1만 장»이 아니다.
///
/// 남은 아쉬움은 앨범이 드롭다운이라는 것 하나다. 그건 이 피커의 빌더 델리게이트를
/// 갈아끼우면 바꿀 수 있다 — 위의 둘처럼 판을 엎지 않고.
ThemeData pickerTheme() {
  final base = AssetPicker.themeData(kAcc, light: false);
  return base.copyWith(
    scaffoldBackgroundColor: kGround,
    canvasColor: kGround,
    cardColor: kPanel,
    dividerColor: const Color(0x24B1C7C1), // --hair
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
