// app/Consultant/Step1Register.jsx
// ✅ FINAL FLOW:
// - HARD-STOP if email exists in Auth OR consultantEmailIndex
// - NEW email ALWAYS proceeds to Step2
// - Clears step2Data if email changes (prevents Step2/Step3 skip)
// - NO reservation write in Step1
// ✅ FIX: DO NOT wipe AsyncStorage on app relaunch (camera/picker can relaunch Expo Go)

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import CenterMessageModal from "../components/CenterMessageModal";
import PolicyModal from "../components/PolicyModal";

import { fetchSignInMethodsForEmail } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import * as Crypto from "expo-crypto";
import { auth, db } from "../../config/firebase";

/* ================= CONSTANTS ================= */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASS_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

const PROVINCES = ["Oriental Mindoro"];
const DEFAULT_PROVINCE = "Oriental Mindoro";

const OR_MIN_MUNICIPALITIES = [
  "Baco",
  "Bansud",
  "Bongabong",
  "Bulalacao",
  "Calapan City",
  "Gloria",
  "Mansalay",
  "Naujan",
  "Pinamalayan",
  "Pola",
  "Puerto Galera",
  "Roxas",
  "San Teodoro",
  "Socorro",
  "Victoria",
];

// ✅ Collection name for the DB email index
export const CONSULTANT_EMAIL_INDEX_COL = "consultantEmailIndex";

export default function Step1Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    sitio: "",
    municipality: "",
    province: "",
    password: "",
    confirmPassword: "",
    gender: "",
  });

  const [checkingEmail, setCheckingEmail] = useState(false);

  // ✅ Eye toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ✅ Privacy Policy
  const [policyVisible, setPolicyVisible] = useState(false);
  const [agreePolicy, setAgreePolicy] = useState(false);

  // ✅ Age confirmation (18+)
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  // ✅ Dropdown modals
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [muniOpen, setMuniOpen] = useState(false);

  /* ===========================
     ✅ CENTER MESSAGE MODAL STATE
     =========================== */
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  const showToast = (text, type = "info", ms = 2400) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}

    const safeType = ["info", "success", "warning", "error"].includes(String(type))
      ? String(type)
      : "info";

    setMsgType(safeType);

    const autoTitle =
      safeType === "success"
        ? "Success"
        : safeType === "error"
        ? "Error"
        : safeType === "warning"
        ? "Warning"
        : "Notice";

    setMsgTitle(autoTitle);
    setMsgBody(String(text || ""));
    setMsgVisible(true);

    if (ms && ms > 0) {
      msgTimerRef.current = setTimeout(() => setMsgVisible(false), ms);
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

  /* ===========================
     ✅ Helpers
     =========================== */
  const safeStr = (v) => String(v ?? "").trim();
  const normalizeEmail = (v) => safeStr(v).toLowerCase();
  const isStrongEnoughPassword = (pw) => STRONG_PASS_REGEX.test(String(pw || ""));

  const buildFullName = (first, middle, last) =>
    [safeStr(first), safeStr(middle), safeStr(last)].filter(Boolean).join(" ");

  const buildAddress = (sitio, municipality, province) =>
    [safeStr(sitio), safeStr(municipality), safeStr(province)].filter(Boolean).join(", ");

  const hashEmail = async (email) => {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      String(email || "").toLowerCase().trim()
    );
  };

  const submittingRef = useRef(false);

  // ✅ Persist helper (include checkbox states para consistent)
  const persistStep1 = async (nextForm, extra = {}) => {
    try {
      await AsyncStorage.setItem(
        "step1Data",
        JSON.stringify({
          ...nextForm,
          ageConfirmed:
            typeof extra.ageConfirmed === "boolean" ? extra.ageConfirmed : ageConfirmed,
          agreePolicy:
            typeof extra.agreePolicy === "boolean" ? extra.agreePolicy : agreePolicy,
        })
      );
    } catch {}
  };

  // ✅ Init: SAFE JSON.parse (auto clear if corrupted)
  // ✅ FIX: removed global.__APP_SESSION__ wipe (causes reset after camera/picker)
  useEffect(() => {
    const init = async () => {
      try {
        const saved = await AsyncStorage.getItem("step1Data");
        if (!saved) return;

        let parsed = null;
        try {
          parsed = JSON.parse(saved);
        } catch {
          await AsyncStorage.removeItem("step1Data");
          return;
        }

        const restored = {
          firstName: parsed?.firstName ?? "",
          middleName: parsed?.middleName ?? "",
          lastName: parsed?.lastName ?? "",
          email: parsed?.email ?? "",
          sitio: parsed?.sitio ?? "",
          municipality: parsed?.municipality ?? "",
          province: parsed?.province ?? "",
          password: parsed?.password ?? "",
          confirmPassword: parsed?.confirmPassword ?? "",
          gender: parsed?.gender ?? "",
        };

        setFormData(restored);
        if (typeof parsed?.ageConfirmed === "boolean") setAgeConfirmed(parsed.ageConfirmed);
        if (typeof parsed?.agreePolicy === "boolean") setAgreePolicy(parsed.agreePolicy);
      } catch (err) {
        console.error("Step1 init error:", err);
      }
    };

    init();
  }, []);

  const handleInputChange = (field, value) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    persistStep1(updated);

    // ✅ IMPORTANT:
    // kapag nagpalit ng email, i-reset step2Data para di mag-skip sa Step3
    if (field === "email") {
      AsyncStorage.removeItem("step2Data").catch(() => {});
    }
  };

  /* ===========================
     ✅ Email check (Auth)
     =========================== */
  const checkAuthEmailExists = async (emailRaw) => {
    const email = normalizeEmail(emailRaw);

    if (!EMAIL_REGEX.test(email)) {
      return { ok: false, exists: false, message: "Please enter a valid email." };
    }

    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      const exists = Array.isArray(methods) && methods.length > 0;
      return { ok: true, exists, message: "" };
    } catch (err) {
      const code = String(err?.code || "");
      console.log("checkAuthEmailExists error:", code, err?.message || err);

      if (code === "auth/network-request-failed" || code === "auth/too-many-requests") {
        return {
          ok: false,
          exists: false,
          message: "Cannot verify email. Check your internet and try again.",
        };
      }

      return {
        ok: false,
        exists: false,
        message: "Email verification failed. Please try again.",
      };
    }
  };

  /* ===========================
     ✅ Consultant DB Email Check
     - Firestore doc lookup: consultantEmailIndex/{emailHash}
     - Treat ANY existing doc as TAKEN
     =========================== */
  const checkConsultantDbEmailExists = async (emailRaw) => {
    const email = normalizeEmail(emailRaw);

    if (!EMAIL_REGEX.test(email)) {
      return { ok: false, exists: false, message: "Please enter a valid email." };
    }

    try {
      const emailHash = await hashEmail(email);
      const ref = doc(db, CONSULTANT_EMAIL_INDEX_COL, emailHash);
      const snap = await getDoc(ref);

      if (!snap.exists()) return { ok: true, exists: false, message: "" };

      const d = snap.data() || {};
      const status = String(d.status || "").toLowerCase(); // "final" or others
      return {
        ok: true,
        exists: true,
        message:
          status === "final"
            ? "Email already exists. Please use a different email."
            : "Email is already used/reserved. Please use another email.",
      };
    } catch (err) {
      const code = String(err?.code || "");
      console.log("checkConsultantDbEmailExists error:", code, err?.message || err);

      if (code === "permission-denied") {
        return {
          ok: false,
          exists: false,
          message:
            "Cannot verify email in database (permission denied). Add read access for consultantEmailIndex in Firestore rules.",
        };
      }

      return {
        ok: false,
        exists: false,
        message: "Cannot verify email in database. Check your internet and try again.",
      };
    }
  };

  /* ===========================
     ✅ Validation
     =========================== */
  const validateForm = () => {
    const firstName = safeStr(formData.firstName);
    const middleName = safeStr(formData.middleName);
    const lastName = safeStr(formData.lastName);
    const fullName = buildFullName(firstName, middleName, lastName);

    const email = normalizeEmail(formData.email);

    const sitio = safeStr(formData.sitio);
    const municipality = safeStr(formData.municipality);
    const province = safeStr(formData.province);

    const password = String(formData.password ?? "");
    const confirmPassword = String(formData.confirmPassword ?? "");
    const gender = safeStr(formData.gender);

    if (!firstName) return (showToast("First name is required.", "warning"), false);
    if (!lastName) return (showToast("Last name is required.", "warning"), false);

    if (fullName.length < 3 || /^\d+$/.test(fullName))
      return (showToast("Please enter a valid name.", "warning"), false);

    if (!email) return (showToast("Email is required.", "warning"), false);

    if (!EMAIL_REGEX.test(email))
      return (
        showToast("Please enter a valid email (example: name@gmail.com).", "warning"),
        false
      );

    if (!password) return (showToast("Password is required.", "warning"), false);

    if (!isStrongEnoughPassword(password))
      return (
        showToast(
          "Password must be 8+ characters with uppercase, lowercase, number, and symbol.",
          "warning"
        ),
        false
      );

    if (password.toLowerCase() === email.toLowerCase())
      return (showToast("Password must not be the same as your email.", "warning"), false);

    if (!confirmPassword) return (showToast("Please confirm your password.", "warning"), false);
    if (password !== confirmPassword)
      return (showToast("Passwords do not match. Please try again.", "warning"), false);

    if (!ageConfirmed)
      return (showToast("Please confirm that you are 18 years old or above.", "warning"), false);

    if (!province) return (showToast("Please select your Province/City.", "warning"), false);
    if (province !== DEFAULT_PROVINCE)
      return (
        showToast("For now, Province/City available is Oriental Mindoro only.", "warning"),
        false
      );

    if (!municipality) return (showToast("Please select your municipality.", "warning"), false);

    if (!sitio) return (showToast("Sitio/Street is required.", "warning"), false);
    if (sitio.length < 3)
      return (
        showToast("Please enter a valid Sitio/Street (at least 3 characters).", "warning"),
        false
      );

    if (!gender) return (showToast("Please select your gender.", "warning"), false);

    if (!agreePolicy)
      return (
        showToast("Please agree to the Terms & Conditions before continuing.", "warning"),
        false
      );

    return true;
  };

  /* ===========================
     ✅ Next:
     - HARD STOP if exists in DB index OR Auth
     - Otherwise ALWAYS goes to Step2
     =========================== */
  const handleNext = async () => {
    if (submittingRef.current || checkingEmail) return;
    submittingRef.current = true;

    try {
      if (!validateForm()) return;

      setCheckingEmail(true);
      showToast("Checking email…", "info", 900);

      // 1) DB index check
      const dbRes = await checkConsultantDbEmailExists(formData.email);
      if (!dbRes.ok) {
        showToast(dbRes.message || "Cannot verify email in database.", "error", 2800);
        return;
      }
      if (dbRes.exists) {
        showToast(dbRes.message || "Email already exists.", "error", 2800);
        return;
      }

      // 2) Auth check
      const authRes = await checkAuthEmailExists(formData.email);
      if (!authRes.ok) {
        showToast(authRes.message || "Cannot verify email (Auth).", "error", 2800);
        return;
      }
      if (authRes.exists) {
        showToast("Email already exists. Please use a different email.", "error", 2800);
        return;
      }

      // ✅ Normalize + PASS EVERYTHING to Step2
      const normalized = {
        ...formData,
        fullName: buildFullName(formData.firstName, formData.middleName, formData.lastName),
        email: normalizeEmail(formData.email),

        sitio: safeStr(formData.sitio),
        municipality: safeStr(formData.municipality),
        province: safeStr(formData.province),

        address: buildAddress(formData.sitio, formData.municipality, formData.province),

        ageConfirmed: !!ageConfirmed,
        agreePolicy: !!agreePolicy,

        // informational flags (optional)
        emailExists: false,
        emailExistsInDb: false,
        emailExistsInAuth: false,
      };

      // ✅ clear old Step2 cache so Step2 won't auto-skip
      await AsyncStorage.removeItem("step2Data").catch(() => {});
      await AsyncStorage.setItem("step1Data", JSON.stringify(normalized));

      router.push({
        pathname: "/Consultant/Step2Details",
        params: {
          data: JSON.stringify(normalized),
          fresh: String(Date.now()),
        },
      });
    } catch (err) {
      console.log("STEP1 NEXT ERROR:", err?.code || err?.message || err);
      showToast("Unexpected error. Please try again.", "error", 2800);
    } finally {
      setCheckingEmail(false);
      submittingRef.current = false;
    }
  };

  /* ===========================
     ✅ UI (unchanged from your design)
     =========================== */
  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
        >
          {/* HEADER */}
          <View style={styles.header}>
            <Image source={require("../../assets/new_background.jpg")} style={styles.image} />
            <View style={styles.headerOverlay} />

            <TouchableOpacity
              onPress={() => router.back()}
              style={[styles.backButton, { top: insets.top + 8 }]}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Registration</Text>
              <Text style={styles.headerSubtitle}>Step 1 – Personal Information</Text>
            </View>
          </View>

          {/* CONTENT */}
          <View style={styles.content}>
            <View style={styles.row}>
              <View style={[styles.inputBox, styles.half]}>
                <Ionicons name="person-outline" size={18} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  value={formData.firstName}
                  onChangeText={(t) => handleInputChange("firstName", t)}
                  placeholder="First name"
                  placeholderTextColor="#94A3B8"
                  style={styles.inputField}
                />
              </View>

              <View style={[styles.inputBox, styles.half]}>
                <Ionicons name="person-outline" size={18} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  value={formData.middleName}
                  onChangeText={(t) => handleInputChange("middleName", t)}
                  placeholder="Middle name"
                  placeholderTextColor="#94A3B8"
                  style={styles.inputField}
                />
              </View>
            </View>

            <View style={styles.inputBox}>
              <Ionicons name="person-outline" size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                value={formData.lastName}
                onChangeText={(t) => handleInputChange("lastName", t)}
                placeholder="Last name"
                placeholderTextColor="#94A3B8"
                style={styles.inputField}
              />
            </View>

            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                value={formData.email}
                onChangeText={(t) => handleInputChange("email", t)}
                placeholder="Email address"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.inputField}
              />
            </View>

            {/* Password */}
            <View style={styles.inputBox}>
              <Ionicons name="lock-closed-outline" size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                value={formData.password}
                onChangeText={(t) => handleInputChange("password", t)}
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPassword}
                style={styles.inputField}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                activeOpacity={0.8}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>

            {/* Confirm Password */}
            <View style={styles.inputBox}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                value={formData.confirmPassword}
                onChangeText={(t) => handleInputChange("confirmPassword", t)}
                placeholder="Confirm password"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showConfirmPassword}
                style={styles.inputField}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword((v) => !v)}
                activeOpacity={0.8}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>

            {/* Province + Municipality */}
            <View style={styles.row}>
              <Pressable
                onPress={() => setProvinceOpen(true)}
                style={({ pressed }) => [styles.inputBox, styles.half, pressed && { opacity: 0.95 }]}
              >
                <Ionicons name="map-outline" size={18} color="#64748B" style={styles.inputIcon} />
                <Text
                  style={[styles.dropdownText, !formData.province && { color: "#94A3B8" }]}
                  numberOfLines={1}
                >
                  {formData.province ? formData.province : "Province / City"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#64748B" />
              </Pressable>

              <Pressable
                onPress={() => setMuniOpen(true)}
                style={({ pressed }) => [styles.inputBox, styles.half, pressed && { opacity: 0.95 }]}
              >
                <Ionicons name="business-outline" size={18} color="#64748B" style={styles.inputIcon} />
                <Text
                  style={[styles.dropdownText, !formData.municipality && { color: "#94A3B8" }]}
                  numberOfLines={1}
                >
                  {formData.municipality ? formData.municipality : "Municipality"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#64748B" />
              </Pressable>
            </View>

            <View style={styles.inputBox}>
              <Ionicons name="home-outline" size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                value={formData.sitio}
                onChangeText={(t) => handleInputChange("sitio", t)}
                placeholder="Sitio / Street / Barangay"
                placeholderTextColor="#94A3B8"
                style={styles.inputField}
              />
            </View>

            <Text style={styles.label}>Gender</Text>

            <View style={styles.genderRow}>
              <TouchableOpacity
                style={[styles.genderBtn, formData.gender === "Male" && styles.genderMaleActive]}
                onPress={() => handleInputChange("gender", "Male")}
                activeOpacity={0.85}
              >
                <Ionicons name="male" size={18} color={formData.gender === "Male" ? "#fff" : "#555"} />
                <Text style={[styles.genderText, formData.gender === "Male" && styles.genderTextActive]}>
                  Male
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.genderBtn, formData.gender === "Female" && styles.genderFemaleActive]}
                onPress={() => handleInputChange("gender", "Female")}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="female"
                  size={18}
                  color={formData.gender === "Female" ? "#fff" : "#555"}
                />
                <Text
                  style={[styles.genderText, formData.gender === "Female" && styles.genderTextActive]}
                >
                  Female
                </Text>
              </TouchableOpacity>
            </View>

            {/* 18+ checkbox */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.checkRow}
              onPress={() => {
                setAgeConfirmed((v) => {
                  const next = !v;
                  persistStep1(formData, { ageConfirmed: next });
                  return next;
                });
              }}
            >
              <View style={[styles.checkBox, ageConfirmed && styles.checkBoxChecked]}>
                {ageConfirmed && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
              </View>
              <Text style={styles.checkText}>
                I confirm that I am at least <Text style={styles.checkBold}>18 years old</Text>
              </Text>
            </TouchableOpacity>

            {/* Terms checkbox */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.checkRow}
              onPress={() => {
                if (agreePolicy) {
                  setAgreePolicy(false);
                  persistStep1(formData, { agreePolicy: false });
                  return;
                }
                setPolicyVisible(true);
              }}
            >
              <View style={[styles.checkBox, agreePolicy && styles.checkBoxChecked]}>
                {agreePolicy && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
              </View>
              <Text style={styles.checkText}>
                I agree to the <Text style={[styles.checkBold, styles.checkLink]}>Terms &amp; Conditions</Text>
              </Text>
            </TouchableOpacity>

            <Button
              title={checkingEmail ? "Checking…" : "Next"}
              onPress={handleNext}
              style={[styles.next, checkingEmail && { opacity: 0.7 }]}
            />

            <View style={{ height: 26 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Province modal */}
      {provinceOpen && (
        <Pressable style={styles.modalOverlay} onPress={() => setProvinceOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Province / City</Text>
              <TouchableOpacity onPress={() => setProvinceOpen(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {PROVINCES.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={styles.modalItem}
                  activeOpacity={0.85}
                  onPress={() => {
                    handleInputChange("province", p);
                    if (p !== DEFAULT_PROVINCE) handleInputChange("municipality", "");
                    setProvinceOpen(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{p}</Text>
                  {formData.province === p && <Ionicons name="checkmark" size={20} color="#2c4f4f" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      {/* Municipality modal */}
      {muniOpen && (
        <Pressable style={styles.modalOverlay} onPress={() => setMuniOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Municipality</Text>
              <TouchableOpacity onPress={() => setMuniOpen(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {OR_MIN_MUNICIPALITIES.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={styles.modalItem}
                  activeOpacity={0.85}
                  onPress={() => {
                    handleInputChange("municipality", m);
                    setMuniOpen(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{m}</Text>
                  {formData.municipality === m && <Ionicons name="checkmark" size={20} color="#2c4f4f" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      <PolicyModal
        visible={policyVisible}
        variant="consultant"
        onClose={() => setPolicyVisible(false)}
        onAccept={() => {
          setAgreePolicy(true);
          persistStep1(formData, { agreePolicy: true });
          setPolicyVisible(false);
        }}
      />

      <CenterMessageModal
        visible={msgVisible}
        type={msgType}
        title={msgTitle}
        message={msgBody}
        onClose={closeMessage}
        dismissOnBackdrop
      />
    </SafeAreaView>
  );
}

/* ✅ styles unchanged */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { flexGrow: 1, paddingBottom: 0 },

  header: { width: "100%", height: 250, position: "relative", overflow: "hidden" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  headerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },

  backButton: {
    position: "absolute",
    left: 20,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
  },

  headerTextContainer: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.92)",
    marginTop: 6,
    fontWeight: "600",
  },

  content: {
    paddingHorizontal: 32,
    paddingTop: 32,
    marginTop: -50,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingBottom: 30,
  },

  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },

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
  inputIcon: { marginRight: 12 },

  inputField: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    paddingVertical: 0,
  },

  dropdownText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    ...(Platform.OS === "android" ? { textAlignVertical: "center" } : {}),
  },

  eyeBtn: {
    width: 40,
    alignItems: "flex-end",
    justifyContent: "center",
  },

  label: { fontWeight: "600", marginTop: 5, marginBottom: 6, color: "#2c4f4f" },

  genderRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  genderBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE3EA",
    backgroundColor: "#fff",
  },
  genderMaleActive: { backgroundColor: "#2c4f4f", borderColor: "#2c4f4f" },
  genderFemaleActive: { backgroundColor: "#8f2f52", borderColor: "#8f2f52" },
  genderText: { marginLeft: 8, fontWeight: "800", color: "#555" },
  genderTextActive: { color: "#fff" },

  next: { marginTop: 14, marginBottom: 14 },

  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#DCE3EA",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxChecked: { backgroundColor: "#2c4f4f", borderColor: "#2c4f4f" },
  checkText: {
    marginLeft: 10,
    flex: 1,
    color: "#2C4F4F",
    fontWeight: "700",
    lineHeight: 20,
  },
  checkBold: { fontWeight: "900" },
  checkLink: { textDecorationLine: "underline" },

  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 15, fontWeight: "900", color: "#111827" },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalItemText: { fontSize: 14, fontWeight: "800", color: "#2c4f4f" },
});
