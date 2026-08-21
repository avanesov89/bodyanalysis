import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionViewModel

    var body: some View {
        if !session.isAuthenticated {
            SignInView()
        } else {
            TodayView()
        }
    }
}
