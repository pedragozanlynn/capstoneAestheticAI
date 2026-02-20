import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
} from "react-native";
import { auth, db } from "../config/firebase";
import Button from "./components/Button";
import CenterMessageModal from "./components/CenterMessageModal";

/* ================= CONSTANTS ================= */
const ROLE_KEY_PREFIX = "aestheticai:user-role:";
const PROFILE_KEY_PREFIX = "aestheticai:user-profile:";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialRole = params.role || "user";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  // ✅ UI-only: focus styling (content inputs)
  const [focusField, setFocusField] = useState(null); // "email" | "password" | null


  const unsubscribeProfileRef = useRef(null);

  /* ===========================
     ✅ CENTER MESSAGE MODAL (component-based)
     =========================== */
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  const showMessage = (type = "info", title = "", body = "", autoHideMs = 1800) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}

    setMsgType(String(type || "info"));
    setMsgTitle(String(title || ""));
    setMsgBody(String(body || ""));
    setMsgVisible(true);

    if (autoHideMs && autoHideMs > 0) {
      msgTimerRef.current = setTimeout(() => setMsgVisible(false), autoHideMs);
    }
  };

  const closeMessage = () => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setMsgVisible(false);
  };

  useEffect(() => {
    return () => {
      try {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      } catch {}
    };
  }, []);

  /* ================= ROLE LABEL ================= */
  const roleLabel = useMemo(
    () => (initialRole === "consultant" ? "Consultant" : "User"),
    [initialRole]
  );

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
    await AsyncStorage.setItem(`${PROFILE_KEY_PREFIX}${uid}`, JSON.stringify(profile));
  };

  const detectSubscription = (data) => {
    const now = new Date();
    const expiresAt = data.subscription_expires_at?.toDate?.();
    return expiresAt && expiresAt > now ? "Premium" : "Free";
  };

  const fetchProfileFromFirestore = async (uid, role) => {
    let collectionName = "users";
    if (role === "consultant") collectionName = "consultants";
    if (role === "admin") collectionName = "admin";

    const snap = await getDoc(doc(db, collectionName, uid));
    if (!snap.exists()) return null;

    const data = snap.data();
    return { uid, ...data, subscription_type: detectSubscription(data) };
  };

  const subscribeToProfile = (uid, role) => {
    let collectionName = "users";
    if (role === "consultant") collectionName = "consultants";
    if (role === "admin") collectionName = "admin";

    return onSnapshot(doc(db, collectionName, uid), (snap) => {
      if (snap.exists()) {
        saveProfile(uid, { uid, ...snap.data() });
      }
    });
  };

  const mapAuthError = (code) => {
    const c = String(code || "");
    if (c.includes("auth/invalid-email")) return "Invalid email format.";
    if (c.includes("auth/user-not-found")) return "Account not found.";
    if (c.includes("auth/wrong-password")) return "Incorrect password.";
    if (c.includes("auth/invalid-credential")) return "Invalid email or password.";
    if (c.includes("auth/too-many-requests")) return "Too many attempts. Please try again later.";
    return "Login failed. Please try again.";
  };

  const login = async () => {
    if (loggingIn) return;

    const e = String(email || "").trim();
    const p = String(password || "");

    if (!e) return showMessage("error", "Missing field", "Please enter your email.");
    if (!EMAIL_REGEX.test(e))
      return showMessage("error", "Invalid email", "Please enter a valid email.");
    if (!p) return showMessage("error", "Missing field", "Please enter your password.");
    if (p.length < 6)
      return showMessage("error", "Invalid password", "Password must be at least 6 characters.");

    setLoggingIn(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, e, p);
      const uid = credential.user.uid;

      const profile = await fetchProfileFromFirestore(uid, initialRole);
      if (!profile) {
        showMessage(
          "error",
          "No profile",
          "No profile found. Please register your account first.",
          2000
        );
        return;
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

      try {
        unsubscribeProfileRef.current = subscribeToProfile(uid, initialRole);
      } catch {}

      if (initialRole === "consultant") {
        const s = String(profile.status || "").trim().toLowerCase();
        const status = s || "pending";

        if (status === "pending" || status === "rejected") {
          showMessage(
            status === "pending" ? "info" : "error",
            status === "pending" ? "Pending approval" : "Application rejected",
            status === "pending"
              ? "Your application is pending. Redirecting…"
              : "Your application was rejected. Redirecting…",
            900
          );

          setTimeout(() => {
            router.replace("/Consultant/PendingApproval");
          }, 900);

          return;
        }
      }

      const displayName = profile.fullName || profile.name || "User";
      showMessage("success", "Login successful", `Welcome back, ${displayName}!`, 900);

      setTimeout(() => {
        if (initialRole === "user") {
          router.replace("/User/Home");
        } else {
          router.replace("/Consultant/Homepage");
        }
      }, 900);
    } catch (err) {
      const msg = mapAuthError(err?.code);
      showMessage("error", "Login failed", msg, 2000);
    } finally {
      setLoggingIn(false);
    }
  };

  useEffect(() => {
    return () => unsubscribeProfileRef.current?.();
  }, []);

  /* ================= UI ================= */
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <Image source={require("../assets/new_background.jpg")} style={styles.image} />

            <View style={styles.headerOverlay} />

            <TouchableOpacity onPress={() => router.push("/")} style={styles.backButton}>
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </TouchableOpacity>

            <View style={styles.headerTextContainer}>
              <Text style={styles.title}>Welcome Back</Text>

              <Text style={styles.subtitle}>
                Sign in to continue as <Text style={styles.roleHighlight}>{roleLabel}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.content}>
          <View style={styles.sectionHeader}>
  <View style={styles.sectionHeaderLeft}>
    <View style={styles.sectionBadge}>
      <Ionicons name="person-circle-outline" size={18} color="#111827" />
    </View>
    <View>
      <Text style={styles.sectionLabel}>Account Information</Text>
      <Text style={styles.sectionSubLabel}>Enter your credentials to continue</Text>
    </View>
  </View>

  <View style={styles.sectionDivider} />
</View>

            <View style={[styles.inputBox, focusField === "email" && styles.inputBoxFocused]}>
              <Ionicons
                name="mail-outline"
                size={18}
                color={focusField === "email" ? "#0F766E" : "#64748B"}
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Email"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={styles.inputText}
                onFocus={() => setFocusField("email")}
                onBlur={() => setFocusField(null)}
              />
            </View>

            <View style={[styles.inputBox, focusField === "password" && styles.inputBoxFocused]}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={focusField === "password" ? "#0F766E" : "#64748B"}
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                style={styles.inputText}
                onFocus={() => setFocusField("password")}
                onBlur={() => setFocusField(null)}
              />

              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => router.push("/ForgotPassword")}
              activeOpacity={0.85}
              style={styles.linkPill}
            >
              <Ionicons name="help-circle" size={18} color="#2C4F4F" />
              <Text style={styles.linkPillText}>Forgot Password?</Text>
            </TouchableOpacity>

            <Button
              title={loggingIn ? "Logging in..." : "Login"}
              onPress={login}
              disabled={loggingIn}
            />

            {/* ✅ ONLY CHANGE: Create an account -> OUTLINE BUTTON */}
            <View style={styles.createAccountWrap}>
              <TouchableOpacity
                onPress={goToRegister}
                disabled={loggingIn}
                activeOpacity={0.85}
                style={[styles.outlineButton, loggingIn && styles.outlineButtonDisabled]}
              >
                <Ionicons name="person-add" size={18} color="#2C4F4F" />
                <Text style={styles.outlineButtonText}>Create an account</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 30 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CenterMessageModal
        visible={msgVisible}
        type={msgType}
        title={msgTitle}
        body={msgBody}
        onClose={closeMessage}
      />
    </View>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  header: {
    height: 390,
    marginTop: Platform.OS === "android" ? -(StatusBar.currentHeight || 0) : 0,
    overflow: "hidden",
    backgroundColor: "#000",
  },

  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
    transform: [{ translateY: -30 }],
  },

  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },

  backButton: {
    position: "absolute",
    top: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 55 : 95,
    left: 18,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
  },

  headerTextContainer: {
    position: "absolute",
    top: "50%",
    alignSelf: "center",
    alignItems: "center",
  },

  title: { fontSize: 34, fontWeight: "800", color: "#fff" },
  subtitle: { fontSize: 16, color: "rgba(255,255,255,0.92)", marginTop: 6 },
  roleHighlight: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },

  content: {
    flex: 1,
    marginTop: -60,
    paddingHorizontal: 28,
    paddingTop: 44,
    paddingBottom: 28,
    backgroundColor: "#FAF9F6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -6 },
    elevation: 6,
  },
  sectionHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  
  sectionBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  
  sectionLabel: {
    fontSize: 16,
    fontWeight: "900",
    color: "#2C4F4F",
  },
  
  sectionSubLabel: {
    marginTop: 2,
    fontSize: 12.5,
    color: "#6B7280",
    fontWeight: "600",
  },
  
  sectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
    marginLeft: 12,
  },
  
  sectionLabel: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 14,
    color: "#111827",
  },

  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 14,
    height: 60,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  inputBoxFocused: {
    borderColor: "#0F766E",
    shadowOpacity: 0.08,
  },

  inputIcon: { marginRight: 12 },

  inputText: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    fontWeight: "600",
  },

  eyeBtn: { paddingLeft: 10, paddingVertical: 8 },

  createAccountWrap: { marginTop: 20, alignItems: "center" },

  linkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderColor: "rgba(145,47,86,0.18)",
  },
  linkPillText: {
    color: "#2C4F4F",
    fontWeight: "800",
    fontSize: 14,
  },

  /* ✅ OUTLINE BUTTON styles (only for Create an account) */
  outlineButton: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2C4F4F",
    backgroundColor: "transparent",
  },
  outlineButtonDisabled: {
    opacity: 0.55,
  },
  outlineButtonText: {
    color: "#2C4F4F",
    fontWeight: "600",
    fontSize: 15,
    letterSpacing: 0.2,
  },
});
