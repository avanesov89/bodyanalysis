import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var session: SessionViewModel
    @StateObject private var entriesStore = EntriesStore()
    @StateObject private var healthKitStore = HealthKitStore()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(session.displayEmail)
                                .font(.headline)
                            Text(session.isDeveloperSession ? "Dev-режим симулятора: используются тестовые записи." : "Данные читаются из того же Firebase, что и web-версия.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Button("Выйти") {
                            session.signOut()
                        }
                        .font(.caption)
                    }
                }

                Section("Apple Health") {
                    if !healthKitStore.isAvailable {
                        Text("Реальные данные Apple Health доступны на iPhone.")
                            .foregroundStyle(.secondary)
                    } else if let snapshot = healthKitStore.snapshot {
                        HealthMetricRow(title: "Вес", value: format(snapshot.weightKg, suffix: "кг"))
                        HealthMetricRow(title: "Шаги сегодня", value: format(snapshot.stepsToday, suffix: "шагов", fractionDigits: 0))
                        HealthMetricRow(title: "Активные калории", value: format(snapshot.activeCaloriesToday, suffix: "ккал", fractionDigits: 0))
                        HealthMetricRow(title: "Сон", value: format(snapshot.sleepHours, suffix: "ч"))

                        Text("Обновлено \(snapshot.updatedAt.formatted(date: .omitted, time: .shortened))")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)

                        Button {
                            Task {
                                await healthKitStore.syncSnapshotToFirebase()
                                await entriesStore.loadRecentEntries(useMockData: session.isDeveloperSession)
                            }
                        } label: {
                            HStack {
                                Spacer()
                                if healthKitStore.isSyncing {
                                    ProgressView()
                                } else {
                                    Text("Синхронизировать в web")
                                }
                                Spacer()
                            }
                        }
                        .disabled(healthKitStore.isSyncing || session.isDeveloperSession)

                        Button {
                            Task {
                                await healthKitStore.syncHistoryToFirebase(days: 30)
                                await entriesStore.loadRecentEntries(useMockData: session.isDeveloperSession)
                            }
                        } label: {
                            HStack {
                                Spacer()
                                if healthKitStore.isSyncing {
                                    ProgressView()
                                } else {
                                    Text("Синхронизировать 30 дней")
                                }
                                Spacer()
                            }
                        }
                        .disabled(healthKitStore.isSyncing || session.isDeveloperSession)
                    } else {
                        Button("Подключить Apple Health") {
                            Task {
                                await healthKitStore.requestAuthorizationAndLoad()
                            }
                        }
                    }

                    if healthKitStore.isLoading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    }

                    if let errorMessage = healthKitStore.errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }

                    if let syncMessage = healthKitStore.syncMessage {
                        Text(syncMessage)
                            .foregroundStyle(.green)
                    }
                }

                if let errorMessage = entriesStore.errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section("Последние записи") {
                    if entriesStore.isLoading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    } else if entriesStore.entries.isEmpty {
                        Text("Записей пока нет.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(entriesStore.entries) { entry in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(entry.kind.title)
                                        .font(.headline)
                                    Spacer()
                                    Text(entry.date)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }

                                Text(entry.summary.isEmpty ? "Без значений" : entry.summary)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)

                                Text(entry.source.title)
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Сегодня")
            .toolbar {
                Button("Обновить") {
                    Task {
                        await entriesStore.loadRecentEntries(useMockData: session.isDeveloperSession)
                    }
                }
            }
            .task {
                await entriesStore.loadRecentEntries(useMockData: session.isDeveloperSession)
            }
            .refreshable {
                await entriesStore.loadRecentEntries(useMockData: session.isDeveloperSession)
            }
        }
    }

    private func format(_ value: Double?, suffix: String, fractionDigits: Int = 1) -> String {
        guard let value else {
            return "Нет данных"
        }

        let formatter = NumberFormatter()
        formatter.maximumFractionDigits = fractionDigits
        formatter.minimumFractionDigits = 0

        return "\(formatter.string(from: NSNumber(value: value)) ?? String(value)) \(suffix)"
    }
}

private struct HealthMetricRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
        }
    }
}
