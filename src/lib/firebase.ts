import { initializeApp, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseUserScope = import.meta.env.VITE_FIREBASE_USER_SCOPE || "default"
export const firebaseAuthEmail = import.meta.env.VITE_FIREBASE_AUTH_EMAIL || ""

export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every(Boolean)
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

function getFirebaseApp() {
  if (!isFirebaseConfigured()) {
    return null
  }

  app ??= initializeApp(firebaseConfig)
  return app
}

export function getAuthClient() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) {
    return null
  }

  auth ??= getAuth(firebaseApp)
  return auth
}

export function getDb() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) {
    return null
  }

  db ??= getFirestore(firebaseApp)

  return db
}

export function getFirebaseUserScope() {
  return getAuthClient()?.currentUser?.uid ?? firebaseUserScope
}
