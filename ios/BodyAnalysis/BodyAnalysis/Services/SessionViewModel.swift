import FirebaseAuth
import Foundation

@MainActor
final class SessionViewModel: ObservableObject {
    @Published private(set) var user: User?
    @Published private(set) var isDeveloperSession = false
    @Published var email = ""
    @Published var password = ""
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var listener: AuthStateDidChangeListenerHandle?

    init() {
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                guard self?.isDeveloperSession == false else {
                    return
                }

                self?.user = user
            }
        }
    }

    var isAuthenticated: Bool {
        user != nil || isDeveloperSession
    }

    var displayEmail: String {
        if isDeveloperSession {
            return "dev@simulator.local"
        }

        return user?.email ?? "Аккаунт"
    }

    #if DEBUG
    var canUseDeveloperSession: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }
    #endif

    func signIn() async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedEmail.isEmpty, !password.isEmpty else {
            errorMessage = "Введите email и пароль."
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            _ = try await Auth.auth().signIn(withEmail: trimmedEmail, password: password)
            isDeveloperSession = false
        } catch {
            errorMessage = Self.formatAuthError(error)
        }

        isLoading = false
    }

    #if DEBUG
    func signInAsDeveloper() {
        #if targetEnvironment(simulator)
        isDeveloperSession = true
        errorMessage = nil
        #endif
    }
    #endif

    func signOut() {
        if isDeveloperSession {
            isDeveloperSession = false
            return
        }

        do {
            try Auth.auth().signOut()
        } catch {
            errorMessage = Self.formatAuthError(error)
        }
    }

    private static func formatAuthError(_ error: Error) -> String {
        let nsError = error as NSError
        let details = diagnosticDetails(for: nsError)

        if nsError.domain == AuthErrorDomain,
           let code = AuthErrorCode(rawValue: nsError.code) {
            switch code {
            case .networkError:
                return "Firebase Auth не смог выполнить сетевой запрос. \(details)"
            case .wrongPassword, .invalidCredential:
                return "Email или пароль не подошли. \(details)"
            case .userNotFound:
                return "Пользователь с таким email не найден. \(details)"
            case .invalidEmail:
                return "Email выглядит некорректно. \(details)"
            default:
                break
            }
        }

        return "\(error.localizedDescription) \(details)"
    }

    private static func diagnosticDetails(for error: NSError) -> String {
        var parts = ["Код \(error.code), \(error.domain)"]

        if let errorName = error.userInfo["FIRAuthErrorNameKey"] as? String {
            parts.append(errorName)
        }

        if let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError {
            parts.append("Причина: код \(underlying.code), \(underlying.domain)")
            if let url = failingURL(from: underlying) {
                parts.append("URL: \(url)")
            }
            parts.append(underlying.localizedDescription)
        }

        return parts.joined(separator: ". ")
    }

    private static func failingURL(from error: NSError) -> String? {
        if let url = error.userInfo[NSURLErrorFailingURLStringErrorKey] as? String {
            return redactedURL(url)
        }

        if let url = error.userInfo[NSURLErrorFailingURLErrorKey] as? URL {
            return redactedURL(url.absoluteString)
        }

        return nil
    }

    private static func redactedURL(_ urlString: String) -> String {
        guard var components = URLComponents(string: urlString) else {
            return urlString
        }

        components.query = nil
        return components.string ?? urlString
    }
}
