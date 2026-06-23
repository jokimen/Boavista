import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// O SDK cliente só é necessário no browser (login corre num event handler). Inicializar
// Auth/Firestore no servidor (prerender) lançaria `auth/invalid-api-key` quando as
// variáveis NEXT_PUBLIC_* ainda não estão definidas — por isso guardamos por `window`.
const isBrowser = typeof window !== "undefined";
const app = isBrowser ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)) : null;

export const auth: Auth = app ? getAuth(app) : (undefined as unknown as Auth);
export const db: Firestore = app ? getFirestore(app) : (undefined as unknown as Firestore);
