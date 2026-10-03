// Firebase SDK imports - Unified provisioned configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDocFromServer } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Configured from firebase-applet-config.json for project gen-lang-client-0252012026
const firebaseConfig = {
  projectId: "gen-lang-client-0252012026",
  appId: "1:392073440321:web:82c80696c69a9015ddaac0",
  apiKey: "AIzaSyDP3ue8Rdw4GvX28QVLQggI_asvQ-Ilw2A",
  authDomain: "gen-lang-client-0252012026.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-portfolio-d4f5cb96-6d77-4ac8-a099-283e9f812285",
  storageBucket: "gen-lang-client-0252012026.firebasestorage.app",
  messagingSenderId: "392073440321",
  oAuthClientId: "392073440321-p8ljvn876vi5ohjkg5jo8e5f9kvc6ut8.apps.googleusercontent.com"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore with configured database ID
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)"
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Safe storage & realtime DB access
let storageInstance = null;
try {
  storageInstance = getStorage(app);
} catch (e) {
  console.warn("Firebase Storage fallback:", e?.message);
}
export const storage = storageInstance;

let realtimeDbInstance = null;
try {
  if (firebaseConfig.databaseURL) {
    realtimeDbInstance = getDatabase(app);
  }
} catch (e) {
  console.warn("Realtime Database fallback:", e?.message);
}
export const realtimeDb = realtimeDbInstance;

// Export utils
export const useAuthState = (callback) => onAuthStateChanged(auth, callback);

// Validate connection per skill guideline
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, '_health', 'ping'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore offline or pending initialization.");
    }
  }
}
testFirestoreConnection();
