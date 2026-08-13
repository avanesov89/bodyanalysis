import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore"

import { getDb, getFirebaseUserScope } from "@/lib/firebase"
import type { EntryDraft, HealthEntry, HealthGoal, Lifestyle, SyncMode, UserGender, UserProfile } from "@/types/health"

const storageKey = "body-analysis.entries.v1"
const profileStorageKey = "body-analysis.profile.v1"
const firestoreTimeoutMs = 12_000

const genderValues: UserGender[] = ["male", "female"]
const goalValues: HealthGoal[] = ["weight_loss", "muscle_gain", "maintenance"]
const lifestyleValues: Lifestyle[] = ["sedentary", "moderate", "active", "very_active"]

type LegacyEntry = HealthEntry & {
  activityType?: string
  bodyFatPct?: number
  boneMineralsPct?: number
  distanceKm?: number
  durationMin?: number
  intensity?: "low" | "medium" | "high"
  leanBodyMassKg?: number
  mealType?: string
  muscleMassPct?: number
  neckCm?: number
  notes?: string
  proteinPct?: number
  pulseBpm?: number
  skeletalMuscleKg?: number
  title?: string
}

function nowIso() {
  return new Date().toISOString()
}

function newId() {
  return crypto.randomUUID()
}

function cleanEntry(entry: HealthEntry) {
  return JSON.parse(JSON.stringify(entry)) as HealthEntry
}

function cleanProfile(profile: UserProfile) {
  return JSON.parse(JSON.stringify(profile)) as UserProfile
}

function normalizeEntry(entry: LegacyEntry) {
  const {
    activityType,
    bodyFatPct,
    boneMineralsPct,
    distanceKm,
    durationMin,
    intensity,
    leanBodyMassKg,
    mealType,
    muscleMassPct,
    neckCm,
    notes,
    proteinPct,
    pulseBpm,
    skeletalMuscleKg,
    title,
    ...rest
  } = entry
  void activityType
  void bodyFatPct
  void boneMineralsPct
  void distanceKm
  void durationMin
  void intensity
  void leanBodyMassKg
  void mealType
  void muscleMassPct
  void neckCm
  void notes
  void proteinPct
  void pulseBpm
  void skeletalMuscleKg
  void title
  return cleanEntry(rest)
}

function localRead() {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return []

  try {
    return (JSON.parse(raw) as LegacyEntry[]).map(normalizeEntry)
  } catch {
    return []
  }
}

function localWrite(entries: HealthEntry[]) {
  localStorage.setItem(storageKey, JSON.stringify(entries))
}

function normalizeProfile(profile: Partial<UserProfile> | null | undefined) {
  if (!profile) return {}

  const next: UserProfile = {}

  if (profile.gender && genderValues.includes(profile.gender)) {
    next.gender = profile.gender
  }

  if (typeof profile.age === "number" && Number.isFinite(profile.age) && profile.age > 0) {
    next.age = Math.round(profile.age)
  }

  if (profile.goal && goalValues.includes(profile.goal)) {
    next.goal = profile.goal
  }

  if (profile.lifestyle && lifestyleValues.includes(profile.lifestyle)) {
    next.lifestyle = profile.lifestyle
  }

  return cleanProfile(next)
}

function localReadProfile() {
  const raw = localStorage.getItem(profileStorageKey)
  if (!raw) return {}

  try {
    return normalizeProfile(JSON.parse(raw) as Partial<UserProfile>)
  } catch {
    return {}
  }
}

function localWriteProfile(profile: UserProfile) {
  localStorage.setItem(profileStorageKey, JSON.stringify(normalizeProfile(profile)))
}

function formatFirestoreError(error: unknown, action: string) {
  if (error instanceof Error) {
    return new Error(`${action}: ${error.message}`)
  }

  return new Error(`${action}: неизвестная ошибка Firestore`)
}

function withFirestoreTimeout<T>(operation: Promise<T>, action: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(
        new Error(
          `${action}: Firestore не ответил за ${firestoreTimeoutMs / 1000} сек. Проверь, что Firestore Database создана и rules разрешают запись.`,
        ),
      )
    }, firestoreTimeoutMs)

    operation
      .then((result) => {
        window.clearTimeout(timer)
        resolve(result)
      })
      .catch((error: unknown) => {
        window.clearTimeout(timer)
        reject(formatFirestoreError(error, action))
      })
  })
}

function entriesCollection() {
  const db = getDb()
  if (!db) return null

  return collection(db, "healthUsers", getFirebaseUserScope(), "entries")
}

function profileDocument() {
  const db = getDb()
  if (!db) return null

  return doc(db, "healthUsers", getFirebaseUserScope(), "profile", "settings")
}

export function getSyncMode(): SyncMode {
  return entriesCollection() ? "firebase" : "local"
}

export async function listEntries(): Promise<HealthEntry[]> {
  const ref = entriesCollection()
  if (!ref) {
    return localRead().sort((a, b) => b.date.localeCompare(a.date))
  }

  const snapshot = await withFirestoreTimeout(getDocs(query(ref, orderBy("date", "desc"))), "Загрузка данных")
  return snapshot.docs.map((item) => normalizeEntry(item.data() as LegacyEntry))
}

export async function getUserProfile(): Promise<UserProfile> {
  const ref = profileDocument()
  if (!ref) {
    return localReadProfile()
  }

  const snapshot = await withFirestoreTimeout(getDoc(ref), "Загрузка профиля")
  return normalizeProfile(snapshot.exists() ? snapshot.data() : null)
}

export async function upsertEntry(
  draft: EntryDraft,
  existing?: HealthEntry,
): Promise<HealthEntry> {
  const timestamp = nowIso()
  const entry = normalizeEntry({
    ...existing,
    ...draft,
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  })

  const ref = entriesCollection()
  if (!ref) {
    const entries = localRead()
    const next = entries.some((item) => item.id === entry.id)
      ? entries.map((item) => (item.id === entry.id ? entry : item))
      : [entry, ...entries]
    localWrite(next)
    return entry
  }

  await withFirestoreTimeout(setDoc(doc(ref, entry.id), entry), "Сохранение записи")
  return entry
}

export async function removeEntry(id: string) {
  const ref = entriesCollection()
  if (!ref) {
    localWrite(localRead().filter((item) => item.id !== id))
    return
  }

  await withFirestoreTimeout(deleteDoc(doc(ref, id)), "Удаление записи")
}

export async function upsertUserProfile(profile: UserProfile): Promise<UserProfile> {
  const nextProfile = normalizeProfile(profile)
  const ref = profileDocument()

  if (!ref) {
    localWriteProfile(nextProfile)
    return nextProfile
  }

  await withFirestoreTimeout(setDoc(ref, nextProfile), "Сохранение профиля")
  return nextProfile
}

export function buildExampleEntries(): EntryDraft[] {
  const today = new Date()
  const isoDay = (offset: number) => {
    const day = new Date(today)
    day.setDate(today.getDate() - offset)
    return day.toISOString().slice(0, 10)
  }

  return [
    {
      kind: "body",
      date: isoDay(0),
      weightKg: 82.4,
      fatMassKg: 16.3,
      muscleKg: 39.2,
      waterPct: 55.1,
      visceralFat: 9,
    },
    {
      kind: "nutrition",
      date: isoDay(0),
      calories: 510,
      protein: 31,
      fat: 13,
      carbs: 66,
      fiber: 9,
    },
    {
      kind: "nutrition",
      date: isoDay(0),
      calories: 720,
      protein: 48,
      fat: 18,
      carbs: 86,
      fiber: 8,
    },
    {
      kind: "activity",
      date: isoDay(1),
      activeCalories: 410,
      steps: 8400,
    },
    {
      kind: "measurements",
      date: isoDay(2),
      waistCm: 86,
      chestCm: 104,
      hipsCm: 99,
      glutesCm: 101,
      bicepsCm: 35,
      shouldersCm: 122,
    },
    {
      kind: "note",
      date: isoDay(1),
      sleepHours: 7.2,
      stressLevel: 4,
      mood: "ровно",
    },
  ]
}
