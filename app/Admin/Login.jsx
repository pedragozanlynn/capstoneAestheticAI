// app/Admin/Login.jsx
// ✅ StatusBar blends with header image (transparent + header underlays it)
// ✅ Button is ALWAYS clickable (not disabled by empty inputs)
// ✅ Still blocks submit while loading (submitting)
// ✅ Validation runs on press (Alert), and inline errors still appear after blur

import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../../config/firebase";
import CenterMessageModal from "../components/CenterMessageModal";

/* =========================
   HELPERS
========================= */
const safeStr = (v) => (v == null ? "" : String(v).trim());
const normalizeEmail = (v) => safeStr(v).toLowerCase();

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));
const passwordMeetsMin = (v) => safeStr(v).length >= 6;

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  const [centerModal, setCenterModal] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
    nextRoute: null,
  });

  /* =========================
     INLINE ERRORS (after blur)
  ========================= */
  const emailError = useMemo(() => {
    if (!touched.email) return "";
    const e = normalizeEmail(email);
    if (!e) return "Email is required.";
    if (!isValidEmail(e)) return "Please enter a valid email address.";
    return "";
  }, [email, touched.email]);

  const passwordError = useMemo(() => {
    if (!touched.password) return "";
    const p = safeStr(password);
    if (!p) return "Password is required.";
    if (!passwordMeetsMin(p)) return "Password must be at least 6 characters.";
    return "";
  }, [password, touched.password]);

  /* =========================
     MODAL HELPERS
  ========================= */
  const openModal = useCallback((type, title, message, nextRoute = null) => {
    setCenterModal({
      visible: true,
      type,
      title: String(title || ""),
      message: String(message || ""),
      nextRoute,
    });
  }, []);

  const closeModal = useCallback(() => {
    setCenterModal((m) => {
      const next = m.nextRoute;
      const updated = { ...m, visible: false, nextRoute: null };
      if (next) setTimeout(() => router.replace(next), 200);
      return updated;
    });
  }, [router]);

  const markAllTouched = useCallback(() => {
    setTouched({ email: true, password: true });
  }, []);

  /* =========================
     LOGIN
  ========================= */
  const handleAdminLogin = useCallback(async () => {
    markAllTouched();

    const e = normalizeEmail(email);
    const p = safeStr(password);

    // ✅ validation on press (button not disabled when empty)
    if (!e || !p) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }
    if (!isValidEmail(e)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }
    if (!passwordMeetsMin(p)) {
      Alert.alert("Invalid password", "Password must be at least 6 characters.");
      return;
    }

    if (submitting) return;
    setSubmitting(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, e, p);
      const uid = userCredential.user.uid;

      const adminSnap = await getDoc(doc(db, "admin", uid));

      if (adminSnap.exists()) {
        openModal("success", "Success", "Admin login successful!", "/Admin/Dashboard");
      } else {
        openModal("error", "Unauthorized", "You are not authorized as admin.");
      }
    } catch (error) {
      console.error(error);

      const code = String(error?.code || "");
      let message = "Something went wrong. Please try again.";

      if (code === "auth/invalid-email") message = "Invalid email format.";
      else if (code === "auth/missing-password") message = "Password is required.";
      else if (code === "auth/user-not-found") message = "No account found for this email.";
      else if (code === "auth/wrong-password") message = "Incorrect password.";
      else if (code === "auth/invalid-credential") message = "Invalid login credentials.";
      else if (code === "auth/too-many-requests")
        message = "Too many attempts. Please try again later.";
      else if (error?.message) message = String(error.message);

      openModal("error", "Login Failed", message);
    } finally {
      setSubmitting(false);
    }
  }, [email, password, submitting, markAllTouched, openModal]);

  return (
    // ✅ edges includes top, but we will NOT add paddingTop here (we want header to reach status bar)
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      {/* ✅ Transparent StatusBar so header image shows behind it */}
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require("../../assets/new_background.jpg")}
              style={styles.headerImage}
            />

            {/* back button inside the header image area */}
            <TouchableOpacity
              onPress={() => router.replace("/")}
              style={styles.backButton}
              activeOpacity={0.85}
              disabled={submitting}
            >
              <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.headerTextContainer}>
              <Text style={styles.title}>Admin Login</Text>
              <Text style={styles.subtitle}>Sign in to access the dashboard</Text>
            </View>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.sectionLabel}>Account Information</Text>

            {/* Email */}
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, emailError ? styles.inputError : null]}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
                returnKeyType="next"
                placeholderTextColor="#94A3B8"
              />
              {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
            </View>

            {/* Password */}
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, passwordError ? styles.inputError : null]}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                secureTextEntry
                editable={!submitting}
                returnKeyType="done"
                onSubmitEditing={handleAdminLogin}
                placeholderTextColor="#94A3B8"
              />
              {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
            </View>

            {/* ✅ Button is clickable ALWAYS, only disabled while submitting */}
            <TouchableOpacity
              style={[styles.button, submitting ? styles.buttonDisabled : null]}
              onPress={handleAdminLogin}
              activeOpacity={0.9}
              disabled={submitting}
            >
              {submitting ? (
                <View style={styles.buttonRow}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={[styles.buttonText, styles.buttonTextLoading]}>
                    Logging in...
                  </Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        <CenterMessageModal
          visible={centerModal.visible}
          type={centerModal.type}
          title={centerModal.title}
          message={centerModal.message}
          onClose={closeModal}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: {
    flex: 1,
    backgroundColor: "#0B2E35", // fallback behind header image
  },
  scroll: { flexGrow: 1 },

  // ✅ add extra top padding so header image covers translucent status bar
  header: {
    width: "100%",
    height: 300 + (Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0),
    position: "relative",
  },
  headerImage: { width: "100%", height: "100%", resizeMode: "cover" },

  backButton: {
    position: "absolute",
    top: (Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0) + 12,
    left: 16,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
  },

  headerTextContainer: {
    position: "absolute",
    top: "52%",
    left: 0,
    right: 0,
    transform: [{ translateY: -20 }],
    alignItems: "center",
    paddingHorizontal: 18,
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },

  subtitle: {
    fontSize: 14,
    color: "#F1F5F9",
    textAlign: "center",
    fontWeight: "500",
    marginTop: 6,
    letterSpacing: 0.4,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  content: {
    flex: 1,
    paddingTop: 28,
    marginTop: -40,
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: "#FAF9F6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },

  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2C4F4F",
    marginBottom: 12,
    marginLeft: 6,
    letterSpacing: 0.3,
  },

  inputWrap: { marginBottom: 16 },

  input: {
    width: "100%",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCE3EA",
    fontSize: 14,
    color: "#1F2937",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },

  inputError: { borderColor: "#EF4444" },

  errorText: {
    marginTop: 6,
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#EF4444",
  },

  button: {
    backgroundColor: "#3fa796",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    minHeight: 50,
  },

  // ✅ only when submitting
  buttonDisabled: {
    opacity: 0.75,
  },

  buttonRow: { flexDirection: "row", alignItems: "center" },

  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.2,
  },
  buttonTextLoading: { marginLeft: 10 },
});