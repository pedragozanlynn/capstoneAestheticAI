import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useRef, useState } from "react";
import {
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  auth,
  createUserWithEmailAndPassword,
  db,
  updateProfile,
} from "../../config/firebase";

import { cacheUserRole } from "../../config/userCache";
import Button from "../components/Button";
import CenterMessageModal from "../components/CenterMessageModal";
import PolicyModal from "../components/PolicyModal";

/** ✅ Security adds (related only) */
import { sendEmailVerification } from "firebase/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** ✅ Strong password: 8+ chars, uppercase, lowercase, number, symbol */
const STRONG_PASS_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

export default function Register() {
  const router = useRouter();
  const role = "user";

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // UI states
  const [agree, setAgree] = useState(false);
  const [policyVisible, setPolicyVisible] = useState(false);
  const [gender, setGender] = useState(null); // "Male" | "Female"

  /** ✅ Age confirmation (18+) */
  const [adultConfirmed, setAdultConfirmed] = useState(false);

  // Password visibility
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Message modal states
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgAutoHideMsRef = useRef(2200);

  const showMessage = (type = "info", title = "", body = "", autoHideMs = 2200) => {
    setMsgType(String(type || "info"));
    setMsgTitle(String(title || ""));
    setMsgBody(String(body || ""));
    msgAutoHideMsRef.current = autoHideMs;
    setMsgVisible(true);
  };

  const closeMessage = () => setMsgVisible(false);

  // Validation (same logic + security-related only)
  const validate = () => {
    const n = String(name || "").trim();
    const e = String(email || "").trim().toLowerCase(); // ✅ normalize email
    const p = String(password || "");
    const c = String(confirm || "");

    if (!n) return showMessage("error", "Missing field", "Please enter your name."), false;

    // ✅ optional: basic name sanity (still minimal)
    if (n.length < 2)
      return showMessage("error", "Invalid name", "Name must be at least 2 characters."), false;

    if (!EMAIL_REGEX.test(e))
      return showMessage("error", "Invalid email", "Enter a valid email address."), false;

    // ✅ stronger password requirement
    if (!STRONG_PASS_REGEX.test(p))
      return (
        showMessage(
          "error",
          "Weak password",
          "Use 8+ chars with uppercase, lowercase, number, and symbol."
        ),
        false
      );

    if (p !== c)
      return showMessage("error", "Password mismatch", "Passwords do not match."), false;

    if (!gender)
      return showMessage("error", "Missing field", "Please select your gender."), false;

    /** ✅ Age confirmation required */
    if (!adultConfirmed)
      return (
        showMessage("info", "Age confirmation required", "Please confirm you are at least 18 years old."),
        false
      );

    if (!agree)
      return (
        showMessage("info", "Agreement required", "Please agree to the Terms & Conditions."),
        false
      );

    return true;
  };

  // Register (same logic + security-related only)
  const register = async () => {
    if (!validate()) return;

    try {
      const cleanEmail = String(email || "").trim().toLowerCase(); // ✅ normalize email
      const cleanName = String(name || "").trim();

      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);

      await updateProfile(credential.user, { displayName: cleanName });

      // ✅ email verification
      await sendEmailVerification(credential.user);

      const profile = {
        uid: credential.user.uid,
        name: cleanName,
        nameLower: cleanName.toLowerCase(), // ✅ useful for search
        email: cleanEmail,
        gender,
        role,
        subscription_type: "Free",
        status: "active", // ✅ basic user status

        /** ✅ Age confirmation fields */
        isAdultConfirmed: true,
        ageConfirmationAt: serverTimestamp(),

        termsAcceptedAt: serverTimestamp(), // ✅ policy acceptance timestamp
        termsVersion: "v1", // ✅ track policy version
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(), // ✅ audit field
      };

      await setDoc(doc(db, "users", credential.user.uid), profile);
      await cacheUserRole(credential.user.uid, role);

      // ✅ message updated for verification (security-related)
      showMessage(
        "success",
        "Register Success",
        "Welcome to AestheticAI  ",
        2200
      );

      setTimeout(() => {
        router.replace("/Login");
      }, 2200);
    } catch (error) {
      // ✅ use error.code (reliable)
      const code = String(error?.code || "");

      if (code === "auth/email-already-in-use") {
        showMessage("error", "Registration failed", "This email is already registered.");
      } else if (code === "auth/invalid-email") {
        showMessage("error", "Registration failed", "Invalid email address.");
      } else if (code === "auth/weak-password") {
        showMessage(
          "error",
          "Registration failed",
          "Password is too weak. Use 8+ characters with uppercase, lowercase, number, and symbol."
        );
      } else {
        showMessage("error", "Registration failed", "Please try again.");
      }
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          <Image source={require("../../assets/new_background.jpg")} style={styles.image} />
          <View style={styles.headerOverlay} />

          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Create Account</Text>
            <Text style={styles.headerSubtitle}>Join us today to get started</Text>
          </View>
        </View>

        {/* CONTENT CARD */}
        <View style={styles.content}>
          {/* PERSONAL DETAILS */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Personal Details</Text>

            {/* Username */}
            <View style={styles.inputBox}>
              <Ionicons name="person-outline" size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                placeholder="Username"
                placeholderTextColor="#94A3B8"
                value={name}
                onChangeText={setName}
                style={styles.inputText}
              />
            </View>

            {/* Email */}
            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                placeholder="Email Address"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={styles.inputText}
              />
            </View>

            {/* Password */}
            <View style={styles.inputBox}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color="#64748B"
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPass}
                value={password}
                onChangeText={setPassword}
                style={styles.inputText}
              />
              <TouchableOpacity
                onPress={() => setShowPass((v) => !v)}
                style={styles.eyeBtn}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={showPass ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>

            {/* Confirm Password */}
            <View style={styles.inputBox}>
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color="#64748B"
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Confirm Password"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showConfirm}
                value={confirm}
                onChangeText={setConfirm}
                style={styles.inputText}
              />
              <TouchableOpacity
                onPress={() => setShowConfirm((v) => !v)}
                style={styles.eyeBtn}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={showConfirm ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* GENDER */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Gender</Text>

            <View style={styles.genderRow}>
              <TouchableOpacity
                style={[styles.genderBtn, gender === "Male" && styles.genderMaleActive]}
                onPress={() => setGender("Male")}
                activeOpacity={0.9}
              >
                <Ionicons name="male" size={18} color={gender === "Male" ? "#fff" : "#555"} />
                <Text style={[styles.genderText, gender === "Male" && styles.genderTextActive]}>
                  Male
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.genderBtn, gender === "Female" && styles.genderFemaleActive]}
                onPress={() => setGender("Female")}
                activeOpacity={0.9}
              >
                <Ionicons name="female" size={18} color={gender === "Female" ? "#fff" : "#555"} />
                <Text style={[styles.genderText, gender === "Female" && styles.genderTextActive]}>
                  Female
                </Text>
              </TouchableOpacity>
            </View>
          </View>
           {/* ✅ AGREEMENTS moved BELOW Register + checkbox style */}
           <View style={styles.checkBlock}>
              {/* Age confirm checkbox */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.checkRow}
                onPress={() => setAdultConfirmed((v) => !v)}
              >
                <View style={[styles.checkbox, adultConfirmed && styles.checkboxChecked]}>
                  {adultConfirmed && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>
                <Text style={styles.checkText}>
                  I confirm that I am at least{" "}
                  <Text style={styles.checkBold}>18 years old</Text>
                </Text>
              </TouchableOpacity>

              {/* Terms checkbox (opens modal on check) */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.checkRow}
                onPress={() => {
                  if (agree) return setAgree(false);
                  setPolicyVisible(true);
                }}
              >
                <View style={[styles.checkbox, agree && styles.checkboxChecked]}>
                  {agree && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>
                <Text style={styles.checkText}>
                  I agree to the{" "}
                  <Text style={[styles.checkBold, styles.checkLink]}>Terms &amp; Conditions</Text>
                </Text>
              </TouchableOpacity>
            </View>

          {/* ACTIONS */}
          <View style={styles.section}>
            <Button title="Register" onPress={register} />

           

            <TouchableOpacity
              onPress={() => router.replace("/Login")}
              activeOpacity={0.85}
              style={styles.footerPill}
            >
              <Ionicons name="log-in" size={20} color="#2C4F4F" />
              <Text style={styles.footerPillText}>
                Already have an account? <Text style={styles.footerPillTextStrong}> Login</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <PolicyModal
        visible={policyVisible}
        onClose={() => setPolicyVisible(false)}
        onAccept={() => {
          setAgree(true);
          setPolicyVisible(false);
        }}
        variant="user"
      />

      <CenterMessageModal
        visible={msgVisible}
        type={msgType}
        title={msgTitle}
        body={msgBody}
        autoHideMs={msgAutoHideMsRef.current}
        onClose={closeMessage}
      />
    </SafeAreaView>
  );
}

// ... same imports and code above (NO CHANGES) ...

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAF9F6" },
  scroll: { paddingBottom: 40 },

  /* HEADER */
  header: { width: "100%", height: 360, position: "relative", overflow: "hidden" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  headerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },

  backButton: {
    position: "absolute",
    top: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 18 : 50,
    left: 18,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
  },

  headerTextContainer: {
    position: "absolute",
    top: 140,
    left: 0,
    right: 0,
    alignItems: "center",
    transform: [{ translateY: -20 }],
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
  },

  /* ✅ CONTENT */
  content: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: 30,
    paddingBottom: 28,
    marginTop: -150,
    backgroundColor: "#FAF9F6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },

  section: { marginBottom: 10 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#2C4F4F",
    marginBottom: 12,
    marginLeft: 6,
    letterSpacing: 0.2,
  },

  /* INPUTS */
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
    height: 54,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  inputIcon: { marginRight: 12 },
  inputText: { flex: 1, fontSize: 16, fontWeight: "600", color: "#111827" },
  eyeBtn: { paddingLeft: 10, paddingVertical: 8 },

  /* GENDER */
  genderRow: { flexDirection: "row", gap: 10 },
  genderBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE3EA",
    backgroundColor: "#FFFFFF",
  },
  genderMaleActive: { backgroundColor: "#2C4F4F", borderColor: "#2C4F4F" },
  genderFemaleActive: { backgroundColor: "#8F2F52", borderColor: "#8F2F52" },
  genderText: { marginLeft: 8, fontWeight: "800", color: "#555" },
  genderTextActive: { color: "#FFFFFF" },

  /* ✅ Checkbox block */
  checkBlock: {
    padding: 12,
   
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#2C4F4F",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: "#2C4F4F",
  },
  checkText: {
    flex: 1,
    color: "#2C4F4F",
    fontWeight: "700",
    lineHeight: 18,
    fontSize: 13.5,
  },
  checkBold: {
    fontWeight: "900",
  },
  checkLink: {
    textDecorationLine: "underline",
  },

  /* FOOTER */
  footer: { textAlign: "center", color: "#2C4F4F", fontWeight: "700", fontSize: 14 },
  footerPill: {
    marginTop: 10,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 60,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2C4F4F",
    backgroundColor: "transparent",
  },
  footerPillText: {
    paddingHorizontal: 10,
    color: "#2C4F4F",
    fontWeight: "700",
    fontSize: 14,
  },
  footerPillTextStrong: {
    fontWeight: "900",
  },
});
