// app/User/UpgradePayment.jsx
// ✅ UPDATED (COMPLETE):
// - Auto-scroll kapag tinap ang Amount/Reference input (kitang-kita kahit may keyboard)
// - KeyboardAvoidingView + ScrollView ref + input Y tracking
// - Monthly/Yearly plan via route param: /User/UpgradePayment?plan=yearly
// - Amount validation uses CenterMessageModal
// - Saves to Firestore: subscription_payments
// - Sets users/{uid}.proStatus="pending" (admin verifies later)

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  StatusBar,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../config/firebase";

// ✅ adjust path if needed
import CenterMessageModal from "../components/CenterMessageModal";

/* =========================
   CONFIG
========================= */
const GCASH_NAME = "AestheticAI";
const GCASH_NUMBER = "0912 345 6789";

const PRICE_MONTHLY = 299;
const PRICE_YEARLY = 2999;

/* =========================
   HELPERS
========================= */
const safeStr = (v) => (v == null ? "" : String(v).trim());
const onlyDigits = (s = "") => String(s || "").replace(/\D+/g, "");

const parseAmount = (raw) => {
  const s = safeStr(raw).replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/* =========================
   COMPONENT
========================= */
export default function UpgradePayment() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // plan from UpgradeInfo: router.push(`/User/UpgradePayment?plan=${plan}`)
  const plan = useMemo(() => {
    const p = safeStr(params?.plan).toLowerCase();
    return p === "yearly" ? "yearly" : "monthly";
  }, [params]);

  const expectedAmount = useMemo(() => (plan === "yearly" ? PRICE_YEARLY : PRICE_MONTHLY), [plan]);
  const planLabel = useMemo(() => (plan === "yearly" ? "Yearly Plan" : "Monthly Plan"), [plan]);

  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ✅ toast for small notices
  const [toast, setToast] = useState({ visible: false, text: "", type: "info" });
  const toastTimerRef = useRef(null);

  // ✅ center modal for important validations
  const [modal, setModal] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const gcashLogo = useMemo(() => require("../../assets/gcash_logo.png"), []);

  // ✅ refs for auto-scroll
  const scrollRef = useRef(null);
  const amountYRef = useRef(0);
  const referenceYRef = useRef(0);

  const showToast = useCallback((text, type = "info", ms = 1800) => {
    try {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ visible: true, text: safeStr(text), type });
      toastTimerRef.current = setTimeout(() => {
        setToast((t) => ({ ...t, visible: false }));
      }, ms);
    } catch {}
  }, []);

  const showModal = useCallback((title, message, type = "info") => {
    setModal({
      visible: true,
      title: safeStr(title),
      message: safeStr(message),
      type,
    });
  }, []);

  const closeModal = useCallback(() => {
    setModal((m) => ({ ...m, visible: false }));
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      } catch {}
    };
  }, []);

  const scrollToY = useCallback((y) => {
    // small offset para hindi dikit sa top
    const target = Math.max(0, Number(y || 0) - 16);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo?.({ y: target, animated: true });
    });
  }, []);

  const validateInputs = useCallback(() => {
    const amt = parseAmount(amount);
    const ref = safeStr(reference);
    const refDigits = onlyDigits(ref);

    if (!safeStr(amount)) {
      showModal("Missing Amount", "Please enter the amount you sent.", "error");
      return { ok: false };
    }

    if (!Number.isFinite(amt) || amt <= 0) {
      showModal("Invalid Amount", "Please enter a valid amount.", "error");
      return { ok: false };
    }

    // ✅ mismatch check
    if (Math.abs(amt - expectedAmount) > 0.01) {
      showModal(
        "Amount Mismatch",
        `The amount you entered (₱${amt}) does not match the required payment for the ${planLabel} (₱${expectedAmount}). Please correct the amount.`,
        "error"
      );
      return { ok: false };
    }

    if (!ref) {
      showModal("Missing Reference", "Please enter your GCash reference number.", "error");
      return { ok: false };
    }

    if (refDigits.length < 10) {
      showModal("Invalid Reference", "Please enter a valid reference number.", "error");
      return { ok: false };
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      showModal("Session Required", "Not signed in. Please sign in again and retry.", "error");
      return { ok: false };
    }

    return { ok: true, uid, numericAmount: amt, referenceText: ref };
  }, [amount, expectedAmount, planLabel, reference, showModal]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;

    const res = validateInputs();
    if (!res.ok) return;

    const { uid, numericAmount, referenceText } = res;

    try {
      setSubmitting(true);

      await addDoc(collection(db, "subscription_payments"), {
        user_id: uid,
        plan, // "monthly" | "yearly"
        amount: numericAmount,
        expected_amount: expectedAmount,
        reference_number: referenceText,
        gcash_name: GCASH_NAME,
        gcash_number: GCASH_NUMBER,
        status: "Pending",
        timestamp: serverTimestamp(),
      });

      await setDoc(
        doc(db, "users", uid),
        {
          uid,
          isPro: false,
          subscription_type: "Free",
          proStatus: "pending",
          proPlanRequested: plan,
          proRequestedAt: serverTimestamp(),
        },
        { merge: true }
      );

      Keyboard.dismiss();

      showModal(
        "Payment Submitted",
        "Payment submitted successfully. Verification may take up to 24 hours.",
        "success"
      );

      setTimeout(() => {
        router.replace("/User/Home");
      }, 1200);
    } catch (e) {
      console.log("submit payment error:", e?.message || e);
      showModal("Submission Failed", "Something went wrong while submitting payment.", "error");
    } finally {
      setSubmitting(false);
    }
  }, [expectedAmount, plan, router, showModal, submitting, validateInputs]);

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFEFF" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* HEADER */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backCircle} onPress={router.back} activeOpacity={0.85}>
              <Ionicons name="chevron-back" size={22} color="#000" />
            </TouchableOpacity>

            <Text style={styles.title}>Payment Details</Text>
            <Text style={styles.subtitle}>
              Send payment via GCash for the{" "}
              <Text style={{ fontWeight: "900" }}>{planLabel}</Text> and enter the transaction details below.
            </Text>
          </View>

          {/* GCASH INFO */}
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
                  onPress={() => showToast("Copy manually: " + GCASH_NUMBER, "success")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="copy-outline" size={18} color="#3fa796" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.infoRow, { marginBottom: 0 }]}>
              <Text style={styles.label}>Amount to Send</Text>
              <Text style={[styles.value, { color: "#3fa796" }]}>₱{expectedAmount}</Text>
            </View>
          </View>

          {/* FORM */}
          <View style={styles.form}>
            {/* Amount */}
            <View
              onLayout={(e) => {
                amountYRef.current = e?.nativeEvent?.layout?.y ?? 0;
              }}
            >
              <Text style={styles.inputLabel}>Amount Sent (₱)</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.currencyPrefix}>₱</Text>
                <TextInput
                  style={styles.input}
                  placeholder={`${expectedAmount}`}
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                  onFocus={() => scrollToY(amountYRef.current)}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Reference */}
            <View
              onLayout={(e) => {
                referenceYRef.current = e?.nativeEvent?.layout?.y ?? 0;
              }}
            >
              <Text style={styles.inputLabel}>Reference Number</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="receipt-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Reference No."
                  placeholderTextColor="#94A3B8"
                  value={reference}
                  onChangeText={setReference}
                  autoCapitalize="none"
                  onFocus={() => scrollToY(referenceYRef.current)}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>
            </View>
          </View>

          {/* SUBMIT */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Text style={styles.submitText}>Confirm Payment</Text>
                <Ionicons name="shield-checkmark" size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.note}>
            Verification may take up to 24 hours. Please keep your GCash receipt for reference.
          </Text>
        </ScrollView>

        {/* TOAST */}
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

        {/* CENTER MODAL */}
        <CenterMessageModal
          visible={modal.visible}
          title={modal.title}
          message={modal.message}
          type={modal.type}
          onClose={closeModal}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

/* =========================
   STYLES
========================= */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FDFEFF" },
  scrollContent: {
    paddingHorizontal: 25,
    paddingBottom: 50,
    paddingTop: Platform.OS === "ios" ? 50 : 50,
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
  title: { fontSize: 25, fontWeight: "900", color: "#1E293B", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "#64748B", marginTop: 6, lineHeight: 20 },

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
  statusBadge: { backgroundColor: "#F0FDFA", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
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
  numberContainer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  copyBtn: { padding: 4 },

  form: { marginBottom: 25 },
  inputLabel: { fontSize: 14, fontWeight: "700", color: "#1E293B", marginBottom: 8, marginLeft: 4 },
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
  currencyPrefix: { fontSize: 18, fontWeight: "700", color: "#1E293B", marginRight: 10 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: "#000", fontWeight: "600" },

  submitBtn: {
    backgroundColor: "#3fa796",
    marginTop: -10,
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
    marginTop: 18,
    paddingHorizontal: 15,
    lineHeight: 18,
  },

  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    top: Platform.OS === "ios" ? 58 : 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    opacity: 0.96,
    elevation: 10,
    zIndex: 9999,
  },
  toastText: { color: "#fff", fontWeight: "800", fontSize: 13, textAlign: "center" },
  toastInfo: { backgroundColor: "#0F172A" },
  toastSuccess: { backgroundColor: "#16A34A" },
  toastError: { backgroundColor: "#DC2626" },
});
