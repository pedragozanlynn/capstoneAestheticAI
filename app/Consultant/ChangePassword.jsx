import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
} from "firebase/auth";
import { SafeAreaView } from "react-native-safe-area-context";

import Button from "../components/Button";
import Input from "../components/Input";
import CenterMessageModal from "../components/CenterMessageModal";

const safeStr = (v) => (v == null ? "" : String(v));
const trimStr = (v) => safeStr(v).trim();

export default function ConsultantChangePassword() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [centerModal, setCenterModal] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
    nextRoute: null,
  });

  const msgTimerRef = useRef(null);

  const showMessage = (type = "info", title = "", body = "", autoHideMs = 1700) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}

    setCenterModal({
      visible: true,
      type,
      title: String(title || ""),
      message: String(body || ""),
      nextRoute: null,
    });

    if (autoHideMs && autoHideMs > 0) {
      msgTimerRef.current = setTimeout(() => {
        setCenterModal((m) => ({ ...m, visible: false }));
      }, autoHideMs);
    }
  };

  const closeMessage = () => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setCenterModal((m) => ({ ...m, visible: false }));
  };

  useEffect(() => {
    return () => {
      try {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      } catch {}
    };
  }, []);

  const validate = () => {
    const cur = trimStr(currentPassword);
    const next = trimStr(newPassword);
    const conf = trimStr(confirmPassword);

    if (!user?.email) {
      return { ok: false, title: "Not signed in", body: "Please login again to continue." };
    }
    if (!cur || !next || !conf) {
      return { ok: false, title: "Validation", body: "Please fill in all fields." };
    }
    if (next.length < 6) {
      return { ok: false, title: "Weak password", body: "Password must be at least 6 characters." };
    }
    if (next !== conf) {
      return { ok: false, title: "Mismatch", body: "New passwords do not match." };
    }
    if (cur === next) {
      return {
        ok: false,
        title: "Invalid",
        body: "New password must be different from current password.",
      };
    }

    return { ok: true };
  };

  const handleChangePassword = async () => {
    if (loading) return;

    Keyboard.dismiss();

    const v = validate();
    if (!v.ok) {
      showMessage("error", v.title, v.body, 1900);
      return;
    }

    try {
      setLoading(true);

      const credential = EmailAuthProvider.credential(user.email, trimStr(currentPassword));
      await reauthenticateWithCredential(user, credential);

      await updatePassword(user, trimStr(newPassword));

      await signOut(auth);
      await AsyncStorage.multiRemove(["aestheticai:current-user-id", "aestheticai:current-user-role"]);

      showMessage("success", "Password updated", "Please login again using your new password.", 1200);

      setTimeout(() => {
        router.replace({ pathname: "/Login", params: { role: "consultant" } });
      }, 450);
    } catch (error) {
      console.log("Change password error:", error?.code || error);

      if (error?.code === "auth/wrong-password") {
        showMessage("error", "Incorrect password", "Your current password is incorrect.", 1900);
      } else if (error?.code === "auth/too-many-requests") {
        showMessage("error", "Too many attempts", "Please try again later.", 1900);
      } else if (error?.code === "auth/requires-recent-login") {
        showMessage(
          "error",
          "Session expired",
          "Please login again and try updating your password.",
          1900
        );
        setTimeout(() => router.replace({ pathname: "/Login", params: { role: "consultant" } }), 600);
      } else {
        showMessage("error", "Update failed", "Failed to update password. Please try again.", 1900);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent={false} />

      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
            disabled={loading}
          >
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Change Password</Text>
            <Text style={styles.headerSubtitle}>Secure your consultant account</Text>
          </View>

          {loading ? <ActivityIndicator color="#0F3E48" /> : <View style={{ width: 22 }} />}
        </View>

        <View style={styles.headerDivider} />
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.content}>
        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark" size={20} color="#0D9488" />
          <Text style={styles.infoText}>
            Updating your password will log you out from all devices for security.
          </Text>
        </View>

        <View style={styles.card}>
        

          <View style={styles.cardDivider} />

          <Input
            label="Current Password"
            placeholder="Enter current password"
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
            editable={!loading}
            icon={<Ionicons name="lock-closed" size={18} color="#94A3B8" />}
          />

          <View style={styles.inputDivider} />

          <Input
            label="New Password"
            placeholder="Enter new password"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            editable={!loading}
            icon={<Ionicons name="key" size={18} color="#94A3B8" />}
          />

          <Input
            label="Confirm New Password"
            placeholder="Confirm new password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!loading}
            icon={<Ionicons name="checkmark-circle" size={18} color="#94A3B8" />}
          />

          <Text style={styles.hintText}>Minimum of 6 characters. Use a strong password.</Text>
        </View>
         {/* ✅ Button moved UP INSIDE the card */}
         <Button
            title={loading ? "Processing..." : "Update Password"}
            onPress={handleChangePassword}
            disabled={loading}
            backgroundColor="#0F3E48"
            textColor="#fff"
            style={styles.submitBtn}
          />

      </KeyboardAvoidingView>

       
      <CenterMessageModal
        visible={centerModal.visible}
        type={centerModal.type}
        title={centerModal.title}
        message={centerModal.message}
        onClose={closeMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  safeArea: { backgroundColor: "#FFF" },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === "android" ? 15 : 10,
    backgroundColor: "#FFF",
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 19, fontWeight: "900", color: "#0F3E48" },
  headerSubtitle: { fontSize: 13, color: "#64748B", marginTop: 2 },
  headerDivider: { height: 1, backgroundColor: "#F1F5F9" },

  content: { flex: 1, padding: 20 },

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
    fontWeight: "600",
    lineHeight: 18,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },

  submitBtn: { borderRadius: 16, height: 56 },

  cardDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 14 },
  inputDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 10 },

  hintText: {
    marginTop: 10,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "700",
    textAlign: "center",
  },
});
