import Foundation
import Capacitor

@objc(WGDevShellPlugin)
public class WGDevShellPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "WGDevShellPlugin"
    public let jsName = "WGDevShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setUrlAndRestart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearUrl", returnType: CAPPluginReturnPromise),
    ]

    @objc func getUrl(_ call: CAPPluginCall) {
        let url = UserDefaults.standard.string(forKey: MainViewController.prefsKey)
        call.resolve(["url": url as Any])
    }

    @objc func setUrlAndRestart(_ call: CAPPluginCall) {
        guard let url = call.getString("url"), !url.isEmpty else {
            call.reject("url is required")
            return
        }
        UserDefaults.standard.set(url, forKey: MainViewController.prefsKey)
        UserDefaults.standard.synchronize()
        call.resolve()
        restart()
    }

    @objc func clearUrl(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: MainViewController.prefsKey)
        UserDefaults.standard.synchronize()
        call.resolve()
        restart()
    }

    private func restart() {
        // Tiny delay so the JS resolve gets posted before we kill the process.
        // exit(0) is App Store unsafe but acceptable for a dev-only IPA.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            exit(0)
        }
    }
}
