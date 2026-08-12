# Body Analysis: контекст проекта

Этот документ нужен, чтобы быстро восстановить контекст в новом чате и продолжить разработку без повторного выяснения решений.

## Цель

Body Analysis — личный web-интерфейс для учета питания, показателей тела, активности, замеров и коротких заметок. Основной сценарий MVP: вручную заносить числовые показатели, хранить их в Firebase Firestore и выгружать JSON для дальнейшего анализа в GPT или другой программе.

Это не полноценный дневник питания с блюдами. По питанию сейчас хранятся только агрегированные цифры за дату.

## Технологии

- Vite + React + TypeScript.
- shadcn/ui-подход: локальные UI-компоненты в `src/components/ui`.
- Tailwind CSS v4 используется как CSS-слой shadcn.
- Firebase Web SDK + Firestore.
- Без Firebase приложение может работать через `localStorage`.

## Запуск

```bash
npm install
npm run dev
```

Локальный адрес: `http://127.0.0.1:5173/`.

Проверка сборки:

```bash
npm run build
```

## Firebase

Конфиг хранится в `.env`, файл не коммитится. Шаблон лежит в `.env.example`.

Используемые переменные:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_USER_SCOPE
```

Firestore collection path:

```text
healthUsers/{VITE_FIREBASE_USER_SCOPE}/entries
```

Для текущей личной версии используется `VITE_FIREBASE_USER_SCOPE=default`.

На этапе MVP правила Firestore могут быть открыты только для разработки:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /healthUsers/default/entries/{entryId} {
      allow read, write: if true;
    }
  }
}
```

Важно: перед публичным использованием нужно добавить авторизацию и закрыть правила.

## Модель данных

Базовые поля каждой записи:

```ts
id: string
kind: "nutrition" | "body" | "activity" | "measurements" | "note"
date: string
createdAt: string
updatedAt: string
```

### Питание

Питание сейчас без завтрака/обеда/ужина и без блюд.

Поля:

- `calories`
- `protein`
- `fat`
- `carbs`
- `fiber`

Таблица плоская: дата и числовые колонки. Строки "Итого" нет.

### Тело

Поля:

- `weightKg`
- `fatMassKg`
- `muscleKg`
- `waterPct`
- `visceralFat`

В таблице значения разбиты по колонкам. Рядом со значениями показываются стрелки вверх/вниз относительно предыдущей записи.

### Активность

Поля:

- `activeCalories`
- `steps`

В таблице нет стрелок сравнения.

### Замеры

Поля:

- `waistCm`
- `chestCm`
- `hipsCm`
- `glutesCm`
- `bicepsCm`
- `shouldersCm`

В таблице значения разбиты по колонкам. Рядом со значениями показываются стрелки вверх/вниз относительно предыдущей записи.

### Заметка

Поля:

- `mood`
- `sleepHours`
- `stressLevel`

Этот раздел пока минимальный.

## UX-решения MVP

- Нет верхних блоков статистики.
- Нет блока "Выводы"; анализ будет делать нейросеть отдельно.
- Нет экспорта на каждой вкладке; экспорт вынесен в `Настройки`.
- Кнопка `Новая запись` открывает форму на странице.
- Пока форма открыта, кнопка `Новая запись` disabled, чтобы случайно не сбрасывать введенные данные.
- Кнопка `Пример` удалена из всех форм.
- Комментарии/notes в формах удалены.
- Заголовки и кнопки уменьшены, интерфейс должен быть компактным.

## Экспорт JSON

Экспорт находится на странице `Настройки`.

Селект по умолчанию стоит на `Выгрузить все`.

Формат payload:

```json
{
  "exportedAt": "ISO date",
  "section": "all | nutrition | body | activity | measurements | note",
  "sectionLabel": "Все разделы | Питание | ...",
  "count": 0,
  "entries": []
}
```

## Важные файлы

- `src/App.tsx` — основной интерфейс, таблицы, формы, настройки и экспорт.
- `src/types/health.ts` — типы записей и labels разделов.
- `src/lib/health-store.ts` — работа с Firestore/localStorage, нормализация legacy-полей.
- `src/lib/firebase.ts` — инициализация Firebase из env.
- `src/components/ui/*` — локальные shadcn-style компоненты.
- `src/index.css` — Tailwind v4 и CSS-переменные темы.

## Legacy-поля

В `src/lib/health-store.ts` есть `LegacyEntry` и `normalizeEntry`. Это сделано специально, чтобы старые поля из предыдущих итераций не возвращались в UI и экспорт:

- `mealType`
- `title`
- `notes`
- старые поля активности: `activityType`, `durationMin`, `distanceKm`, `intensity`
- старые поля тела: `bodyFatPct`, `muscleMassPct`, `proteinPct`, `boneMineralsPct`, `skeletalMuscleKg`, `leanBodyMassKg`, `pulseBpm`
- старое поле замеров: `neckCm`

## Репозиторий

GitHub:

```text
git@github.com:avanesov89/bodyanalysis.git
```

Текущая основная ветка: `main`.

## Ближайшие возможные задачи

- Добавить авторизацию Firebase и закрытые Firestore rules.
- Подготовить деплой и подключение домена.
- Добавить фильтры по датам и диапазонам.
- Сделать страницу технического JSON-экспорта более гибкой: диапазон дат, формат за неделю, формат для GPT.
- Добавить импорт/миграцию данных.
- Разнести `src/App.tsx` на компоненты, когда интерфейс начнет расти.
- Решить, нужен ли раздел `Заметка` в текущем виде или его лучше заменить на сон/самочувствие.
