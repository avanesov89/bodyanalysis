# Body Analysis

Личный web-журнал питания, показателей тела, активности, замеров и заметок.

## Текущий статус

Это MVP-версия для личного учета:

- питание: дата, калории, белки, жиры, углеводы, клетчатка;
- тело: вес, масса жира, мышечная масса, вода, висцеральный жир;
- активность: дата, активные калории, шаги;
- замеры: талия, грудь, бедра, ягодицы, бицепс, плечи;
- заметки: настроение, сон, стресс;
- настройки: режим хранилища и выгрузка JSON по разделу или всех данных.

Подробный контекст проекта для продолжения работы в новом чате лежит в [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

## Запуск

```bash
npm install
npm run dev
```

Открой `http://127.0.0.1:5173/`.

## Firebase

Без Firebase приложение сохраняет данные в `localStorage`. Чтобы включить Firestore:

1. Скопируй `.env.example` в `.env`.
2. Заполни `VITE_FIREBASE_*` из настроек Firebase Web App.
3. Создай Firestore Database.
4. Включи Firebase Authentication -> Sign-in method -> Email/Password.
5. Опубликуй правила из `firestore.rules`.
6. Перезапусти dev-сервер.

Записи будут храниться в коллекции:

```text
healthUsers/{uid}/entries
```

`uid` берется из Firebase Authentication, поэтому каждый зарегистрированный пользователь видит только свои записи.

Если заполнить `VITE_FIREBASE_AUTH_EMAIL`, экран входа будет просить только пароль и использовать этот email автоматически. Если оставить переменную пустой, экран входа покажет email и пароль.
На экране регистрации email всегда вводится вручную.

Firestore rules для регистрации сторонних пользователей:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /healthUsers/{userId}/entries/{entryId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }
  }
}
```

Пример правил также лежит в `firestore.rules`.

Если до этого данные лежали в `healthUsers/default/entries`, они останутся в старом пути. Их можно перенести вручную или отдельной миграцией.

## Проверка

```bash
npm run build
```

Сейчас сборка проходит. Vite может предупреждать о большом JS-чанке из-за Firebase SDK; для MVP это не блокирует работу.

## Деплой GitHub Pages

Проект нужно публиковать как Vite build, а не как корень репозитория. Для этого добавлен workflow:

```text
.github/workflows/deploy.yml
```

В GitHub открой `Settings -> Pages` и выбери:

```text
Build and deployment -> Source -> GitHub Actions
```

Кастомный домен лежит в `public/CNAME` и попадет в `dist` при сборке.

Чтобы Firebase работал на опубликованном домене, добавь переменные в `Settings -> Secrets and variables -> Actions -> Secrets`:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_AUTH_EMAIL
```
