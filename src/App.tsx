import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react"
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Download,
  Dumbbell,
  Info,
  Moon,
  Pencil,
  Plus,
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
import { getSyncMode, listEntries, removeEntry, upsertEntry } from "@/lib/health-store"
import type { EntryDraft, EntryKind, HealthEntry } from "@/types/health"
import { kindLabels } from "@/types/health"

const kindOptions: EntryKind[] = ["nutrition", "body", "activity", "measurements", "note"]
type AppPage = EntryKind | "settings" | "about"
type ExportKind = EntryKind | "all"
type ThemeMode = "light" | "dark"
const themeStorageKey = "body-analysis.theme.v1"

const kindIcons: Record<EntryKind, typeof Utensils> = {
  nutrition: Utensils,
  body: Scale,
  activity: Dumbbell,
  measurements: BarChart3,
  note: Waves,
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

function numberInput(value: number | undefined) {
  return value ?? ""
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  return `${value.toLocaleString("ru-RU")}${suffix}`
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

function describeEntry(entry: HealthEntry) {
  if (entry.kind === "nutrition") {
    return "Питание"
  }

  if (entry.kind === "body") {
    return `Вес ${formatNumber(entry.weightKg, " кг")}`
  }

  if (entry.kind === "activity") {
    return "Активность"
  }

  if (entry.kind === "measurements") {
    return "Замеры тела"
  }

  return entry.mood ? `Самочувствие: ${entry.mood}` : "Заметка"
}

function metricLine(entry: HealthEntry) {
  if (entry.kind === "nutrition") {
    return [
      formatNumber(entry.calories, " ккал"),
      formatNumber(entry.protein, " Б"),
      formatNumber(entry.fat, " Ж"),
      formatNumber(entry.carbs, " У"),
      formatNumber(entry.fiber, " клетчатка"),
    ].join(" · ")
  }

  if (entry.kind === "body") {
    return [
      formatNumber(entry.fatMassKg, " кг жира"),
      formatNumber(entry.muscleKg, " кг мышц"),
      formatNumber(entry.waterPct, "% воды"),
      formatNumber(entry.visceralFat, " висц."),
    ].join(" · ")
  }

  if (entry.kind === "activity") {
    return [
      formatNumber(entry.activeCalories, " ккал"),
      formatNumber(entry.steps, " шагов"),
    ].join(" · ")
  }

  if (entry.kind === "measurements") {
    return [
      formatNumber(entry.waistCm, " талия"),
      formatNumber(entry.chestCm, " грудь"),
      formatNumber(entry.hipsCm, " бедра"),
      formatNumber(entry.glutesCm, " ягодицы"),
      formatNumber(entry.bicepsCm, " бицепс"),
      formatNumber(entry.shouldersCm, " плечи"),
    ].join(" · ")
  }

  return [
    formatNumber(entry.sleepHours, " ч сна"),
    entry.stressLevel ? `стресс ${entry.stressLevel}/10` : "стресс -",
  ].join(" · ")
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function App() {
  const [entries, setEntries] = useState<HealthEntry[]>([])
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
      const saved = await upsertEntry({ ...draft, kind: selectedKind }, editing ?? undefined)
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

  function downloadSectionJson() {
    const sectionEntries = exportKind === "all"
      ? entries
      : entries.filter((entry) => entry.kind === exportKind)
    const payload = {
      exportedAt: new Date().toISOString(),
      section: exportKind,
      sectionLabel: exportKind === "all" ? "Все разделы" : kindLabels[exportKind],
      count: sectionEntries.length,
      entries: sectionEntries,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `body-analysis-${exportKind}-${today()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!authReady) {
    return <AuthLoading />
  }

  if (authEnabled && !authUser) {
    return <LoginPage onSignIn={signIn} onSignUp={signUp} />
  }

  return (
    <TooltipProvider>
      <main className="min-h-svh bg-background">
        <div className="mx-auto grid max-w-[1380px] gap-0 lg:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="border-b bg-background px-5 py-5 lg:relative lg:min-h-svh lg:border-b-0 lg:after:absolute lg:after:top-5 lg:after:right-0 lg:after:bottom-5 lg:after:border-r lg:after:border-[var(--border)] lg:after:content-['']">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Activity className="size-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-normal">Body Analysis</h1>
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
                        ? "bg-secondary text-secondary-foreground"
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
                      ? "bg-secondary text-secondary-foreground"
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
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  ].join(" ")}
                >
                  <Info className="size-4" />
                  О проекте
                </button>
              </div>
            </nav>
          </aside>

          <section className="min-w-0 px-5 py-5">
            {activePage === "settings" ? (
              <SettingsPage
                authEmail={authUser?.email ?? ""}
                authEnabled={authEnabled}
                authUserId={authUser?.uid ?? ""}
                entries={entries}
                exportKind={exportKind}
                themeMode={themeMode}
                onExport={downloadSectionJson}
                onExportKindChange={setExportKind}
                onResetPassword={resetPassword}
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

                  <section>
                    <div className="overflow-hidden rounded-md border bg-background">
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
                      ) : (
                        <GenericTable
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
      </main>
    </TooltipProvider>
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
      <form onSubmit={submitAuth} className="grid w-full max-w-sm gap-5 rounded-md border bg-background p-5 shadow-xs">
        <div className="grid gap-2">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Body Analysis</h1>
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
              mode === "signIn" ? "bg-background font-medium shadow-xs" : "text-muted-foreground",
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
              mode === "signUp" ? "bg-background font-medium shadow-xs" : "text-muted-foreground",
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
  onExport,
  onExportKindChange,
  onResetPassword,
  onSignOut,
  onThemeModeChange,
}: {
  authEmail: string
  authEnabled: boolean
  authUserId: string
  entries: HealthEntry[]
  exportKind: ExportKind
  themeMode: ThemeMode
  onExport: () => void
  onExportKindChange: (kind: ExportKind) => void
  onResetPassword: () => Promise<void>
  onSignOut: () => void
  onThemeModeChange: (theme: ThemeMode) => void
}) {
  const [passwordResetMessage, setPasswordResetMessage] = useState("")
  const [passwordResetLoading, setPasswordResetLoading] = useState(false)
  const exportCount = exportKind === "all"
    ? entries.length
    : entries.filter((entry) => entry.kind === exportKind).length

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
        <section className="rounded-md border bg-background p-4 shadow-xs">
          <h3 className="font-semibold">Пользователь</h3>
          <div className="mt-4 grid gap-3 text-sm">
            {authEnabled ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                  <span className="text-muted-foreground">ID пользователя</span>
                  <span className="max-w-full break-all font-mono text-xs">{authUserId || "-"}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                  <span className="text-muted-foreground">E-mail при регистрации</span>
                  <span className="font-medium">{authEmail || "Авторизован"}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
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

        <section className="rounded-md border bg-background p-4 shadow-xs">
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
                      ? "bg-background font-medium text-foreground shadow-xs"
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
                      ? "bg-background font-medium text-foreground shadow-xs"
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

        <section className="rounded-md border bg-background p-4 shadow-xs">
          <h3 className="font-semibold">Выгрузка JSON</h3>
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
            <Button type="button" onClick={onExport} disabled={exportCount === 0}>
              <Download className="size-4" />
              Скачать JSON
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Записей для выгрузки: {exportCount}
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
        <section className="rounded-md border bg-background p-4 shadow-xs">
          <h3 className="font-semibold">Body Analysis</h3>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
            <p>
              Личный журнал для учета питания, показателей тела, активности, замеров и коротких заметок.
            </p>
            <p>
              Проект сфокусирован на ручном вводе ключевых чисел и выгрузке структурированного JSON для дальнейшего анализа.
            </p>
          </div>
        </section>

        <section className="rounded-md border bg-background p-4 shadow-xs">
          <h3 className="font-semibold">Разделы</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b pb-3">
              <span className="text-muted-foreground">Питание</span>
              <span className="text-right">калории и макронутриенты</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-b pb-3">
              <span className="text-muted-foreground">Тело</span>
              <span className="text-right">вес, жир, мышцы, вода</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-b pb-3">
              <span className="text-muted-foreground">Активность</span>
              <span className="text-right">активные калории и шаги</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-b pb-3">
              <span className="text-muted-foreground">Замеры</span>
              <span className="text-right">основные окружности тела</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Заметка</span>
              <span className="text-right">сон, стресс и самочувствие</span>
            </div>
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
            <TableCell className="font-medium">{entry.date}</TableCell>
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

function GenericTable({
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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Дата</TableHead>
          <TableHead>Запись</TableHead>
          <TableHead>Показатели</TableHead>
          <TableHead className="w-24 text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="font-medium">{entry.date}</TableCell>
            <TableCell>
              <div className="font-medium">{describeEntry(entry)}</div>
            </TableCell>
            <TableCell className="text-muted-foreground">{metricLine(entry)}</TableCell>
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
              <TableCell className="font-medium">{entry.date}</TableCell>
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
            <TableCell className="font-medium">{entry.date}</TableCell>
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
              <TableCell className="font-medium">{entry.date}</TableCell>
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
    <form onSubmit={onSubmit} className="rounded-md border bg-background p-4 shadow-xs">
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
      <Field label="Сон, часов">
        <Input value={numberInput(draft.sleepHours)} onChange={(event) => updateNumber("sleepHours", event.target.value)} type="number" min="0" max="24" step="0.1" />
      </Field>
      <Field label="Стресс 1-10">
        <Input value={numberInput(draft.stressLevel)} onChange={(event) => updateNumber("stressLevel", event.target.value)} type="number" min="1" max="10" />
      </Field>
    </>
  )
}

export default App
