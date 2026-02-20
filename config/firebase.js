import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAFdW-wIHdpci42YcngOBP-hhACBKGvW1Y",
  authDomain: "aestheticai-c3795.firebaseapp.com",
  projectId: "aestheticai-c3795",
  storageBucket: "aestheticai-c3795.firebasestorage.app",
  messagingSenderId: "873025464768",
  appId: "1:873025464768:android:49bb9dffb2f52f1aafc025",
};

// Initialize app
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ Auth (RN persistence)
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

// Firestore setup
const db = getFirestore(app);

export {
  app,
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
};
