export type EntryKind = "nutrition" | "body" | "activity" | "measurements" | "sleep" | "note"
export type EntrySource = "manual" | "apple_health" | "fatsecret" | "mi_fitness" | "health_connect"

export type HealthEntry = {
  id: string
  kind: EntryKind
  date: string
  createdAt: string
  updatedAt: string
  source?: EntrySource
  sourceName?: string
  externalId?: string
  syncedAt?: string
  calories?: number
  protein?: number
  fat?: number
  carbs?: number
  fiber?: number
  weightKg?: number
  fatMassKg?: number
  muscleKg?: number
  waterPct?: number
  visceralFat?: number
  steps?: number
  activeCalories?: number
  waistCm?: number
  chestCm?: number
  hipsCm?: number
  glutesCm?: number
  bicepsCm?: number
  shouldersCm?: number
  sleepHours?: number
  sleepQuality?: number
  stressLevel?: number
  mood?: string
}

export type EntryDraft = Omit<HealthEntry, "id" | "createdAt" | "updatedAt">

export type SyncMode = "firebase" | "local"

export type UserGender = "male" | "female"
export type HealthGoal = "weight_loss" | "muscle_gain" | "maintenance"
export type Lifestyle = "sedentary" | "moderate" | "active" | "very_active"

export type UserProfile = {
  gender?: UserGender
  age?: number
  goal?: HealthGoal
  lifestyle?: Lifestyle
}

export const kindLabels: Record<EntryKind, string> = {
  nutrition: "Питание",
  body: "Тело",
  activity: "Активность",
  measurements: "Замеры",
  sleep: "Сон",
  note: "Заметки",
}

export const sourceLabels: Record<EntrySource, string> = {
  manual: "Вручную",
  apple_health: "Apple Health",
  fatsecret: "FatSecret",
  mi_fitness: "Mi Fitness",
  health_connect: "Health Connect",
}

export const genderLabels: Record<UserGender, string> = {
  male: "Мужской",
  female: "Женский",
}

export const goalLabels: Record<HealthGoal, string> = {
  weight_loss: "Похудение",
  muscle_gain: "Набор",
  maintenance: "Поддержание",
}

export const lifestyleLabels: Record<Lifestyle, string> = {
  sedentary: "Малоподвижный",
  moderate: "Умеренно активный",
  active: "Активный",
  very_active: "Очень активный",
}

export const lifestyleDescriptions: Record<Lifestyle, string> = {
  sedentary: "Сидячая работа, мало шагов, тренировки редко или отсутствуют.",
  moderate: "Регулярная ходьба, бытовая активность или 1-3 тренировки в неделю.",
  active: "Много движения в течение дня или 3-5 тренировок в неделю.",
  very_active: "Физическая работа, частые интенсивные тренировки или спорт почти каждый день.",
}
