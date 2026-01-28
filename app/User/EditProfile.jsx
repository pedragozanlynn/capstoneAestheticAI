import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../config/firebase";
import Button from "../components/Button";

// ✅ Central modal from components
import CenterMessageModal from "../components/CenterMessageModal";

const USER_ID_KEY = "aestheticai:current-user-id";

export default function EditProfile() {
  const router = useRouter();

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

  // ✅ baseline snapshot (for "no edits" detection)
  const initialRef = useRef({ name: "", gender: "" });

  // ✅ inline validation state
  const [errors, setErrors] = useState({ name: "", gender: "" });

  // ✅ guard to avoid repeated session warnings
  const didWarnNoUser = useRef(false);

  // ✅ CenterMessageModal state
  const [centerModal, setCenterModal] = useState({
    visible: false,
    type: "info", // "success" | "error" | "info" | "warning"
    title: "Notice",
    message: "",
    // optional: afterClose action control
    nextRoute: null,
  });

  const safeStr = (v) => String(v ?? "").trim();
  const isNonEmpty = (v) => safeStr(v).length > 0;

  const openCenterModal = (message, type = "info", title = "Notice", nextRoute = null) => {
    setCenterModal({
      visible: true,
      type,
      title,
      message: String(message || ""),
      nextRoute,
    });
  };

  const closeCenterModal = () => {
    const route = centerModal.nextRoute;
    setCenterModal((m) => ({ ...m, visible: false, nextRoute: null }));
    if (route) {
      // ✅ navigate after user closes modal
      router.replace(route);
    }
  };

  const clearErrors = () => setErrors({ name: "", gender: "" });
  const setFieldError = (field, msg) => setErrors((prev) => ({ ...prev, [field]: msg }));

  const hasAnyError = useMemo(() => !!(errors.name || errors.gender), [errors]);

  const validateBeforeSave = () => {
    const next = { name: "", gender: "" };

    if (!isNonEmpty(userId)) {
      openCenterModal("Session required. Please sign in again.", "error", "Session Required", "/Login");
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
  };

  const hasNoChanges = () => {
    const baseName = safeStr(initialRef.current?.name);
    const baseGender = safeStr(initialRef.current?.gender);
    const curName = safeStr(form.name);
    const curGender = safeStr(form.gender);
    return baseName === curName && baseGender === curGender;
  };

  /* ================= LOAD USER ================= */
  useEffect(() => {
    const loadUser = async () => {
      try {
        setLoading(true);

        const uid = await AsyncStorage.getItem(USER_ID_KEY);

        if (!uid) {
          setUserId(null);
          if (!didWarnNoUser.current) {
            didWarnNoUser.current = true;
            // ✅ keep Alert for blocking/session cases
            Alert.alert("Session Required", "Please sign in to edit your profile.");
          }
          router.replace("/Login");
          return;
        }

        setUserId(uid);

        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) {
          Alert.alert("Profile Not Found", "Your profile record was not found.");
          router.replace("/User/Profile");
          return;
        }

        const data = snap.data() || {};

        // Format createdAt
        let formattedDate = "N/A";
        try {
          if (data.createdAt) {
            const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            if (!Number.isNaN(date.getTime())) {
              formattedDate = date.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              });
            }
          }
        } catch {}

        const loadedName = safeStr(data.name);
        const loadedGender = safeStr(data.gender);

        // ✅ set baseline for "no edits"
        initialRef.current = { name: loadedName, gender: loadedGender };

        setForm({
          name: loadedName,
          email: safeStr(data.email),
          gender: loadedGender,
          subscription_type: safeStr(data.subscription_type) || "Free",
          createdAt: formattedDate,
        });
      } catch (e) {
        console.log("Load profile error:", e?.message || e);
        openCenterModal("Failed to load your profile. Please try again.", "error", "Error");
      } finally {
        setLoading(false);
      }
    };

    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= SAVE ================= */
  const handleSave = async () => {
    if (saving) return;

    clearErrors();

    if (!validateBeforeSave()) return;

    // ✅ requested: if no edits -> show message (central modal)
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

      // ✅ update baseline
      initialRef.current = { name: cleanName, gender: cleanGender };

      // ✅ success message then go back to Profile after close
      openCenterModal(
        "Profile updated successfully.",
        "success",
        "Success",
        "/User/Profile"
      );
    } catch (e) {
      console.log("Update profile error:", e?.message || e);
      openCenterModal("Failed to update profile. Please try again.", "error", "Error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#01579B" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== HEADER (UNCHANGED) ===== */}
        <View style={styles.profileHeaderRow}>
          <View style={styles.profileHeaderLeft}>
            <TouchableOpacity
              style={styles.profileHeaderAvatar}
              onPress={router.back}
              disabled={saving}
            >
              <Ionicons name="arrow-back" size={20} color="#0F3E48" />
            </TouchableOpacity>

            <View>
              <Text style={styles.profileHeaderTitle}>Edit Profile</Text>
              <Text style={styles.profileHeaderSubtitle}>
                Update your personal information
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.profileHeaderDivider} />

        {/* ===== ACCOUNT SUMMARY (READ-ONLY) ===== */}
        <View style={styles.infoRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Subscription</Text>
            <Text style={styles.infoValue}>{form.subscription_type}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Member Since</Text>
            <Text style={styles.infoValue}>{form.createdAt}</Text>
          </View>
        </View>

        {/* ===== FORM CARD ===== */}
        <View style={styles.card}>
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
                setForm({ ...form, name: v });
                if (errors.name) setFieldError("name", "");
              }}
              placeholder="Enter your full name"
              placeholderTextColor="#94A3B8"
            />
          </View>
          {!!errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

          <Label text="Email Address" />
          <View style={[styles.inputWrapper, styles.readonlyWrap]}>
            <Ionicons
              name="mail-outline"
              size={18}
              color="#CBD5E1"
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: "#94A3B8" }]}
              value={form.email}
              editable={false}
            />
          </View>

          <Label text="Gender" />
          {!!errors.gender && (
            <Text style={[styles.errorText, { marginTop: 0, marginBottom: 10 }]}>
              {errors.gender}
            </Text>
          )}

          <View style={styles.genderRow}>
            <TouchableOpacity
              style={[
                styles.genderCard,
                form.gender === "Male" && styles.genderActiveMale,
                !!errors.gender && !form.gender && styles.genderCardError,
              ]}
              onPress={() => {
                setForm({ ...form, gender: "Male" });
                if (errors.gender) setFieldError("gender", "");
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name="male"
                size={20}
                color={form.gender === "Male" ? "#fff" : "#0284C7"}
              />
              <Text
                style={[
                  styles.genderText,
                  form.gender === "Male" && styles.genderTextActive,
                ]}
              >
                Male
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.genderCard,
                form.gender === "Female" && styles.genderActiveFemale,
                !!errors.gender && !form.gender && styles.genderCardError,
              ]}
              onPress={() => {
                setForm({ ...form, gender: "Female" });
                if (errors.gender) setFieldError("gender", "");
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name="female"
                size={20}
                color={form.gender === "Female" ? "#fff" : "#DB2777"}
              />
              <Text
                style={[
                  styles.genderText,
                  form.gender === "Female" && styles.genderTextActive,
                ]}
              >
                Female
              </Text>
            </TouchableOpacity>
          </View>
        </View>

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
        onClose={closeCenterModal}
      />
    </KeyboardAvoidingView>
  );
}

const Label = ({ text }) => <Text style={styles.label}>{text}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContent: { paddingHorizontal: 25, paddingBottom: 40 },

  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 50,
  },
  profileHeaderLeft: { flexDirection: "row", alignItems: "center" },
  profileHeaderAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  profileHeaderTitle: { fontSize: 19, fontWeight: "900", color: "#0F3E48" },
  profileHeaderSubtitle: { fontSize: 12, color: "#64748B" },
  profileHeaderDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginBottom: 20,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 12,
  },
  infoBox: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    elevation: 1,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  infoValue: { fontSize: 13, fontWeight: "700", color: "#0F3E48" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    marginTop: 15,
    marginBottom: 8,
    textTransform: "uppercase",
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    paddingHorizontal: 15,
  },
  inputWrapperError: {
    borderColor: "#DC2626",
    backgroundColor: "rgba(220,38,38,0.06)",
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
  },
  readonlyWrap: { backgroundColor: "#F1F5F9", borderColor: "#E2E8F0" },

  errorText: {
    marginTop: 8,
    color: "#DC2626",
    fontWeight: "800",
    fontSize: 12,
    lineHeight: 16,
  },

  genderRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  genderCard: {
    flex: 1,
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFCFD",
    gap: 6,
  },
  genderCardError: {
    borderColor: "#DC2626",
    backgroundColor: "rgba(220,38,38,0.06)",
  },
  genderActiveMale: { backgroundColor: "#0284C7", borderColor: "#0284C7" },
  genderActiveFemale: { backgroundColor: "#DB2777", borderColor: "#DB2777" },
  genderText: { fontWeight: "800", fontSize: 13, color: "#64748B" },
  genderTextActive: { color: "#fff" },

  buttonWrapper: { marginTop: 5 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
