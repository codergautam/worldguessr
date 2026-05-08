import UIKit
import Capacitor

/// CAPBridgeViewController subclass that:
///   1. Overrides `instanceDescriptor()` to inject the saved dev URL into
///      `descriptor.serverURL` before the bridge initializes.
///   2. Registers WGDevShellPlugin so the bundled dev-shell HTML can
///      save/clear the URL and restart the app.
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

    override open var canBecomeFirstResponder: Bool {
        true
    }

    override open func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        becomeFirstResponder()
    }

    override open func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        guard motion == .motionShake else {
            super.motionEnded(motion, with: event)
            return
        }

        UserDefaults.standard.removeObject(forKey: MainViewController.prefsKey)
        UserDefaults.standard.synchronize()
        restart()
    }

    private func restart() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            exit(0)
        }
    }
}
