import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDeKE5u-A5-yvbmvVSJon_ehdLaOx9Byow",
  authDomain: "studypilot-ai-9965e.firebaseapp.com",
  projectId: "studypilot-ai-9965e",
  storageBucket: "studypilot-ai-9965e.firebasestorage.app",
  messagingSenderId: "177687548048",
  appId: "1:177687548048:web:2356f7204405c7e9874815",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);