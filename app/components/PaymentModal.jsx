import { Ionicons } from "@expo/vector-icons";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../config/firebase";

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
  }, [visible, sessionFeeProp, appointmentAtProp]);

  const safeDate = formatDate(appointmentAt);
  const safeTime = formatTime(appointmentAt);

  const handlePayment = async () => {
    if (!userId || !consultantId || !appointmentId || !sessionFee) {
      alert("Missing payment information.");
      console.log("❌ Missing payment info:", { userId, consultantId, appointmentId, sessionFee });
      return;
    }

    setLoading(true);
    try {
      const consultantShare = Number((sessionFee * 0.9).toFixed(2));
      const adminShare = Number((sessionFee * 0.1).toFixed(2));

      await addDoc(collection(db, "payments"), {
        userId,
        consultantId,
        consultantName: consultantName || "Consultant",
        appointmentId,
        appointmentAt,
        amount: consultantShare,
        baseAmount: sessionFee,
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
        baseAmount: sessionFee,
        currency: "PHP",
        status: "completed",
        createdAt: serverTimestamp(),
        type: "admin_income",
      });

      setLoading(false);
      onPaymentSuccess?.();
      onClose?.();
    } catch (err) {
      setLoading(false);
      console.log("❌ Payment failed:", err?.message || err);
      alert("Payment failed. Please try again.");
    }
  };

  return (
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
                  <Text style={styles.value}>{consultantName || "Consultant"}</Text>
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
                  <Text style={styles.totalValue}>₱{Number(sessionFee || 0).toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.securityNote}>
                <Ionicons name="shield-checkmark" size={14} color="#64748B" />
                <Text style={styles.securityText}>Secure Transaction via GCash Balance</Text>
              </View>

              <TouchableOpacity
                style={[styles.payBtn, loading && styles.disabledBtn]}
                onPress={handlePayment}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.payText}>Pay & Start Consultation</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 8 }} />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel Payment</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
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
  subtitle: { fontSize: 14, color: "#64748B", marginTop: 4, marginBottom: 24 },
  invoiceContainer: {
    width: "100%",
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
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
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 15, fontWeight: "800", color: "#1E293B" },
  totalValue: { fontSize: 24, fontWeight: "900", color: "#01579B" },
  securityNote: { flexDirection: "row", alignItems: "center", marginTop: 15, marginBottom: 25, gap: 5 },
  securityText: { fontSize: 12, color: "#64748B", fontWeight: "500" },

  // ✅ keep your button visibility fixes
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
});
