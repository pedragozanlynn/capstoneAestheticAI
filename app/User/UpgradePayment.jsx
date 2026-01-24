import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  setDoc,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  Platform,
} from "react-native";
import { auth, db } from "../../config/firebase";
import { Ionicons } from "@expo/vector-icons";

export default function UpgradePayment() {
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");

  const gcashLogo = require("../../assets/gcash_logo.png");

  const GCASH_NAME = "AestheticAI";
  const GCASH_NUMBER = "0995 862 1473";

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

  const onlyDigits = (s = "") => String(s || "").replace(/\D+/g, "");

  const handleSubmit = async () => {
    const a = String(amount || "").trim();
    const r = String(reference || "").trim();

    // ✅ validations (toast, no OK)
    if (!a) return showToast("Please enter the amount sent.", "error");
    const numericAmount = Number(a.replace(/,/g, ""));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return showToast("Please enter a valid amount.", "error");
    }

    if (!r) return showToast("Please enter the reference number.", "error");
    const refDigits = onlyDigits(r);
    if (refDigits.length < 10) {
      return showToast("Please enter a valid reference number.", "error");
    }

    const uid = auth.currentUser?.uid;
    if (!uid) return showToast("Not signed in. Please sign in again and retry.", "error");

    try {
      // 1) Save payment request (ledger)
      await addDoc(collection(db, "subscription_payments"), {
        user_id: uid,
        amount: numericAmount,
        reference_number: r,
        gcash_number: GCASH_NUMBER,
        timestamp: serverTimestamp(),
        status: "Pending",
      });

      // 2) ✅ Ensure users/{uid}.isPro exists (boolean)
      // IMPORTANT: since payment is pending, set isPro to false by default.
      // When admin verifies, admin should update users/{uid}.isPro = true.
      await setDoc(
        doc(db, "users", uid),
        {
          uid,
          isPro: false,
          proStatus: "pending",
          proRequestedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // ✅ success toast (no OK)
      showToast("Payment submitted. Verification within 24 hours.", "success", 1800);

      setTimeout(() => {
        router.replace("/User/Home");
      }, 1800);
    } catch (error) {
      showToast("Something went wrong while submitting payment.", "error");
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* BACK BUTTON & HEADER */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backCircle} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Payment Details</Text>
          <Text style={styles.subtitle}>
            Send payment via GCash and enter the transaction details below.
          </Text>
        </View>

        {/* GCASH INFO CARD */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Image source={gcashLogo} style={styles.gcashLogo} />
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>OFFICIAL</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Account Name</Text>
            <Text style={styles.value}>{GCASH_NAME}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>GCash Number</Text>
            <View style={styles.numberContainer}>
              <Text style={styles.value}>{GCASH_NUMBER}</Text>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={() => showToast("Number copied to clipboard.", "success")}
              >
                <Ionicons name="copy-outline" size={18} color="#3fa796" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* INPUT FORM */}
        <View style={styles.form}>
          <Text style={styles.inputLabel}>Amount Sent (₱)</Text>
          <View style={styles.inputWrapper}>
            <Text style={styles.currencyPrefix}>₱</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
          </View>

          <Text style={styles.inputLabel}>Reference Number</Text>
          <View style={styles.inputWrapper}>
            <Ionicons
              name="receipt-outline"
              size={20}
              color="#94A3B8"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="13-digit Reference No."
              placeholderTextColor="#94A3B8"
              value={reference}
              onChangeText={setReference}
            />
          </View>
        </View>

        {/* SUBMIT BUTTON */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.submitBtn}
          onPress={handleSubmit}
        >
          <Text style={styles.submitText}>Confirm Payment</Text>
          <Ionicons name="shield-checkmark" size={20} color="#FFF" />
        </TouchableOpacity>

        <Text style={styles.note}>
          Verification may take up to 24 hours. Please keep your GCash receipt for
          reference.
        </Text>
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FDFEFF" },
  scrollContent: {
    paddingHorizontal: 25,
    paddingBottom: 40,
    paddingTop: Platform.OS === "ios" ? 50 : 20,
  },
  header: { marginBottom: 25 },
  backCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  title: {
    fontSize: 25,
    fontWeight: "900",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 6,
    lineHeight: 20,
  },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    elevation: 4,
    shadowColor: "#3fa796",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    marginBottom: 25,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  gcashLogo: { width: 90, height: 28, resizeMode: "contain" },
  statusBadge: {
    backgroundColor: "#F0FDFA",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 10, fontWeight: "800", color: "#3fa796" },

  infoRow: { marginBottom: 14 },
  label: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  value: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  numberContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  copyBtn: { padding: 4 },

  form: { marginBottom: 25 },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 15,
    height: 58,
    marginBottom: 18,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    marginRight: 10,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: "#000", fontWeight: "600" },

  submitBtn: {
    backgroundColor: "#3fa796",
    marginTop: -15,
    height: 60,
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    elevation: 5,
    shadowColor: "#3fa796",
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  submitText: { color: "#FFF", fontWeight: "800", fontSize: 17 },
  note: {
    textAlign: "center",
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 20,
    paddingHorizontal: 15,
    lineHeight: 18,
  },

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
