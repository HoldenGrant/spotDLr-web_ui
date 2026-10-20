import Cocoa
import WebKit

// Native window for both source and self-contained builds. A packaged app owns its
// backend; source builds keep the original background server behavior.
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var status: NSTextField!
    private var loading: NSStackView!
    private var backend: Process?
    private var backendLog: FileHandle?
    private var ready = false
    private var failed = false
    private var address = URL(string: "http://127.0.0.1:8000")!
    private let packaged = Bundle.main.object(forInfoDictionaryKey: "SpotDLrBundledBackend") as? Bool == true
    private let readyFile = FileManager.default.temporaryDirectory.appendingPathComponent("spotDLr-\(UUID().uuidString).json")
    private let deadline = Date().addingTimeInterval(300)

    func applicationDidFinishLaunching(_ notification: Notification) {
        makeMenu()
        let configuration = WKWebViewConfiguration()
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.preferences.isElementFullscreenEnabled = true
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isHidden = true

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "spotDLr"
        window.minSize = NSSize(width: 400, height: 560)
        window.isReleasedWhenClosed = false
        window.backgroundColor = NSColor(calibratedWhite: 0.07, alpha: 1)
        window.appearance = NSAppearance(named: .darkAqua)
        window.setFrameAutosaveName("spotDLrMainWindow")
        let content = window.contentView!
        webView.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            webView.topAnchor.constraint(equalTo: content.topAnchor),
            webView.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])

        let spinner = NSProgressIndicator()
        spinner.style = .spinning
        spinner.startAnimation(nil)
        status = NSTextField(labelWithString: "Starting spotDLr…")
        status.textColor = .secondaryLabelColor
        loading = NSStackView(views: [spinner, status])
        loading.orientation = .vertical
        loading.spacing = 16
        loading.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(loading)
        NSLayoutConstraint.activate([
            loading.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            loading.centerYAnchor.constraint(equalTo: content.centerYAnchor),
        ])
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        checkServer()
    }

    private func makeMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        menu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About spotDLr", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide spotDLr", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit spotDLr", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        for (title, items) in [
            ("Edit", [("Undo", "undo:", "z"), ("Redo", "redo:", "Z"),
                      ("Cut", "cut:", "x"), ("Copy", "copy:", "c"),
                      ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")]),
            ("View", [("Reload", "reloadPage:", "r"), ("Enter Full Screen", "toggleFullScreen:", "f")]),
            ("Window", [("Minimize", "performMiniaturize:", "m"), ("Close Window", "performClose:", "w")]),
        ] {
            let item = NSMenuItem()
            menu.addItem(item)
            let submenu = NSMenu(title: title)
            for (label, action, key) in items {
                let entry = submenu.addItem(withTitle: label, action: Selector(action), keyEquivalent: key)
                if action == "reloadPage:" { entry.target = self }
                if action == "toggleFullScreen:" { entry.keyEquivalentModifierMask = [.command, .control] }
            }
            item.submenu = submenu
            if title == "Window" { NSApp.windowsMenu = submenu }
        }
        NSApp.mainMenu = menu
    }

    @objc private func reloadPage(_ sender: Any?) {
        if ready { webView.reload() }
    }

    private func checkServer() {
        guard !ready, !failed else { return }
        if packaged {
            if backend == nil { startServer() }
            guard !failed else { return }
            guard let data = try? Data(contentsOf: readyFile),
                  let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Int],
                  let port = payload["port"], (1024...65535).contains(port) else {
                if Date() > deadline { fail("Starting took too long. See ~/Library/Logs/spotDLr.log for details.") }
                else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.checkServer() } }
                return
            }
            address = URL(string: "http://127.0.0.1:\(port)")!
        }
        var request = URLRequest(url: address.appendingPathComponent("api/ping"))
        request.timeoutInterval = 2
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                guard let self = self, !self.ready, !self.failed else { return }
                let payload = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
                if payload?["app"] as? String == "spotDLr" {
                    self.ready = true
                    self.status.stringValue = "Opening your library…"
                    self.webView.load(URLRequest(url: self.address))
                } else if response != nil {
                    self.fail("Port 8000 is being used by another app. Close that app and reopen spotDLr.")
                } else if Date() > self.deadline {
                    self.fail("Starting took more than five minutes. See ~/Library/Logs/spotDLr.log for details.")
                } else {
                    if self.backend == nil { self.startServer() }
                    if self.failed { return }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.checkServer() }
                }
            }
        }.resume()
    }

    private func startServer() {
        let project = Bundle.main.object(forInfoDictionaryKey: "SpotDLrProjectPath") as? String
        let helper = Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/spotDLr-server.app/Contents/MacOS/spotDLr-server")
        if !packaged && (project == nil || !FileManager.default.isExecutableFile(atPath: project! + "/run.sh")) {
            fail("The project folder has moved. Run make_launcher.sh from its new location to rebuild this app.")
            return
        }
        do {
            let logURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/spotDLr.log")
            try FileManager.default.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: logURL.path) {
                FileManager.default.createFile(atPath: logURL.path, contents: nil)
            }
            let log = try FileHandle(forWritingTo: logURL)
            log.seekToEndOfFile()
            backendLog = log
            let process = Process()
            var environment = ProcessInfo.processInfo.environment
            if packaged {
                process.executableURL = helper
                process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
                environment["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin"
                environment["SPOTDLR_READY_FILE"] = readyFile.path
            } else {
                process.executableURL = URL(fileURLWithPath: "/bin/bash")
                process.arguments = [project! + "/run.sh"]
                process.currentDirectoryURL = URL(fileURLWithPath: project!)
                environment["PATH"] = Bundle.main.object(forInfoDictionaryKey: "SpotDLrExecutablePath") as? String
                environment["SPOTDLR_NO_BROWSER"] = "1"
            }
            process.environment = environment
            process.standardInput = FileHandle.nullDevice
            process.standardOutput = log
            process.standardError = log
            process.terminationHandler = { [weak self] process in
                DispatchQueue.main.async {
                    guard let self = self, !self.ready else { return }
                    self.fail("The music server stopped (exit \(process.terminationStatus)). See ~/Library/Logs/spotDLr.log for details.")
                }
            }
            backend = process
            try process.run()
            status.stringValue = packaged ? "Opening spotDLr…" : "Preparing spotDLr… First launch can take a few minutes."
        } catch {
            fail("Couldn't start spotDLr: \(error.localizedDescription)")
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        if packaged, let process = backend, process.isRunning { process.terminate() }
        try? FileManager.default.removeItem(at: readyFile)
    }

    private func fail(_ message: String) {
        guard !failed else { return }
        failed = true
        let alert = NSAlert()
        alert.messageText = "spotDLr couldn't open"
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.addButton(withTitle: "Quit")
        alert.runModal()
        NSApp.terminate(nil)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        return true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loading.isHidden = true
        webView.isHidden = false
        window.makeFirstResponder(webView)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { fail(error.localizedDescription) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == address.scheme && url.host == address.host && url.port == address.port {
            decisionHandler(.allow)
        } else {
            if action.navigationType == .linkActivated, ["https", "http"].contains(url.scheme ?? "") {
                NSWorkspace.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, ["https", "http"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.beginSheetModal(for: window) { result in
            completionHandler(result == .OK ? panel.urls : nil)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
