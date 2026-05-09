import UIKit
import Capacitor
import MachO

/// CAPBridgeViewController subclass that:
///   1. Overrides `instanceDescriptor()` to inject the saved dev URL into
///      `descriptor.serverURL` before the bridge initializes.
///   2. Registers WGDevShellPlugin so the bundled dev-shell HTML can
///      save/clear the URL and restart the app.
class MainViewController: CAPBridgeViewController {

    static let prefsKey = "wg_dev_url"
    private var memoryLogTimer: Timer?

    override open func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if let saved = UserDefaults.standard.string(forKey: MainViewController.prefsKey),
           !saved.isEmpty {
            NSLog("[WGReloadDiagnostics][Native] using saved dev server URL: %@", saved)
            descriptor.serverURL = saved
        } else {
            NSLog("[WGReloadDiagnostics][Native] using bundled web assets")
        }
        return descriptor
    }

    override open func capacitorDidLoad() {
        NSLog("[WGReloadDiagnostics][Native] capacitorDidLoad webViewURL=%@",
              webView?.url?.absoluteString ?? "nil")
        bridge?.registerPluginInstance(WGDevShellPlugin())
    }

    override open var canBecomeFirstResponder: Bool {
        true
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        NSLog("[WGReloadDiagnostics][Native] MainViewController viewDidLoad")
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
        startMemoryLogTimer()
    }

    override open func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        NSLog("[WGReloadDiagnostics][Native] MainViewController viewDidAppear webViewURL=%@",
              webView?.url?.absoluteString ?? "nil")
        becomeFirstResponder()
    }

    deinit {
        memoryLogTimer?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    override open func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        guard motion == .motionShake else {
            super.motionEnded(motion, with: event)
            return
        }

        NSLog("[WGReloadDiagnostics][Native] shake restart requested; clearing saved dev URL")
        UserDefaults.standard.removeObject(forKey: MainViewController.prefsKey)
        UserDefaults.standard.synchronize()
        restart()
    }

    @objc private func handleMemoryWarning() {
        NSLog("[WGReloadDiagnostics][Native] MainViewController memory warning webViewURL=%@",
              webView?.url?.absoluteString ?? "nil")
        logMemorySample("MainViewController memory warning")
    }

    private func restart() {
        logMemorySample("process exit scheduled")
        NSLog("[WGReloadDiagnostics][Native] process exit scheduled")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            exit(0)
        }
    }

    private func startMemoryLogTimer() {
        memoryLogTimer?.invalidate()
        memoryLogTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            let state = UIApplication.shared.applicationState
            if state == .active || state == .inactive {
                self.logMemorySample("periodic visible")
            }
        }
        memoryLogTimer?.tolerance = 2
    }

    private func logMemorySample(_ reason: String) {
        let sample = currentMemorySample()
        NSLog("[WGReloadDiagnostics][Native][Memory] reason=%@ residentMB=%.1f physicalFootprintMB=%.1f internalMB=%.1f compressedMB=%.1f webViewURL=%@",
              reason,
              sample.residentMB,
              sample.physicalFootprintMB,
              sample.internalMB,
              sample.compressedMB,
              webView?.url?.absoluteString ?? "nil")
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
