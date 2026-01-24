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
  Modal,
  Pressable,
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

export default function ChangePassword() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ success modal state
  const [successVisible, setSuccessVisible] = useState(false);
  const [successMsg, setSuccessMsg] = useState(
    "Your password has been updated successfully!"
  );

  // ✅ validation error state (inline)
  const [errors, setErrors] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  /* ===========================
     ✅ TOAST (TOP, NO OK BUTTON)
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

  const hasAnyError = useMemo(
    () => !!(errors.currentPassword || errors.newPassword || errors.confirmPassword),
    [errors]
  );

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
      // basic strength checks (optional but good UX)
      if (!/[A-Z]/.test(nw)) next.newPassword = "Include at least 1 uppercase letter.";
      else if (!/[a-z]/.test(nw)) next.newPassword = "Include at least 1 lowercase letter.";
      else if (!/[0-9]/.test(nw)) next.newPassword = "Include at least 1 number.";
    }

    // ✅ confirm password
    if (!cf) next.confirmPassword = "Please confirm your new password.";
    else if (nw !== cf) next.confirmPassword = "Passwords do not match.";

    setErrors(next);

    const ok = !(next.currentPassword || next.newPassword || next.confirmPassword);

    // ✅ optional: show top toast summary when invalid
    if (!ok) {
      if (next.currentPassword) showToast(next.currentPassword, "error");
      else if (next.newPassword) showToast(next.newPassword, "error");
      else if (next.confirmPassword) showToast(next.confirmPassword, "error");
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
        showToast("No signed-in user found. Please login again.", "error");
        return;
      }

      // A. Create credential for re-authentication
      const credential = EmailAuthProvider.credential(user.email, currentPassword);

      // B. Re-authenticate (Required by Firebase for password changes)
      await reauthenticateWithCredential(user, credential);

      // C. Update the password
      await updatePassword(user, newPassword);

      // ✅ show success modal
      setSuccessMsg("Your password has been updated successfully!");
      setSuccessVisible(true);
    } catch (e) {
      console.log("Change password error:", e?.code, e?.message);

      // ✅ Friendly error handling
      if (e?.code === "auth/wrong-password" || e?.code === "auth/invalid-credential") {
        setFieldError("currentPassword", "The current password is incorrect.");
        showToast("The current password is incorrect.", "error");
      } else if (e?.code === "auth/too-many-requests") {
        showToast("Too many failed attempts. Please try again later.", "error", 2600);
      } else if (e?.code === "auth/requires-recent-login") {
        // This happens if session is old; user must login again
        showToast("Please login again to update your password.", "error", 2600);
        setTimeout(() => router.replace("/Login"), 1200);
      } else if (e?.code === "auth/weak-password") {
        setFieldError("newPassword", "Password is too weak. Try a stronger password.");
        showToast("Password is too weak. Try a stronger password.", "error");
      } else {
        showToast("Failed to change password. Please try again.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSuccess = () => {
    setSuccessVisible(false);
    router.back();
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
          {!!errors.currentPassword && (
            <Text style={styles.errorText}>{errors.currentPassword}</Text>
          )}

          <View style={{ height: 15 }} />

          <Input
            label="New Password"
            placeholder="Minimum 6 characters"
            secureTextEntry
            value={newPassword}
            onChangeText={(v) => {
              setNewPassword(v);
              if (errors.newPassword) setFieldError("newPassword", "");

              // quick confirm check
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
          disabled={loading} // ✅ do not block with hasAnyError; validate on press
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

      {/* ✅ SUCCESS MODAL */}
      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSuccess}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleCloseSuccess}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <Ionicons name="checkmark" size={24} color="#16A34A" />
              </View>
              <Text style={styles.modalTitle}>Success</Text>
            </View>

            <Text style={styles.modalMsg}>{successMsg}</Text>

            <TouchableOpacity
              style={styles.modalBtn}
              onPress={handleCloseSuccess}
              activeOpacity={0.9}
            >
              <Text style={styles.modalBtnText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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

  /* ✅ Success modal styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(22,163,74,0.12)",
    borderWidth: 1,
    borderColor: "rgba(22,163,74,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  modalMsg: {
    marginTop: 12,
    color: "#475569",
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 18,
  },
  modalBtn: {
    marginTop: 16,
    backgroundColor: "#0F3E48",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  modalBtnText: { color: "#fff", fontWeight: "900" },

  /* ✅ TOAST (TOP) */
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
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
