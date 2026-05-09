import UIKit
import Capacitor
import MachO

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        NSLog("[WGReloadDiagnostics][Native] didFinishLaunching state=%@ launchOptions=%@",
              appStateName(application.applicationState),
              String(describing: launchOptions))
        logMemorySample("didFinishLaunching")
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
        NSLog("[WGReloadDiagnostics][Native] applicationWillResignActive state=%@",
              appStateName(application.applicationState))
        logMemorySample("applicationWillResignActive")
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
        NSLog("[WGReloadDiagnostics][Native] applicationDidEnterBackground state=%@ backgroundTimeRemaining=%.2f",
              appStateName(application.applicationState),
              application.backgroundTimeRemaining)
        logMemorySample("applicationDidEnterBackground")
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
        NSLog("[WGReloadDiagnostics][Native] applicationWillEnterForeground state=%@",
              appStateName(application.applicationState))
        logMemorySample("applicationWillEnterForeground")
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        NSLog("[WGReloadDiagnostics][Native] applicationDidBecomeActive state=%@",
              appStateName(application.applicationState))
        logMemorySample("applicationDidBecomeActive")
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
        NSLog("[WGReloadDiagnostics][Native] applicationWillTerminate state=%@",
              appStateName(application.applicationState))
        logMemorySample("applicationWillTerminate")
    }

    func applicationDidReceiveMemoryWarning(_ application: UIApplication) {
        NSLog("[WGReloadDiagnostics][Native] applicationDidReceiveMemoryWarning state=%@",
              appStateName(application.applicationState))
        logMemorySample("applicationDidReceiveMemoryWarning")
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func appStateName(_ state: UIApplication.State) -> String {
        switch state {
        case .active:
            return "active"
        case .inactive:
            return "inactive"
        case .background:
            return "background"
        @unknown default:
            return "unknown"
        }
    }

    private func logMemorySample(_ reason: String) {
        let sample = currentMemorySample()
        NSLog("[WGReloadDiagnostics][Native][Memory] reason=%@ residentMB=%.1f physicalFootprintMB=%.1f internalMB=%.1f compressedMB=%.1f",
              reason,
              sample.residentMB,
              sample.physicalFootprintMB,
              sample.internalMB,
              sample.compressedMB)
    }

    private func currentMemorySample() -> (residentMB: Double, physicalFootprintMB: Double, internalMB: Double, compressedMB: Double) {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }

        guard result == KERN_SUCCESS else {
            return (0, 0, 0, 0)
        }

        let bytesPerMB = 1024.0 * 1024.0
        return (
            Double(info.resident_size) / bytesPerMB,
            Double(info.phys_footprint) / bytesPerMB,
            Double(info.internal) / bytesPerMB,
            Double(info.compressed) / bytesPerMB
        )
    }

}
