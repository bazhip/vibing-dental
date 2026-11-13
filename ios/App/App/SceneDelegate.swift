import UIKit
import Capacitor

// iOS 27 requires the UIScene lifecycle. Capacitor 7's template is
// AppDelegate-only, so this scene delegate hosts the window (UIKit loads
// Main.storyboard, i.e. the CAPBridgeViewController, via
// UISceneStoryboardFile in Info.plist) and forwards URL opens to Capacitor.
// With scenes, UIKit no longer calls AppDelegate's application(_:open:options:)
// or application(_:continue:restorationHandler:), so deep links such as
// toothops://auth-callback must be forwarded from here to reach the App plugin
// (appUrlOpen) and App.getLaunchUrl() (ApplicationDelegateProxy.lastURL).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Cold start from a URL: the URL arrives here, not in openURLContexts.
        forward(connectionOptions.urlContexts)
        for activity in connectionOptions.userActivities {
            forward(activity)
        }
    }

    // Privacy cover: iOS snapshots the screen for the app switcher right
    // after the app enters the background. Cover the web view natively
    // (the web layer's own cover, added on Capacitor's `pause`, may not
    // have painted by then) so no patient chart shows in the switcher.
    // Removed on the way back; the web layer then decides whether to show
    // its Face ID lock screen.
    private var privacyCover: UIView?

    func sceneDidEnterBackground(_ scene: UIScene) {
        guard let window = window, privacyCover == nil else { return }
        let cover = UIImageView(frame: window.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = .systemBackground
        cover.image = UIImage(named: "Splash")
        cover.contentMode = .scaleAspectFill
        window.addSubview(cover)
        privacyCover = cover
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        privacyCover?.removeFromSuperview()
        privacyCover = nil
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        forward(URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        forward(userActivity)
    }

    private func forward(_ contexts: Set<UIOpenURLContext>) {
        for context in contexts {
            var options: [UIApplication.OpenURLOptionsKey: Any] = [
                .openInPlace: context.options.openInPlace
            ]
            if let source = context.options.sourceApplication {
                options[.sourceApplication] = source
            }
            if let annotation = context.options.annotation {
                options[.annotation] = annotation
            }
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
        }
    }

    private func forward(_ activity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
}
