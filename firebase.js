// Firebase SDK imports - Fixed config
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getDatabase, ref as dbRef, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Original working config from project
const firebaseConfig = {
apiKey: "AIzaSyBMNfCZ2LSVkCWVmJ9w2jYKG8PHaDYUyfI",
authDomain: "matnix-studios.firebaseapp.com",
databaseURL: "https://matnix-studios-default-rtdb.firebaseio.com",
projectId: "matnix-studios",
storageBucket: "matnix-studios.firebasestorage.app",
messagingSenderId: "590431916519",
appId: "1:590431916519:web:6622678876ee17c36aed42"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const realtimeDb = getDatabase(app);

// Export utils
export const useAuthState = (callback) => onAuthStateChanged(auth, callback);
