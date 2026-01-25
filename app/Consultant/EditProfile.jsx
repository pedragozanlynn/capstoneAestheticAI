import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import { db } from "../../config/firebase";
import Input from "../components/Input";
import Button from "../components/Button";

/* ---------------- CENTER MESSAGE MODAL ---------------- */
const MSG_COLORS = {
  info: { bg: "#EFF6FF", border: "#BFDBFE", icon: "information-circle", iconColor: "#01579B" },
  success: { bg: "#ECFDF5", border: "#BBF7D0", icon: "checkmark-circle", iconColor: "#16A34A" },
  error: { bg: "#FEF2F2", border: "#FECACA", icon: "close-circle", iconColor: "#DC2626" },
};

const safeStr = (v) => (v == null ? "" : String(v));
const trimStr = (v) => safeStr(v).trim();

const normalizeNum = (v) => {
  const s = trimStr(v).replace(/[^\d.]/g, "");
  if (!s) return "";
  // prevent multiple dots
  const parts = s.split(".");
  const clean = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : s;
  const n = Number(clean);
  return Number.isFinite(n) ? clean : "";
};

export default function EditProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [initialData, setInitialData] = useState(null);

  const [formData, setFormData] = useState({
    fullName: "",
    address: "",
    gender: "",
    consultantType: "",
    education: "",
    specialization: "",
    experience: "",
    licenseNumber: "",
    sessionFee: "", // ✅ ADDED
  });

  // ✅ Center message modal
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  const showMessage = (type = "info", title = "", body = "", autoHideMs = 1600) => {
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
    let mounted = true;

    const loadProfile = async () => {
      try {
        const uid = await AsyncStorage.getItem("aestheticai:current-user-id");
        if (!uid) {
          if (!mounted) return;
          showMessage("error", "Not signed in", "Please login again to continue.", 1800);
          return;
        }

        const snap = await getDoc(doc(db, "consultants", uid));
        if (snap.exists()) {
          const data = snap.data() || {};

          // ✅ Get session fee (preferred: sessionFee, fallback: rate)
          const fee = data.sessionFee ?? data.rate ?? "";

          const next = {
            fullName: data.fullName || "",
            address: data.address || "",
            gender: data.gender || "",
            consultantType: data.consultantType || "",
            education: data.education || "",
            specialization: data.specialization || "",
            experience: data.experience != null ? String(data.experience) : "",
            licenseNumber: data.licenseNumber || "",
            sessionFee: fee !== "" && fee != null ? String(fee) : "",
          };

          if (!mounted) return;
          setFormData(next);
          setInitialData(next);
        } else {
          if (!mounted) return;
          showMessage("error", "Profile missing", "Consultant profile not found.", 1800);
        }
      } catch (err) {
        console.log("Load profile error:", err?.message || err);
        if (!mounted) return;
        showMessage("error", "Load failed", "Unable to load profile. Please try again.", 1800);
      }
    };

    loadProfile();

    return () => {
      mounted = false;
      try {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      } catch {}
    };
  }, []);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const hasChanges = () => {
    if (!initialData) return true;
    const keys = Object.keys(initialData);
    for (const k of keys) {
      const a = trimStr(initialData[k]);
      const b = trimStr(formData[k]);
      if (a !== b) return true;
    }
    return false;
  };

  const validate = () => {
    const fullName = trimStr(formData.fullName);
    const address = trimStr(formData.address);
    const gender = trimStr(formData.gender);
    const education = trimStr(formData.education);
    const specialization = trimStr(formData.specialization);
    const consultantType = trimStr(formData.consultantType);

    // ✅ fee validation
    const feeRaw = trimStr(formData.sessionFee);
    const feeNum = Number(feeRaw);

    if (!fullName) return { ok: false, title: "Missing field", body: "Please enter your full name." };
    if (!address) return { ok: false, title: "Missing field", body: "Please enter your office/clinic address." };
    if (!gender) return { ok: false, title: "Missing field", body: "Please select your gender." };
    if (!education) return { ok: false, title: "Missing field", body: "Please select your highest education." };
    if (!specialization) return { ok: false, title: "Missing field", body: "Please select your specialization." };

    if (!feeRaw) return { ok: false, title: "Missing field", body: "Please enter your session fee." };
    if (!Number.isFinite(feeNum) || feeNum <= 0) {
      return { ok: false, title: "Invalid fee", body: "Session fee must be a number greater than 0." };
    }
    if (feeNum < 50) {
      return { ok: false, title: "Fee too low", body: "Please set a realistic minimum fee (e.g., ₱50+)." };
    }

    if (consultantType === "Professional") {
      const exp = trimStr(formData.experience);
      const lic = trimStr(formData.licenseNumber);

      if (!exp) return { ok: false, title: "Missing field", body: "Please enter your years of experience." };

      const expNum = Number(exp);
      if (!Number.isFinite(expNum) || expNum <= 0) {
        return { ok: false, title: "Invalid experience", body: "Years of experience must be a number greater than 0." };
      }

      if (!lic) return { ok: false, title: "Missing field", body: "Please enter your PRC license number." };
      if (lic.length < 6) {
        return { ok: false, title: "Invalid license", body: "PRC license number looks too short. Please verify." };
      }
    }

    return { ok: true, feeNum };
  };

  const handleSave = async () => {
    if (loading) return;
    Keyboard.dismiss();

    const uid = await AsyncStorage.getItem("aestheticai:current-user-id");
    if (!uid) {
      showMessage("error", "Not signed in", "Please login again to continue.", 1800);
      return;
    }

    if (!hasChanges()) {
      showMessage("info", "No changes", "Nothing to update.", 1400);
      return;
    }

    const v = validate();
    if (!v.ok) {
      showMessage("error", v.title, v.body, 1800);
      return;
    }

    try {
      setLoading(true);

      const payload = {
        fullName: trimStr(formData.fullName),
        address: trimStr(formData.address),
        gender: trimStr(formData.gender),
        education: trimStr(formData.education),
        specialization: trimStr(formData.specialization),
        consultantType: trimStr(formData.consultantType),

        // ✅ save session fee
        sessionFee: v.feeNum,
        // rate: v.feeNum, // ✅ OPTIONAL: enable if other screens still read `rate`
      };

      if (trimStr(formData.consultantType) === "Professional") {
        payload.experience = trimStr(formData.experience);
        payload.licenseNumber = trimStr(formData.licenseNumber);
      } else {
        payload.experience = "";
        payload.licenseNumber = "";
      }

      await updateDoc(doc(db, "consultants", uid), payload);

      const nextInitial = {
        ...initialData,
        ...payload,
        experience: payload.experience ?? "",
        licenseNumber: payload.licenseNumber ?? "",
        sessionFee: String(payload.sessionFee ?? ""),
      };

      setInitialData(nextInitial);
      setFormData((prev) => ({ ...prev, sessionFee: String(payload.sessionFee ?? "") }));

      showMessage("success", "Saved", "Profile updated successfully.", 1000);
      setTimeout(() => router.back(), 280);
    } catch (err) {
      console.log("Update profile error:", err?.message || err);
      showMessage("error", "Save failed", "Failed to update profile. Please try again.", 1800);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent={false} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Edit Profile</Text>
            <Text style={styles.headerSubtitle}>Professional Information</Text>
          </View>

          {loading ? <ActivityIndicator color="#01579B" /> : <View style={{ width: 22 }} />}
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Basic Details</Text>
          </View>

          <View style={styles.card}>
            <Input
              label="Full Name *"
              value={formData.fullName}
              onChangeText={(t) => handleChange("fullName", t)}
              placeholder="Enter your full name"
            />

            <Input
              label="Office/Clinic Address *"
              value={formData.address}
              onChangeText={(t) => handleChange("address", t)}
              placeholder="City, Province"
            />

            <Text style={styles.label}>Gender *</Text>
            <View style={styles.genderRow}>
              {["Male", "Female"].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderBtn,
                    formData.gender === g && (g === "Male" ? styles.genderMaleActive : styles.genderFemaleActive),
                  ]}
                  onPress={() => handleChange("gender", g)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={g === "Male" ? "male" : "female"}
                    size={18}
                    color={formData.gender === g ? "#fff" : "#64748B"}
                  />
                  <Text style={[styles.genderText, formData.gender === g && { color: "#fff" }]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ✅ NEW SECTION: Consultation Settings */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Consultation Settings</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Session Fee (PHP) *</Text>
            <View style={styles.feeRow}>
              <Text style={styles.currency}>₱</Text>
              <Input
                label=""
                value={formData.sessionFee}
                onChangeText={(v) => handleChange("sessionFee", normalizeNum(v))}
                placeholder="e.g. 500"
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.feeHint}>This will be used during booking and payments.</Text>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Credentials</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Highest Education *</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={formData.education} onValueChange={(v) => handleChange("education", v)} style={styles.picker}>
                <Picker.Item label="Select degree" value="" color="#94A3B8" />
                <Picker.Item label="BS in Architecture" value="BS Architecture" />
                <Picker.Item label="BS in Civil Engineering" value="BSCE" />
                <Picker.Item label="Bachelor of Interior Design" value="Interior Design" />
              </Picker>
            </View>

            <Text style={styles.label}>Primary Specialization *</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={formData.specialization}
                onValueChange={(v) => handleChange("specialization", v)}
                style={styles.picker}
              >
                <Picker.Item label="Select specialization" value="" color="#94A3B8" />
                <Picker.Item label="Architectural Design" value="Architectural Design" />
                <Picker.Item label="Structural Engineering" value="Structural Engineering" />
                <Picker.Item label="Residential Interior Design" value="Residential Interior Design" />
                <Picker.Item label="Lighting Design" value="Lighting Design" />
              </Picker>
            </View>

            {trimStr(formData.consultantType) === "Professional" && (
              <View style={styles.proSection}>
                <View style={styles.proDivider} />
                <Input
                  label="Years of Experience *"
                  keyboardType="numeric"
                  value={formData.experience}
                  onChangeText={(v) => handleChange("experience", normalizeNum(v))}
                  placeholder="e.g. 5"
                />
                <Input
                  label="PRC License Number *"
                  value={formData.licenseNumber}
                  onChangeText={(v) => handleChange("licenseNumber", v)}
                  placeholder="0000000"
                />
              </View>
            )}
          </View>

          <View style={styles.buttonContainer}>
            <Button
              title={loading ? "Updating Profile..." : "Save Profile Changes"}
              onPress={handleSave}
              disabled={loading}
              backgroundColor="#01579B"
            />
          </View>

          <Text style={styles.hintText}>Fields marked with * are required.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ===== CENTER MESSAGE MODAL ===== */}
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
    paddingTop: 50,
    paddingHorizontal: 30,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
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
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#1E293B" },
  headerSubtitle: { fontSize: 13, color: "#64748B", marginTop: 1 },

  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionHeader: { marginBottom: 10, marginTop: 10, paddingLeft: 5 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#01579B", textTransform: "uppercase", letterSpacing: 0.5 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },

  label: { fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 8, marginTop: 10, marginLeft: 2 },

  genderRow: { flexDirection: "row", gap: 12, marginTop: 5 },
  genderBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 15,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  genderMaleActive: { backgroundColor: "#01579B", borderColor: "#01579B" },
  genderFemaleActive: { backgroundColor: "#C44569", borderColor: "#C44569" },
  genderText: { marginLeft: 8, fontWeight: "800", color: "#64748B", fontSize: 14 },

  pickerBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
    overflow: "hidden",
  },
  picker: { height: 55, width: "100%" },

  proSection: { marginTop: 10 },
  proDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 15 },
  buttonContainer: { marginTop: 10, marginBottom: 14 },

  hintText: { textAlign: "center", color: "#94A3B8", fontWeight: "700", fontSize: 12, marginTop: 4 },

  // ✅ Fee styles
  feeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  currency: { fontSize: 18, fontWeight: "900", color: "#01579B", marginTop: 10 },
  feeHint: { marginTop: 6, color: "#94A3B8", fontSize: 12, fontWeight: "700" },

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
