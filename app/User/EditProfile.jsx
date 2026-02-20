import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../config/firebase";
import Button from "../components/Button";
import CenterMessageModal from "../components/CenterMessageModal";

const USER_ID_KEY = "aestheticai:current-user-id";

/* =========================
   SMALL UI COMPONENTS
========================= */
const Label = ({ text }) => <Text style={styles.label}>{text}</Text>;
const safeStr = (v) => String(v ?? "").trim();

export default function EditProfile() {
  const router = useRouter();

  /* =========================
     STATE
  ========================= */
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    gender: "",
    subscription_type: "Free",
    createdAt: "N/A",
  });

  const [errors, setErrors] = useState({ name: "", gender: "" });

  // baseline snapshot for no-changes detection
  const initialRef = useRef({ name: "", gender: "" });

  // CenterMessageModal state
  const [centerModal, setCenterModal] = useState({
    visible: false,
    type: "info",
    title: "Notice",
    message: "",
    nextRoute: null,
  });

  /* =========================
     DERIVED
  ========================= */
  const hasAnyError = useMemo(() => !!(errors.name || errors.gender), [errors]);

  // ✅ UPDATED: static subtitle (replaces "Gender: ...")
  const headerSubtitle = useMemo(() => {
    return "Update your personal information";
  }, []);

  /* =========================
     MODAL HELPERS
  ========================= */
  const openCenterModal = useCallback(
    (message, type = "info", title = "Notice", nextRoute = null) => {
      setCenterModal({
        visible: true,
        type,
        title,
        message: String(message || ""),
        nextRoute,
      });
    },
    []
  );

  const closeCenterModal = useCallback(() => {
    const route = centerModal.nextRoute;
    setCenterModal((m) => ({ ...m, visible: false, nextRoute: null }));
    if (route) router.replace(route);
  }, [centerModal.nextRoute, router]);

  /* =========================
     FORM HELPERS
  ========================= */
  const clearErrors = useCallback(() => setErrors({ name: "", gender: "" }), []);
  const setFieldError = useCallback(
    (field, msg) => setErrors((prev) => ({ ...prev, [field]: msg })),
    []
  );

  const formatCreatedAt = (createdAt) => {
    try {
      if (!createdAt) return "N/A";
      const d = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
      if (Number.isNaN(d.getTime())) return "N/A";
      return d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  const hasNoChanges = useCallback(() => {
    const baseName = safeStr(initialRef.current?.name);
    const baseGender = safeStr(initialRef.current?.gender);
    const curName = safeStr(form.name);
    const curGender = safeStr(form.gender);
    return baseName === curName && baseGender === curGender;
  }, [form.name, form.gender]);

  const validateBeforeSave = useCallback(() => {
    const next = { name: "", gender: "" };

    if (!safeStr(userId)) {
      openCenterModal(
        "Session required. Please sign in again.",
        "error",
        "Session Required",
        "/Login"
      );
      return false;
    }

    const cleanName = safeStr(form.name);
    if (!cleanName) next.name = "Name is required.";
    else if (cleanName.length < 2) next.name = "Name must be at least 2 characters.";
    else if (!/^[A-Za-z\s.'-]+$/.test(cleanName))
      next.name = "Name contains invalid characters.";

    const g = safeStr(form.gender);
    if (!g) next.gender = "Please select your gender.";
    else if (g !== "Male" && g !== "Female") next.gender = "Invalid gender selection.";

    setErrors(next);

    if (next.name || next.gender) {
      openCenterModal("Please correct the highlighted fields.", "error", "Validation Error");
      return false;
    }

    return true;
  }, [form.gender, form.name, openCenterModal, userId]);

  /* =========================
     LOAD USER
  ========================= */
  const loadUser = useCallback(async () => {
    try {
      setLoading(true);

      const uid = await AsyncStorage.getItem(USER_ID_KEY);
      if (!uid) {
        setUserId(null);
        openCenterModal(
          "Please sign in to edit your profile.",
          "warning",
          "Session Required",
          "/Login"
        );
        return;
      }

      setUserId(uid);

      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        openCenterModal(
          "Your profile record was not found.",
          "error",
          "Profile Not Found",
          "/User/Profile"
        );
        return;
      }

      const data = snap.data() || {};
      const loadedName = safeStr(data.name);
      const loadedGender = safeStr(data.gender);
      const createdAt = formatCreatedAt(data.createdAt);

      initialRef.current = { name: loadedName, gender: loadedGender };

      setForm({
        name: loadedName,
        email: safeStr(data.email),
        gender: loadedGender,
        subscription_type: safeStr(data.subscription_type) || "Free",
        createdAt,
      });
    } catch (e) {
      console.log("Load profile error:", e?.message || e);
      openCenterModal("Failed to load your profile. Please try again.", "error", "Error");
    } finally {
      setLoading(false);
    }
  }, [openCenterModal]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  /* =========================
     SAVE
  ========================= */
  const handleSave = useCallback(async () => {
    if (saving) return;

    clearErrors();

    if (!validateBeforeSave()) return;

    if (hasNoChanges()) {
      openCenterModal("No changes to save. Please edit your profile first.", "info", "No Changes");
      return;
    }

    try {
      setSaving(true);

      const cleanName = safeStr(form.name);
      const cleanGender = safeStr(form.gender);

      await updateDoc(doc(db, "users", userId), {
        name: cleanName,
        gender: cleanGender,
      });

      initialRef.current = { name: cleanName, gender: cleanGender };

      openCenterModal("Profile updated successfully.", "success", "Success", "/User/Profile");
    } catch (e) {
      console.log("Update profile error:", e?.message || e);
      openCenterModal("Failed to update profile. Please try again.", "error", "Error");
    } finally {
      setSaving(false);
    }
  }, [
    clearErrors,
    form.gender,
    form.name,
    hasNoChanges,
    openCenterModal,
    saving,
    userId,
    validateBeforeSave,
  ]);

  /* =========================
     RENDER: LOADING
  ========================= */
  if (loading) {
    return (
      <View style={styles.loadingPage}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#0F3E48" />
          <Text style={styles.loadingText}>Loading profile…</Text>
        </View>

        <CenterMessageModal
          visible={centerModal.visible}
          type={centerModal.type}
          title={centerModal.title}
          message={centerModal.message}
          primaryText="OK"
          onPrimaryPress={closeCenterModal}
          onClose={closeCenterModal}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* ✅ STATUS BAR (WHITE HEADER) */}
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={Platform.OS === "android"}
      />

      {/* ✅ WHITE TOP HEADER */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={router.back}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={20} color="#0F3E48" />
        </TouchableOpacity>

        <View style={styles.topHeaderText}>
          <Text style={styles.topTitle}>Edit Profile</Text>

          {/* ✅ SUBTITLE BELOW TITLE (replaces Gender text) */}
          <Text style={styles.topSubtitle} numberOfLines={1}>
            {headerSubtitle}
          </Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ✅ ACCOUNT SUMMARY */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <View style={styles.summaryTop}>
              <Ionicons name="card-outline" size={16} color="#16A34A" />
              <Text style={styles.summaryLabel}>Subscription</Text>
            </View>
            <Text style={styles.summaryValue}>{form.subscription_type}</Text>
          </View>

          <View style={styles.summaryBox}>
            <View style={styles.summaryTop}>
              <Ionicons name="calendar-outline" size={16} color="#0284C7" />
              <Text style={styles.summaryLabel}>Member Since</Text>
            </View>
            <Text style={styles.summaryValue}>{form.createdAt}</Text>
          </View>
        </View>

        {/* ✅ FORM CARD */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Personal Details</Text>

          <Label text="Full Name" />
          <View style={[styles.inputWrapper, !!errors.name && styles.inputWrapperError]}>
            <Ionicons
              name="person-outline"
              size={18}
              color={errors.name ? "#DC2626" : "#94A3B8"}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(v) => {
                setForm((p) => ({ ...p, name: v }));
                if (errors.name) setFieldError("name", "");
              }}
              placeholder="Enter your full name"
              placeholderTextColor="#94A3B8"
              editable={!saving}
              returnKeyType="done"
            />
          </View>
          {!!errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

          <Label text="Email Address" />
          <View style={[styles.inputWrapper, styles.readonlyWrap]}>
            <Ionicons name="mail-outline" size={18} color="#CBD5E1" style={styles.inputIcon} />
            <TextInput style={[styles.input, styles.readonlyText]} value={form.email} editable={false} />
          </View>

          <Label text="Gender" />
          {!!errors.gender && <Text style={styles.errorText}>{errors.gender}</Text>}

          <View style={styles.genderRow}>
            <TouchableOpacity
              style={[
                styles.genderCard,
                form.gender === "Male" && styles.genderActiveMale,
                !!errors.gender && !form.gender && styles.genderCardError,
              ]}
              onPress={() => {
                setForm((p) => ({ ...p, gender: "Male" }));
                if (errors.gender) setFieldError("gender", "");
              }}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Ionicons name="male" size={20} color={form.gender === "Male" ? "#fff" : "#0284C7"} />
              <Text style={[styles.genderText, form.gender === "Male" && styles.genderTextActive]}>Male</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.genderCard,
                form.gender === "Female" && styles.genderActiveFemale,
                !!errors.gender && !form.gender && styles.genderCardError,
              ]}
              onPress={() => {
                setForm((p) => ({ ...p, gender: "Female" }));
                if (errors.gender) setFieldError("gender", "");
              }}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Ionicons name="female" size={20} color={form.gender === "Female" ? "#fff" : "#DB2777"} />
              <Text style={[styles.genderText, form.gender === "Female" && styles.genderTextActive]}>Female</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.saveHintRow}>
            <Ionicons name="information-circle-outline" size={16} color="#64748B" />
            <Text style={styles.saveHintText}>Only name and gender can be updated.</Text>
          </View>
        </View>

        {/* ✅ SAVE BUTTON */}
        <View style={styles.buttonWrapper}>
          <Button
            title={saving ? "Saving..." : "Save Changes"}
            onPress={handleSave}
            disabled={saving || hasAnyError}
            backgroundColor="#0F3E48"
            textColor="#fff"
            icon={
              saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              )
            }
          />
        </View>
      </ScrollView>

      {/* ✅ CenterMessageModal */}
      <CenterMessageModal
        visible={centerModal.visible}
        type={centerModal.type}
        title={centerModal.title}
        message={centerModal.message}
        primaryText="OK"
        onPrimaryPress={closeCenterModal}
        onClose={closeCenterModal}
      />
    </KeyboardAvoidingView>
  );
}

/* =========================
   STYLES
========================= */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },

  /* ===== Loading ===== */
  loadingPage: { flex: 1, backgroundColor: "#F8FAFC", justifyContent: "center", alignItems: "center", padding: 18 },
  loadingCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    gap: 10,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
  },
  loadingText: { color: "#475569", fontWeight: "900" },

  /* ===== Header (WHITE) ===== */
  topHeader: {
    backgroundColor: "#FFFFFF",
    paddingTop: Platform.OS === "ios" ? 56 : 68,
    paddingBottom: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  topHeaderText: { flex: 1, marginLeft: 12 },
  topTitle: { color: "#0F3E48", fontWeight: "900", fontSize: 18 },
  topSubtitle: { color: "#64748B", fontWeight: "700", marginTop: 3, fontSize: 12.5 },
  headerSpacer: { width: 42 },

  /* ===== Content ===== */
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 40 },

  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  summaryBox: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  summaryTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  summaryLabel: { fontSize: 11, fontWeight: "900", color: "#64748B", textTransform: "uppercase", letterSpacing: 0.9 },
  summaryValue: { fontSize: 13, fontWeight: "900", color: "#0F172A" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  cardHeader: { fontSize: 14, fontWeight: "900", color: "#0F3E48", marginBottom: 6 },

  label: { fontSize: 11, fontWeight: "900", color: "#475569", marginTop: 14, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.9 },

  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 16, paddingHorizontal: 14 },
  inputWrapperError: { borderColor: "#DC2626", backgroundColor: "rgba(220,38,38,0.06)" },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, fontWeight: "700", color: "#0F172A" },

  readonlyWrap: { backgroundColor: "#F1F5F9" },
  readonlyText: { color: "#94A3B8" },

  errorText: { marginTop: 8, color: "#DC2626", fontWeight: "900", fontSize: 12, lineHeight: 16 },

  genderRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  genderCard: { flex: 1, flexDirection: "row", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", paddingVertical: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", gap: 8 },
  genderCardError: { borderColor: "#DC2626", backgroundColor: "rgba(220,38,38,0.06)" },
  genderActiveMale: { backgroundColor: "#0284C7", borderColor: "#0284C7" },
  genderActiveFemale: { backgroundColor: "#DB2777", borderColor: "#DB2777" },
  genderText: { fontWeight: "900", fontSize: 13, color: "#64748B" },
  genderTextActive: { color: "#FFFFFF" },

  saveHintRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  saveHintText: { color: "#64748B", fontWeight: "800", fontSize: 12 },

  buttonWrapper: { marginTop: 14 },
});
