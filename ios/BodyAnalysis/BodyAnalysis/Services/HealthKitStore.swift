import Foundation
import FirebaseAuth
import FirebaseFirestore
import HealthKit

@MainActor
final class HealthKitStore: ObservableObject {
    @Published private(set) var snapshot: HealthSnapshot?
    @Published private(set) var isLoading = false
    @Published private(set) var isSyncing = false
    @Published var syncMessage: String?
    @Published var errorMessage: String?

    private let healthStore = HKHealthStore()
    private let db = Firestore.firestore()

    var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    func requestAuthorizationAndLoad() async {
        guard isAvailable else {
            errorMessage = "Apple Health доступен только на iPhone."
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            try await requestAuthorization()
            snapshot = try await loadSnapshot()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func loadLatestValues() async {
        guard isAvailable else {
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            snapshot = try await loadSnapshot()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func syncSnapshotToFirebase() async {
        guard let snapshot else {
            errorMessage = "Сначала подключи Apple Health и загрузи данные."
            return
        }

        guard let uid = Auth.auth().currentUser?.uid else {
            errorMessage = "Для синхронизации нужно войти в Firebase-аккаунт."
            return
        }

        let entries = buildFirebaseEntries(from: snapshot)
        guard !entries.isEmpty else {
            errorMessage = "Нет данных Apple Health для синхронизации."
            return
        }

        isSyncing = true
        errorMessage = nil
        syncMessage = nil

        do {
            for entry in entries {
                try await saveEntry(entry, uid: uid)
            }

            syncMessage = "Синхронизировано записей: \(entries.count)."
        } catch {
            errorMessage = "Не удалось синхронизировать Apple Health: \(error.localizedDescription)"
        }

        isSyncing = false
    }

    func syncHistoryToFirebase(days: Int = 30) async {
        guard isAvailable else {
            errorMessage = "Apple Health доступен только на iPhone."
            return
        }

        guard let uid = Auth.auth().currentUser?.uid else {
            errorMessage = "Для синхронизации нужно войти в Firebase-аккаунт."
            return
        }

        isSyncing = true
        errorMessage = nil
        syncMessage = nil

        do {
            try await requestAuthorization()
            let history = try await loadHistory(days: days)
            let timestamp = ISO8601DateFormatter().string(from: Date())
            let entries = history.flatMap { buildFirebaseEntries(from: $0, syncedAt: timestamp) }

            guard !entries.isEmpty else {
                errorMessage = "За выбранный период не найдено данных Apple Health."
                isSyncing = false
                return
            }

            for entry in entries {
                try await saveEntry(entry, uid: uid)
            }

            snapshot = try await loadSnapshot()
            syncMessage = "Синхронизировано за \(days) дней: \(entries.count) записей."
        } catch {
            errorMessage = "Не удалось синхронизировать историю Apple Health: \(error.localizedDescription)"
        }

        isSyncing = false
    }

    private func requestAuthorization() async throws {
        let readTypes = Set([
            HKObjectType.quantityType(forIdentifier: .bodyMass),
            HKObjectType.quantityType(forIdentifier: .stepCount),
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis),
        ].compactMap { $0 })

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            healthStore.requestAuthorization(toShare: [], read: readTypes) { success, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if success {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: HealthKitError.authorizationDenied)
                }
            }
        }
    }

    private func loadSnapshot() async throws -> HealthSnapshot {
        async let weight = latestQuantity(.bodyMass, unit: .gramUnit(with: .kilo))
        async let steps = cumulativeQuantityToday(.stepCount, unit: .count())
        async let activeCalories = cumulativeQuantityToday(.activeEnergyBurned, unit: .kilocalorie())
        async let sleep = sleepHoursSinceYesterdayEvening()

        return HealthSnapshot(
            weightKg: try await weight,
            stepsToday: try await steps,
            activeCaloriesToday: try await activeCalories,
            sleepHours: try await sleep,
            updatedAt: Date()
        )
    }

    private func loadHistory(days: Int) async throws -> [HealthHistoryDay] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let safeDays = max(1, min(days, 90))

        return try await withThrowingTaskGroup(of: HealthHistoryDay?.self) { group in
            for offset in 0..<safeDays {
                guard let day = calendar.date(byAdding: .day, value: -offset, to: today) else {
                    continue
                }

                group.addTask {
                    try await self.loadHistoryDay(day)
                }
            }

            var history: [HealthHistoryDay] = []
            for try await day in group {
                if let day {
                    history.append(day)
                }
            }

            return history.sorted { $0.date > $1.date }
        }
    }

    private func loadHistoryDay(_ day: Date) async throws -> HealthHistoryDay? {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: day)
        let nextDay = calendar.date(byAdding: .day, value: 1, to: start) ?? start
        let end = min(nextDay, Date())

        async let weight = latestQuantity(.bodyMass, unit: .gramUnit(with: .kilo), start: start, end: end)
        async let steps = cumulativeQuantity(.stepCount, unit: .count(), start: start, end: end)
        async let activeCalories = cumulativeQuantity(.activeEnergyBurned, unit: .kilocalorie(), start: start, end: end)
        async let sleep = sleepHours(for: start)

        let historyDay = HealthHistoryDay(
            date: start,
            weightKg: try await weight,
            steps: try await steps,
            activeCalories: try await activeCalories,
            sleepHours: try await sleep
        )

        return historyDay.hasValues ? historyDay : nil
    }

    private func latestQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit) async throws -> Double? {
        try await latestQuantity(identifier, unit: unit, start: nil, end: nil)
    }

    private func latestQuantity(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        start: Date?,
        end: Date?
    ) async throws -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
            return nil
        }

        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let predicate: NSPredicate?
        if let start, let end {
            predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        } else {
            predicate = nil
        }

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let sample = samples?.first as? HKQuantitySample
                continuation.resume(returning: sample?.quantity.doubleValue(for: unit))
            }

            healthStore.execute(query)
        }
    }

    private func cumulativeQuantityToday(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit) async throws -> Double? {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        return try await cumulativeQuantity(identifier, unit: unit, start: startOfDay, end: Date())
    }

    private func cumulativeQuantity(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        start: Date,
        end: Date
    ) async throws -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
            return nil
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                continuation.resume(returning: statistics?.sumQuantity()?.doubleValue(for: unit))
            }

            healthStore.execute(query)
        }
    }

    private func sleepHoursSinceYesterdayEvening() async throws -> Double? {
        try await sleepHours(for: Date())
    }

    private func sleepHours(for day: Date) async throws -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            return nil
        }

        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: day)
        let start = calendar.date(byAdding: .hour, value: -6, to: startOfDay) ?? startOfDay
        let evening = calendar.date(byAdding: .hour, value: 18, to: startOfDay) ?? Date()
        let end = min(evening, Date())
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let sleepSeconds = (samples as? [HKCategorySample])?
                    .filter { $0.value != HKCategoryValueSleepAnalysis.inBed.rawValue && $0.value != HKCategoryValueSleepAnalysis.awake.rawValue }
                    .reduce(0) { total, sample in
                        total + sample.endDate.timeIntervalSince(sample.startDate)
                    } ?? 0

                continuation.resume(returning: sleepSeconds > 0 ? sleepSeconds / 3600 : nil)
            }

            healthStore.execute(query)
        }
    }

    private func buildFirebaseEntries(from snapshot: HealthSnapshot) -> [[String: Any]] {
        let date = Self.dayString(from: snapshot.updatedAt)
        let timestamp = ISO8601DateFormatter().string(from: Date())
        var entries: [[String: Any]] = []

        if let weightKg = snapshot.weightKg {
            entries.append([
                "id": "apple_health_body_\(date)",
                "kind": "body",
                "date": date,
                "source": "apple_health",
                "sourceName": "Apple Health",
                "externalId": "apple_health:body:\(date)",
                "syncedAt": timestamp,
                "createdAt": timestamp,
                "updatedAt": timestamp,
                "weightKg": weightKg,
            ])
        }

        if snapshot.stepsToday != nil || snapshot.activeCaloriesToday != nil {
            var activityEntry: [String: Any] = [
                "id": "apple_health_activity_\(date)",
                "kind": "activity",
                "date": date,
                "source": "apple_health",
                "sourceName": "Apple Health",
                "externalId": "apple_health:activity:\(date)",
                "syncedAt": timestamp,
                "createdAt": timestamp,
                "updatedAt": timestamp,
            ]

            if let steps = snapshot.stepsToday {
                activityEntry["steps"] = roundedWholeNumber(steps)
            }

            if let activeCalories = snapshot.activeCaloriesToday {
                activityEntry["activeCalories"] = roundedWholeNumber(activeCalories)
            }

            entries.append(activityEntry)
        }

        if let sleepHours = snapshot.sleepHours {
            entries.append([
                "id": "apple_health_sleep_\(date)",
                "kind": "sleep",
                "date": date,
                "source": "apple_health",
                "sourceName": "Apple Health",
                "externalId": "apple_health:sleep:\(date)",
                "syncedAt": timestamp,
                "createdAt": timestamp,
                "updatedAt": timestamp,
                "sleepHours": roundedOneDecimal(sleepHours),
            ])
        }

        return entries
    }

    private func buildFirebaseEntries(from historyDay: HealthHistoryDay, syncedAt timestamp: String) -> [[String: Any]] {
        let date = Self.dayString(from: historyDay.date)
        var entries: [[String: Any]] = []

        if let weightKg = historyDay.weightKg {
            entries.append([
                "id": "apple_health_body_\(date)",
                "kind": "body",
                "date": date,
                "source": "apple_health",
                "sourceName": "Apple Health",
                "externalId": "apple_health:body:\(date)",
                "syncedAt": timestamp,
                "createdAt": timestamp,
                "updatedAt": timestamp,
                "weightKg": weightKg,
            ])
        }

        if historyDay.steps != nil || historyDay.activeCalories != nil {
            var activityEntry: [String: Any] = [
                "id": "apple_health_activity_\(date)",
                "kind": "activity",
                "date": date,
                "source": "apple_health",
                "sourceName": "Apple Health",
                "externalId": "apple_health:activity:\(date)",
                "syncedAt": timestamp,
                "createdAt": timestamp,
                "updatedAt": timestamp,
            ]

            if let steps = historyDay.steps {
                activityEntry["steps"] = roundedWholeNumber(steps)
            }

            if let activeCalories = historyDay.activeCalories {
                activityEntry["activeCalories"] = roundedWholeNumber(activeCalories)
            }

            entries.append(activityEntry)
        }

        if let sleepHours = historyDay.sleepHours {
            entries.append([
                "id": "apple_health_sleep_\(date)",
                "kind": "sleep",
                "date": date,
                "source": "apple_health",
                "sourceName": "Apple Health",
                "externalId": "apple_health:sleep:\(date)",
                "syncedAt": timestamp,
                "createdAt": timestamp,
                "updatedAt": timestamp,
                "sleepHours": roundedOneDecimal(sleepHours),
            ])
        }

        return entries
    }

    private func saveEntry(_ entry: [String: Any], uid: String) async throws {
        guard
            let id = entry["id"] as? String,
            let kind = entry["kind"] as? String,
            let date = entry["date"] as? String
        else {
            return
        }

        let collectionRef = db
            .collection("healthUsers")
            .document(uid)
            .collection("entries")
        let appleHealthRef = collectionRef.document(id)
        var ref = appleHealthRef
        var existing = try await appleHealthRef.getDocument()

        if !existing.exists, let manualMatch = try await findManualEntry(kind: kind, date: date, in: collectionRef) {
            ref = manualMatch.reference
            existing = manualMatch
        }

        var nextEntry = entry
        if let createdAt = existing.data()?["createdAt"] as? String {
            nextEntry["createdAt"] = createdAt
        }
        nextEntry["id"] = ref.documentID

        try await ref.setData(nextEntry, merge: true)
    }

    private func findManualEntry(
        kind: String,
        date: String,
        in collectionRef: CollectionReference
    ) async throws -> DocumentSnapshot? {
        let snapshot = try await collectionRef
            .whereField("date", isEqualTo: date)
            .getDocuments()

        return snapshot.documents.first { document in
            let data = document.data()
            let source = data["source"] as? String ?? "manual"
            return data["kind"] as? String == kind && source == "manual"
        }
    }

    private static func dayString(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func roundedWholeNumber(_ value: Double) -> Double {
        value.rounded()
    }

    private func roundedOneDecimal(_ value: Double) -> Double {
        (value * 10).rounded() / 10
    }
}

private struct HealthHistoryDay {
    let date: Date
    let weightKg: Double?
    let steps: Double?
    let activeCalories: Double?
    let sleepHours: Double?

    var hasValues: Bool {
        weightKg != nil || steps != nil || activeCalories != nil || sleepHours != nil
    }
}

enum HealthKitError: LocalizedError {
    case authorizationDenied

    var errorDescription: String? {
        switch self {
        case .authorizationDenied:
            return "Доступ к Apple Health не был предоставлен."
        }
    }
}
