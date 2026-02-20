import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  EmailAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";

import Button from "../components/Button";
import Input from "../components/Input";
import CenterMessageModal from "../components/CenterMessageModal";

const safeStr = (v) => String(v ?? "").trim();

export default function ChangePassword() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  /* =========================
     STATE
  ========================= */
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);

  /* =========================
     CENTER MODAL
  ========================= */
  const timerRef = useRef(null);
  const [msgModal, setMsgModal] = useState({
    visible: false,
    type: "info", // info | success | warning | error
    title: "Notice",
    message: "",
  });

  const closeMsg = useCallback(() => {
    try {
      if (timerRef.current) clearTimeout(timerRef.current);
    } catch {}
    setMsgModal((m) => ({ ...m, visible: false }));
  }, []);

  const openMsg = useCallback((message, type = "info", title = "Notice", autoHideMs = 2200) => {
    try {
      if (timerRef.current) clearTimeout(timerRef.current);
    } catch {}

    setMsgModal({
      visible: true,
      type,
      title,
      message: String(message || ""),
    });

    if (autoHideMs && autoHideMs > 0) {
      timerRef.current = setTimeout(() => {
        setMsgModal((m) => ({ ...m, visible: false }));
      }, autoHideMs);
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (timerRef.current) clearTimeout(timerRef.current);
      } catch {}
    };
  }, []);

  /* =========================
     HELPERS
  ========================= */
  const setField = useCallback((key, value) => {
    setForm((p) => ({ ...p, [key]: value }));
  }, []);

  const setFieldError = useCallback((key, value) => {
    setErrors((p) => ({ ...p, [key]: value }));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }, []);

  const validate = useCallback(() => {
    const next = { currentPassword: "", newPassword: "", confirmPassword: "" };

    const cur = safeStr(form.currentPassword);
    const nw = String(form.newPassword || "");
    const cf = String(form.confirmPassword || "");

    if (!cur) next.currentPassword = "Current password is required.";

    if (!nw) next.newPassword = "New password is required.";
    else if (nw.length < 6) next.newPassword = "New password must be at least 6 characters.";
    else if (nw === cur) next.newPassword = "New password must be different from current password.";
    else {
      if (!/[A-Z]/.test(nw)) next.newPassword = "Include at least 1 uppercase letter.";
      else if (!/[a-z]/.test(nw)) next.newPassword = "Include at least 1 lowercase letter.";
      else if (!/[0-9]/.test(nw)) next.newPassword = "Include at least 1 number.";
    }

    if (!cf) next.confirmPassword = "Please confirm your new password.";
    else if (nw !== cf) next.confirmPassword = "Passwords do not match.";

    setErrors(next);

    const ok = !(next.currentPassword || next.newPassword || next.confirmPassword);
    if (!ok) {
      const first =
        next.currentPassword || next.newPassword || next.confirmPassword || "Please check your inputs.";
      openMsg(first, "error", "Validation Error");
    }

    return ok;
  }, [form.confirmPassword, form.currentPassword, form.newPassword, openMsg]);

  /* =========================
     ACTION
  ========================= */
  const handleChangePassword = useCallback(async () => {
    if (loading) return;

    clearErrors();
    if (!validate()) return;

    try {
      setLoading(true);

      if (!user?.email) {
        openMsg("No signed-in user found. Please login again.", "error", "Session Error", 2400);
        return;
      }

      const credential = EmailAuthProvider.credential(user.email, form.currentPassword);

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, form.newPassword);

      openMsg("Your password has been updated successfully!", "success", "Success", 1200);

      setTimeout(() => {
        router.back();
      }, 900);
    } catch (e) {
      console.log("Change password error:", e?.code, e?.message);

      if (e?.code === "auth/wrong-password" || e?.code === "auth/invalid-credential") {
        setFieldError("currentPassword", "The current password is incorrect.");
        openMsg("The current password is incorrect.", "error", "Error");
      } else if (e?.code === "auth/too-many-requests") {
        openMsg("Too many failed attempts. Please try again later.", "error", "Error", 2600);
      } else if (e?.code === "auth/requires-recent-login") {
        openMsg("Please login again to update your password.", "error", "Session Expired", 2600);
        setTimeout(() => router.replace("/Login"), 1200);
      } else if (e?.code === "auth/weak-password") {
        setFieldError("newPassword", "Password is too weak. Try a stronger password.");
        openMsg("Password is too weak. Try a stronger password.", "error", "Error");
      } else {
        openMsg("Failed to change password. Please try again.", "error", "Error");
      }
    } finally {
      setLoading(false);
    }
  }, [clearErrors, form.currentPassword, form.newPassword, loading, openMsg, router, setFieldError, user, validate]);

  const subtitle = useMemo(() => "Update your account security", []);

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* ✅ STATUS BAR */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={Platform.OS === "android"} />

      {/* ✅ WHITE HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={router.back} disabled={loading} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={20} color="#0F3E48" />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Change Password</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark" size={20} color="#0D9488" />
          <Text style={styles.infoText}>
            Updating your password may require you to sign in again on other devices.
          </Text>
        </View>

        <View style={styles.card}>
          <Input
            label="Current Password"
            placeholder="Enter current password"
            secureTextEntry
            value={form.currentPassword}
            onChangeText={(v) => {
              setField("currentPassword", v);
              if (errors.currentPassword) setFieldError("currentPassword", "");
            }}
            icon={<Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />}
          />
          {!!errors.currentPassword && <Text style={styles.errorText}>{errors.currentPassword}</Text>}

          <View style={styles.gap} />

          <Input
            label="New Password"
            placeholder="Minimum 6 characters"
            secureTextEntry
            value={form.newPassword}
            onChangeText={(v) => {
              setField("newPassword", v);

              if (errors.newPassword) setFieldError("newPassword", "");

              if (form.confirmPassword && v !== form.confirmPassword) {
                setFieldError("confirmPassword", "Passwords do not match.");
              } else if (errors.confirmPassword) {
                setFieldError("confirmPassword", "");
              }
            }}
            icon={<Ionicons name="key-outline" size={18} color="#9CA3AF" />}
          />
          {!!errors.newPassword && <Text style={styles.errorText}>{errors.newPassword}</Text>}

          <View style={styles.gap} />

          <Input
            label="Confirm New Password"
            placeholder="Repeat new password"
            secureTextEntry
            value={form.confirmPassword}
            onChangeText={(v) => {
              setField("confirmPassword", v);

              if (errors.confirmPassword) setFieldError("confirmPassword", "");

              if (form.newPassword && v !== form.newPassword) {
                setFieldError("confirmPassword", "Passwords do not match.");
              }
            }}
            icon={<Ionicons name="shield-checkmark-outline" size={18} color="#9CA3AF" />}
          />
          {!!errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
        </View>

        <Button
          title={loading ? "Updating..." : "Update Password"}
          onPress={handleChangePassword}
          disabled={loading}
          backgroundColor="#0F3E48"
          textColor="#fff"
          icon={
            loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="shield-outline" size={20} color="#fff" />
            )
          }
        />
      </ScrollView>

      {/* ✅ CENTER MESSAGE MODAL */}
      <CenterMessageModal
        visible={msgModal.visible}
        type={msgModal.type}
        title={msgModal.title}
        message={msgModal.message}
        primaryText="OK"
        onPrimaryPress={closeMsg}
        onClose={closeMsg}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },

  /* ===== Header (WHITE) ===== */
  header: {
    backgroundColor: "#FFFFFF",
    paddingTop: Platform.OS === "ios" ? 56 : 68,
    paddingBottom: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    elevation: 6,
    shadowColor: "#000",
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
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#0F3E48" },
  headerSubtitle: { marginTop: 3, fontSize: 12.5, fontWeight: "700", color: "#64748B" },
  headerSpacer: { width: 42 },

  /* ===== Content ===== */
  scrollContent: { padding: 18, paddingBottom: 28 },

  infoBox: {
    flexDirection: "row",
    backgroundColor: "#F0FDFA",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    marginBottom: 14,
    alignItems: "center",
  },
  infoText: {
    fontSize: 12.5,
    color: "#0D9488",
    marginLeft: 10,
    flex: 1,
    fontWeight: "700",
    lineHeight: 18,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },

  gap: { height: 14 },

  errorText: {
    marginTop: 8,
    color: "#DC2626",
    fontWeight: "900",
    fontSize: 12,
    lineHeight: 16,
  },
});
