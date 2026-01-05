// Archivo: utils/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// PEGA AQUÍ TUS CREDENCIALES COPIADAS DE LA CONSOLA
const firebaseConfig = {
  apiKey: "AIzaSyAQ77ApRZ24iEYBk-TT7KJXpiOuEkYenEE",
  authDomain: "cultivos-d97e2.firebaseapp.com",
  projectId: "cultivos-d97e2",
  storageBucket: "cultivos-d97e2.firebasestorage.app",
  messagingSenderId: "609587907832",
  appId: "1:609587907832:web:534a239892cdd0c3483f0d"
};

// --- ESTA ES LA CORRECCIÓN CLAVE ---
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const db = getFirestore(app);
export { db };