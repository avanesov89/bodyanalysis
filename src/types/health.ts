export type EntryKind = "nutrition" | "body" | "activity" | "measurements" | "note"

export type HealthEntry = {
  id: string
  kind: EntryKind
  date: string
  createdAt: string
  updatedAt: string
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
  stressLevel?: number
  mood?: string
}

export type EntryDraft = Omit<HealthEntry, "id" | "createdAt" | "updatedAt">

export type SyncMode = "firebase" | "local"

export const kindLabels: Record<EntryKind, string> = {
  nutrition: "Питание",
  body: "Тело",
  activity: "Активность",
  measurements: "Замеры",
  note: "Заметка",
}
