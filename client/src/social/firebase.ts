import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

export interface FirebaseBundle {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

function readConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;
  if (!apiKey || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}

export function isFirebaseConfigured(): boolean {
  return readConfig() !== null;
}

let bundle: FirebaseBundle | null | undefined;

export function getFirebase(): FirebaseBundle | null {
  if (bundle !== undefined) return bundle;
  const config = readConfig();
  if (!config) {
    bundle = null;
    return null;
  }
  const app = getApps()[0] ?? initializeApp(config);
  bundle = { app, auth: getAuth(app), db: getFirestore(app) };
  return bundle;
}
