# Тело в цифрах: контекст проекта

Этот документ нужен, чтобы быстро восстановить контекст в новом чате и продолжить разработку без повторного выяснения решений.

## Цель

Тело в цифрах — личный web-интерфейс для учета питания, показателей тела, активности, замеров, сна и коротких заметок. Основной сценарий MVP: вручную заносить числовые показатели, хранить их в Firebase Firestore и выгружать JSON для дальнейшего анализа в GPT или другой программе.

Это не полноценный дневник питания с блюдами. По питанию сейчас хранятся только агрегированные цифры за дату.

## Технологии

- Vite + React + TypeScript.
- shadcn/ui-подход: локальные UI-компоненты в `src/components/ui`.
- Tailwind CSS v4 используется как CSS-слой shadcn.
- Firebase Web SDK + Firestore.
- Firebase Authentication для входа.
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
VITE_FIREBASE_AUTH_EMAIL
```

Legacy fallback:

```text
VITE_FIREBASE_USER_SCOPE
```

Firestore collection path:

```text
healthUsers/{uid}/entries
```

`uid` берется из Firebase Authentication. Для legacy-данных без текущего пользователя в коде остается fallback `VITE_FIREBASE_USER_SCOPE=default`, но рабочий сценарий с Firebase Auth использует uid.

### Вход и регистрация

Добавлен Firebase Authentication через Email/Password.

Если `VITE_FIREBASE_AUTH_EMAIL` заполнен, экран входа визуально просит только пароль и использует этот email автоматически. Если переменная пустая, экран входа просит email и пароль.
Экран регистрации всегда просит email и пароль, чтобы сторонний пользователь создавал собственный аккаунт.

В Firebase Console нужно включить:

```text
Authentication -> Sign-in method -> Email/Password
```

После включения входа Firestore rules нужно закрыть так:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /healthUsers/{userId}/entries/{entryId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }

    match /healthUsers/{userId}/profile/{documentId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }
  }
}
```

Если до перехода на uid данные лежали в `healthUsers/default/entries`, они не появятся у пользователя автоматически. Для этого нужна ручная переноска или отдельная миграция в `healthUsers/{uid}/entries`.

## Модель данных

Базовые поля каждой записи:

```ts
id: string
kind: "nutrition" | "body" | "activity" | "measurements" | "sleep" | "note"
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

### Сон

Поля:

- `sleepHours`
- `sleepQuality`

Таблица плоская: дата, часы сна и качество.

### Заметки

Поля:

- `mood`
- `stressLevel`

Раздел оставлен для короткого самочувствия без данных сна.

## UX-решения MVP

- Нет верхних блоков статистики.
- Нет блока "Выводы"; анализ будет делать нейросеть отдельно.
- Нет экспорта на каждой вкладке; экспорт вынесен в `Настройки`.
- Кнопка `Новая запись` открывает форму на странице.
- Пока форма открыта, кнопка `Новая запись` disabled, чтобы случайно не сбрасывать введенные данные.
- Кнопка `Пример` удалена из всех форм.
- Комментарии/notes в формах удалены.
- Заголовки и кнопки уменьшены, интерфейс должен быть компактным.
- При включенном Firebase приложение показывает экран входа до чтения Firestore.

## Профиль для анализа

Профиль находится на странице `Настройки`.

Поля:

- пол: мужской / женский;
- возраст;
- цель: похудение / набор / поддержание;
- образ жизни: малоподвижный / умеренно активный / активный / очень активный.

В UI рядом с label поля `Образ жизни` есть иконка с tooltip-подсказкой:

- малоподвижный: сидячая работа, мало шагов, тренировки редко или отсутствуют;
- умеренно активный: регулярная ходьба, бытовая активность или 1-3 тренировки в неделю;
- активный: много движения в течение дня или 3-5 тренировок в неделю;
- очень активный: физическая работа, частые интенсивные тренировки или спорт почти каждый день.

Профиль сохраняется в `localStorage` без Firebase или в Firestore по пути:

```text
healthUsers/{uid}/profile/settings
```

## Экспорт архива для анализа

Экспорт находится на странице `Настройки`.

Селект по умолчанию стоит на `Выгрузить все`.

Кнопка выгрузки активна только после 14 заполненных дней в выбранной выгрузке. День считается заполненным, если за эту дату есть хотя бы одна запись выбранного раздела. Для `Выгрузить все` считаются уникальные даты по всем разделам.

По клику скачивается ZIP-архив:

- `body-analysis-{section}-{date}.zip`.

Внутри архива два файла:

- `body-analysis-{section}-{date}.json` — данные выбранного раздела или всех разделов;
- `body-analysis-{section}-{date}-prompt.md` — настройки пользователя и инструкция для анализа данных.

Формат JSON payload:

```json
{
  "exportedAt": "ISO date",
  "section": "all | nutrition | body | activity | measurements | sleep | note",
  "sectionLabel": "Все разделы | Питание | ...",
  "count": 0,
  "userProfile": {
    "gender": "male | female | null",
    "genderLabel": "Мужской | Женский | null",
    "age": 0,
    "goal": "weight_loss | muscle_gain | maintenance | null",
    "goalLabel": "Похудение | Набор | Поддержание | null",
    "lifestyle": "sedentary | moderate | active | very_active | null",
    "lifestyleLabel": "Малоподвижный | Умеренно активный | Активный | Очень активный | null",
    "lifestyleDescription": "Описание выбранного образа жизни | null"
  },
  "entries": []
}
```

## Важные файлы

- `src/App.tsx` — основной интерфейс, таблицы, формы, настройки и экспорт.
- `src/types/health.ts` — типы записей и labels разделов.
- `src/lib/health-store.ts` — работа с Firestore/localStorage, нормализация legacy-полей.
- `src/lib/firebase.ts` — инициализация Firebase из env и вычисление текущего Firestore user scope.
- `firestore.rules` — правила Firestore, которые ограничивают записи текущим `request.auth.uid`.
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

- Добавить миграцию старых данных из `healthUsers/default/entries` в `healthUsers/{uid}/entries`.
- Добавить подтверждение email перед записью данных.
- Подготовить деплой и подключение домена.
- Добавить фильтры по датам и диапазонам.
- Сделать страницу технического JSON-экспорта более гибкой: диапазон дат, формат за неделю, формат для GPT.
- Добавить импорт/миграцию данных.
- Разнести `src/App.tsx` на компоненты, когда интерфейс начнет расти.
- При необходимости расширить `Заметки` отдельным текстовым полем после возврата комментариев в UI.
