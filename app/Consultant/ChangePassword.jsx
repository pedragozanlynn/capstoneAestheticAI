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
  Modal,
  Pressable,
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

/* ---------------- TOP MESSAGE MODAL (APP-READY) ---------------- */
const MSG_COLORS = {
  info: { bg: "#EFF6FF", border: "#BFDBFE", icon: "information-circle", iconColor: "#01579B" },
  success: { bg: "#ECFDF5", border: "#BBF7D0", icon: "checkmark-circle", iconColor: "#16A34A" },
  error: { bg: "#FEF2F2", border: "#FECACA", icon: "close-circle", iconColor: "#DC2626" },
};

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

  // ✅ App-ready message modal
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  const showMessage = (type = "info", title = "", body = "", autoHideMs = 1700) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setMsgType(type);
    setMsgTitle(String(title || ""));
    setMsgBody(String(body || ""));
    setMsgVisible(true);

    if (autoHideMs && autoHideMs > 0) {
      msgTimerRef.current = setTimeout(() => setMsgVisible(false), autoHideMs);
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

  const validate = () => {
    const cur = trimStr(currentPassword);
    const next = trimStr(newPassword);
    const conf = trimStr(confirmPassword);

    if (!user?.email) return { ok: false, title: "Not signed in", body: "Please login again to continue." };
    if (!cur || !next || !conf) return { ok: false, title: "Validation", body: "Please fill in all fields." };

    if (next.length < 6) return { ok: false, title: "Weak password", body: "Password must be at least 6 characters." };
    if (next !== conf) return { ok: false, title: "Mismatch", body: "New passwords do not match." };
    if (cur === next) return { ok: false, title: "Invalid", body: "New password must be different from current password." };

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

      // ✅ re-auth for security
      const credential = EmailAuthProvider.credential(user.email, trimStr(currentPassword));
      await reauthenticateWithCredential(user, credential);

      // ✅ update password
      await updatePassword(user, trimStr(newPassword));

      // ✅ logout everywhere
      await signOut(auth);
      await AsyncStorage.multiRemove(["aestheticai:current-user-id", "aestheticai:current-user-role"]);

      showMessage("success", "Password updated", "Please login again using your new password.", 1200);

      // ✅ App-safe navigation: replace Login and block going back to secured screens
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
        showMessage("error", "Session expired", "Please login again and try updating your password.", 1900);
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
      {/* ✅ App-stable StatusBar */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent={false} />

      {/* ✅ SafeArea header so it won’t jump after install */}
      <SafeAreaView style={styles.safeArea}>
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

        <View style={styles.buttonContainer}>
          <Button
            title={loading ? "Processing..." : "Update Password"}
            onPress={handleChangePassword}
            disabled={loading}
            backgroundColor="#0F3E48"
            textColor="#fff"
            style={styles.submitBtn}
          />
        </View>
      </KeyboardAvoidingView>

      {/* ✅ TOP MESSAGE MODAL (instead of Alert) */}
      <Modal visible={msgVisible} transparent animationType="fade" onRequestClose={closeMessage}>
        <Pressable style={styles.msgBackdrop} onPress={closeMessage}>
          <Pressable
            style={[
              styles.msgCard,
              {
                backgroundColor: (MSG_COLORS[msgType] || MSG_COLORS.info).bg,
                borderColor: (MSG_COLORS[msgType] || MSG_COLORS.info).border,
              },
            ]}
            onPress={() => {}}
          >
            <View style={styles.msgRow}>
              <Ionicons
                name={(MSG_COLORS[msgType] || MSG_COLORS.info).icon}
                size={22}
                color={(MSG_COLORS[msgType] || MSG_COLORS.info).iconColor}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                {!!msgTitle && <Text style={styles.msgTitle}>{msgTitle}</Text>}
                {!!msgBody && <Text style={styles.msgBody}>{msgBody}</Text>}
              </View>
            </View>

            <TouchableOpacity style={styles.msgClose} onPress={closeMessage} activeOpacity={0.85}>
              <Ionicons name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  inputDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 10 },

  hintText: {
    marginTop: 10,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "700",
    textAlign: "center",
  },

  buttonContainer: { marginTop: "auto", paddingBottom: 20 },
  submitBtn: { borderRadius: 16, height: 56 },

  /* TOP MESSAGE MODAL (APP-READY) */
  msgBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: Platform.OS === "ios" ? 90 : 70,
    paddingHorizontal: 18,
  },
  msgCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    position: "relative",
  },
  msgRow: { flexDirection: "row", alignItems: "flex-start" },
  msgTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  msgBody: { marginTop: 3, fontSize: 13, fontWeight: "700", color: "#475569", lineHeight: 18 },
  msgClose: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
});
