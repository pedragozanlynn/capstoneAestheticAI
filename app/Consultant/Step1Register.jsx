import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Input from "../components/Input";
import Button from "../components/Button";
import { Ionicons } from "@expo/vector-icons";

export default function Step1Register() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    address: "",
    password: "",
    confirmPassword: "",
    gender: "",
  });

  /* ===========================
     ✅ TOAST (TOP, NO OK BUTTON)
     - added only for validations/messages
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

  // ✅ validations helpers (minimal + safe)
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const safeStr = (v) => String(v ?? "").trim();

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
    await AsyncStorage.setItem("step1Data", JSON.stringify(updated));
  };

  const validateForm = () => {
    const fullName = safeStr(formData.fullName);
    const email = safeStr(formData.email);
    const address = safeStr(formData.address);
    const password = String(formData.password ?? "");
    const confirmPassword = String(formData.confirmPassword ?? "");
    const gender = safeStr(formData.gender);

    if (!fullName) return showToast("Please enter your full name.", "error"), false;
    if (fullName.length < 3) return showToast("Full name is too short.", "error"), false;

    if (!email) return showToast("Please enter your email.", "error"), false;
    if (!EMAIL_REGEX.test(email))
      return showToast("Please enter a valid email address.", "error"), false;

    if (!password) return showToast("Please enter your password.", "error"), false;
    if (password.length < 8)
      return showToast("Password must be at least 8 characters.", "error"), false;

    if (!confirmPassword) return showToast("Please confirm your password.", "error"), false;
    if (password !== confirmPassword)
      return showToast("Passwords do not match.", "error"), false;

    if (!address) return showToast("Please enter your address.", "error"), false;
    if (address.length < 5) return showToast("Please enter a valid address.", "error"), false;

    if (!gender) return showToast("Please select your gender.", "error"), false;

    return true;
  };

  const handleNext = async () => {
    if (!validateForm()) return;

    try {
      await AsyncStorage.setItem("step1Data", JSON.stringify(formData));
      showToast("Saved. Proceeding to Step 2...", "success", 900);

      setTimeout(() => {
        router.push({
          pathname: "/Consultant/Step2Details",
          params: { data: JSON.stringify(formData) },
        });
      }, 250);
    } catch {
      showToast("Failed to save data. Please try again.", "error");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        {/* HEADER */}
        <View style={styles.header}>
          <Image
            source={require("../../assets/new_background.jpg")}
            style={styles.image}
          />
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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

          {/* GENDER */}
          <Text style={styles.label}>Gender</Text>
          <View style={styles.genderRow}>
            <TouchableOpacity
              style={[
                styles.genderBtn,
                formData.gender === "Male" && styles.genderMaleActive,
              ]}
              onPress={() => handleInputChange("gender", "Male")}
            >
              <Ionicons
                name="male"
                size={18}
                color={formData.gender === "Male" ? "#fff" : "#555"}
              />
              <Text
                style={[
                  styles.genderText,
                  formData.gender === "Male" && { color: "#fff" },
                ]}
              >
                Male
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.genderBtn,
                formData.gender === "Female" && styles.genderFemaleActive,
              ]}
              onPress={() => handleInputChange("gender", "Female")}
            >
              <Ionicons
                name="female"
                size={18}
                color={formData.gender === "Female" ? "#fff" : "#555"}
              />
              <Text
                style={[
                  styles.genderText,
                  formData.gender === "Female" && { color: "#fff" },
                ]}
              >
                Female
              </Text>
            </TouchableOpacity>
          </View>

          <Button title="Next" onPress={handleNext} style={styles.next} />
        </View>
      </ScrollView>

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
    </View>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  header: { width: "100%", height: 250, position: "relative" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  backButton: {
    position: "absolute",
    top: 30,
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
  },

  label: {
    fontWeight: "600",
    marginTop: 5,
    marginBottom: 6,
    color: "#2c4f4f",
  },

  /* GENDER */
  genderRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
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
  genderMaleActive: {
    backgroundColor: "#2c4f4f",
    borderColor: "#2c4f4f",
  },
  genderFemaleActive: {
    backgroundColor: "#8f2f52",
    borderColor: "#8f2f52",
  },
  genderText: {
    marginLeft: 8,
    fontWeight: "700",
    color: "#555",
  },

  next: { marginTop: 20, marginBottom: 20 },

  /* ===== TOAST (TOP, NO OK) ===== */
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
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
