import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  updateDoc,
  serverTimestamp,
  query,
  where,
  limit,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import { SafeAreaView } from "react-native-safe-area-context";

const COLLECTION_PAYMENTS = "subscription_payments";

/** -----------------------------
 * Helpers
 * ----------------------------- */
const safeStr = (v) => (v == null ? "" : String(v).trim());

const normalizePaymentStatus = (status) => {
  const s = safeStr(status);
  if (s === "Pending") return "Pending";
  if (s === "Approved") return "Approved";
  if (s === "Rejected") return "Rejected";

  const low = s.toLowerCase();
  if (low === "pending") return "Pending";
  if (low === "approved") return "Approved";
  if (low === "rejected") return "Rejected";
  if (low === "completed") return "Completed";

  return s || "Pending";
};

const isPositiveAmount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
};

const normalizeTxType = (docType) => {
  const t = safeStr(docType).toLowerCase();
  if (t === "admin_income") return "admin_income";
  return "subscription";
};

const getTxMillis = (tx) => {
  const tryTs = (x) => (x?.toMillis?.() ? x.toMillis() : 0);
  return (
    tryTs(tx?.timestamp) ||
    tryTs(tx?.createdAt) ||
    tryTs(tx?.created_at) ||
    tryTs(tx?.paidAt) ||
    tryTs(tx?.updatedAt) ||
    0
  );
};

const formatTs = (ts) => {
  try {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleString();
  } catch {
    return "";
  }
};

/** ✅ Robust consultant fetch (docId may not equal uid) */
const fetchConsultantByUid = async (consultantId) => {
  const cid = safeStr(consultantId);
  if (!cid) return null;

  // 1) direct doc id attempt
  try {
    const direct = await getDoc(doc(db, "consultants", cid));
    if (direct.exists()) return direct.data();
  } catch {}

  // 2) fallback: query by common uid fields
  try {
    let q = query(collection(db, "consultants"), where("uid", "==", cid), limit(1));
    let snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].data();

    q = query(collection(db, "consultants"), where("userId", "==", cid), limit(1));
    snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].data();

    q = query(collection(db, "consultants"), where("consultantId", "==", cid), limit(1));
    snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].data();
  } catch (e) {
    console.log("Consultant fallback query failed:", e?.message || e);
  }

  return null;
};

export default function AdminTransactions() {
  const router = useRouter();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // 3 tabs only
  const [activeTab, setActiveTab] = useState("All"); // All | Subscription | Admin Share

  const actionLockRef = useRef(false);

  // cache to reduce reads
  const userCacheRef = useRef(new Map());
  const consultantCacheRef = useRef(new Map());

  const fetchUserCached = async (userId) => {
    const uid = safeStr(userId);
    if (!uid) return null;
    if (userCacheRef.current.has(uid)) return userCacheRef.current.get(uid);

    try {
      const s = await getDoc(doc(db, "users", uid));
      const data = s.exists() ? s.data() : null;
      userCacheRef.current.set(uid, data);
      return data;
    } catch (e) {
      console.log("User fetch failed:", uid, e?.message || e);
      userCacheRef.current.set(uid, null);
      return null;
    }
  };

  const fetchConsultantCached = async (consultantId) => {
    const cid = safeStr(consultantId);
    if (!cid) return null;
    if (consultantCacheRef.current.has(cid)) return consultantCacheRef.current.get(cid);

    const data = await fetchConsultantByUid(cid);
    consultantCacheRef.current.set(cid, data);
    return data;
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION_PAYMENTS));

      const rows = await Promise.all(
        snap.docs.map(async (docSnap) => {
          const data = docSnap.data();
          const txType = normalizeTxType(data?.type);

          const userId = safeStr(data?.userId) || safeStr(data?.user_id);
          const consultantId = safeStr(data?.consultantId) || safeStr(data?.consultant_id);

          const userData = await fetchUserCached(userId);
          const consultantData = await fetchConsultantCached(consultantId);

          return {
            id: docSnap.id,
            ...data,
            txType,
            status: normalizePaymentStatus(data?.status),
            userId,
            consultantId,
            user: userData,
            consultant: consultantData,
          };
        })
      );

      rows.sort((a, b) => getTxMillis(b) - getTxMillis(a));
      setTransactions(rows);
    } catch (error) {
      console.error("Fetch transactions error:", error);
      Alert.alert("Error", "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const filteredTransactions = useMemo(() => {
    if (activeTab === "All") return transactions;
    if (activeTab === "Subscription") return transactions.filter((t) => t.txType === "subscription");
    if (activeTab === "Admin Share") return transactions.filter((t) => t.txType === "admin_income");
    return transactions;
  }, [transactions, activeTab]);

  /** -----------------------------
   * Approve/Reject ONLY for subscription
   * ----------------------------- */
  const notifyUserSubscription = async ({ userId, approved, payment }) => {
    const uid = safeStr(userId);
    if (!uid) return;

    const title = approved ? "Subscription Approved" : "Subscription Rejected";
    const type = approved ? "subscription_accepted" : "subscription_rejected";

    const amount =
      payment?.amount != null
        ? `₱${Number(payment.amount).toFixed?.(2) || payment.amount}`
        : "";
    const ref = payment?.reference_number ? `Ref: ${payment.reference_number}` : "";

    const message = approved
      ? `Your Premium subscription is now active. ${amount ? `(${amount})` : ""} ${ref ? `• ${ref}` : ""}`.trim()
      : `Your subscription request was rejected. ${ref ? `(${ref})` : ""}`.trim();

    try {
      await addDoc(collection(db, "notifications"), {
        userId: uid,
        title,
        message,
        type,
        read: false,
        createdAt: serverTimestamp(),
        amount: payment?.amount ?? null,
        sessionFee: payment?.amount ?? null,
      });
    } catch (e) {
      console.log("❌ notifyUserSubscription failed:", e?.message || e);
    }
  };

  const validatePaymentBeforeAction = (payment) => {
    if (!payment?.id) return "Payment document ID is missing.";
    if (payment?.txType !== "subscription") return "This transaction is not a subscription request.";
    const uid = safeStr(payment?.userId) || safeStr(payment?.user_id);
    if (!uid) return "Missing user ID for this payment.";
    if (normalizePaymentStatus(payment?.status) !== "Pending") return "This payment is no longer pending.";
    if (!safeStr(payment?.reference_number)) return "Reference number is missing.";
    if (!safeStr(payment?.gcash_number)) return "GCash number is missing.";
    if (!isPositiveAmount(payment?.amount)) return "Invalid amount.";
    return "";
  };

  const handleApprove = async (payment) => {
    const vErr = validatePaymentBeforeAction(payment);
    if (vErr) return Alert.alert("Cannot approve", vErr);

    Alert.alert("Approve Payment", "Approve this subscription?", [
      { text: "Cancel" },
      {
        text: "Approve",
        onPress: async () => {
          if (actionLockRef.current) return;
          actionLockRef.current = true;

          setActionLoading(true);
          try {
            const uid = safeStr(payment?.userId) || safeStr(payment?.user_id);
            const userRef = doc(db, "users", uid);

            const now = Timestamp.now();
            const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);

            await updateDoc(userRef, {
              subscription_type: "Premium",
              subscribed_at: now,
              subscription_expires_at: expiresAt,
              isPro: true,
              proStatus: "active",
              proActivatedAt: now,
              subscription_status: "approved",
              subscription_updated_at: now,
            });

            await updateDoc(doc(db, COLLECTION_PAYMENTS, payment.id), { status: "Approved" });

            await notifyUserSubscription({ userId: uid, approved: true, payment });

            Alert.alert("Success", "Subscription upgraded!");
            await fetchTransactions();
          } catch (error) {
            console.log("❌ approve error:", error?.message || error);
            Alert.alert("Error", "Failed to approve payment.");
          } finally {
            setActionLoading(false);
            actionLockRef.current = false;
          }
        },
      },
    ]);
  };

  const handleReject = async (payment) => {
    const vErr = validatePaymentBeforeAction(payment);
    if (vErr) return Alert.alert("Cannot reject", vErr);

    Alert.alert("Reject Payment", "Reject this subscription?", [
      { text: "Cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          if (actionLockRef.current) return;
          actionLockRef.current = true;

          setActionLoading(true);
          try {
            const uid = safeStr(payment?.userId) || safeStr(payment?.user_id);
            const userRef = doc(db, "users", uid);

            await updateDoc(userRef, {
              subscription_type: "Free",
              isPro: false,
              proStatus: "inactive",
              subscription_status: "rejected",
              subscription_updated_at: Timestamp.now(),
            });

            await updateDoc(doc(db, COLLECTION_PAYMENTS, payment.id), { status: "Rejected" });

            await notifyUserSubscription({ userId: uid, approved: false, payment });

            Alert.alert("Done", "Subscription request rejected.");
            await fetchTransactions();
          } catch (e) {
            console.log("❌ reject error:", e?.message || e);
            Alert.alert("Error", "Failed to reject payment.");
          } finally {
            setActionLoading(false);
            actionLockRef.current = false;
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.mainContainer}>
      {/* ✅ Stable on installed Android apps */}
      <StatusBar
        barStyle="light-content"
     backgroundColor="#01579B"

        translucent={false}
      />

      {/* ✅ HEADER: SafeAreaView is the ONLY top padding (no double inset padding) */}
      <View style={styles.headerWrap}>
        <SafeAreaView edges={["top"]} style={styles.headerSafe}>
          <View style={styles.headerInner}>
            <Text style={styles.headerTitle}>Admin Transactions</Text>
            <Text style={styles.headerSubtitle}>
              Subscription payments & session-fee admin earnings
            </Text>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.filterWrapper}>
        <View style={styles.filterContainer}>
          {["All", "Subscription", "Admin Share"].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.85}
              style={[styles.filterTab, activeTab === tab && styles.activeFilterTab]}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeTab === tab && styles.activeFilterTabText,
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerLoader}>
<ActivityIndicator size="large" color="#01579B" />
<Text style={styles.loadingText}>Fetching transactions...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          contentContainerStyle={styles.listContent}
          keyExtractor={(item) => `${item.txType}:${item.id}`}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSubscription = item.txType === "subscription";
            const isAdminIncome = item.txType === "admin_income";
            const status = normalizePaymentStatus(item.status);

            const typeLabel = isSubscription ? "Subscription" : "Session Fee (Admin Income)";

            const userName =
              item.user?.name ||
              item.user?.fullName ||
              item.user?.displayName ||
              "Unknown User";

            const consultantName =
              item.consultant?.name ||
              item.consultant?.fullName ||
              item.consultant?.displayName ||
              item.consultant?.username ||
              "Unknown Consultant";

            const statusBg =
              status === "Approved"
                ? "#E8F5E9"
                : status === "Rejected"
                ? "#FEE2E2"
                : "#FFF3E0";

            const statusColor =
              status === "Approved"
                ? "#2E7D32"
                : status === "Rejected"
                ? "#DC2626"
                : "#EF6C00";

            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.avatarCircle}>
                    <Ionicons
                      name={isSubscription ? "card" : "cash-outline"}
                      size={22}
                      color="#01579B"
                      />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {isAdminIncome ? `${userName} → ${consultantName}` : userName}
                    </Text>

                    <Text style={styles.refText} numberOfLines={1}>
                      {typeLabel}
                      {item.appointmentId ? ` • Appt: ${item.appointmentId}` : ""}
                    </Text>
                  </View>

                  {isSubscription && (
                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardDetail}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{isSubscription ? "GCash Number" : "Appointment"}</Text>

                    <Text style={styles.value} numberOfLines={2}>
                      {isSubscription
                        ? item.gcash_number || "N/A"
                        : item.appointmentAt
                        ? formatTs(item.appointmentAt)
                        : "N/A"}
                    </Text>

                    {isAdminIncome && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.smallLine}>
                          User: <Text style={styles.smallStrong}>{userName}</Text>
                        </Text>
                        <Text style={styles.smallLine}>
                          Consultant:{" "}
                          <Text style={styles.smallStrong}>{consultantName}</Text>
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.label}>Amount</Text>
                    <Text style={styles.amountValue}>₱{item.amount ?? "0"}</Text>

                    {isAdminIncome && (
                      <Text style={styles.miniMuted}>Base: ₱{item.baseAmount ?? "0"}</Text>
                    )}
                  </View>
                </View>

                {isSubscription && status === "Pending" && (
                  <View style={{ gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.approveBtn, actionLoading && { opacity: 0.7 }]}
                      onPress={() => handleApprove(item)}
                      disabled={actionLoading}
                      activeOpacity={0.9}
                    >
                      {actionLoading ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <Text style={styles.approveText}>Approve Subscription</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.rejectBtn, actionLoading && { opacity: 0.7 }]}
                      onPress={() => handleReject(item)}
                      disabled={actionLoading}
                      activeOpacity={0.9}
                    >
                      {actionLoading ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <Text style={styles.rejectText}>Reject Subscription</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {isAdminIncome && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={styles.miniMuted}>
                      Auto-generated from session fee. No approval required.
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={50} color="#CBD5E1" />
              <Text style={styles.emptyText}>No transactions found.</Text>
            </View>
          }
        />
      )}

      <BottomNavbar role="admin" />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#F1F5F9" },

  headerWrap: { backgroundColor: "#01579B" },
  headerSafe: { backgroundColor: "#01579B" },
  headerInner: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.78)",
    marginTop: 4,
  },

  filterWrapper: { paddingHorizontal: 20, marginTop: 12, marginBottom: 6 },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 16,
    padding: 6,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  activeFilterTab: {
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  filterTabText: { color: "#64748B", fontSize: 12, fontWeight: "800" },
  activeFilterTabText: { color: "#01579B" },

  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#64748B", fontSize: 13, fontWeight: "700" },

  listContent: { padding: 16, paddingBottom: 140 },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  avatarCircle: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "#E3F2FD",
    justifyContent: "center",
    alignItems: "center",
  },
  userName: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  refText: { fontSize: 12, color: "#94A3B8", marginTop: 2 },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: "900" },

  cardDetail: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 15,
    marginBottom: 12,
  },
  label: {
    fontSize: 10,
    color: "#94A3B8",
    textTransform: "uppercase",
    fontWeight: "700",
  },
  value: { fontSize: 14, color: "#1E293B", fontWeight: "700", marginTop: 2 },
  amountValue: { fontSize: 16, fontWeight: "900", color: "#01579B", marginTop: 2 },

  smallLine: { fontSize: 12, color: "#64748B", fontWeight: "700", marginTop: 2 },
  smallStrong: { color: "#1E293B", fontWeight: "900" },
  miniMuted: { fontSize: 12, color: "#94A3B8", fontWeight: "700", marginTop: 6 },

  approveBtn: {
    backgroundColor: "#01579B",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    minHeight: 45,
    justifyContent: "center",
  },
  approveText: { color: "#FFF", fontWeight: "800" },

  rejectBtn: {
    backgroundColor: "#DC2626",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    minHeight: 45,
    justifyContent: "center",
  },
  rejectText: { color: "#FFF", fontWeight: "800" },

  emptyContainer: { flex: 1, alignItems: "center", marginTop: 50 },
  emptyText: {
    textAlign: "center",
    color: "#94A3B8",
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
  },
});
