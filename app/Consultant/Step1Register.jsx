import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Input from "../components/Input";

/* ================= CENTER MESSAGE MODAL (Login style) ================= */
const MSG_COLORS = {
  info: {
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: "information-circle",
    iconColor: "#01579B",
  },
  success: {
    bg: "#ECFDF5",
    border: "#BBF7D0",
    icon: "checkmark-circle",
    iconColor: "#16A34A",
  },
  warning: {
    bg: "#FFFBEB",
    border: "#FDE68A",
    icon: "warning",
    iconColor: "#F59E0B",
  },
  error: {
    bg: "#FEF2F2",
    border: "#FECACA",
    icon: "close-circle",
    iconColor: "#DC2626",
  },
};

export default function Step1Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    address: "",
    password: "",
    confirmPassword: "",
    gender: "",
  });

  /* ===========================
     ✅ MESSAGE MODAL (Login style)
     Types: info | success | warning | error
     =========================== */
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  // Keep same function name used in your validations
  const showToast = (text, type = "info", ms = 2400) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}

    const t = String(type || "info");
    const safeType = MSG_COLORS[t] ? t : "info";

    setMsgType(safeType);

    // Optional: auto-title based on type (keeps your calls unchanged)
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
     ✅ Helpers + Validations
     =========================== */
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const safeStr = (v) => String(v ?? "").trim();
  const normalizeEmail = (v) => safeStr(v).toLowerCase();
  const hasNumber = (s) => /\d/.test(String(s || ""));

  const isStrongEnoughPassword = (pw) => {
    const p = String(pw || "");
    if (p.length < 8) return false;
    if (!hasNumber(p)) return false;
    return true;
  };

  const submittingRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      try {
        if (!global.__APP_SESSION__) {
          await AsyncStorage.multiRemove(["step1Data", "step2Data"]);
          global.__APP_SESSION__ = true;
        } else {
          const saved = await AsyncStorage.getItem("step1Data");
          if (saved) setFormData(JSON.parse(saved));
        }
      } catch (err) {
        console.error("Step1 init error:", err);
      }
    };
    init();
  }, []);

  const handleInputChange = async (field, value) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    try {
      await AsyncStorage.setItem("step1Data", JSON.stringify(updated));
    } catch {}
  };

  const validateForm = () => {
    const fullName = safeStr(formData.fullName);
    const email = normalizeEmail(formData.email);
    const address = safeStr(formData.address);
    const password = String(formData.password ?? "");
    const confirmPassword = String(formData.confirmPassword ?? "");
    const gender = safeStr(formData.gender);

    if (!fullName) {
      showToast("Full name is required.", "warning");
      return false;
    }
    if (fullName.length < 3 || /^\d+$/.test(fullName)) {
      showToast("Please enter a valid full name.", "warning");
      return false;
    }

    if (!email) {
      showToast("Email is required.", "warning");
      return false;
    }
    if (!EMAIL_REGEX.test(email)) {
      showToast("Please enter a valid email (example: name@gmail.com).", "warning");
      return false;
    }

    if (!password) {
      showToast("Password is required.", "warning");
      return false;
    }
    if (!isStrongEnoughPassword(password)) {
      showToast("Password must be 8+ characters and include at least 1 number.", "warning");
      return false;
    }

    if (!confirmPassword) {
      showToast("Please confirm your password.", "warning");
      return false;
    }
    if (password !== confirmPassword) {
      showToast("Passwords do not match. Please try again.", "warning");
      return false;
    }

    if (!address) {
      showToast("Address is required.", "warning");
      return false;
    }
    if (address.length < 5) {
      showToast("Please enter a valid address (at least 5 characters).", "warning");
      return false;
    }

    if (!gender) {
      showToast("Please select your gender.", "warning");
      return false;
    }

    return true;
  };

  const handleNext = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      if (!validateForm()) return;

      const normalized = {
        ...formData,
        fullName: safeStr(formData.fullName),
        email: normalizeEmail(formData.email),
        address: safeStr(formData.address),
        gender: safeStr(formData.gender),
      };

      showToast("Saving Step 1…", "info", 900);

      await AsyncStorage.setItem("step1Data", JSON.stringify(normalized));

      showToast(
        "Step 1 saved. Email availability will be checked on final submission.",
        "success",
        1600
      );

      setTimeout(() => {
        router.push({
          pathname: "/Consultant/Step2Details",
          params: { data: JSON.stringify(normalized) },
        });
      }, 450);
    } catch (err) {
      console.log("STEP1 SAVE ERROR:", err?.message || err);
      showToast("Unable to save right now. Please try again.", "error");
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* ✅ ADDED: StatusBar background + style (no other changes) */}
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 180 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="always"
        >
          {/* HEADER */}
          <View style={styles.header}>
            <Image source={require("../../assets/new_background.jpg")} style={styles.image} />

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
            <Input
              value={formData.fullName}
              onChangeText={(t) => handleInputChange("fullName", t)}
              placeholder="Enter full name"
            />

            <Input
              value={formData.email}
              onChangeText={(t) => handleInputChange("email", t)}
              placeholder="Enter email"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Input
              value={formData.password}
              onChangeText={(t) => handleInputChange("password", t)}
              placeholder="Enter password"
              secureTextEntry
            />

            <Input
              value={formData.confirmPassword}
              onChangeText={(t) => handleInputChange("confirmPassword", t)}
              placeholder="Confirm password"
              secureTextEntry
            />

            <Input
              value={formData.address}
              onChangeText={(t) => handleInputChange("address", t)}
              placeholder="Enter address"
            />

            <Text style={styles.label}>Gender</Text>

            <View style={styles.genderRow}>
              <TouchableOpacity
                style={[styles.genderBtn, formData.gender === "Male" && styles.genderMaleActive]}
                onPress={() => handleInputChange("gender", "Male")}
                activeOpacity={0.85}
              >
                <Ionicons name="male" size={18} color={formData.gender === "Male" ? "#fff" : "#555"} />
                <Text style={[styles.genderText, formData.gender === "Male" && { color: "#fff" }]}>
                  Male
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.genderBtn, formData.gender === "Female" && styles.genderFemaleActive]}
                onPress={() => handleInputChange("gender", "Female")}
                activeOpacity={0.85}
              >
                <Ionicons name="female" size={18} color={formData.gender === "Female" ? "#fff" : "#555"} />
                <Text style={[styles.genderText, formData.gender === "Female" && { color: "#fff" }]}>
                  Female
                </Text>
              </TouchableOpacity>
            </View>

            <Button title="Next" onPress={handleNext} style={styles.next} />

            <View style={{ height: 26 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ✅ MESSAGE MODAL OVERLAY (Login style) */}
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
    </SafeAreaView>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, backgroundColor: "#fff" },

  header: { width: "100%", height: 250, position: "relative" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },

  backButton: {
    position: "absolute",
    left: 20,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
  },

  headerTextContainer: {
    position: "absolute",
    top: "35%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#fff" },
  headerSubtitle: { fontSize: 14, color: "#f5f5f5", marginTop: 6 },

  content: {
    paddingHorizontal: 32,
    paddingTop: 32,
    marginTop: -90,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingBottom: 30,
  },

  label: {
    fontWeight: "600",
    marginTop: 5,
    marginBottom: 6,
    color: "#2c4f4f",
  },

  genderRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
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
  genderMaleActive: { backgroundColor: "#2c4f4f", borderColor: "#2c4f4f" },
  genderFemaleActive: { backgroundColor: "#8f2f52", borderColor: "#8f2f52" },
  genderText: { marginLeft: 8, fontWeight: "700", color: "#555" },

  next: { marginTop: 20, marginBottom: 20 },

  /* ===== Login-style message modal styles ===== */
  msgBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: Platform.OS === "ios" ? 120 : 80,
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
