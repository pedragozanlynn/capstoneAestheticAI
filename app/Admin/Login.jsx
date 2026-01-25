import React, { useMemo, useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import { Ionicons } from "@expo/vector-icons";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  // -----------------------------
  // ✅ Helpers
  // -----------------------------
  const safeStr = (v) => (v == null ? "" : String(v).trim());

  const normalizeEmail = (v) => safeStr(v).toLowerCase();

  const isValidEmail = (v) => {
    const s = normalizeEmail(v);
    // practical email check (not overly strict)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  };

  const passwordMeetsMin = (v) => safeStr(v).length >= 6;

  const emailError = useMemo(() => {
    const e = normalizeEmail(email);
    if (!touched.email) return "";
    if (!e) return "Email is required.";
    if (!isValidEmail(e)) return "Please enter a valid email address.";
    return "";
  }, [email, touched.email]);

  const passwordError = useMemo(() => {
    const p = safeStr(password);
    if (!touched.password) return "";
    if (!p) return "Password is required.";
    if (!passwordMeetsMin(p)) return "Password must be at least 6 characters.";
    return "";
  }, [password, touched.password]);

  const canSubmit = useMemo(() => {
    return (
      !submitting &&
      isValidEmail(email) &&
      passwordMeetsMin(password) &&
      safeStr(email) !== "" &&
      safeStr(password) !== ""
    );
  }, [email, password, submitting]);

  const markAllTouched = () => setTouched({ email: true, password: true });

  const handleAdminLogin = async () => {
    // ✅ inline validations first (no UI redesign changes)
    markAllTouched();

    const e = normalizeEmail(email);
    const p = safeStr(password);

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

      const adminDoc = await getDoc(doc(db, "admin", uid));

      if (adminDoc.exists()) {
        Alert.alert("Success", "Admin login successful!");
        router.replace("/Admin/Dashboard");
      } else {
        Alert.alert("Unauthorized", "You are not authorized as admin.");
      }
    } catch (error) {
      console.error(error);

      // ✅ friendly auth messages (still safe)
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

      Alert.alert("Error", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* Header with background image */}
        <View style={styles.header}>
          <Image source={require("../../assets/new_background.jpg")} style={styles.image} />

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
              onChangeText={(v) => setEmail(v)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              returnKeyType="next"
            />
            {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
          </View>

          {/* Password */}
          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, passwordError ? styles.inputError : null]}
              placeholder="Password"
              value={password}
              onChangeText={(v) => setPassword(v)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              secureTextEntry
              editable={!submitting}
              returnKeyType="done"
              onSubmitEditing={handleAdminLogin}
            />
            {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
          </View>

          <TouchableOpacity
            style={[styles.button, !canSubmit ? styles.buttonDisabled : null]}
            onPress={handleAdminLogin}
            activeOpacity={0.9}
            disabled={!canSubmit}
          >
            {submitting ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={[styles.buttonText, { marginLeft: 10 }]}>Logging in...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { width: "100%", height: 300, position: "relative" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },

  backButton: {
    position: "absolute",
    top: 50,
    left: 20,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
  },

  headerTextContainer: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    transform: [{ translateY: -20 }],
    alignItems: "center",
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
    color: "#f5f5f5",
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
    paddingTop: 32,
    marginTop: -40,
    paddingHorizontal: 40,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },

  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2c4f4f",
    marginBottom: 10,
    marginLeft: 6,
    letterSpacing: 0.3,
    paddingBottom: 2,
  },

  inputWrap: { marginBottom: 16 },

  input: {
    width: "100%",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dce3ea",
    fontSize: 14,
    color: "#2c3e50",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },

  inputError: {
    borderColor: "#EF4444",
  },

  errorText: {
    marginTop: 6,
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#EF4444",
  },

  button: {
    backgroundColor: "#0F3E48",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
