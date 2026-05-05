import UIKit
import Capacitor

/// CAPBridgeViewController subclass that:
///   1. Overrides `instanceDescriptor()` to inject the saved dev URL into
///      `descriptor.serverURL` BEFORE the bridge initializes. The WebView's
///      first load is `webView.load(URLRequest(url: serverURL))` issued by
///      Capacitor itself — that path does NOT pass through
///      `WebViewDelegationHandler.decidePolicyFor`, so the dev URL is
///      immune to the system-browser pop-out problem (UIApplication.open).
///   2. Overrides `capacitorDidLoad()` to register WGDevShellPlugin so the
///      bundled dev-shell HTML can save/clear the URL and restart the app.
class MainViewController: CAPBridgeViewController {

    static let prefsKey = "wg_dev_url"

    override open func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if let saved = UserDefaults.standard.string(forKey: MainViewController.prefsKey),
           !saved.isEmpty {
            descriptor.serverURL = saved
        }
        return descriptor
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WGDevShellPlugin())
    }
}
