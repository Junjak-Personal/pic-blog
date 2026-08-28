import 'package:flutter/material.dart';
import 'package:wechat_assets_picker/wechat_assets_picker.dart';
// context.topPadding 확장 — 기본 델리게이트가 쓰는 것과 같은 것을 쓴다
import 'package:wechat_picker_library/wechat_picker_library.dart';

import 'picker_theme.dart';

/// 앨범 고르개를 «드롭다운 목록» 대신 «그리드»로 바꾼다.
///
/// 이것 하나만 갈아끼운다. 사진 그리드·끌어서 선택·선택 카운트·미리보기는 전부 원래
/// 것을 그대로 쓴다 — 앨범 목록이 좁은 드롭다운이라 한눈에 안 들어온다는 것 말고는
/// 이 피커에 아쉬운 점이 없었다. (iOS 기본 피커로 갈아탔다가 끌어서 선택이 없어서,
/// 웹뷰에서 직접 그렸다가 1만 장짜리 사진첩을 브리지로 나르는 구조라서 둘 다 되돌아왔다.
/// 자세한 경위는 picker_theme.dart 의 🔴 주석에 있다.)
class AlbumGridPickerDelegate extends DefaultAssetPickerBuilderDelegate {
  AlbumGridPickerDelegate({
    required super.provider,
    required super.initialPermission,
    super.gridCount,
    super.pickerTheme,
    super.textDelegate,
    super.dragToSelect,
    super.locale,
  });

  @override
  Widget pathEntityListWidget(BuildContext context) {
    // 기본 구현과 같은 계산 — 이걸 안 하면 첫 줄이 앱바 밑에 깔린다
    appBarPreferredSize ??= appBar(context).preferredSize;
    return ValueListenableBuilder<bool>(
      valueListenable: isSwitchingPath,
      builder: (_, bool switching, _) {
        // 🔴 닫혀 있을 때는 아예 자리를 비워야 한다. 크기 0 으로 접어두면 그 위에
        //    투명한 판이 남아 사진 그리드의 탭·드래그를 먹는다.
        if (!switching) return const SizedBox.shrink();
        return Positioned.fill(
          top: context.topPadding + appBarPreferredSize!.height,
          child: _grid(context),
        );
      },
    );
  }

  Widget _grid(BuildContext context) {
    return Container(
      color: kGround,
      child: SafeArea(
        top: false,
        // provider 패키지의 Selector 를 쓰지 않는다 — 델리게이트가 provider 를 필드로
        // 이미 들고 있고, 그 자체가 ChangeNotifier 라 직접 들으면 된다.
        child: ListenableBuilder(
          listenable: provider,
          builder: (_, _) {
            /*
             * Recents(isAll)를 맨 앞에 고정하고, 나머지는 받아온 순서의 역순 —
             * 최근에 만든 앨범이 위로 온다. 여행 기록은 방금 만든 앨범을 쓰는 일이
             * 대부분이라, 기본 정렬(이름순)이면 매번 끝까지 굴려야 했다.
             */
            final all = provider.paths.where((w) => (w.assetCount ?? 0) > 0).toList();
            final visible = <PathWrapper<AssetPathEntity>>[
              ...all.where((w) => w.path.isAll),
              ...all.where((w) => !w.path.isAll).toList().reversed,
            ];
            if (visible.isEmpty) {
              return Center(
                child: Text(textDelegate.emptyList, style: const TextStyle(color: kMid)),
              );
            }
            return GridView.builder(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 14,
                crossAxisSpacing: 14,
                // 정사각 커버 + 이름/장수 두 줄
                childAspectRatio: 0.82,
              ),
              itemCount: visible.length,
              itemBuilder: (_, int i) => _card(visible[i]),
            );
          },
        ),
      ),
    );
  }

  Widget _card(PathWrapper<AssetPathEntity> wrapper) {
    final current = provider.currentPath?.path.id == wrapper.path.id;
    final name = pathNameBuilder?.call(wrapper.path) ?? wrapper.path.name;

    return GestureDetector(
      onTap: () {
        provider.switchPath(wrapper);
        isSwitchingPath.value = false;
      },
      behavior: HitTestBehavior.opaque,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(
            /*
             * 🔴 테두리를 이미지 «위에» 그린다.
             *
             *    Container 의 border + clipBehavior 로 하면 자식이 «바깥» 둥근 사각으로
             *    잘려서, 이미지 가장자리가 테두리의 안티에일리어싱을 뚫고 나온다.
             *    흐린 테두리에서는 안 보이지만 지금 보고 있는 앨범(밝은 --acc)에서는
             *    모서리가 깨져 보였다. 잘라낸 다음 그 위에 테두리를 얹으면 깨끗하다.
             */
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Stack(
                fit: StackFit.expand,
                children: <Widget>[
                  const ColoredBox(color: kPanel),
                  /*
                   * 커버는 provider 가 이미 뽑아 둔 것을 쓴다 (pathThumbnailSize).
                   * 여기서 새로 요청하면 앨범 수만큼 PhotoKit 을 또 두드린다.
                   */
                  if (wrapper.thumbnailData != null)
                    Image.memory(wrapper.thumbnailData!, fit: BoxFit.cover),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(color: current ? kAcc : const Color(0x24B1C7C1)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 7),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 14,
              color: current ? kInk : kInk.withValues(alpha: 0.92),
              fontWeight: current ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
          Text(
            '${wrapper.assetCount ?? 0}',
            style: const TextStyle(fontSize: 11.5, color: kMid),
          ),
        ],
      ),
    );
  }
}
