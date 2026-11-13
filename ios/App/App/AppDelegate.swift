import UIKit
import Capacitor

// The app uses the UIScene lifecycle (required on iOS 27). The window, the
// Capacitor bridge view controller and URL opens (deep links, universal links)
// are handled by SceneDelegate; see UIApplicationSceneManifest in Info.plist.
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }
}
