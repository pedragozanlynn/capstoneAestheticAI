// app/Consultant/Step3Review.jsx
// ✅ FINAL FLOW:
// - Step3 requires Step1 + Step2; if Step2 missing -> redirect to Step2
// - DOES NOT require "reserved" doc
// - On submit: create Auth user -> transaction:
//    - if consultantEmailIndex already final => fail + delete created auth user
//    - else set index final + write consultant profile
// - Clear step1Data/step2Data after success
//
// ✅ CHANGES ONLY (as requested):
// 1) After successful submit -> go to /Consultant/PendingApproval (role pending)
// 2) Remove the "line line" separators in the review cards (no border lines)
// 3) In Verification Uploads: show images for ID front/back + selfie (instead of text only)

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import * as Crypto from "expo-crypto";

// Firebase
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../config/firebase";

// ✅ must match Step1 export
export const CONSULTANT_EMAIL_INDEX_COL = "consultantEmailIndex";
const CONSULTANTS_COL = "consultants";

/* ================= CONSTANTS ================= */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Step3Review() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [step1, setStep1] = useState(null);
  const [step2, setStep2] = useState(null);

  // message overlay
  const [msg, setMsg] = useState({ open: false, type: "info", title: "", body: "" });
  const msgTimerRef = useRef(null);

  const showMsg = (body, type = "info", ms = 2400, title = "") => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}

    const safeType = ["info", "success", "warning", "error"].includes(String(type))
      ? String(type)
      : "info";

    const autoTitle =
      title ||
      (safeType === "success"
        ? "Success"
        : safeType === "error"
        ? "Error"
        : safeType === "warning"
        ? "Warning"
        : "Notice");

    setMsg({ open: true, type: safeType, title: autoTitle, body: String(body || "") });

    if (ms && ms > 0) {
      msgTimerRef.current = setTimeout(() => setMsg((p) => ({ ...p, open: false })), ms);
    }
  };

  const closeMsg = () => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setMsg((p) => ({ ...p, open: false }));
  };

  useEffect(() => {
    return () => {
      try {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      } catch {}
    };
  }, []);

  /* ================= HELPERS ================= */
  const safeStr = (v) => String(v ?? "").trim();
  const normalizeEmail = (v) => safeStr(v).toLowerCase();

  const hashEmail = async (email) => {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      String(email || "").toLowerCase().trim()
    );
  };

  const buildAddress = (sitio, municipality, province) =>
    [safeStr(sitio), safeStr(municipality), safeStr(province)].filter(Boolean).join(", ");

  const money = (v) => {
    const raw = String(v || "").trim();
    const n = Number(raw.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return raw || "-";
    return `₱${n.toLocaleString()}`;
  };

  const hasUrl = (u) => !!safeStr(u);

  /* ================= INIT (read Step1 + Step2) =================
     ✅ Guard: if Step2 missing -> redirect to Step2Details
  */
  useEffect(() => {
    const init = async () => {
      try {
        let merged = null;
        if (params?.data) {
          try {
            merged = JSON.parse(params.data);
          } catch {}
        }

        let s1 = null;
        let s2 = null;

        if (merged) {
          s1 = merged;
          s2 = merged?.step2 || null;
        } else {
          const raw1 = await AsyncStorage.getItem("step1Data");
          const raw2 = await AsyncStorage.getItem("step2Data");
          try {
            s1 = raw1 ? JSON.parse(raw1) : null;
          } catch {}
          try {
            s2 = raw2 ? JSON.parse(raw2) : null;
          } catch {}
        }

        // Normalize Step1 address compatibility
        if (s1) {
          const addr =
            safeStr(s1.address) || buildAddress(s1.sitio, s1.municipality, s1.province);

          s1 = { ...s1, email: normalizeEmail(s1.email), address: addr };
        }

       // inside Step3 init guard:

if (s1 && !s2) {
  try {
    await AsyncStorage.setItem("step1Data", JSON.stringify(s1));
  } catch {}

  setLoading(false);

  // ✅ FIX: use same flow key (don’t Date.now) to avoid Step2 clearing
  const flowKey = safeStr(params?.fresh) || "default_flow";

  router.replace({
    pathname: "/Consultant/Step2Details",
    params: {
      data: JSON.stringify(s1),
      fresh: flowKey,
      from: "step3_guard",
    },
  });
  return;
}


        setStep1(s1);
        setStep2(s2);
      } catch (e) {
        console.log("Step3 init error:", e?.message || e);
      } finally {
        setLoading(false);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.data]);

  /* ================= VALIDATION ================= */
  const validateAll = () => {
    if (!step1 || !step2) {
      showMsg("Missing registration data. Please complete Step 1 and Step 2.", "error", 2800);
      return false;
    }

    const email = normalizeEmail(step1.email);
    if (!EMAIL_REGEX.test(email)) {
      showMsg("Invalid email. Please go back to Step 1 and fix it.", "error", 2800);
      return false;
    }

    if (!safeStr(step1.password) || safeStr(step1.password).length < 8) {
      showMsg("Password is missing/invalid. Please go back to Step 1.", "error", 2800);
      return false;
    }

    if (!safeStr(step2.education) || !safeStr(step2.specialization)) {
      showMsg("Missing Education/Specialization. Please go back to Step 2.", "error", 2800);
      return false;
    }

    if (!safeStr(step2.idFrontUrl) || !safeStr(step2.idBackUrl) || !safeStr(step2.selfieUrl)) {
      showMsg("Verification uploads are incomplete. Please go back to Step 2.", "warning", 2800);
      return false;
    }

    const avail = Array.isArray(step2.availability) ? step2.availability : [];
    if (avail.length < 1) {
      showMsg("Please add at least 1 availability day in Step 2.", "warning", 2400);
      return false;
    }

    return true;
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = async () => {
    if (submitting) return;
    if (!validateAll()) return;

    setSubmitting(true);

    const email = normalizeEmail(step1.email);
    const password = String(step1.password || "");
    const fullName = safeStr(step1.fullName) || safeStr(step1.firstName) || "Consultant";

    let createdUser = null;

    try {
      showMsg("Submitting registration…", "info", 900);

      // ✅ Create Auth user first
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      createdUser = cred?.user || null;

      const uid = createdUser?.uid;
      if (!uid) {
        showMsg("Registration failed. Please try again.", "error", 2800);
        return;
      }

      // ✅ best-effort displayName
      try {
        await updateProfile(createdUser, { displayName: fullName });
      } catch {}

      const emailHash = await hashEmail(email);
      const indexRef = doc(db, CONSULTANT_EMAIL_INDEX_COL, emailHash);
      const consultantRef = doc(db, CONSULTANTS_COL, uid);

      // ✅ transaction: enforce unique email via index
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(indexRef);

        if (snap.exists()) {
          const existing = snap.data() || {};
          const status = String(existing.status || "").toLowerCase();
          if (status === "final") {
            throw new Error("EMAIL_INDEX_EXISTS");
          }
          // if exists but not final, still treat as taken
          throw new Error("EMAIL_INDEX_RESERVED");
        }

        // create final index
        tx.set(indexRef, {
          uid,
          emailHash,
          status: "final",
          createdAt: serverTimestamp(),
          role: "consultant",
        });

        // create consultant profile
        tx.set(consultantRef, {
          uid,
          role: "consultant",
          status: "pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),

          // Step1
          firstName: safeStr(step1.firstName),
          middleName: safeStr(step1.middleName),
          lastName: safeStr(step1.lastName),
          fullName: safeStr(step1.fullName),
          email: email,
          gender: safeStr(step1.gender),

          sitio: safeStr(step1.sitio),
          municipality: safeStr(step1.municipality),
          province: safeStr(step1.province),
          address: safeStr(step1.address),

          ageConfirmed: !!step1.ageConfirmed,
          agreePolicy: !!step1.agreePolicy,

          // Step2
          education: safeStr(step2.education),
          specialization: safeStr(step2.specialization),
          experience: safeStr(step2.experience),
          licenseNumber: safeStr(step2.licenseNumber),
          rate: safeStr(step2.rate),
          availability: Array.isArray(step2.availability) ? step2.availability : [],

          // uploads
          idFrontUrl: safeStr(step2.idFrontUrl),
          idBackUrl: safeStr(step2.idBackUrl),
          selfieUrl: safeStr(step2.selfieUrl),
        });
      });

      // ✅ clear temp data
      try {
        await AsyncStorage.multiRemove(["step1Data", "step2Data"]);
      } catch {}

      showMsg("Registration submitted! Please wait for approval.", "success", 1600);

      // ✅ CHANGE: go to PendingApproval
      setTimeout(() => {
        router.replace("/Consultant/PendingApproval");
      }, 450);
    } catch (err) {
      const m = String(err?.message || err);
      const code = String(err?.code || "");

      // If transaction fails, delete created auth user
      const rollbackAuth = async () => {
        try {
          if (createdUser) await createdUser.delete();
        } catch {}
      };

      if (code === "auth/email-already-in-use") {
        showMsg("Email already exists. Please use another email.", "error", 2800);
        return;
      }

      if (m.includes("EMAIL_INDEX_EXISTS") || m.includes("EMAIL_INDEX_RESERVED")) {
        await rollbackAuth();
        showMsg("Email already exists. Please use another email.", "error", 2800);
        return;
      }

      if (code === "auth/network-request-failed") {
        await rollbackAuth();
        showMsg("Network error. Check your internet and try again.", "error", 2800);
        return;
      }

      console.log("STEP3 SUBMIT ERROR:", code, m);
      await rollbackAuth();
      showMsg("Unable to submit registration. Please try again.", "error", 2800);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => router.back();

  /* ================= UI helpers ================= */
  const Row = ({ label, value }) => (
    <View style={styles.rowLine}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={3}>
        {safeStr(value) || "-"}
      </Text>
    </View>
  );

  const VerifyImageRow = ({ label, uri }) => (
    <View style={styles.verifyRow}>
      <Text style={styles.verifyLabel}>{label}</Text>
      {hasUrl(uri) ? (
        <Image source={{ uri }} style={styles.verifyImg} />
      ) : (
        <View style={styles.verifyMissing}>
          <Text style={styles.verifyMissingText}>Missing ❌</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          alwaysBounceVertical={false}
        >
          {/* HEADER */}
          <View style={styles.header}>
            <Image source={require("../../assets/new_background.jpg")} style={styles.image} />
            <View style={styles.headerOverlay} />

            <TouchableOpacity
              onPress={handleBack}
              style={[styles.backButton, { top: insets.top + 8 }]}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Registration</Text>
              <Text style={styles.headerSubtitle}>Step 3 – Review &amp; Submit</Text>
            </View>
          </View>

          {/* CONTENT */}
          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <View style={styles.card}>
              <Row label="Full Name" value={step1?.fullName} />
              <Row label="Email" value={step1?.email} />
              <Row label="Gender" value={step1?.gender} />
              <Row label="Address" value={step1?.address} />
              <Row label="Province" value={step1?.province} />
              <Row label="Municipality" value={step1?.municipality} />
              <Row label="Sitio/Street" value={step1?.sitio} />
            </View>

            <Text style={styles.sectionTitle}>Professional Details</Text>
            <View style={styles.card}>
              <Row label="Education" value={step2?.education} />
              <Row label="Specialization" value={step2?.specialization} />
              <Row label="Experience (Years)" value={step2?.experience || "-"} />
              <Row label="License Number" value={step2?.licenseNumber || "-"} />
              <Row label="Salary Rate" value={money(step2?.rate)} />
              <Row label="Availability" value={(step2?.availability || []).join(", ")} />
            </View>

            <Text style={styles.sectionTitle}>Verification Uploads</Text>
            <View style={styles.card}>
              {/* ✅ CHANGE: show images */}
              <VerifyImageRow label="Valid ID (Front)" uri={step2?.idFrontUrl} />
              <VerifyImageRow label="Valid ID (Back)" uri={step2?.idBackUrl} />
              <VerifyImageRow label="Selfie" uri={step2?.selfieUrl} />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.75 }]}
              onPress={handleSubmit}
              activeOpacity={0.9}
              disabled={submitting}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.submitText}>{submitting ? "Submitting…" : "Submit Registration"}</Text>
            </TouchableOpacity>

            <View style={{ height: 28 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Message overlay */}
      {msg.open && (
        <Pressable style={styles.msgBackdrop} onPress={closeMsg}>
          <Pressable style={[styles.msgCard, styles[`msg_${msg.type}`]]} onPress={() => {}}>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Ionicons
                name={
                  msg.type === "success"
                    ? "checkmark-circle"
                    : msg.type === "error"
                    ? "close-circle"
                    : msg.type === "warning"
                    ? "warning"
                    : "information-circle"
                }
                size={22}
                color={
                  msg.type === "success"
                    ? "#16A34A"
                    : msg.type === "error"
                    ? "#DC2626"
                    : msg.type === "warning"
                    ? "#F59E0B"
                    : "#01579B"
                }
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.msgTitle}>{msg.title}</Text>
                <Text style={styles.msgBody}>{msg.body}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.msgClose} onPress={closeMsg} activeOpacity={0.85}>
              <Ionicons name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { flexGrow: 1, paddingBottom: 0 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontWeight: "800", color: "#0F3E48" },

  header: { width: "100%", height: 250, position: "relative", overflow: "hidden" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  headerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },

  backButton: {
    position: "absolute",
    left: 20,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
  },

  headerTextContainer: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.92)",
    marginTop: 6,
    fontWeight: "600",
  },

  content: {
    paddingHorizontal: 32,
    paddingTop: 28,
    marginTop: -50,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingBottom: 30,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F3E48",
    marginBottom: 10,
    marginTop: 6,
  },

  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  // ✅ CHANGE: removed the line separators
  rowLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 8,
    // borderBottomWidth: 1,
    // borderBottomColor: "#F1F5F9",
  },
  rowLabel: { flex: 1, color: "#64748B", fontWeight: "800", fontSize: 12 },
  rowValue: {
    flex: 1.2,
    color: "#111827",
    fontWeight: "900",
    fontSize: 12,
    textAlign: "right",
  },

  // ✅ Verification image rows
  verifyRow: {
    marginBottom: 12,
  },
  verifyLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F3E48",
    marginBottom: 8,
  },
  verifyImg: {
    width: "100%",
    height: 160,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  verifyMissing: {
    width: "100%",
    height: 120,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
  },
  verifyMissingText: {
    fontWeight: "900",
    color: "#DC2626",
    fontSize: 12,
  },

  submitBtn: {
    marginTop: 10,
    backgroundColor: "#0F3E48",
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  submitText: { color: "#fff", fontWeight: "900" },

  msgBackdrop: {
    ...StyleSheet.absoluteFillObject,
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
  msg_info: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  msg_success: { backgroundColor: "#ECFDF5", borderColor: "#BBF7D0" },
  msg_warning: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  msg_error: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },

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
