import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../config/firebase";
import Button from "../components/Button";

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

export default function Step3Review() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const data = params.data ? JSON.parse(params.data) : {};
  const step2 = data.step2 || {};

  const [loading, setLoading] = useState(false);

  const iconColor = "#0F3E48";

  /* ===========================
     ✅ MESSAGE MODAL (Login style)
     Types: info | success | warning | error
     =========================== */
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  const showToast = (text, type = "info", ms = 2400) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}

    const t = String(type || "info");
    const safeType = MSG_COLORS[t] ? t : "info";

    setMsgType(safeType);

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
  const safeStr = (v) => String(v ?? "").trim();
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateBeforeSubmit = () => {
    const fullName = safeStr(data.fullName);
    const email = safeStr(data.email).toLowerCase();
    const password = String(data.password ?? "");
    const address = safeStr(data.address);
    const gender = safeStr(data.gender);

    // Step 1 must exist
    if (!fullName || fullName.length < 3) {
      showToast("Missing or invalid Full Name. Please go back to Step 1.", "warning");
      return false;
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      showToast("Missing or invalid Email. Please go back to Step 1.", "warning");
      return false;
    }
    if (!password || password.length < 8) {
      showToast("Password is missing or too short. Please go back to Step 1.", "warning");
      return false;
    }
    if (!address || address.length < 5) {
      showToast("Address is missing. Please go back to Step 1.", "warning");
      return false;
    }
    if (!gender) {
      showToast("Gender is missing. Please go back to Step 1.", "warning");
      return false;
    }

    // Step 2 required fields
    if (!safeStr(step2.education)) {
      showToast("Education is missing. Please go back to Step 2.", "warning");
      return false;
    }
    if (!safeStr(step2.specialization)) {
      showToast("Specialization is missing. Please go back to Step 2.", "warning");
      return false;
    }

    // ✅ NEW: Rate required
    const rate = safeStr(step2.rate);
    if (!rate) {
      showToast("Salary Rate is missing. Please go back to Step 2.", "warning");
      return false;
    }
    const rateNum = Number(rate);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      showToast("Salary Rate must be a valid amount. Please go back to Step 2.", "warning");
      return false;
    }
    if (rateNum > 1_000_000) {
      showToast("Salary Rate looks too high. Please check it in Step 2.", "warning");
      return false;
    }

    // Availability: require at least 1 day
    const avail = Array.isArray(step2.availability) ? step2.availability : [];
    if (avail.length < 1) {
      showToast("Please add at least 1 availability day (Step 2).", "warning");
      return false;
    }

    // Verification uploads required
    if (!safeStr(step2.idFrontUrl) || !safeStr(step2.idBackUrl)) {
      showToast("Please upload BOTH front and back of your Valid ID (Step 2).", "warning");
      return false;
    }
    if (!safeStr(step2.selfieUrl)) {
      showToast("Please take and upload your selfie (Step 2).", "warning");
      return false;
    }

    return true;
  };

  const friendlyAuthError = (err) => {
    const code = err?.code || "";
    const msg = err?.message || "Something went wrong.";

    if (code === "auth/email-already-in-use") {
      return "This email is already registered. Please use another email or login instead.";
    }
    if (code === "auth/invalid-email") {
      return "Invalid email format. Please go back to Step 1 and correct it.";
    }
    if (code === "auth/weak-password") {
      return "Weak password. Please use at least 8 characters (recommended: include numbers).";
    }
    if (code === "auth/network-request-failed") {
      return "Network error. Please check your internet connection and try again.";
    }
    if (code === "auth/too-many-requests") {
      return "Too many attempts. Please wait a bit and try again.";
    }
    return msg;
  };

  /* ===========================
     ✅ Submit
     =========================== */
     const handleSubmit = async () => {
      if (loading) return;
      if (!validateBeforeSubmit()) return;
    
      setLoading(true);
    
      try {
        showToast("Submitting your registration…", "info", 1200);
    
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          String(data.email || "").trim(),
          String(data.password || "")
        );
    
        const user = userCredential.user;
    
        try {
          await updateProfile(user, { displayName: safeStr(data.fullName) });
        } catch {}
    
        await setDoc(doc(db, "consultants", user.uid), {
          fullName: safeStr(data.fullName),
          email: safeStr(data.email).toLowerCase(),
          address: safeStr(data.address),
          gender: safeStr(data.gender),
    
          specialization: safeStr(step2.specialization),
          education: safeStr(step2.education),
    
          experience: safeStr(step2.experience),
          licenseNumber: safeStr(step2.licenseNumber),
    
          rate: Number(safeStr(step2.rate)),
    
          availability: Array.isArray(step2.availability) ? step2.availability : [],
    
          idFrontUrl: step2.idFrontUrl || null,
          idBackUrl: step2.idBackUrl || null,
          selfieUrl: step2.selfieUrl || null,
    
          submittedAt: serverTimestamp(),
          status: "pending",
        });
    
        // ✅ refresh token using the new user object (stable)
        await user.getIdToken(true);
    
        showToast("Submitted successfully. Pending admin approval.", "success", 1200);
    
        setTimeout(() => {
          router.replace("/Consultant/PendingApproval");
        }, 500);
      } catch (error) {
        console.error("Submission error:", error);
        showToast(friendlyAuthError(error), "error", 3200);
      } finally {
        setLoading(false);
      }
    };
    

  const openLink = async (url) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      showToast("Unable to open file link.", "error");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Image source={require("../../assets/new_background.jpg")} style={styles.image} />
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Registration</Text>
            <Text style={styles.headerSubtitle}>Step 3 – Review Information</Text>
          </View>
        </View>

        <View style={styles.content}>
          {/* Personal Info */}
          <View style={styles.card}>
            <Text style={styles.section}>Personal Information</Text>

            <View style={styles.infoRow}>
              <Ionicons name="person" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Full Name</Text>
              <Text style={styles.value}>{data.fullName || "-"}</Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="mail" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{data.email || "-"}</Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="home" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Address</Text>
              <Text style={styles.value}>{data.address || "-"}</Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="male-female" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Gender</Text>
              <Text style={styles.value}>{data.gender || "-"}</Text>
            </View>
          </View>

          {/* Details */}
          <View style={styles.card}>
            <Text style={styles.section}>Details</Text>

            <View style={styles.infoRow}>
              <Ionicons name="construct" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Specialization</Text>
              <Text style={styles.value}>{step2.specialization || "-"}</Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="school" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Education</Text>
              <Text style={styles.value}>{step2.education || "-"}</Text>
            </View>

            {/* ✅ NEW: Rate row */}
            <View style={styles.infoRow}>
              <Ionicons name="cash" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Salary Rate</Text>
              <Text style={styles.value}>
                {step2.rate ? `₱${Number(step2.rate).toLocaleString()}` : "-"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="time" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Experience</Text>
              <Text style={styles.value}>
                {step2.experience ? `${step2.experience} years` : "Not specified"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="card" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>License Number</Text>
              <Text style={styles.value}>
                {step2.licenseNumber ? step2.licenseNumber : "Not specified"}
              </Text>
            </View>
          </View>

          {/* Availability */}
          <View style={styles.card}>
            <Text style={styles.section}>Availability</Text>
            {step2.availability && step2.availability.length > 0 ? (
              step2.availability.map((day, i) => (
                <View key={i} style={styles.infoRow}>
                  <Ionicons name="calendar" size={20} color={iconColor} style={styles.icon} />
                  <Text style={styles.label}>Day</Text>
                  <Text style={styles.value}>{day}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.value}>Not specified</Text>
            )}
          </View>

          {/* Verification */}
          <View style={styles.card}>
            <Text style={styles.section}>Verification</Text>

            <View style={styles.infoRow}>
              <Ionicons name="card-outline" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Valid ID (Front)</Text>
              <Text style={styles.value}>{step2.idFrontUrl ? "Uploaded" : "Missing"}</Text>
            </View>
            {step2.idFrontUrl ? (
              <TouchableOpacity style={styles.fileButton} onPress={() => openLink(step2.idFrontUrl)}>
                <Ionicons name="open-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.fileButtonText}>Open Front ID</Text>
              </TouchableOpacity>
            ) : null}

            <View style={[styles.infoRow, { marginTop: 10 }]}>
              <Ionicons name="card-outline" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Valid ID (Back)</Text>
              <Text style={styles.value}>{step2.idBackUrl ? "Uploaded" : "Missing"}</Text>
            </View>
            {step2.idBackUrl ? (
              <TouchableOpacity style={styles.fileButton} onPress={() => openLink(step2.idBackUrl)}>
                <Ionicons name="open-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.fileButtonText}>Open Back ID</Text>
              </TouchableOpacity>
            ) : null}

            <View style={[styles.infoRow, { marginTop: 10 }]}>
              <Ionicons name="camera-outline" size={20} color={iconColor} style={styles.icon} />
              <Text style={styles.label}>Selfie</Text>
              <Text style={styles.value}>{step2.selfieUrl ? "Uploaded" : "Missing"}</Text>
            </View>
            {step2.selfieUrl ? (
              <TouchableOpacity style={styles.fileButton} onPress={() => openLink(step2.selfieUrl)}>
                <Ionicons name="open-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.fileButtonText}>Open Selfie</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Button
            title={loading ? "Submitting..." : "Submit"}
            type="primary"
            onPress={handleSubmit}
            loading={loading}
          />
        </View>
      </ScrollView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { width: "100%", height: 250, position: "relative" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
  },
  headerTextContainer: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    transform: [{ translateY: -20 }],
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#f5f5f5",
    textAlign: "center",
    fontWeight: "500",
    marginTop: 6,
    letterSpacing: 0.4,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 32,
    marginTop: -60,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    marginBottom: 50,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E1E8EA",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F3E48",
    marginBottom: 12,
  },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  icon: { marginRight: 8 },
  label: { fontSize: 14, color: "#666", flex: 1 },
  value: {
    fontSize: 14,
    color: "#4A4A4A",
    fontWeight: "400",
    flex: 1,
    textAlign: "right",
  },

  fileButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F3E48",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  fileButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },

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
