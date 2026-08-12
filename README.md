# Body Analysis

Личный web-журнал питания, показателей тела, активности, замеров и заметок.

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
4. Перезапусти dev-сервер.

Записи будут храниться в коллекции:

```text
healthUsers/{VITE_FIREBASE_USER_SCOPE}/entries
```

Для первой личной версии можно оставить `VITE_FIREBASE_USER_SCOPE=default`.
