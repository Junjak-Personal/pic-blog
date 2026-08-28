import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    /*
     * 🔴 앱이 떠 있는 동안 화면을 재우지 않는다.
     *
     *    취향이 아니라 «중단 위험» 때문이다. 사진 수백 장을 올리면 리사이즈 + 전송이 몇
     *    분씩 걸리는데, 그동안 화면이 꺼지면 iOS 가 앱을 재우고 전송이 그 자리에서 멈춘다.
     *    사용자는 다 올라간 줄 알고 앱을 떠난다 — 조용한 실패다.
     *
     *    백그라운드로 가면 iOS 가 알아서 되돌리므로 따로 풀어줄 필요는 없다.
     */
    application.isIdleTimerDisabled = true
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
