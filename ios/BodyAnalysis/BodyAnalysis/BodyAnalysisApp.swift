import FirebaseCore
import SwiftUI

@main
struct BodyAnalysisApp: App {
    @StateObject private var session: SessionViewModel

    init() {
        FirebaseConfiguration.shared.setLoggerLevel(.debug)
        FirebaseApp.configure()
        _session = StateObject(wrappedValue: SessionViewModel())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
        }
    }
}
