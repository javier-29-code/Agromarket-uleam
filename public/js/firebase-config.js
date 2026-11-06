// ═══════════════════════════════════════════════════════
// firebase-config.js
// Reemplaza los 6 valores con los datos de tu proyecto.
// Firebase Console → ⚙️ → Tu app web → SDK de Firebase
// ═══════════════════════════════════════════════════════

// Configuración de la aplicación web en Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyB6AciCXvdtqChPamGnOUenU060NLbjUEY",
  authDomain: "agromarket-uleam-ad3a4.firebaseapp.com",
  projectId: "agromarket-uleam-ad3a4",
  storageBucket: "agromarket-uleam-ad3a4.firebasestorage.app",
  messagingSenderId: "360128437070",
  appId: "1:360128437070:web:38c0c13afc722625935c1f"
};

// Inicializar Firebase con la API que utiliza el código base.
firebase.initializeApp(firebaseConfig);

// Servicios utilizados por el sistema.
const auth = firebase.auth();
const db = firebase.firestore();

// Dominio permitido para el registro.
const DOMINIO = "@uleam.edu.ec";