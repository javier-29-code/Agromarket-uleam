// ═══════════════════════════════════════════════════════
// firebase-config.js
// Reemplaza los 6 valores con los datos de tu proyecto.
// Firebase Console → ⚙️ → Tu app web → SDK de Firebase
// ═══════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey:            "TU_API_KEY",
  authDomain:        "TU_PROYECTO.firebaseapp.com",
  projectId:         "TU_PROYECTO",
  storageBucket:     "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId:             "TU_APP_ID"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

const DOMINIO = "@uleam.edu.ec";
