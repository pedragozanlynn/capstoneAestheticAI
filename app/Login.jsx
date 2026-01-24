import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  StatusBar,
  KeyboardAvoidingView, // ✅ ADDED
} from "react-native";
import { auth, db } from "../config/firebase";
import Button from "./components/Button";
import Input from "./components/Input";

/* ================= CONSTANTS ================= */
const ROLE_KEY_PREFIX = "aestheticai:user-role:";
const PROFILE_KEY_PREFIX = "aestheticai:user-profile:";

/* ✅ email regex (minimal) */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialRole = params.role || "user";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const unsubscribeProfileRef = useRef(null);

  /* ===========================
     ✅ TOAST (TOP, NO OK BUTTON)
     =========================== */
  const [toast, setToast] = useState({ visible: false, text: "", type: "info" });
  const toastTimerRef = useRef(null);

  const showToast = (text, type = "info", ms = 2200) => {
    try {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ visible: true, text: String(text || ""), type });
      toastTimerRef.current = setTimeout(() => {
        setToast((t) => ({ ...t, visible: false }));
      }, ms);
    } catch {}
  };

  useEffect(() => {
    return () => {
      try {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      } catch {}
    };
  }, []);

  /* ================= ROLE LABEL ================= */
  const roleLabel = initialRole === "consultant" ? "Consultant" : "User";

  /* ================= CREATE ACCOUNT ================= */
  const goToRegister = () => {
    if (initialRole === "consultant") {
      router.push("/Consultant/Step1Register");
    } else {
      router.push("/User/Register");
    }
  };

  /* ================= HELPERS ================= */
  const cacheUserRole = async (uid, role) => {
    await AsyncStorage.setItem(`${ROLE_KEY_PREFIX}${uid}`, role);
  };

  const saveProfile = async (uid, profile) => {
    await AsyncStorage.setItem(
      `${PROFILE_KEY_PREFIX}${uid}`,
      JSON.stringify(profile)
    );
  };

  const detectSubscription = (data) => {
    const now = new Date();
    const expiresAt = data.subscription_expires_at?.toDate?.();
    return expiresAt && expiresAt > now ? "Premium" : "Free";
  };

  const fetchProfileFromFirestore = async (uid, role) => {
    let collection = "users";
    if (role === "consultant") collection = "consultants";
    if (role === "admin") collection = "admin";

    const snap = await getDoc(doc(db, collection, uid));
    if (!snap.exists()) return null;

    const data = snap.data();
    return { uid, ...data, subscription_type: detectSubscription(data) };
  };

  const subscribeToProfile = (uid, role) => {
    let collection = "users";
    if (role === "consultant") collection = "consultants";
    if (role === "admin") collection = "admin";

    return onSnapshot(doc(db, collection, uid), (snap) => {
      if (snap.exists()) {
        saveProfile(uid, { uid, ...snap.data() });
      }
    });
  };

  /* ================= LOGIN ================= */
  const login = async () => {
    const e = String(email || "").trim();
    const p = String(password || "");

    if (!e) return showToast("Please enter your email.", "error");
    if (!EMAIL_REGEX.test(e))
      return showToast("Please enter a valid email.", "error");
    if (!p) return showToast("Please enter your password.", "error");
    if (p.length < 6)
      return showToast("Password must be at least 6 characters.", "error");

    try {
      const credential = await signInWithEmailAndPassword(auth, e, p);
      const uid = credential.user.uid;

      const profile = await fetchProfileFromFirestore(uid, initialRole);
      if (!profile) {
        showToast("No profile found. Please register your account first.", "error");
        return;
      }

      if (initialRole === "consultant") {
        if (profile.status === "pending") {
          showToast("Pending approval. Please wait for admin approval.", "info");
          return;
        }
        if (profile.status === "rejected") {
          showToast("Registration cancelled. Please contact admin.", "error");
          return;
        }
      }

      await AsyncStorage.setItem("aestheticai:current-user-id", uid);
      await AsyncStorage.setItem("aestheticai:current-user-role", initialRole);

      if (initialRole === "user") {
        await AsyncStorage.setItem("userUid", uid);
      } else if (initialRole === "consultant") {
        await AsyncStorage.setItem("consultantUid", uid);
      }

      await cacheUserRole(uid, initialRole);
      await saveProfile(uid, profile);

      unsubscribeProfileRef.current = subscribeToProfile(uid, initialRole);

      const displayName = profile.fullName || profile.name || "User";
      showToast(`Login successful. Welcome back, ${displayName}!`, "success", 1400);

      setTimeout(() => {
        if (initialRole === "user") {
          router.replace("/User/Home");
        } else {
          router.replace("/Consultant/Homepage");
        }
      }, 1400);
    } catch (err) {
      showToast("Login failed. Invalid email or password.", "error");
    }
  };

  useEffect(() => {
    return () => unsubscribeProfileRef.current?.();
  }, []);

  /* ================= UI ================= */
  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />

      {/* ✅ ADDED: KeyboardAvoidingView makes screen move up when keyboard opens */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled" // ✅ ADDED
          keyboardDismissMode="on-drag" // ✅ ADDED
        >
          <View style={styles.header}>
            <Image
              source={require("../assets/new_background.jpg")}
              style={styles.image}
            />

            <TouchableOpacity
              onPress={() => router.push("/")}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </TouchableOpacity>

            <View style={styles.headerTextContainer}>
              <Text style={styles.title}>Welcome Back</Text>

              <Text style={styles.subtitle}>
                Sign in to continue as{" "}
                <Text style={styles.roleHighlight}>{roleLabel}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.content}>
            <Text style={styles.sectionLabel}>Account Information</Text>

            <Input
              placeholder="Email"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Input
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity onPress={() => router.push("/ForgotPassword")}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            <Button title="Login" onPress={login} />

            <View style={{ marginTop: 20, alignItems: "center" }}>
              <TouchableOpacity onPress={goToRegister}>
                <Text style={{ color: "#01579B", fontWeight: "700" }}>
                  Create an account
                </Text>
              </TouchableOpacity>
            </View>

            {/* ✅ ADDED: extra space so last elements aren’t covered by keyboard */}
            <View style={{ height: 30 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ✅ TOAST OVERLAY (TOP, NO OK BUTTON) */}
      {toast.visible && (
        <View
          pointerEvents="none"
          style={[
            styles.toast,
            toast.type === "success" && styles.toastSuccess,
            toast.type === "error" && styles.toastError,
            toast.type === "info" && styles.toastInfo,
          ]}
        >
          <Text style={styles.toastText}>{toast.text}</Text>
        </View>
      )}
    </View>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  header: { height: 360 },
  image: { width: "100%", height: "100%" },

  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
  },

  headerTextContainer: {
    position: "absolute",
    top: "50%",
    alignSelf: "center",
    alignItems: "center",
  },

  title: { fontSize: 30, fontWeight: "800", color: "#fff" },
  subtitle: { fontSize: 14, color: "#eee", marginTop: 6 },

  roleHighlight: {
    color: "#F3F9FA",
    fontWeight: "700",
    letterSpacing: 0.5,
    fontSize: 18,
  },

  content: {
    flex: 1,
    marginTop: -65,
    padding: 40,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
  },

  sectionLabel: { fontSize: 15, fontWeight: "600", marginBottom: 10 },

  forgotText: {
    color: "#912f56",
    fontWeight: "600",
    fontSize: 13,
    marginBottom: 16,
  },

  /* ===== TOAST (TOP, NO OK) ===== */
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    top: Platform.OS === "ios" ? 58 : 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    opacity: 0.96,
    elevation: 10,
    zIndex: 9999,
  },
  toastText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },
  toastInfo: { backgroundColor: "#0F172A" },
  toastSuccess: { backgroundColor: "#16A34A" },
  toastError: { backgroundColor: "#DC2626" },
});
