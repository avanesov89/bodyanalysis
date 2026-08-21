import FirebaseAuth
import FirebaseFirestore
import Foundation

@MainActor
final class EntriesStore: ObservableObject {
    @Published private(set) var entries: [HealthEntry] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let db = Firestore.firestore()

    func loadRecentEntries(useMockData: Bool = false) async {
        if useMockData {
            entries = HealthEntry.simulatorPreviewEntries
            errorMessage = nil
            isLoading = false
            return
        }

        guard let uid = Auth.auth().currentUser?.uid else {
            entries = []
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let snapshot = try await db
                .collection("healthUsers")
                .document(uid)
                .collection("entries")
                .order(by: "date", descending: true)
                .limit(to: 30)
                .getDocuments()

            entries = snapshot.documents.compactMap { document in
                HealthEntry(id: document.documentID, data: document.data())
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
