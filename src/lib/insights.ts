import type { HealthEntry } from "@/types/health"

const dayMs = 24 * 60 * 60 * 1000

function toNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function finiteNumbers(values: Array<number | undefined>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
}

export function recentEntries(entries: HealthEntry[], days = 7) {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date(end.getTime() - (days - 1) * dayMs)
  start.setHours(0, 0, 0, 0)

  return entries.filter((entry) => {
    const date = new Date(`${entry.date}T12:00:00`)
    return date >= start && date <= end
  })
}

export function summarizeEntries(entries: HealthEntry[], days = 7) {
  const scope = recentEntries(entries, days)
  const nutrition = scope.filter((entry) => entry.kind === "nutrition")
  const body = scope.filter((entry) => entry.kind === "body")
  const activity = scope.filter((entry) => entry.kind === "activity")
  const sleep = scope.filter((entry) => entry.kind === "sleep")
  const notes = scope.filter((entry) => entry.kind === "note")

  const totals = {
    calories: nutrition.reduce((sum, entry) => sum + toNumber(entry.calories), 0),
    protein: nutrition.reduce((sum, entry) => sum + toNumber(entry.protein), 0),
    fat: nutrition.reduce((sum, entry) => sum + toNumber(entry.fat), 0),
    carbs: nutrition.reduce((sum, entry) => sum + toNumber(entry.carbs), 0),
    fiber: nutrition.reduce((sum, entry) => sum + toNumber(entry.fiber), 0),
    activeCalories: activity.reduce((sum, entry) => sum + toNumber(entry.activeCalories), 0),
    steps: activity.reduce((sum, entry) => sum + toNumber(entry.steps), 0),
  }

  const weights = body
    .filter((entry) => typeof entry.weightKg === "number")
    .sort((a, b) => a.date.localeCompare(b.date))
  const latestWeight = weights.at(-1)?.weightKg ?? null
  const firstWeight = weights.at(0)?.weightKg ?? null
  const weightDelta =
    latestWeight !== null && firstWeight !== null
      ? Number((latestWeight - firstWeight).toFixed(1))
      : null

  const daysWithNutrition = new Set(nutrition.map((entry) => entry.date)).size || 1
  const sleepHours = finiteNumbers(sleep.map((entry) => entry.sleepHours))
  const sleepQuality = finiteNumbers(sleep.map((entry) => entry.sleepQuality))

  return {
    periodDays: days,
    records: scope.length,
    nutritionRecords: nutrition.length,
    activityRecords: activity.length,
    bodyRecords: body.length,
    sleepRecords: sleep.length,
    noteRecords: notes.length,
    averages: {
      calories: Math.round(totals.calories / daysWithNutrition),
      protein: Math.round(totals.protein / daysWithNutrition),
      fat: Math.round(totals.fat / daysWithNutrition),
      carbs: Math.round(totals.carbs / daysWithNutrition),
      fiber: Math.round(totals.fiber / daysWithNutrition),
      steps: Math.round(totals.steps / days),
      sleepHours: sleepHours.length
        ? Number((sleepHours.reduce((sum, value) => sum + value, 0) / sleepHours.length).toFixed(1))
        : 0,
      sleepQuality: sleepQuality.length
        ? Number((sleepQuality.reduce((sum, value) => sum + value, 0) / sleepQuality.length).toFixed(1))
        : 0,
    },
    totals,
    latestWeight,
    weightDelta,
    entries: scope
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(({ id, createdAt, updatedAt, ...entry }) => entry),
  }
}

export function buildInsights(entries: HealthEntry[]) {
  const summary = summarizeEntries(entries, 7)
  const insights: string[] = []

  if (summary.nutritionRecords === 0) {
    insights.push("За последние 7 дней пока нет записей питания. Начни с фиксации приемов пищи и базовых БЖУ.")
  } else {
    insights.push(
      `Среднее питание: ${summary.averages.calories} ккал, ${summary.averages.protein} г белка, ${summary.averages.fiber} г клетчатки в день.`,
    )
  }

  if (summary.averages.protein > 0 && summary.latestWeight) {
    const proteinPerKg = summary.averages.protein / summary.latestWeight
    insights.push(
      proteinPerKg >= 1.6
        ? `Белок выглядит уверенно: около ${proteinPerKg.toFixed(1)} г/кг текущего веса.`
        : `Белок ниже спортивного ориентира 1.6 г/кг: сейчас около ${proteinPerKg.toFixed(1)} г/кг.`,
    )
  }

  if (summary.activityRecords > 0) {
    insights.push(
      `Активность за неделю: ${summary.totals.activeCalories} активных ккал и в среднем ${summary.averages.steps} шагов в день.`,
    )
  }

  if (summary.sleepRecords > 0) {
    insights.push(
      `Сон за неделю: в среднем ${summary.averages.sleepHours} ч, качество ${summary.averages.sleepQuality}.`,
    )
  }

  if (summary.weightDelta !== null) {
    const trend =
      summary.weightDelta > 0.2
        ? "вес растет"
        : summary.weightDelta < -0.2
          ? "вес снижается"
          : "вес почти стабилен"
    insights.push(`Тренд веса за внесенный период: ${trend} (${summary.weightDelta > 0 ? "+" : ""}${summary.weightDelta} кг).`)
  }

  return insights
}
