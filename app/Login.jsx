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
  KeyboardAvoidingView,
  Modal,
  Pressable,
} from "react-native";
import { auth, db } from "../config/firebase";
import Button from "./components/Button";
import Input from "./components/Input";

/* ================= CONSTANTS ================= */
const ROLE_KEY_PREFIX = "aestheticai:user-role:";
const PROFILE_KEY_PREFIX = "aestheticai:user-profile:";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ================= CENTER MESSAGE MODAL (same as earlier) ================= */
const MSG_COLORS = {
  info: {
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: "information-circle",
    iconColor: "#01579B",
  },
  success: {
    bg: "#ECFDF5",
    border: "#BBF7D0",
    icon: "checkmark-circle",
    iconColor: "#16A34A",
  },
  error: {
    bg: "#FEF2F2",
    border: "#FECACA",
    icon: "close-circle",
    iconColor: "#DC2626",
  },
};

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialRole = params.role || "user";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loggingIn, setLoggingIn] = useState(false);

  const unsubscribeProfileRef = useRef(null);

  /* ===========================
     ✅ MESSAGE MODAL (NO OK BUTTON)
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
    setMsgType(type);
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
    if (!EMAIL_REGEX.test(e)) return showMessage("error", "Invalid email", "Please enter a valid email.");
    if (!p) return showMessage("error", "Missing field", "Please enter your password.");
    if (p.length < 6) return showMessage("error", "Invalid password", "Password must be at least 6 characters.");

    setLoggingIn(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, e, p);
      const uid = credential.user.uid;

      const profile = await fetchProfileFromFirestore(uid, initialRole);
      if (!profile) {
        showMessage("error", "No profile", "No profile found. Please register your account first.", 2000);
        return;
      }

      // ✅ Cache basics early
      await AsyncStorage.setItem("aestheticai:current-user-id", uid);
      await AsyncStorage.setItem("aestheticai:current-user-role", initialRole);

      if (initialRole === "user") {
        await AsyncStorage.setItem("userUid", uid);
      } else if (initialRole === "consultant") {
        await AsyncStorage.setItem("consultantUid", uid);
      }

      await cacheUserRole(uid, initialRole);
      await saveProfile(uid, profile);

      // ✅ Keep profile subscription listener (optional)
      try {
        unsubscribeProfileRef.current = subscribeToProfile(uid, initialRole);
      } catch {}

      // ✅ CONSULTANT STATUS GATING
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
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <Image source={require("../assets/new_background.jpg")} style={styles.image} />

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
            <Text style={styles.sectionLabel}>Account Information</Text>

            <Input placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />

            <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />

            <TouchableOpacity onPress={() => router.push("/ForgotPassword")}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            <Button title={loggingIn ? "Logging in..." : "Login"} onPress={login} disabled={loggingIn} />

            <View style={{ marginTop: 20, alignItems: "center" }}>
              <TouchableOpacity onPress={goToRegister} disabled={loggingIn}>
                <Text style={{ color: "#01579B", fontWeight: "700" }}>Create an account</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 30 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ✅ MESSAGE MODAL OVERLAY (same style as earlier) */}
      <Modal visible={msgVisible} transparent animationType="fade" onRequestClose={closeMessage}>
        <Pressable style={styles.msgBackdrop} onPress={closeMessage}>
          <Pressable
            style={[
              styles.msgCard,
              {
                backgroundColor: (MSG_COLORS[msgType] || MSG_COLORS.info).bg,
                borderColor: (MSG_COLORS[msgType] || MSG_COLORS.info).border,
              },
            ]}
            onPress={() => {}}
          >
            <View style={styles.msgRow}>
              <Ionicons
                name={(MSG_COLORS[msgType] || MSG_COLORS.info).icon}
                size={22}
                color={(MSG_COLORS[msgType] || MSG_COLORS.info).iconColor}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                {!!msgTitle && <Text style={styles.msgTitle}>{msgTitle}</Text>}
                {!!msgBody && <Text style={styles.msgBody}>{msgBody}</Text>}
              </View>
            </View>

            <TouchableOpacity style={styles.msgClose} onPress={closeMessage} activeOpacity={0.85}>
              <Ionicons name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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

  msgBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: Platform.OS === "ios" ? 120 : 80, // ✅ mas bababa
    paddingHorizontal: 18,
  },
  
  msgCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    position: "relative",
  },
  msgRow: { flexDirection: "row", alignItems: "flex-start" },
  msgTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  msgBody: { marginTop: 3, fontSize: 13, fontWeight: "700", color: "#475569", lineHeight: 18 },
  msgClose: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
});
