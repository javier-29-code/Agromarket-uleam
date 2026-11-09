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

// Usar emuladores únicamente en el servidor local de pruebas.
const USAR_EMULADORES =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  window.location.port === "5002";

const configuracionActiva = USAR_EMULADORES
  ? {
      ...firebaseConfig,
      projectId: "demo-agromarket",
      authDomain: "demo-agromarket.firebaseapp.com"
    }
  : firebaseConfig;

firebase.initializeApp(configuracionActiva);

// Servicios utilizados por el sistema.
const auth = firebase.auth();
const db = firebase.firestore();

// Conectar antes de realizar consultas o iniciar sesión.
if (USAR_EMULADORES) {
  auth.useEmulator("http://127.0.0.1:9099");
  db.useEmulator("127.0.0.1", 8080);

  console.info("Agro Market: conectado a los emuladores.");
}

// Dominio permitido para el registro.
const DOMINIO = "@uleam.edu.ec";