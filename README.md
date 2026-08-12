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
5. Создай пользователя с email/password.
6. Перезапусти dev-сервер.

Записи будут храниться в коллекции:

```text
healthUsers/{VITE_FIREBASE_USER_SCOPE}/entries
```

Для первой личной версии можно оставить `VITE_FIREBASE_USER_SCOPE=default`.

Если заполнить `VITE_FIREBASE_AUTH_EMAIL`, экран входа будет просить только пароль и использовать этот email автоматически. Если оставить переменную пустой, экран входа покажет email и пароль.

Минимальные Firestore rules после включения входа:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /healthUsers/default/entries/{entryId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Пример правил также лежит в `firestore.rules`. Для максимального ограничения можно добавить проверку конкретного email:

```js
allow read, write: if request.auth != null
  && request.auth.token.email == "you@example.com";
```

## Проверка

```bash
npm run build
```

Сейчас сборка проходит. Vite может предупреждать о большом JS-чанке из-за Firebase SDK; для MVP это не блокирует работу.
