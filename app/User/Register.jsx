import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import {
  auth,
  createUserWithEmailAndPassword,
  db,
  updateProfile,
} from "../../config/firebase";

import { cacheUserRole } from "../../config/userCache";
import Button from "../components/Button";
import Input from "../components/Input";
import PolicyModal from "../components/PolicyModal";
import Screen from "../components/Screen";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const router = useRouter();
  const role = "user";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [policyVisible, setPolicyVisible] = useState(false);

  /* ✅ GENDER STATE (ADDED ONLY) */
  const [gender, setGender] = useState(null); // "Male" | "Female"

  /* ===========================
     ✅ TOAST (TOP POSITION)
     ✅ NO OK BUTTON
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

  const validate = () => {
    const n = String(name || "").trim();
    const e = String(email || "").trim();

    if (!n) {
      showToast("Please enter your name.", "error");
      return false;
    }
    if (!EMAIL_REGEX.test(e)) {
      showToast("Enter a valid email address.", "error");
      return false;
    }
    if (password.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return false;
    }
    if (password !== confirm) {
      showToast("Passwords do not match.", "error");
      return false;
    }
    if (!gender) {
      showToast("Please select your gender.", "error");
      return false;
    }
    if (!agree) {
      showToast("Please agree to the Terms & Conditions.", "info");
      return false;
    }
    return true;
  };

  const register = async () => {
    if (!validate()) return;

    try {
      const cleanEmail = String(email || "").trim();
      const cleanName = String(name || "").trim();

      const credential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      await updateProfile(credential.user, { displayName: cleanName });

      const profile = {
        uid: credential.user.uid,
        name: cleanName,
        email: cleanEmail,
        gender, // ✅ SAVED
        role,
        subscription_type: "Free",
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, "users", credential.user.uid), profile);
      await cacheUserRole(credential.user.uid, role);

      // ✅ success message (toast)
      showToast("Account created successfully!", "success", 1800);

      setTimeout(() => {
        router.replace("/Login");
      }, 1800);
    } catch (error) {
      const msg = String(error?.message || "");

      // ✅ friendlier common auth errors (still minimal)
      if (msg.toLowerCase().includes("email-already-in-use")) {
        showToast("This email is already registered.", "error");
      } else if (msg.toLowerCase().includes("invalid-email")) {
        showToast("Invalid email address.", "error");
      } else if (msg.toLowerCase().includes("weak-password")) {
        showToast("Password is too weak. Use at least 6 characters.", "error");
      } else {
        showToast("Registration failed. Please try again.", "error");
      }
    }
  };

  return (
    <Screen style={styles.screen}>
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

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER (UNCHANGED) */}
        <View style={styles.header}>
          <Image
            source={require("../../assets/new_background.jpg")}
            style={styles.image}
          />
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Create Account</Text>
            <Text style={styles.headerSubtitle}>Join us today to get started</Text>
          </View>
        </View>

        {/* CONTENT */}
        <View style={styles.content}>
          {/* ACCOUNT INFO */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Personal Details</Text>

            <Input placeholder="Username" value={name} onChangeText={setName} />
            <Input
              placeholder="Email Address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
            />
            <Input
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Input
              placeholder="Confirm Password"
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
            />
          </View>

          {/* GENDER */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Gender</Text>

            <View style={styles.genderRow}>
              {/* MALE */}
              <TouchableOpacity
                style={[styles.genderBtn, gender === "Male" && styles.genderMaleActive]}
                onPress={() => setGender("Male")}
              >
                <Ionicons
                  name="male"
                  size={18}
                  color={gender === "Male" ? "#fff" : "#555"}
                />
                <Text
                  style={[styles.genderText, gender === "Male" && { color: "#fff" }]}
                >
                  Male
                </Text>
              </TouchableOpacity>

              {/* FEMALE */}
              <TouchableOpacity
                style={[
                  styles.genderBtn,
                  gender === "Female" && styles.genderFemaleActive,
                ]}
                onPress={() => setGender("Female")}
              >
                <Ionicons
                  name="female"
                  size={18}
                  color={gender === "Female" ? "#fff" : "#555"}
                />
                <Text
                  style={[
                    styles.genderText,
                    gender === "Female" && { color: "#fff" },
                  ]}
                >
                  Female
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* TERMS */}
          <View style={styles.section}>
            <View style={styles.agreementRow}>
              <Switch
                value={agree}
                onValueChange={(val) => {
                  if (!val) return setAgree(false);
                  setPolicyVisible(true);
                }}
              />
              <Text style={styles.agreementText}>
                I agree to the Terms & Conditions
              </Text>
            </View>
          </View>

          {/* ACTIONS */}
          <View style={styles.section}>
            <Button title="Register" onPress={register} />
            <TouchableOpacity
              onPress={() => router.replace("/Login")}
              style={styles.footerLink}
            >
              <Text style={styles.footer}>Already have an account? Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <PolicyModal
        visible={policyVisible}
        onClose={() => setPolicyVisible(false)}
        onAccept={() => setAgree(true)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#faf9f6",
    paddingHorizontal: 0,
  },
  scroll: { paddingBottom: 40 },

  header: {
    width: "100%",
    height: 360,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
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
    top: "38%",
    left: 0,
    right: 0,
    transform: [{ translateY: -30 }],
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  headerSubtitle: {
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
    paddingHorizontal: 32,
    paddingTop: 32,
    marginTop: -160,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },

  section: {
    marginBottom: 28,
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

  input: {
    width: "100%",
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dce3ea",
    fontSize: 15,
    marginBottom: 12,
    color: "#2c3e50",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },

  /* ===== GENDER STYLES ===== */
  genderRow: {
    flexDirection: "row",
    gap: 12,
  },

  genderBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dce3ea",
    backgroundColor: "#fff",
  },

  /* MALE ACTIVE */
  genderMaleActive: {
    backgroundColor: "#2c4f4f", // DARK TEAL
    borderColor: "#2c4f4f",
  },

  /* FEMALE ACTIVE */
  genderFemaleActive: {
    backgroundColor: "#8f2f52", // FEMALE COLOR
    borderColor: "#8f2f52",
  },

  genderText: {
    marginLeft: 8,
    fontWeight: "700",
    color: "#555",
  },

  agreementRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -20,
    marginBottom: -40,
  },
  agreementText: {
    color: "#912f56",
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
    fontWeight: "600",
  },

  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    marginBottom: 16,
  },
  line: { flex: 1, height: 1, backgroundColor: "#d0d7d4" },
  orText: {
    marginHorizontal: 10,
    color: "#5f7268",
    fontWeight: "600",
    fontSize: 12,
  },
  footerLink: { marginTop: 24 },
  footer: {
    textAlign: "center",
    color: "#2c4f4f",
    fontWeight: "600",
    fontSize: 14,
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
