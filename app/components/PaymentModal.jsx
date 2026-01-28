import { Ionicons } from "@expo/vector-icons";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { db } from "../../config/firebase";

// ✅ CenterMessageModal
import CenterMessageModal from "./CenterMessageModal";

const { width } = Dimensions.get("window");

const formatDate = (ts) => {
  if (!ts) return "TBA";
  if (typeof ts?.toDate === "function") {
    return ts.toDate().toLocaleDateString("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  return "TBA";
};

const formatTime = (ts) => {
  if (!ts) return "TBA";
  if (typeof ts?.toDate === "function") {
    return ts.toDate().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return "TBA";
};

export default function PaymentModal({
  visible,
  onClose,
  userId,
  consultantId,
  consultantName,
  appointmentId,
  onPaymentSuccess,

  // ✅ passed from ChatList
  sessionFee: sessionFeeProp,
  appointmentAt: appointmentAtProp,
}) {
  const [loading, setLoading] = useState(false);
  const [sessionFee, setSessionFee] = useState(Number(sessionFeeProp || 0));
  const [appointmentAt, setAppointmentAt] = useState(appointmentAtProp || null);
  const [fetching, setFetching] = useState(true);

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

  // ✅ CenterMessageModal state (added)
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");

  const showMsg = (type, title, body = "") => {
    setMsgType(type);
    setMsgTitle(title);
    setMsgBody(body);
    setMsgOpen(true);
  };

  useEffect(() => {
    if (!visible) return;

    console.log("🧾 PaymentModal opened with props:", {
      userId,
      consultantId,
      consultantName,
      appointmentId,
      sessionFeeProp,
      appointmentAtProp,
    });

    setSessionFee(Number(sessionFeeProp || 0));
    setAppointmentAt(appointmentAtProp || null);

    // ✅ no fetch; stop loader immediately
    setFetching(false);
  }, [
    visible,
    sessionFeeProp,
    appointmentAtProp,
    userId,
    consultantId,
    consultantName,
    appointmentId,
  ]);

  const safeDate = formatDate(appointmentAt);
  const safeTime = formatTime(appointmentAt);

  /* ================= VALIDATIONS ================= */
  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const validatePayment = () => {
    if (!userId) return "Missing user ID.";
    if (!consultantId) return "Missing consultant ID.";
    if (!appointmentId) return "Missing appointment ID.";
    const fee = safeNum(sessionFee);
    if (!fee || fee <= 0) return "Invalid session fee.";
    if (!appointmentAt) return "Missing appointment schedule.";
    if (loading) return "Please wait… payment is processing.";
    return "";
  };

  const handlePayment = async () => {
    const err = validatePayment();
    if (err) {
      showToast(err, "error");
      // ✅ also show CenterMessageModal
      showMsg("error", "Payment Error", err);

      console.log("❌ Payment validation failed:", {
        err,
        userId,
        consultantId,
        appointmentId,
        sessionFee,
        appointmentAt,
      });
      return;
    }

    setLoading(true);
    try {
      const fee = safeNum(sessionFee);
      const consultantShare = Number((fee * 0.9).toFixed(2));
      const adminShare = Number((fee * 0.1).toFixed(2));

      // ✅ defensive: ensure sum matches base (avoid rounding drift)
      const total = Number((consultantShare + adminShare).toFixed(2));
      const baseAmount = Number(fee.toFixed(2));
      const adjust = Number((baseAmount - total).toFixed(2));
      const finalConsultantShare = Number((consultantShare + adjust).toFixed(2));

      await addDoc(collection(db, "payments"), {
        userId,
        consultantId,
        consultantName: consultantName || "Consultant",
        appointmentId,
        appointmentAt,
        amount: finalConsultantShare,
        baseAmount: baseAmount,
        currency: "PHP",
        status: "completed",
        createdAt: serverTimestamp(),
        type: "consultant_earning",
      });

      await addDoc(collection(db, "subscription_payments"), {
        adminId: "ADMIN_UID",
        userId,
        consultantId,
        appointmentId,
        appointmentAt,
        amount: adminShare,
        baseAmount: baseAmount,
        currency: "PHP",
        status: "completed",
        createdAt: serverTimestamp(),
        type: "admin_income",
      });

      // ✅ toast success (no Alert)
      showToast("Payment successful. Starting consultation...", "success", 1600);

      // ✅ also show CenterMessageModal success
      showMsg(
        "success",
        "Payment Successful",
        "Payment successful. Starting consultation..."
      );

      setLoading(false);

      // allow toast to show briefly then close
      setTimeout(() => {
        try {
          onPaymentSuccess?.();
        } catch {}
        try {
          onClose?.();
        } catch {}
      }, 450);
    } catch (err) {
      setLoading(false);
      console.log("❌ Payment failed:", err?.message || err);
      showToast("Payment failed. Please try again.", "error");

      // ✅ also show CenterMessageModal error
      showMsg("error", "Payment Failed", "Payment failed. Please try again.");
    }
  };

  return (
    <>
      <Modal visible={!!visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Ionicons name="card-outline" size={32} color="#01579B" />
            </View>

            <Text style={styles.title}>Payment Details</Text>
            <Text style={styles.subtitle}>Complete payment to start session</Text>

            {fetching ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="large" color="#01579B" />
                <Text style={styles.loaderText}>Fetching Invoice...</Text>
              </View>
            ) : (
              <>
                <View style={styles.invoiceContainer}>
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Consultant</Text>
                    <Text style={styles.value}>
                      {consultantName || "Consultant"}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Schedule</Text>
                    <Text style={styles.value}>{safeDate}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Time Slot</Text>
                    <Text style={styles.value}>{safeTime}</Text>
                  </View>

                  <View style={styles.dashedDivider} />

                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Grand Total</Text>
                    <Text style={styles.totalValue}>
                      ₱{Number(sessionFee || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.securityNote}>
                  <Ionicons
                    name="shield-checkmark"
                    size={14}
                    color="#64748B"
                  />
                  <Text style={styles.securityText}>
                    Secure Transaction via GCash Balance
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.payBtn, loading && styles.disabledBtn]}
                  onPress={handlePayment}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.payText}>Pay & Start Consultation</Text>
                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color="#FFF"
                        style={{ marginLeft: 8 }}
                      />
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onClose}
                  style={styles.cancelBtn}
                  disabled={loading}
                >
                  <Text style={styles.cancelText}>Cancel Payment</Text>
                </TouchableOpacity>
              </>
            )}

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
        </View>
      </Modal>

      {/* ✅ CenterMessageModal (added, outside Modal) */}
      <CenterMessageModal
        visible={msgOpen}
        type={msgType}
        title={msgTitle}
        message={msgBody}
        onClose={() => setMsgOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: width * 0.85,
    backgroundColor: "#fff",
    borderRadius: 30,
    padding: 24,
    alignItems: "center",
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E1F5FE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "900", color: "#1E293B" },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
    marginBottom: 24,
  },
  invoiceContainer: {
    width: "100%",
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  label: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  value: { fontSize: 13, color: "#1E293B", fontWeight: "700" },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderStyle: "dashed",
    marginVertical: 15,
    borderRadius: 1,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 15, fontWeight: "800", color: "#1E293B" },
  totalValue: { fontSize: 24, fontWeight: "900", color: "#01579B" },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    marginBottom: 25,
    gap: 5,
  },
  securityText: { fontSize: 12, color: "#64748B", fontWeight: "500" },

  payBtn: {
    backgroundColor: "#2c4f4f",
    width: "100%",
    alignSelf: "stretch",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    elevation: 8,
    zIndex: 10,
    shadowColor: "#01579B",
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  disabledBtn: { opacity: 0.7, backgroundColor: "#94A3B8" },
  payText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  cancelBtn: { marginTop: 16, padding: 10 },
  cancelText: { color: "#94A3B8", fontSize: 14, fontWeight: "700" },
  loaderWrap: { padding: 40, alignItems: "center" },
  loaderText: { marginTop: 10, color: "#64748B", fontSize: 13 },

  /* ===== TOAST (TOP, NO OK) ===== */
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    top: Platform.OS === "ios" ? 16 : 12,
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
