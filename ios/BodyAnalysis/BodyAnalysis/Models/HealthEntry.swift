import Foundation

enum EntryKind: String {
    case nutrition
    case body
    case activity
    case measurements
    case sleep
    case note

    var title: String {
        switch self {
        case .nutrition:
            return "Питание"
        case .body:
            return "Тело"
        case .activity:
            return "Активность"
        case .measurements:
            return "Замеры"
        case .sleep:
            return "Сон"
        case .note:
            return "Заметки"
        }
    }
}

enum EntrySource: String {
    case manual
    case appleHealth = "apple_health"
    case fatsecret
    case miFitness = "mi_fitness"
    case healthConnect = "health_connect"

    var title: String {
        switch self {
        case .manual:
            return "Вручную"
        case .appleHealth:
            return "Apple Health"
        case .fatsecret:
            return "FatSecret"
        case .miFitness:
            return "Mi Fitness"
        case .healthConnect:
            return "Health Connect"
        }
    }
}

struct HealthEntry: Identifiable {
    let id: String
    let kind: EntryKind
    let date: String
    let source: EntrySource
    let calories: Double?
    let protein: Double?
    let fat: Double?
    let carbs: Double?
    let fiber: Double?
    let weightKg: Double?
    let fatMassKg: Double?
    let muscleKg: Double?
    let waterPct: Double?
    let visceralFat: Double?
    let steps: Double?
    let activeCalories: Double?
    let sleepHours: Double?
    let mood: String?

    init(
        id: String,
        kind: EntryKind,
        date: String,
        source: EntrySource,
        calories: Double? = nil,
        protein: Double? = nil,
        fat: Double? = nil,
        carbs: Double? = nil,
        fiber: Double? = nil,
        weightKg: Double? = nil,
        fatMassKg: Double? = nil,
        muscleKg: Double? = nil,
        waterPct: Double? = nil,
        visceralFat: Double? = nil,
        steps: Double? = nil,
        activeCalories: Double? = nil,
        sleepHours: Double? = nil,
        mood: String? = nil
    ) {
        self.id = id
        self.kind = kind
        self.date = date
        self.source = source
        self.calories = calories
        self.protein = protein
        self.fat = fat
        self.carbs = carbs
        self.fiber = fiber
        self.weightKg = weightKg
        self.fatMassKg = fatMassKg
        self.muscleKg = muscleKg
        self.waterPct = waterPct
        self.visceralFat = visceralFat
        self.steps = steps
        self.activeCalories = activeCalories
        self.sleepHours = sleepHours
        self.mood = mood
    }

    init?(id: String, data: [String: Any]) {
        guard
            let kindRaw = data["kind"] as? String,
            let kind = EntryKind(rawValue: kindRaw),
            let date = data["date"] as? String
        else {
            return nil
        }

        self.id = id
        self.kind = kind
        self.date = date
        self.source = EntrySource(rawValue: data["source"] as? String ?? "") ?? .manual
        self.calories = HealthEntry.number(data["calories"])
        self.protein = HealthEntry.number(data["protein"])
        self.fat = HealthEntry.number(data["fat"])
        self.carbs = HealthEntry.number(data["carbs"])
        self.fiber = HealthEntry.number(data["fiber"])
        self.weightKg = HealthEntry.number(data["weightKg"])
        self.fatMassKg = HealthEntry.number(data["fatMassKg"])
        self.muscleKg = HealthEntry.number(data["muscleKg"])
        self.waterPct = HealthEntry.number(data["waterPct"])
        self.visceralFat = HealthEntry.number(data["visceralFat"])
        self.steps = HealthEntry.number(data["steps"])
        self.activeCalories = HealthEntry.number(data["activeCalories"])
        self.sleepHours = HealthEntry.number(data["sleepHours"])
        self.mood = data["mood"] as? String
    }

    var summary: String {
        switch kind {
        case .nutrition:
            return [
                formatted(calories, suffix: "ккал"),
                formatted(protein, suffix: "б"),
                formatted(fat, suffix: "ж"),
                formatted(carbs, suffix: "у"),
            ]
            .compactMap { $0 }
            .joined(separator: " · ")
        case .body:
            return [
                formatted(weightKg, suffix: "кг"),
                formatted(fatMassKg, suffix: "жир"),
                formatted(muscleKg, suffix: "мышцы"),
            ]
            .compactMap { $0 }
            .joined(separator: " · ")
        case .activity:
            return [
                formatted(steps, suffix: "шагов"),
                formatted(activeCalories, suffix: "активных ккал"),
            ]
            .compactMap { $0 }
            .joined(separator: " · ")
        case .sleep:
            return formatted(sleepHours, suffix: "ч сна") ?? "Сон"
        case .measurements:
            return "Замеры тела"
        case .note:
            return mood ?? "Заметка"
        }
    }

    private static func number(_ value: Any?) -> Double? {
        if let value = value as? Double {
            return value
        }

        if let value = value as? Int {
            return Double(value)
        }

        if let value = value as? NSNumber {
            return value.doubleValue
        }

        return nil
    }

    private func formatted(_ value: Double?, suffix: String) -> String? {
        guard let value else {
            return nil
        }

        let formattedValue = value.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(value))
            : String(format: "%.1f", value)

        return "\(formattedValue) \(suffix)"
    }
}

extension HealthEntry {
    static let simulatorPreviewEntries: [HealthEntry] = [
        HealthEntry(
            id: "dev-nutrition",
            kind: .nutrition,
            date: "2026-08-21",
            source: .manual,
            calories: 2140,
            protein: 142,
            fat: 68,
            carbs: 226,
            fiber: 28,
            weightKg: nil,
            fatMassKg: nil,
            muscleKg: nil,
            waterPct: nil,
            visceralFat: nil,
            steps: nil,
            activeCalories: nil,
            sleepHours: nil,
            mood: nil
        ),
        HealthEntry(
            id: "dev-body",
            kind: .body,
            date: "2026-08-21",
            source: .appleHealth,
            calories: nil,
            protein: nil,
            fat: nil,
            carbs: nil,
            fiber: nil,
            weightKg: 82.4,
            fatMassKg: 17.8,
            muscleKg: 39.6,
            waterPct: 55.2,
            visceralFat: 9,
            steps: nil,
            activeCalories: nil,
            sleepHours: nil,
            mood: nil
        ),
        HealthEntry(
            id: "dev-activity",
            kind: .activity,
            date: "2026-08-20",
            source: .appleHealth,
            calories: nil,
            protein: nil,
            fat: nil,
            carbs: nil,
            fiber: nil,
            weightKg: nil,
            fatMassKg: nil,
            muscleKg: nil,
            waterPct: nil,
            visceralFat: nil,
            steps: 10482,
            activeCalories: 612,
            sleepHours: nil,
            mood: nil
        ),
        HealthEntry(
            id: "dev-sleep",
            kind: .sleep,
            date: "2026-08-20",
            source: .appleHealth,
            calories: nil,
            protein: nil,
            fat: nil,
            carbs: nil,
            fiber: nil,
            weightKg: nil,
            fatMassKg: nil,
            muscleKg: nil,
            waterPct: nil,
            visceralFat: nil,
            steps: nil,
            activeCalories: nil,
            sleepHours: 7.4,
            mood: nil
        ),
    ]
}
