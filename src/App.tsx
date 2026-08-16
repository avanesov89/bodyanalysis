import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react"
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CircleHelp,
  Download,
  Dumbbell,
  Info,
  Moon,
  Pencil,
  Plus,
  Save,
  Scale,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Utensils,
  Waves,
} from "lucide-react"
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { firebaseAuthEmail, getAuthClient, isFirebaseConfigured } from "@/lib/firebase"
import { getSyncMode, getUserProfile, listEntries, removeEntry, upsertEntry, upsertUserProfile, type UserProfileSaveResult } from "@/lib/health-store"
import analysisPromptMarkdown from "@/lib/analysis-prompt.md?raw"
import type { EntryDraft, EntryKind, HealthEntry, UserProfile } from "@/types/health"
import { genderLabels, goalLabels, kindLabels, lifestyleDescriptions, lifestyleLabels } from "@/types/health"

const kindOptions: EntryKind[] = ["nutrition", "body", "activity", "measurements", "sleep", "note"]
type AppPage = EntryKind | "settings" | "about"
type ExportKind = EntryKind | "all"
type ThemeMode = "light" | "dark"
const themeStorageKey = "body-analysis.theme.v1"
const unsetSelectValue = "not_set"
const minExportFilledDays = 14

const kindIcons: Record<EntryKind, typeof Utensils> = {
  nutrition: Utensils,
  body: Scale,
  activity: Dumbbell,
  measurements: BarChart3,
  sleep: Moon,
  note: Waves,
}

const kindDescriptions: Record<EntryKind, string> = {
  nutrition: "Питание показывает энергетический баланс и качество рациона. Калории помогают понимать динамику веса, а БЖУ и клетчатка — восстановление, насыщение и устойчивость режима.",
  body: "Показатели тела помогают смотреть не только на вес, а на состав и общий тренд. Жир, мышцы, вода и висцеральный жир дают более спокойную картину изменений.",
  activity: "Активность показывает ежедневный расход энергии вне питания. Шаги и активные калории помогают понять, почему вес движется быстрее или медленнее при похожем рационе.",
  measurements: "Замеры часто показывают прогресс там, где вес временно стоит. Объемы помогают видеть изменения формы тела, особенно при наборе, похудении или рекомпозиции.",
  sleep: "Сон влияет на восстановление, аппетит, стресс и качество тренировок. Недосып может мешать как похудению, так и набору мышц.",
  note: "Заметки дают контекст к цифрам. Настроение и стресс помогают объяснить скачки веса, голода, активности или режима, которые не видны в таблицах сами по себе.",
}

const mobileKindLabels: Record<EntryKind, string> = {
  nutrition: "Питание",
  body: "Тело",
  activity: "Актив.",
  measurements: "Замеры",
  sleep: "Сон",
  note: "Заметки",
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function getInitialTheme(): ThemeMode {
  try {
    const savedTheme = localStorage.getItem(themeStorageKey)
    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  } catch {
    return "light"
  }
}

function emptyDraft(kind: EntryKind = "nutrition"): EntryDraft {
  return {
    kind,
    date: today(),
  }
}

function draftForKind(draft: EntryDraft, kind: EntryKind): EntryDraft {
  const base = {
    kind,
    date: draft.date,
  }

  if (kind === "nutrition") {
    return {
      ...base,
      calories: draft.calories,
      protein: draft.protein,
      fat: draft.fat,
      carbs: draft.carbs,
      fiber: draft.fiber,
    }
  }

  if (kind === "body") {
    return {
      ...base,
      weightKg: draft.weightKg,
      fatMassKg: draft.fatMassKg,
      muscleKg: draft.muscleKg,
      waterPct: draft.waterPct,
      visceralFat: draft.visceralFat,
    }
  }

  if (kind === "activity") {
    return {
      ...base,
      activeCalories: draft.activeCalories,
      steps: draft.steps,
    }
  }

  if (kind === "measurements") {
    return {
      ...base,
      waistCm: draft.waistCm,
      chestCm: draft.chestCm,
      hipsCm: draft.hipsCm,
      glutesCm: draft.glutesCm,
      bicepsCm: draft.bicepsCm,
      shouldersCm: draft.shouldersCm,
    }
  }

  if (kind === "sleep") {
    return {
      ...base,
      sleepHours: draft.sleepHours,
      sleepQuality: draft.sleepQuality,
    }
  }

  return {
    ...base,
    mood: draft.mood,
    stressLevel: draft.stressLevel,
  }
}

function numberInput(value: number | undefined) {
  return value ?? ""
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  return `${value.toLocaleString("ru-RU")}${suffix}`
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) {
    return {
      compact: value,
      year: "",
      full: value,
    }
  }

  const date = new Date(year, month - 1, day)
  const dayMonth = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(date).replace(".", "")

  return {
    compact: dayMonth,
    year: String(year),
    full: `${dayMonth} ${year}`,
  }
}

function numericValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function sortEntriesDesc(entries: HealthEntry[]) {
  return [...entries].sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date)
    if (dateDiff !== 0) return dateDiff

    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

function entriesForExport(entries: HealthEntry[], kind: ExportKind) {
  return kind === "all"
    ? entries
    : entries.filter((entry) => entry.kind === kind)
}

function countFilledDays(entries: HealthEntry[]) {
  return new Set(entries.map((entry) => entry.date)).size
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff

  for (const byte of bytes) {
    crc ^= byte

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true)
}

function createZip(files: Array<{ filename: string; content: string }>) {
  const encoder = new TextEncoder()
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.filename)
    const dataBytes = encoder.encode(file.content)
    const checksum = crc32(dataBytes)
    const localOffset = offset

    const localHeader = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(localHeader.buffer)
    writeUint32(localView, 0, 0x04034b50)
    writeUint16(localView, 4, 20)
    writeUint16(localView, 6, 0x0800)
    writeUint16(localView, 8, 0)
    writeUint16(localView, 10, 0)
    writeUint16(localView, 12, 0)
    writeUint32(localView, 14, checksum)
    writeUint32(localView, 18, dataBytes.length)
    writeUint32(localView, 22, dataBytes.length)
    writeUint16(localView, 26, nameBytes.length)
    writeUint16(localView, 28, 0)
    localHeader.set(nameBytes, 30)
    localChunks.push(localHeader, dataBytes)
    offset += localHeader.length + dataBytes.length

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(centralHeader.buffer)
    writeUint32(centralView, 0, 0x02014b50)
    writeUint16(centralView, 4, 20)
    writeUint16(centralView, 6, 20)
    writeUint16(centralView, 8, 0x0800)
    writeUint16(centralView, 10, 0)
    writeUint16(centralView, 12, 0)
    writeUint16(centralView, 14, 0)
    writeUint32(centralView, 16, checksum)
    writeUint32(centralView, 20, dataBytes.length)
    writeUint32(centralView, 24, dataBytes.length)
    writeUint16(centralView, 28, nameBytes.length)
    writeUint16(centralView, 30, 0)
    writeUint16(centralView, 32, 0)
    writeUint16(centralView, 34, 0)
    writeUint16(centralView, 36, 0)
    writeUint32(centralView, 38, 0)
    writeUint32(centralView, 42, localOffset)
    centralHeader.set(nameBytes, 46)
    centralChunks.push(centralHeader)
  }

  const centralOffset = offset
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const endHeader = new Uint8Array(22)
  const endView = new DataView(endHeader.buffer)
  writeUint32(endView, 0, 0x06054b50)
  writeUint16(endView, 4, 0)
  writeUint16(endView, 6, 0)
  writeUint16(endView, 8, files.length)
  writeUint16(endView, 10, files.length)
  writeUint32(endView, 12, centralSize)
  writeUint32(endView, 16, centralOffset)
  writeUint16(endView, 20, 0)

  const blobParts = [...localChunks, ...centralChunks, endHeader].map((chunk) => {
    const copy = new ArrayBuffer(chunk.byteLength)
    new Uint8Array(copy).set(chunk)
    return copy
  })

  return new Blob(blobParts, { type: "application/zip" })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function exportProfile(profile: UserProfile) {
  return {
    gender: profile.gender ?? null,
    genderLabel: profile.gender ? genderLabels[profile.gender] : null,
    age: profile.age ?? null,
    goal: profile.goal ?? null,
    goalLabel: profile.goal ? goalLabels[profile.goal] : null,
    lifestyle: profile.lifestyle ?? null,
    lifestyleLabel: profile.lifestyle ? lifestyleLabels[profile.lifestyle] : null,
    lifestyleDescription: profile.lifestyle ? lifestyleDescriptions[profile.lifestyle] : null,
  }
}

function buildPromptMarkdown({
  exportedAt,
  exportKind,
  filledDays,
  profile,
  recordCount,
}: {
  exportedAt: string
  exportKind: ExportKind
  filledDays: number
  profile: UserProfile
  recordCount: number
}) {
  const sectionLabel = exportKind === "all" ? "Все разделы" : kindLabels[exportKind]

  return [
    "# Контекст для анализа данных тела",
    "",
    "## Настройки пользователя",
    "",
    `- Пол: ${profile.gender ? genderLabels[profile.gender] : "не указан"}`,
    `- Возраст: ${profile.age ? `${profile.age} лет` : "не указан"}`,
    `- Цель: ${profile.goal ? goalLabels[profile.goal] : "не указана"}`,
    `- Образ жизни: ${profile.lifestyle ? `${lifestyleLabels[profile.lifestyle]} (${lifestyleDescriptions[profile.lifestyle]})` : "не указан"}`,
    "",
    analysisPromptMarkdown.trim(),
    "",
    "## Данные выгрузки",
    "",
    `- Дата выгрузки: ${exportedAt}`,
    `- Раздел: ${sectionLabel}`,
    `- Количество заполненных дней: ${filledDays}`,
    `- Количество записей: ${recordCount}`,
    "",
  ].join("\n")
}

function TrendValue({
  value,
  previousValue,
}: {
  value: number | null | undefined
  previousValue?: number | null
}) {
  const current = numericValue(value)
  const previous = numericValue(previousValue)

  if (current === null) return <span>-</span>

  const diff = previous === null ? 0 : current - previous
  const hasDiff = diff !== 0
  const Icon = diff > 0 ? ArrowUp : ArrowDown

  return (
    <span className="inline-flex items-center justify-end gap-1 tabular-nums">
      <span>{formatNumber(current)}</span>
      {hasDiff ? (
        <span
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
          title={`Предыдущее значение: ${formatNumber(previous)}`}
        >
          <Icon className="size-3" />
        </span>
      ) : null}
    </span>
  )
}

function Field({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="flex min-h-5 items-center gap-1.5">
        <Label>{label}</Label>
        {help ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus:ring-2 focus:ring-ring"
                aria-label={`Подсказка: ${label}`}
              >
                <CircleHelp className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-80 bg-zinc-950 p-3 text-white shadow-md">
              {help}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function App() {
  const [entries, setEntries] = useState<HealthEntry[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile>({})
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured())
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [activePage, setActivePage] = useState<AppPage>("nutrition")
  const [selectedKind, setSelectedKind] = useState<EntryKind>("nutrition")
  const [exportKind, setExportKind] = useState<ExportKind>("all")
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme)
  const [draft, setDraft] = useState<EntryDraft>(() => emptyDraft("nutrition"))
  const [editing, setEditing] = useState<HealthEntry | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const syncMode = getSyncMode()
  const authEnabled = Boolean(getAuthClient())

  const sectionEntries = useMemo(() => {
    return entries.filter((entry) => entry.kind === selectedKind)
  }, [entries, selectedKind])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark")
    document.documentElement.style.colorScheme = themeMode
    localStorage.setItem(themeStorageKey, themeMode)
  }, [themeMode])

  async function refresh() {
    setLoading(true)
    setMessage("")

    try {
      setEntries(await listEntries())

      try {
        setUserProfile(await getUserProfile())
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Не удалось загрузить профиль")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить данные")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const auth = getAuthClient()
    if (!auth) {
      setAuthReady(true)
      return undefined
    }

    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user)
      setAuthReady(true)

      if (!user) {
        setEntries([])
        setLoading(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (authEnabled && !authUser) return

    void refresh()
  }, [authReady, authEnabled, authUser])

  async function signIn(email: string, password: string) {
    const auth = getAuthClient()
    if (!auth) return

    await signInWithEmailAndPassword(auth, email, password)
  }

  async function signUp(email: string, password: string) {
    const auth = getAuthClient()
    if (!auth) return

    await createUserWithEmailAndPassword(auth, email, password)
  }

  async function resetPassword() {
    const auth = getAuthClient()
    const email = auth?.currentUser?.email
    if (!auth || !email) {
      throw new Error("У текущего пользователя нет email для смены пароля")
    }

    await sendPasswordResetEmail(auth, email)
  }

  async function signOutUser() {
    const auth = getAuthClient()
    if (!auth) return

    await signOut(auth)
  }

  function openKind(kind: EntryKind) {
    setActivePage(kind)
    setSelectedKind(kind)
    setDraft(emptyDraft(kind))
    setEditing(null)
    setIsFormOpen(false)
    setMessage("")
  }

  function openSettings() {
    setActivePage("settings")
    setEditing(null)
    setIsFormOpen(false)
    setMessage("")
  }

  function openAbout() {
    setActivePage("about")
    setEditing(null)
    setIsFormOpen(false)
    setMessage("")
  }

  function openNewEntry() {
    setDraft(emptyDraft(selectedKind))
    setEditing(null)
    setIsFormOpen(true)
    setMessage("")
  }

  function updateText(key: keyof EntryDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [key]: value || undefined,
    }))
  }

  function updateNumber(key: keyof EntryDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [key]: value === "" ? undefined : Number(value),
    }))
  }

  function startEdit(entry: HealthEntry) {
    const { id, createdAt, updatedAt, ...nextDraft } = entry
    setActivePage(entry.kind)
    setSelectedKind(entry.kind)
    setEditing({ ...entry, id, createdAt, updatedAt })
    setDraft(nextDraft)
    setIsFormOpen(true)
    setMessage("")
  }

  function cancelEdit() {
    setEditing(null)
    setDraft(emptyDraft(selectedKind))
    setIsFormOpen(false)
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage("")

    try {
      const saved = await upsertEntry(draftForKind(draft, selectedKind), editing ?? undefined)
      setEntries((current) => {
        const next = current.some((item) => item.id === saved.id)
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current]
        return next.sort((a, b) => b.date.localeCompare(a.date))
      })
      setDraft(emptyDraft(selectedKind))
      setEditing(null)
      setIsFormOpen(false)
      setMessage(syncMode === "firebase" ? "Запись сохранена в Firebase" : "Запись сохранена локально")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить запись")
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry(id: string) {
    setSaving(true)
    setMessage("")

    try {
      await removeEntry(id)
      setEntries((current) => current.filter((entry) => entry.id !== id))
      setMessage("Запись удалена")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить запись")
    } finally {
      setSaving(false)
    }
  }

  async function saveUserProfile(profile: UserProfile) {
    const saved = await upsertUserProfile(profile)
    setUserProfile(saved.profile)
    setMessage(saved.storage === "firebase" ? "Профиль сохранен в Firebase" : "Профиль сохранен локально")
    return saved
  }

  function downloadSectionJson() {
    const sectionEntries = entriesForExport(entries, exportKind)
    const filledDays = countFilledDays(sectionEntries)
    if (filledDays < minExportFilledDays) {
      setMessage(`Для выгрузки нужно минимум ${minExportFilledDays} заполненных дней. Сейчас: ${filledDays}.`)
      return
    }

    const exportedAt = new Date().toISOString()
    const payload = {
      exportedAt,
      section: exportKind,
      sectionLabel: exportKind === "all" ? "Все разделы" : kindLabels[exportKind],
      count: sectionEntries.length,
      userProfile: exportProfile(userProfile),
      entries: sectionEntries,
    }
    const baseFilename = `body-analysis-${exportKind}-${today()}`
    const archive = createZip([
      {
        filename: `${baseFilename}.json`,
        content: JSON.stringify(payload, null, 2),
      },
      {
        filename: `${baseFilename}-prompt.md`,
        content: buildPromptMarkdown({
          exportedAt,
          exportKind,
          filledDays,
          profile: userProfile,
          recordCount: sectionEntries.length,
        }),
      },
    ])
    downloadBlob(archive, `${baseFilename}.zip`)
  }

  if (!authReady) {
    return <AuthLoading />
  }

  if (authEnabled && !authUser) {
    return <LoginPage onSignIn={signIn} onSignUp={signUp} />
  }

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <main className="min-h-svh overflow-x-hidden bg-background">
        <MobileHeader activePage={activePage} onSettings={openSettings} onAbout={openAbout} />
        <div className="mx-auto grid max-w-[1380px] gap-0 lg:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="hidden border-b px-5 py-5 lg:relative lg:block lg:min-h-svh lg:border-b-0 lg:after:absolute lg:after:top-5 lg:after:right-0 lg:after:bottom-5 lg:after:border-r lg:after:border-[var(--border)] lg:after:content-['']">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Activity className="size-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-normal">Тело в цифрах</h1>
                <p className="text-xs text-muted-foreground">Личная база здоровья</p>
              </div>
            </div>

            <nav className="mt-8 grid gap-2 text-sm">
              {kindOptions.map((kind) => {
                const Icon = kindIcons[kind] ?? Activity
                const isActive = activePage === kind
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => openKind(kind)}
                    className={[
                      "flex h-9 items-center gap-3 rounded-md px-3 text-left transition-colors",
                      isActive
                        ? "border border-primary/25 bg-primary/12 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    <Icon className="size-4" />
                    {kindLabels[kind]}
                  </button>
                )
              })}
              <div className="mt-2 border-t pt-2">
                <button
                  type="button"
                  onClick={openSettings}
                  className={[
                    "flex h-9 w-full items-center gap-3 rounded-md px-3 text-left transition-colors",
                    activePage === "settings"
                      ? "border border-primary/25 bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  ].join(" ")}
                >
                  <Settings className="size-4" />
                  Настройки
                </button>
                <button
                  type="button"
                  onClick={openAbout}
                  className={[
                    "mt-2 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left transition-colors",
                    activePage === "about"
                      ? "border border-primary/25 bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  ].join(" ")}
                >
                  <Info className="size-4" />
                  О проекте
                </button>
              </div>
            </nav>
          </aside>

          <section className="min-w-0 px-4 pt-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:px-5 lg:py-5">
            {activePage === "settings" ? (
              <SettingsPage
                authEmail={authUser?.email ?? ""}
                authEnabled={authEnabled}
                authUserId={authUser?.uid ?? ""}
                entries={entries}
                exportKind={exportKind}
                themeMode={themeMode}
                userProfile={userProfile}
                onExport={downloadSectionJson}
                onExportKindChange={setExportKind}
                onResetPassword={resetPassword}
                onSaveUserProfile={saveUserProfile}
                onSignOut={signOutUser}
                onThemeModeChange={setThemeMode}
              />
            ) : activePage === "about" ? (
              <AboutPage />
            ) : (
              <>
                <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold tracking-normal">
                      {kindLabels[selectedKind]}
                    </h2>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    onClick={openNewEntry}
                    disabled={saving || isFormOpen}
                  >
                    <Plus className="size-4" />
                    Новая запись
                  </Button>
                </header>

                <div className="mt-6 grid gap-6">
                  <SectionIntro kind={selectedKind} />

                  {message ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{message}</p> : null}

                  {isFormOpen ? (
                    <EntryForm
                      draft={draft}
                      editing={editing}
                      saving={saving}
                      selectedKind={selectedKind}
                      onSubmit={submitEntry}
                      onCancel={cancelEdit}
                      updateText={updateText}
                      updateNumber={updateNumber}
                    />
                  ) : null}

                  <section className="min-w-0">
                    <div className="overflow-hidden rounded-md bg-card">
                      {selectedKind === "nutrition" ? (
                        <NutritionTable
                          entries={sectionEntries}
                          loading={loading}
                          onEdit={startEdit}
                          onDelete={deleteEntry}
                        />
                      ) : selectedKind === "body" ? (
                        <BodyTable
                          entries={sectionEntries}
                          loading={loading}
                          onEdit={startEdit}
                          onDelete={deleteEntry}
                        />
                      ) : selectedKind === "activity" ? (
                        <ActivityTable
                          entries={sectionEntries}
                          loading={loading}
                          onEdit={startEdit}
                          onDelete={deleteEntry}
                        />
                      ) : selectedKind === "measurements" ? (
                        <MeasurementsTable
                          entries={sectionEntries}
                          loading={loading}
                          onEdit={startEdit}
                          onDelete={deleteEntry}
                        />
                      ) : selectedKind === "sleep" ? (
                        <SleepTable
                          entries={sectionEntries}
                          loading={loading}
                          onEdit={startEdit}
                          onDelete={deleteEntry}
                        />
                      ) : (
                        <NoteTable
                          entries={sectionEntries}
                          loading={loading}
                          onEdit={startEdit}
                          onDelete={deleteEntry}
                        />
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}
          </section>
        </div>
        <MobileTabBar activePage={activePage} onOpenKind={openKind} />
      </main>
    </TooltipProvider>
  )
}

function MobileHeader({
  activePage,
  onSettings,
  onAbout,
}: {
  activePage: AppPage
  onSettings: () => void
  onAbout: () => void
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-normal">Тело в цифрах</h1>
            <p className="truncate text-xs text-muted-foreground">
              {activePage === "settings"
                ? "Настройки"
                : activePage === "about"
                  ? "О проекте"
                  : kindLabels[activePage]}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={activePage === "settings" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={onSettings}
                aria-label="Настройки"
              >
                <Settings className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Настройки</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={activePage === "about" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={onAbout}
                aria-label="О проекте"
              >
                <Info className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>О проекте</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}

function MobileTabBar({
  activePage,
  onOpenKind,
}: {
  activePage: AppPage
  onOpenKind: (kind: EntryKind) => void
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-6 gap-1">
        {kindOptions.map((kind) => {
          const Icon = kindIcons[kind] ?? Activity
          const isActive = activePage === kind

          return (
            <button
              key={kind}
              type="button"
              onClick={() => onOpenKind(kind)}
              className={[
                "grid min-h-12 min-w-0 place-items-center gap-1 rounded-md px-1 py-1 text-[0.65rem] leading-none transition-colors",
                isActive
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="size-4" />
              <span className="max-w-full truncate">{mobileKindLabels[kind]}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function SectionIntro({ kind }: { kind: EntryKind }) {
  const Icon = kindIcons[kind] ?? Activity
  const description = kindDescriptions[kind]

  return (
    <section className="rounded-md bg-card px-4 py-3">
      <div className="flex gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <p className="text-sm leading-[1.4] text-muted-foreground">{description}</p>
      </div>
    </section>
  )
}

function AuthLoading() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4">
      <div className="grid gap-3 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" />
        </div>
        <p className="text-sm text-muted-foreground">Проверяем доступ</p>
      </div>
    </main>
  )
}

function LoginPage({
  onSignIn,
  onSignUp,
}: {
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
}) {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn")
  const [email, setEmail] = useState(firebaseAuthEmail)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const passwordOnly = mode === "signIn" && Boolean(firebaseAuthEmail)

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      if (mode === "signUp") {
        await onSignUp(email, password)
      } else {
        await onSignIn(email, password)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось выполнить вход")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background px-4">
      <form onSubmit={submitAuth} className="grid w-full max-w-sm gap-5 rounded-md border bg-card p-5 shadow-xs">
        <div className="grid gap-2">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Тело в цифрах</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signUp" ? "Регистрация личной базы" : "Вход в личную базу"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1 text-sm">
          <button
            type="button"
            className={[
              "h-9 rounded-sm transition-colors",
              mode === "signIn" ? "bg-card font-medium shadow-xs" : "text-muted-foreground",
            ].join(" ")}
            onClick={() => {
              setMode("signIn")
              setEmail(firebaseAuthEmail)
              setError("")
            }}
          >
            Вход
          </button>
          <button
            type="button"
            className={[
              "h-9 rounded-sm transition-colors",
              mode === "signUp" ? "bg-card font-medium shadow-xs" : "text-muted-foreground",
            ].join(" ")}
            onClick={() => {
              setMode("signUp")
              setEmail("")
              setError("")
            }}
          >
            Регистрация
          </button>
        </div>

        <div className="grid gap-4">
          {!passwordOnly ? (
            <Field label="Email">
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
            </Field>
          ) : null}
          <Field label="Пароль">
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              minLength={6}
              required
            />
          </Field>
        </div>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{error}</p> : null}

        <Button type="submit" disabled={loading}>
          {loading ? "Подождите..." : mode === "signUp" ? "Создать аккаунт" : "Войти"}
        </Button>
      </form>
    </main>
  )
}

function SettingsPage({
  authEmail,
  authEnabled,
  authUserId,
  entries,
  exportKind,
  themeMode,
  userProfile,
  onExport,
  onExportKindChange,
  onResetPassword,
  onSaveUserProfile,
  onSignOut,
  onThemeModeChange,
}: {
  authEmail: string
  authEnabled: boolean
  authUserId: string
  entries: HealthEntry[]
  exportKind: ExportKind
  themeMode: ThemeMode
  userProfile: UserProfile
  onExport: () => void
  onExportKindChange: (kind: ExportKind) => void
  onResetPassword: () => Promise<void>
  onSaveUserProfile: (profile: UserProfile) => Promise<UserProfileSaveResult>
  onSignOut: () => void
  onThemeModeChange: (theme: ThemeMode) => void
}) {
  const [profileDraft, setProfileDraft] = useState<UserProfile>(userProfile)
  const [profileMessage, setProfileMessage] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordResetMessage, setPasswordResetMessage] = useState("")
  const [passwordResetLoading, setPasswordResetLoading] = useState(false)
  const exportEntries = entriesForExport(entries, exportKind)
  const exportCount = exportEntries.length
  const exportFilledDays = countFilledDays(exportEntries)
  const canExport = exportFilledDays >= minExportFilledDays

  useEffect(() => {
    setProfileDraft(userProfile)
  }, [userProfile])

  function updateProfile(key: keyof UserProfile, value: string) {
    setProfileDraft((current) => ({
      ...current,
      [key]: value === unsetSelectValue || value === "" ? undefined : value,
    }))
  }

  function updateProfileAge(value: string) {
    setProfileDraft((current) => ({
      ...current,
      age: value === "" ? undefined : Number(value),
    }))
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileSaving(true)
    setProfileMessage("")

    try {
      const saved = await onSaveUserProfile(profileDraft)
      setProfileMessage(
        saved.warning
          ? "Профиль сохранен локально. Firebase пока не принял профиль; проверь опубликованные Firestore rules."
          : "Профиль сохранен. Эти данные попадут в следующую выгрузку.",
      )
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль")
    } finally {
      setProfileSaving(false)
    }
  }

  async function resetPassword() {
    setPasswordResetLoading(true)
    setPasswordResetMessage("")

    try {
      await onResetPassword()
      setPasswordResetMessage("Письмо для смены пароля отправлено на email аккаунта.")
    } catch (error) {
      setPasswordResetMessage(error instanceof Error ? error.message : "Не удалось отправить письмо")
    } finally {
      setPasswordResetLoading(false)
    }
  }

  return (
    <>
      <header>
        <h2 className="text-xl font-semibold tracking-normal">Настройки</h2>
      </header>

      <div className="mt-6 grid w-full gap-6">
        <section className="rounded-md bg-card p-4 shadow-xs">
          <h3 className="font-semibold">Пользователь</h3>
          <div className="mt-4 grid gap-3 text-sm">
            {authEnabled ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b-[0.5px] pb-3">
                  <span className="text-muted-foreground">ID пользователя</span>
                  <span className="max-w-full break-all font-mono text-xs">{authUserId || "-"}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b-[0.5px] pb-3">
                  <span className="text-muted-foreground">E-mail при регистрации</span>
                  <span className="font-medium">{authEmail || "Авторизован"}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b-[0.5px] pb-3">
                  <span className="text-muted-foreground">Смена пароля</span>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => void resetPassword()}
                    disabled={passwordResetLoading || !authEmail}
                  >
                    {passwordResetLoading ? "Отправка..." : "Сбросить пароль"}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-muted-foreground">Выход из аккаунта</span>
                  <Button size="sm" type="button" variant="outline" onClick={onSignOut}>
                    Выйти
                  </Button>
                </div>
              </>
            ) : null}
            {passwordResetMessage ? (
              <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
                {passwordResetMessage}
              </p>
            ) : null}
          </div>
        </section>

        <form onSubmit={saveProfile} className="rounded-md bg-card p-4 shadow-xs">
          <h3 className="font-semibold">Профиль для анализа</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Пол">
              <Select value={profileDraft.gender ?? unsetSelectValue} onValueChange={(value) => updateProfile("gender", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={unsetSelectValue}>Не указан</SelectItem>
                  <SelectItem value="male">{genderLabels.male}</SelectItem>
                  <SelectItem value="female">{genderLabels.female}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Возраст">
              <Input
                value={numberInput(profileDraft.age)}
                onChange={(event) => updateProfileAge(event.target.value)}
                type="number"
                min="1"
                max="120"
                placeholder="Например, 35"
              />
            </Field>
            <Field label="Цель">
              <Select value={profileDraft.goal ?? unsetSelectValue} onValueChange={(value) => updateProfile("goal", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={unsetSelectValue}>Не указана</SelectItem>
                  <SelectItem value="weight_loss">{goalLabels.weight_loss}</SelectItem>
                  <SelectItem value="muscle_gain">{goalLabels.muscle_gain}</SelectItem>
                  <SelectItem value="maintenance">{goalLabels.maintenance}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Образ жизни"
              help={
                <div className="grid gap-2 text-xs leading-5">
                  <p>
                    <span className="font-medium">{lifestyleLabels.sedentary}:</span>{" "}
                    {lifestyleDescriptions.sedentary}
                  </p>
                  <p>
                    <span className="font-medium">{lifestyleLabels.moderate}:</span>{" "}
                    {lifestyleDescriptions.moderate}
                  </p>
                  <p>
                    <span className="font-medium">{lifestyleLabels.active}:</span>{" "}
                    {lifestyleDescriptions.active}
                  </p>
                  <p>
                    <span className="font-medium">{lifestyleLabels.very_active}:</span>{" "}
                    {lifestyleDescriptions.very_active}
                  </p>
                </div>
              }
            >
              <Select value={profileDraft.lifestyle ?? unsetSelectValue} onValueChange={(value) => updateProfile("lifestyle", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={unsetSelectValue}>Не указан</SelectItem>
                  <SelectItem value="sedentary">{lifestyleLabels.sedentary}</SelectItem>
                  <SelectItem value="moderate">{lifestyleLabels.moderate}</SelectItem>
                  <SelectItem value="active">{lifestyleLabels.active}</SelectItem>
                  <SelectItem value="very_active">{lifestyleLabels.very_active}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm" type="submit" disabled={profileSaving}>
              <Save className="size-4" />
              {profileSaving ? "Сохранение..." : "Сохранить профиль"}
            </Button>
            {profileMessage ? (
              <p className="text-sm text-muted-foreground">{profileMessage}</p>
            ) : null}
          </div>
        </form>

        <section className="rounded-md bg-card p-4 shadow-xs">
          <h3 className="font-semibold">Оформление</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted-foreground">Тема интерфейса</span>
              <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
                <button
                  type="button"
                  onClick={() => onThemeModeChange("light")}
                  className={[
                    "inline-flex h-8 items-center justify-center gap-2 rounded-sm px-3 transition-colors",
                    themeMode === "light"
                      ? "bg-card font-medium text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <Sun className="size-4" />
                  Светлая
                </button>
                <button
                  type="button"
                  onClick={() => onThemeModeChange("dark")}
                  className={[
                    "inline-flex h-8 items-center justify-center gap-2 rounded-sm px-3 transition-colors",
                    themeMode === "dark"
                      ? "bg-card font-medium text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <Moon className="size-4" />
                  Темная
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md bg-card p-4 shadow-xs">
          <h3 className="font-semibold">Выгрузка архива для анализа</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Раздел">
              <Select value={exportKind} onValueChange={(value) => onExportKindChange(value as ExportKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Выгрузить все</SelectItem>
                  {kindOptions.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {kindLabels[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button type="button" onClick={onExport} disabled={!canExport}>
              <Download className="size-4" />
              Скачать ZIP
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Заполненных дней: {exportFilledDays}/{minExportFilledDays}. Записей для выгрузки: {exportCount}. В архив попадут JSON с данными и MD-промт с профилем и инструкцией.
          </p>
        </section>
      </div>
    </>
  )
}

function AboutPage() {
  return (
    <>
      <header>
        <h2 className="text-xl font-semibold tracking-normal">О проекте</h2>
      </header>

      <div className="mt-6 grid w-full gap-6">
        <section className="rounded-md bg-card p-4 shadow-xs">
          <h3 className="font-semibold">Тело в цифрах</h3>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
            <p>
              Личный журнал для учета питания, показателей тела, активности, замеров, сна и коротких заметок.
            </p>
            <p>
              Проект сфокусирован на ручном вводе ключевых чисел и выгрузке структурированного JSON для дальнейшего анализа.
            </p>
            <p>
              Сейчас это MVP-версия: проект будет постепенно улучшаться, расширяться и дорабатываться по мере использования.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}

function RowActions({
  entry,
  onEdit,
  onDelete,
}: {
  entry: HealthEntry
  onEdit: (entry: HealthEntry) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex justify-end gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(entry)}>
            <Pencil className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Редактировать</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={() => void onDelete(entry.id)}>
            <Trash2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Удалить</TooltipContent>
      </Tooltip>
    </div>
  )
}

function DateCell({ value }: { value: string }) {
  const date = formatDisplayDate(value)

  return (
    <TableCell className="font-medium" title={value}>
      <span className="hidden whitespace-nowrap md:inline">{date.full}</span>
      <span className="grid gap-0.5 whitespace-nowrap leading-none md:hidden">
        <span>{date.compact}</span>
        {date.year ? <span className="text-[0.68rem] font-normal text-muted-foreground">{date.year}</span> : null}
      </span>
    </TableCell>
  )
}

function NutritionTable({
  entries,
  loading,
  onEdit,
  onDelete,
}: {
  entries: HealthEntry[]
  loading: boolean
  onEdit: (entry: HealthEntry) => void
  onDelete: (id: string) => void
}) {
  const sortedEntries = useMemo(() => sortEntriesDesc(entries), [entries])

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Дата</TableHead>
          <TableHead className="w-24 text-right">Ккал</TableHead>
          <TableHead className="w-24 text-right">Белки</TableHead>
          <TableHead className="w-24 text-right">Жиры</TableHead>
          <TableHead className="w-28 text-right">Углеводы</TableHead>
          <TableHead className="w-28 text-right">Клетчатка</TableHead>
          <TableHead className="w-24 text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedEntries.map((entry) => (
          <TableRow key={entry.id}>
            <DateCell value={entry.date} />
            <TableCell className="text-right tabular-nums">{formatNumber(entry.calories)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(entry.protein)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(entry.fat)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(entry.carbs)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(entry.fiber)}</TableCell>
            <TableCell>
              <RowActions entry={entry} onEdit={onEdit} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
        {!loading && entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
              Записей в этом разделе пока нет.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

function NoteTable({
  entries,
  loading,
  onEdit,
  onDelete,
}: {
  entries: HealthEntry[]
  loading: boolean
  onEdit: (entry: HealthEntry) => void
  onDelete: (id: string) => void
}) {
  const sortedEntries = useMemo(() => sortEntriesDesc(entries), [entries])

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Дата</TableHead>
          <TableHead>Настроение</TableHead>
          <TableHead className="w-28 text-right">Стресс</TableHead>
          <TableHead className="w-24 text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedEntries.map((entry) => (
          <TableRow key={entry.id}>
            <DateCell value={entry.date} />
            <TableCell>{entry.mood || "-"}</TableCell>
            <TableCell className="text-right tabular-nums">
              {entry.stressLevel ? `${formatNumber(entry.stressLevel)}/10` : "-"}
            </TableCell>
            <TableCell>
              <RowActions entry={entry} onEdit={onEdit} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
        {!loading && entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
              Записей в этом разделе пока нет.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

function SleepTable({
  entries,
  loading,
  onEdit,
  onDelete,
}: {
  entries: HealthEntry[]
  loading: boolean
  onEdit: (entry: HealthEntry) => void
  onDelete: (id: string) => void
}) {
  const sortedEntries = useMemo(() => sortEntriesDesc(entries), [entries])

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Дата</TableHead>
          <TableHead className="w-28 text-right">Сон, ч</TableHead>
          <TableHead className="w-32 text-right">Качество</TableHead>
          <TableHead className="w-24 text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedEntries.map((entry) => (
          <TableRow key={entry.id}>
            <DateCell value={entry.date} />
            <TableCell className="text-right tabular-nums">{formatNumber(entry.sleepHours)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(entry.sleepQuality)}</TableCell>
            <TableCell>
              <RowActions entry={entry} onEdit={onEdit} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
        {!loading && entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
              Записей в этом разделе пока нет.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

function BodyTable({
  entries,
  loading,
  onEdit,
  onDelete,
}: {
  entries: HealthEntry[]
  loading: boolean
  onEdit: (entry: HealthEntry) => void
  onDelete: (id: string) => void
}) {
  const sortedEntries = useMemo(() => sortEntriesDesc(entries), [entries])

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Дата</TableHead>
          <TableHead className="w-28 text-right">Вес, кг</TableHead>
          <TableHead className="w-32 text-right">Масса жира, кг</TableHead>
          <TableHead className="w-28 text-right">Мышцы, кг</TableHead>
          <TableHead className="w-28 text-right">Вода, %</TableHead>
          <TableHead className="w-28 text-right">Висц. жир</TableHead>
          <TableHead className="w-24 text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedEntries.map((entry, index) => {
          const previous = sortedEntries[index + 1]

          return (
            <TableRow key={entry.id}>
              <DateCell value={entry.date} />
              <TableCell className="text-right">
                <TrendValue value={entry.weightKg} previousValue={previous?.weightKg} />
              </TableCell>
              <TableCell className="text-right">
                <TrendValue value={entry.fatMassKg} previousValue={previous?.fatMassKg} />
              </TableCell>
              <TableCell className="text-right">
                <TrendValue value={entry.muscleKg} previousValue={previous?.muscleKg} />
              </TableCell>
              <TableCell className="text-right">
                <TrendValue value={entry.waterPct} previousValue={previous?.waterPct} />
              </TableCell>
              <TableCell className="text-right">
                <TrendValue value={entry.visceralFat} previousValue={previous?.visceralFat} />
              </TableCell>
              <TableCell>
                <RowActions entry={entry} onEdit={onEdit} onDelete={onDelete} />
              </TableCell>
            </TableRow>
          )
        })}
        {!loading && entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
              Записей в этом разделе пока нет.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

function ActivityTable({
  entries,
  loading,
  onEdit,
  onDelete,
}: {
  entries: HealthEntry[]
  loading: boolean
  onEdit: (entry: HealthEntry) => void
  onDelete: (id: string) => void
}) {
  const sortedEntries = useMemo(() => sortEntriesDesc(entries), [entries])

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Дата</TableHead>
          <TableHead className="w-36 text-right">Активные, ккал</TableHead>
          <TableHead className="w-32 text-right">Шаги, шт.</TableHead>
          <TableHead className="w-24 text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedEntries.map((entry) => (
          <TableRow key={entry.id}>
            <DateCell value={entry.date} />
            <TableCell className="text-right tabular-nums">{formatNumber(entry.activeCalories)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(entry.steps)}</TableCell>
            <TableCell>
              <RowActions entry={entry} onEdit={onEdit} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
        {!loading && entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
              Записей в этом разделе пока нет.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

function MeasurementsTable({
  entries,
  loading,
  onEdit,
  onDelete,
}: {
  entries: HealthEntry[]
  loading: boolean
  onEdit: (entry: HealthEntry) => void
  onDelete: (id: string) => void
}) {
  const sortedEntries = useMemo(() => sortEntriesDesc(entries), [entries])

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Дата</TableHead>
          <TableHead className="w-28 text-right">Талия, см</TableHead>
          <TableHead className="w-28 text-right">Грудь, см</TableHead>
          <TableHead className="w-28 text-right">Бедра, см</TableHead>
          <TableHead className="w-28 text-right">Ягодицы, см</TableHead>
          <TableHead className="w-28 text-right">Бицепс, см</TableHead>
          <TableHead className="w-28 text-right">Плечи, см</TableHead>
          <TableHead className="w-24 text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedEntries.map((entry, index) => {
          const previous = sortedEntries[index + 1]

          return (
            <TableRow key={entry.id}>
              <DateCell value={entry.date} />
              <TableCell className="text-right">
                <TrendValue value={entry.waistCm} previousValue={previous?.waistCm} />
              </TableCell>
              <TableCell className="text-right">
                <TrendValue value={entry.chestCm} previousValue={previous?.chestCm} />
              </TableCell>
              <TableCell className="text-right">
                <TrendValue value={entry.hipsCm} previousValue={previous?.hipsCm} />
              </TableCell>
              <TableCell className="text-right">
                <TrendValue value={entry.glutesCm} previousValue={previous?.glutesCm} />
              </TableCell>
              <TableCell className="text-right">
                <TrendValue value={entry.bicepsCm} previousValue={previous?.bicepsCm} />
              </TableCell>
              <TableCell className="text-right">
                <TrendValue value={entry.shouldersCm} previousValue={previous?.shouldersCm} />
              </TableCell>
              <TableCell>
                <RowActions entry={entry} onEdit={onEdit} onDelete={onDelete} />
              </TableCell>
            </TableRow>
          )
        })}
        {!loading && entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
              Записей в этом разделе пока нет.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}

function EntryForm({
  draft,
  editing,
  saving,
  selectedKind,
  onSubmit,
  onCancel,
  updateText,
  updateNumber,
}: {
  draft: EntryDraft
  editing: HealthEntry | null
  saving: boolean
  selectedKind: EntryKind
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  updateText: (key: keyof EntryDraft, value: string) => void
  updateNumber: (key: keyof EntryDraft, value: string) => void
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-md bg-card p-4 shadow-xs">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold">{editing ? "Редактировать запись" : "Новая запись"}</h3>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Дата">
            <Input value={draft.date} onChange={(event) => updateText("date", event.target.value)} type="date" required />
          </Field>
          {selectedKind === "nutrition" ? (
            <NutritionFields draft={draft} updateNumber={updateNumber} />
          ) : null}
          {selectedKind === "body" ? <BodyFields draft={draft} updateNumber={updateNumber} /> : null}
          {selectedKind === "activity" ? <ActivityFields draft={draft} updateNumber={updateNumber} /> : null}
          {selectedKind === "measurements" ? <MeasurementFields draft={draft} updateNumber={updateNumber} /> : null}
          {selectedKind === "sleep" ? (
            <SleepFields draft={draft} updateNumber={updateNumber} />
          ) : null}
          {selectedKind === "note" ? (
            <NoteFields draft={draft} updateText={updateText} updateNumber={updateNumber} />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" type="submit" disabled={saving}>
            <Plus className="size-4" />
            {editing ? "Сохранить" : "Добавить"}
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={onCancel}>
            {editing ? "Отмена" : "Закрыть"}
          </Button>
        </div>
      </div>
    </form>
  )
}

function NutritionFields({
  draft,
  updateNumber,
}: {
  draft: EntryDraft
  updateNumber: (key: keyof EntryDraft, value: string) => void
}) {
  return (
    <>
      <Field label="Ккал">
        <Input value={numberInput(draft.calories)} onChange={(event) => updateNumber("calories", event.target.value)} type="number" min="0" />
      </Field>
      <Field label="Белки, г">
        <Input value={numberInput(draft.protein)} onChange={(event) => updateNumber("protein", event.target.value)} type="number" min="0" step="0.1" />
      </Field>
      <Field label="Жиры, г">
        <Input value={numberInput(draft.fat)} onChange={(event) => updateNumber("fat", event.target.value)} type="number" min="0" step="0.1" />
      </Field>
      <Field label="Углеводы, г">
        <Input value={numberInput(draft.carbs)} onChange={(event) => updateNumber("carbs", event.target.value)} type="number" min="0" step="0.1" />
      </Field>
      <Field label="Клетчатка, г">
        <Input value={numberInput(draft.fiber)} onChange={(event) => updateNumber("fiber", event.target.value)} type="number" min="0" step="0.1" />
      </Field>
    </>
  )
}

function BodyFields({
  draft,
  updateNumber,
}: {
  draft: EntryDraft
  updateNumber: (key: keyof EntryDraft, value: string) => void
}) {
  return (
    <>
      <Field label="Вес, кг">
        <Input value={numberInput(draft.weightKg)} onChange={(event) => updateNumber("weightKg", event.target.value)} type="number" step="0.1" />
      </Field>
      <Field label="Масса жира, кг">
        <Input value={numberInput(draft.fatMassKg)} onChange={(event) => updateNumber("fatMassKg", event.target.value)} type="number" step="0.1" />
      </Field>
      <Field label="Мышцы, кг">
        <Input value={numberInput(draft.muscleKg)} onChange={(event) => updateNumber("muscleKg", event.target.value)} type="number" step="0.1" />
      </Field>
      <Field label="Вода, %">
        <Input value={numberInput(draft.waterPct)} onChange={(event) => updateNumber("waterPct", event.target.value)} type="number" step="0.1" />
      </Field>
      <Field label="Висц. жир">
        <Input value={numberInput(draft.visceralFat)} onChange={(event) => updateNumber("visceralFat", event.target.value)} type="number" step="1" />
      </Field>
    </>
  )
}

function ActivityFields({
  draft,
  updateNumber,
}: {
  draft: EntryDraft
  updateNumber: (key: keyof EntryDraft, value: string) => void
}) {
  return (
    <>
      <Field label="Активные ккал">
        <Input value={numberInput(draft.activeCalories)} onChange={(event) => updateNumber("activeCalories", event.target.value)} type="number" min="0" />
      </Field>
      <Field label="Шаги">
        <Input value={numberInput(draft.steps)} onChange={(event) => updateNumber("steps", event.target.value)} type="number" min="0" />
      </Field>
    </>
  )
}

function MeasurementFields({
  draft,
  updateNumber,
}: {
  draft: EntryDraft
  updateNumber: (key: keyof EntryDraft, value: string) => void
}) {
  return (
    <>
      <Field label="Талия, см">
        <Input value={numberInput(draft.waistCm)} onChange={(event) => updateNumber("waistCm", event.target.value)} type="number" step="0.1" />
      </Field>
      <Field label="Грудь, см">
        <Input value={numberInput(draft.chestCm)} onChange={(event) => updateNumber("chestCm", event.target.value)} type="number" step="0.1" />
      </Field>
      <Field label="Бедра, см">
        <Input value={numberInput(draft.hipsCm)} onChange={(event) => updateNumber("hipsCm", event.target.value)} type="number" step="0.1" />
      </Field>
      <Field label="Ягодицы, см">
        <Input value={numberInput(draft.glutesCm)} onChange={(event) => updateNumber("glutesCm", event.target.value)} type="number" step="0.1" />
      </Field>
      <Field label="Бицепс, см">
        <Input value={numberInput(draft.bicepsCm)} onChange={(event) => updateNumber("bicepsCm", event.target.value)} type="number" step="0.1" />
      </Field>
      <Field label="Плечи, см">
        <Input value={numberInput(draft.shouldersCm)} onChange={(event) => updateNumber("shouldersCm", event.target.value)} type="number" step="0.1" />
      </Field>
    </>
  )
}

function SleepFields({
  draft,
  updateNumber,
}: {
  draft: EntryDraft
  updateNumber: (key: keyof EntryDraft, value: string) => void
}) {
  return (
    <>
      <Field label="Сон, часов">
        <Input value={numberInput(draft.sleepHours)} onChange={(event) => updateNumber("sleepHours", event.target.value)} type="number" min="0" max="24" step="0.1" />
      </Field>
      <Field label="Качество">
        <Input value={numberInput(draft.sleepQuality)} onChange={(event) => updateNumber("sleepQuality", event.target.value)} type="number" min="0" step="0.1" />
      </Field>
    </>
  )
}

function NoteFields({
  draft,
  updateText,
  updateNumber,
}: {
  draft: EntryDraft
  updateText: (key: keyof EntryDraft, value: string) => void
  updateNumber: (key: keyof EntryDraft, value: string) => void
}) {
  return (
    <>
      <Field label="Настроение">
        <Input value={draft.mood ?? ""} onChange={(event) => updateText("mood", event.target.value)} placeholder="ровно, бодро, усталость" />
      </Field>
      <Field label="Стресс 1-10">
        <Input value={numberInput(draft.stressLevel)} onChange={(event) => updateNumber("stressLevel", event.target.value)} type="number" min="1" max="10" />
      </Field>
    </>
  )
}

export default App
