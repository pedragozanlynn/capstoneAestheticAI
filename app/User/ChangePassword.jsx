import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";

import Button from "../components/Button";
import Input from "../components/Input";

// ✅ ADD: use your reusable center modal
import CenterMessageModal from "../components/CenterMessageModal";

export default function ChangePassword() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ inline validation error state
  const [errors, setErrors] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  /* ===========================
     ✅ CENTER MODAL MESSAGE
     =========================== */
  const [msgModal, setMsgModal] = useState({
    visible: false,
    type: "info", // "info" | "success" | "warning" | "error" (depends on your component)
    title: "Notice",
    message: "",
  });

  const msgTimerRef = useRef(null);

  const openMsg = (message, type = "info", title = "Notice", autoHideMs = 2200) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}

    setMsgModal({
      visible: true,
      type,
      title,
      message: String(message || ""),
    });

    // ✅ auto-hide for non-blocking feel (like your toast)
    if (autoHideMs && autoHideMs > 0) {
      msgTimerRef.current = setTimeout(() => {
        setMsgModal((m) => ({ ...m, visible: false }));
      }, autoHideMs);
    }
  };

  const closeMsg = () => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setMsgModal((m) => ({ ...m, visible: false }));
  };

  useEffect(() => {
    return () => {
      try {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      } catch {}
    };
  }, []);

  const clearErrors = () =>
    setErrors({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const setFieldError = (field, msg) =>
    setErrors((prev) => ({ ...prev, [field]: msg }));

  const validate = () => {
    const next = { currentPassword: "", newPassword: "", confirmPassword: "" };

    const cur = String(currentPassword || "").trim();
    const nw = String(newPassword || "");
    const cf = String(confirmPassword || "");

    // ✅ current password required
    if (!cur) next.currentPassword = "Current password is required.";

    // ✅ new password rules
    if (!nw) {
      next.newPassword = "New password is required.";
    } else if (nw.length < 6) {
      next.newPassword = "New password must be at least 6 characters.";
    } else if (nw === cur) {
      next.newPassword = "New password must be different from current password.";
    } else {
      if (!/[A-Z]/.test(nw)) next.newPassword = "Include at least 1 uppercase letter.";
      else if (!/[a-z]/.test(nw)) next.newPassword = "Include at least 1 lowercase letter.";
      else if (!/[0-9]/.test(nw)) next.newPassword = "Include at least 1 number.";
    }

    // ✅ confirm password
    if (!cf) next.confirmPassword = "Please confirm your new password.";
    else if (nw !== cf) next.confirmPassword = "Passwords do not match.";

    setErrors(next);

    const ok = !(next.currentPassword || next.newPassword || next.confirmPassword);

    // ✅ summary message (replaces top toast)
    if (!ok) {
      if (next.currentPassword) openMsg(next.currentPassword, "error", "Error");
      else if (next.newPassword) openMsg(next.newPassword, "error", "Error");
      else if (next.confirmPassword) openMsg(next.confirmPassword, "error", "Error");
    }

    return ok;
  };

  /* ================= CHANGE PASSWORD LOGIC ================= */
  const handleChangePassword = async () => {
    if (loading) return;

    clearErrors();
    const ok = validate();
    if (!ok) return;

    try {
      setLoading(true);

      if (!user?.email) {
        openMsg("No signed-in user found. Please login again.", "error", "Session Error", 2400);
        return;
      }

      const credential = EmailAuthProvider.credential(user.email, currentPassword);

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      // ✅ success via CenterMessageModal (no custom Modal)
      openMsg("Your password has been updated successfully!", "success", "Success", 1200);

      // ✅ go back after short delay (non-blocking)
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
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ===== HEADER ===== */}
        <View style={styles.profileHeaderRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            disabled={loading}
          >
            <Ionicons name="arrow-back" size={24} color="#0F3E48" />
          </TouchableOpacity>

          <View>
            <Text style={styles.profileHeaderTitle}>Change Password</Text>
            <Text style={styles.profileHeaderSubtitle}>Update your account security</Text>
          </View>
        </View>

        <View style={styles.profileHeaderDivider} />

        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark" size={20} color="#0D9488" />
          <Text style={styles.infoText}>
            Updating your password may require you to sign in again on other devices.
          </Text>
        </View>

        {/* ===== FORM CARD ===== */}
        <View style={styles.card}>
          <Input
            label="Current Password"
            placeholder="Enter current password"
            secureTextEntry
            value={currentPassword}
            onChangeText={(v) => {
              setCurrentPassword(v);
              if (errors.currentPassword) setFieldError("currentPassword", "");
            }}
            icon={<Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />}
          />
          {!!errors.currentPassword && <Text style={styles.errorText}>{errors.currentPassword}</Text>}

          <View style={{ height: 15 }} />

          <Input
            label="New Password"
            placeholder="Minimum 6 characters"
            secureTextEntry
            value={newPassword}
            onChangeText={(v) => {
              setNewPassword(v);
              if (errors.newPassword) setFieldError("newPassword", "");

              if (confirmPassword && v !== confirmPassword) {
                setFieldError("confirmPassword", "Passwords do not match.");
              } else if (errors.confirmPassword) {
                setFieldError("confirmPassword", "");
              }
            }}
            icon={<Ionicons name="key-outline" size={18} color="#9CA3AF" />}
          />
          {!!errors.newPassword && <Text style={styles.errorText}>{errors.newPassword}</Text>}

          <View style={{ height: 15 }} />

          <Input
            label="Confirm New Password"
            placeholder="Repeat new password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={(v) => {
              setConfirmPassword(v);
              if (errors.confirmPassword) setFieldError("confirmPassword", "");
              if (newPassword && v !== newPassword) {
                setFieldError("confirmPassword", "Passwords do not match.");
              }
            }}
            icon={<Ionicons name="shield-checkmark-outline" size={18} color="#9CA3AF" />}
          />
          {!!errors.confirmPassword && (
            <Text style={styles.errorText}>{errors.confirmPassword}</Text>
          )}
        </View>

        {/* ===== SAVE BUTTON ===== */}
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
        onClose={closeMsg}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContent: { padding: 20 },

  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  profileHeaderTitle: { fontSize: 20, fontWeight: "900", color: "#0F3E48" },
  profileHeaderSubtitle: { fontSize: 13, color: "#777" },

  profileHeaderDivider: { height: 1, backgroundColor: "#E4E6EB", marginBottom: 25 },

  infoBox: {
    flexDirection: "row",
    backgroundColor: "#F0FDFA",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    marginBottom: 20,
    alignItems: "center",
  },
  infoText: {
    fontSize: 12,
    color: "#0D9488",
    marginLeft: 10,
    flex: 1,
    fontWeight: "500",
    lineHeight: 18,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: "#E1E8EA",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },

  errorText: {
    marginTop: 8,
    color: "#DC2626",
    fontWeight: "800",
    fontSize: 12,
    lineHeight: 16,
  },
});
