import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import { Ionicons } from "@expo/vector-icons";

// ✅ IMPORT YOUR EXISTING COMPONENT
import CenterMessageModal from "../components/CenterMessageModal";

export default function EarningsScreen() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  // ✅ Center message modal (STATE KEPT)
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info"); // info | success | warning | error (matches your CenterMessageModal)
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  const auth = getAuth();
  const consultantUid = auth?.currentUser?.uid;

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

  /* ================= INPUT HELPERS ================= */
  const sanitizeMoney = (v = "") => {
    const s = String(v || "").replace(/[^\d.]/g, "");
    const parts = s.split(".");
    const whole = parts[0] || "";
    const dec = parts[1] ? parts[1].slice(0, 2) : "";
    return parts.length > 1 ? `${whole}.${dec}` : whole;
  };

  const sanitizeGcash = (v = "") => String(v || "").replace(/[^\d]/g, "");

  const normalizeGcash = (digits = "") => {
    const d = sanitizeGcash(digits);
    if (d.startsWith("09") && d.length === 11) return d;
    if (d.startsWith("639") && d.length === 12) return d;
    return "";
  };

  /* ================= LOAD EARNINGS ================= */
  useEffect(() => {
    if (!consultantUid) {
      setLoading(false);
      showMessage("error", "Not signed in", "Please login to view earnings.", 1800);
      return;
    }

    setLoading(true);
    const ref = collection(db, "payments");
    const q = query(ref, where("consultantId", "==", consultantUid), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        try {
          const items = await Promise.all(
            snapshot.docs.map(async (docSnap) => {
              const data = docSnap.data() || {};
              let userName = "System";

              if (data.userId && data.type === "consultant_earning") {
                try {
                  const userDoc = await getDoc(doc(db, "users", data.userId));
                  if (userDoc.exists()) {
                    const userData = userDoc.data() || {};
                    userName = userData.name || userData.fullName || "User";
                  }
                } catch {}
              }

              const amt = Number(data.amount);
              return {
                id: docSnap.id,
                ...data,
                userName,
                consultantAmount: Number.isFinite(amt) ? amt : 0,
              };
            })
          );

          setEntries(items);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.log("❌ payments listener error:", err?.message || err);
        setLoading(false);
        showMessage("error", "Permission error", "Unable to load transactions.", 1800);
      }
    );

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultantUid]);

  /* ================= BALANCE ================= */
  const availableBalance = useMemo(() => {
    return (entries || []).reduce((sum, e) => sum + (Number(e.consultantAmount) || 0), 0);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return (entries || []).filter((item) => {
      if (activeTab === "all") return true;
      if (activeTab === "earned") return item.type === "consultant_earning";
      if (activeTab === "withdraw") return item.type === "withdraw";
      if (activeTab === "reversal") return item.type === "withdraw_reversal";
      return true;
    });
  }, [entries, activeTab]);

  const closeWithdrawModal = () => {
    if (submitting) return;
    setWithdrawVisible(false);
  };

  const submitWithdraw = async () => {
    if (!consultantUid) {
      showMessage("error", "Not signed in", "Please login again.", 1800);
      return;
    }
    if (submitting) return;

    const amtStr = sanitizeMoney(withdrawAmount);
    const amt = Number(amtStr);
    const gcashNorm = normalizeGcash(gcashNumber);

    // ✅ Validations
    if (!amtStr || !Number.isFinite(amt)) {
      showMessage("error", "Invalid amount", "Please enter a valid withdrawal amount.", 1800);
      return;
    }
    if (amt <= 0) {
      showMessage("error", "Invalid amount", "Amount must be greater than 0.", 1800);
      return;
    }
    if (amt > availableBalance) {
      showMessage("error", "Insufficient balance", "Withdrawal exceeds available balance.", 1800);
      return;
    }
    if (!gcashNorm) {
      showMessage(
        "error",
        "Invalid GCash number",
        "Enter 11 digits (09xxxxxxxxx) or 12 digits (639xxxxxxxxx).",
        2200
      );
      return;
    }

    setSubmitting(true);

    try {
      // payout request
      await addDoc(collection(db, "payouts"), {
        consultantId: consultantUid,
        amount: amt,
        gcash_number: gcashNorm,
        createdAt: serverTimestamp(),
        status: "pending",
      });

      // ledger entry (negative)
      await addDoc(collection(db, "payments"), {
        consultantId: consultantUid,
        userId: consultantUid,
        type: "withdraw",
        amount: -amt,
        createdAt: serverTimestamp(),
        status: "pending",
      });

      showMessage("success", "Submitted", "Withdrawal request has been submitted.", 1600);

      setWithdrawVisible(false);
      setWithdrawAmount("");
      setGcashNumber("");
    } catch (err) {
      console.log("❌ withdraw submit error:", err?.message || err);
      showMessage("error", "Submit failed", "Unable to submit withdrawal request.", 1900);
    } finally {
      setSubmitting(false);
    }
  };

  const renderTransaction = ({ item }) => {
    const isEarning = item.type === "consultant_earning" || item.type === "withdraw_reversal";
    const iconName = isEarning ? "arrow-down-outline" : "arrow-up-outline";
    const iconColor = isEarning ? "#065F46" : "#991B1B";

    const title =
      item.type === "consultant_earning"
        ? "Consultation Fee"
        : item.type === "withdraw"
        ? "Withdrawal"
        : "Refund Reversal";

    const dateText =
      item.createdAt?.toDate?.()
        ? item.createdAt.toDate().toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";

    return (
      <View style={styles.card}>
        <View style={styles.cardIconWrap(item.type)}>
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDate}>{dateText}</Text>
        </View>

        <Text style={[styles.amount, { color: isEarning ? "#059669" : "#DC2626" }]}>
          {isEarning ? "+" : "-"} ₱{Math.abs(Number(item.consultantAmount) || 0).toFixed(2)}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#01579B" translucent={false} />

      <View style={styles.headerArea}>
        <SafeAreaView>
          <View style={styles.balanceCard}>
            <View>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceAmount}>
                ₱{" "}
                {Number(availableBalance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.balanceWithdrawBtn,
                (availableBalance <= 0 || loading) && { opacity: 0.6 },
              ]}
              onPress={() => {
                if (loading) return;
                if (availableBalance <= 0) {
                  showMessage("info", "No balance", "You have no available balance to withdraw.", 1700);
                  return;
                }
                setWithdrawVisible(true);
              }}
              activeOpacity={0.85}
              disabled={loading}
            >
              <Ionicons name="wallet-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.balanceWithdrawText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.content}>
        <Text style={styles.historyTitle}>Transactions</Text>

        <View style={styles.tabsRow}>
          {["all", "earned", "withdraw", "reversal"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === "all" ? "All" : tab === "earned" ? "Fees" : tab === "withdraw" ? "Paid" : "Rev"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#01579B" />
            <Text style={styles.loadingText}>Updating balance...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredEntries}
            keyExtractor={(item) => item.id}
            renderItem={renderTransaction}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Ionicons name="receipt-outline" size={50} color="#CBD5E1" />
                <Text style={styles.emptyText}>No transactions in this category</Text>
              </View>
            }
          />
        )}
      </View>

      {/* WITHDRAW MODAL */}
      <Modal visible={withdrawVisible} transparent animationType="fade" onRequestClose={closeWithdrawModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable style={{ flex: 1, justifyContent: "center" }} onPress={closeWithdrawModal}>
            <Pressable style={styles.modalBox} onPress={() => {}}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Withdraw via GCash</Text>
                <TouchableOpacity onPress={closeWithdrawModal} disabled={submitting} activeOpacity={0.85}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Withdrawal Amount</Text>
                <View style={styles.inputWrap}>
                  <Text style={styles.currencyPrefix}>₱</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChangeText={(v) => setWithdrawAmount(sanitizeMoney(v))}
                    editable={!submitting}
                  />
                </View>

                <View style={styles.quickRow}>
                  <TouchableOpacity
                    style={styles.quickBtn}
                    onPress={() => setWithdrawAmount(String(Math.max(0, availableBalance).toFixed(2)))}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.quickText}>Withdraw All</Text>
                  </TouchableOpacity>

                  <Text style={styles.quickHint}>Max: ₱{Math.max(0, availableBalance).toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>GCash Mobile Number</Text>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="phone-portrait-outline"
                    size={18}
                    color="#94A3B8"
                    style={{ marginLeft: 10 }}
                  />
                  <TextInput
                    style={[styles.input, { paddingLeft: 10 }]}
                    keyboardType="phone-pad"
                    placeholder="09xxxxxxxxx or 639xxxxxxxxx"
                    value={gcashNumber}
                    onChangeText={(v) => setGcashNumber(sanitizeGcash(v))}
                    editable={!submitting}
                    maxLength={12}
                  />
                </View>

                <Text style={styles.helperText}>
                  Format: 09xxxxxxxxx (11 digits) or 639xxxxxxxxx (12 digits)
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.75 }]}
                onPress={submitWithdraw}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.submitText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ✅ CENTER MESSAGE MODAL (USING YOUR COMPONENT) */}
      <CenterMessageModal
        visible={msgVisible}
        type={msgType}
        title={msgTitle}
        message={msgBody}
        onClose={closeMessage}
      />

      <BottomNavbar role="consultant" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  headerArea: {
    backgroundColor: "#01579B",
    paddingBottom: 16,
    paddingTop: 20,
  },
  balanceCard: {
    paddingHorizontal: 20,
    paddingTop: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  balanceAmount: { fontSize: 30, fontWeight: "900", color: "#fff", marginTop: 2 },
  balanceWithdrawBtn: {
    backgroundColor: "#3fa796",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  balanceWithdrawText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  content: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  historyTitle: { fontSize: 18, fontWeight: "800", color: "#1E293B", marginBottom: 14 },

  tabsRow: { flexDirection: "row", marginBottom: 18, gap: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#F1F5F9", alignItems: "center" },
  tabActive: { backgroundColor: "#01579B" },
  tabText: { fontSize: 11, fontWeight: "800", color: "#64748B" },
  tabTextActive: { color: "#fff" },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  cardIconWrap: (type) => ({
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    backgroundColor: String(type || "").includes("withdraw") ? "#FEE2E2" : "#D1FAE5",
  }),
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#1E293B" },
  cardDate: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  amount: { fontSize: 16, fontWeight: "900" },

  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  loadingText: { color: "#64748B", fontWeight: "600" },

  emptyBox: { alignItems: "center", marginTop: 50 },
  emptyText: { color: "#94A3B8", marginTop: 10, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "center", padding: 22 },
  modalBox: { backgroundColor: "#fff", borderRadius: 26, padding: 22, elevation: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#1E293B" },

  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: "700", color: "#64748B", marginBottom: 8 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  currencyPrefix: { fontSize: 16, fontWeight: "700", color: "#1E293B", marginLeft: 15 },
  input: { flex: 1, padding: 14, fontSize: 16, color: "#1E293B", fontWeight: "600" },

  helperText: { marginTop: 8, fontSize: 12, color: "#94A3B8", fontWeight: "700" },

  quickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  quickBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickText: { fontSize: 12, fontWeight: "900", color: "#01579B" },
  quickHint: { fontSize: 12, fontWeight: "800", color: "#64748B" },

  submitBtn: {
    backgroundColor: "#01579B",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    elevation: 4,
    shadowColor: "#01579B",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    alignItems: "center",
  },
  submitText: { color: "#fff", textAlign: "center", fontWeight: "800", fontSize: 15 },
});
