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

// ✅ Use the non-deprecated Safe Area package
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/** -----------------------------
 * ✅ Validation helpers (NO UI logic changes)
 * ----------------------------- */
const safeStr = (v) => (v == null ? "" : String(v).trim());

const normalizePaymentStatus = (status) => {
  const s = safeStr(status);
  if (s === "Pending") return "Pending";
  if (s === "Approved") return "Approved";
  if (s === "Rejected") return "Rejected";
  // fallback for legacy/case mismatch
  const low = s.toLowerCase();
  if (low === "pending") return "Pending";
  if (low === "approved") return "Approved";
  if (low === "rejected") return "Rejected";
  return "Pending";
};

const isPositiveAmount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
};

export default function Subscription() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState("Pending");

  // ✅ Prevent double-tap approve/reject
  const actionLockRef = useRef(false);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "subscription_payments"));

      const allPayments = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();

          let userData = null;
          try {
            if (data.user_id) {
              const userSnap = await getDoc(doc(db, "users", data.user_id));
              if (userSnap.exists()) userData = userSnap.data();
            }
          } catch (err) {
            console.log("User fetch failed:", data.user_id, err);
          }

          return {
            id: docSnap.id,
            ...data,
            status: normalizePaymentStatus(data?.status),
            user: userData,
          };
        })
      );

      // ✅ Ensure "recent first" (latest registrations/payments appear on top)
      const sorted = allPayments.sort((a, b) => {
        const aTs =
          a?.timestamp?.toMillis?.() ??
          a?.createdAt?.toMillis?.() ??
          a?.created_at?.toMillis?.() ??
          0;
        const bTs =
          b?.timestamp?.toMillis?.() ??
          b?.createdAt?.toMillis?.() ??
          b?.created_at?.toMillis?.() ??
          0;
        return bTs - aTs;
      });

      setPayments(sorted);
    } catch (error) {
      console.error("Fetch payments error:", error);
      Alert.alert("Error", "Failed to load payments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (activeFilter === "All") return true;
      return normalizePaymentStatus(p.status) === activeFilter;
    });
  }, [payments, activeFilter]);

  // ✅ helper to create a notification doc
  const notifyUserSubscription = async ({ userId, approved, payment }) => {
    if (!userId) return;

    const title = approved ? "Subscription Approved" : "Subscription Rejected";
    const type = approved ? "subscription_accepted" : "subscription_rejected";

    const amount =
      payment?.amount != null
        ? `₱${Number(payment.amount).toFixed?.(2) || payment.amount}`
        : "";
    const ref = payment?.reference_number ? `Ref: ${payment.reference_number}` : "";

    const message = approved
      ? `Your Premium subscription is now active. ${amount ? `(${amount})` : ""} ${
          ref ? `• ${ref}` : ""
        }`.trim()
      : `Your subscription request was rejected. ${ref ? `(${ref})` : ""}`.trim();

    try {
      await addDoc(collection(db, "notifications"), {
        userId,
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
    if (!payment?.user_id) return "Missing user ID for this payment.";
    if (normalizePaymentStatus(payment?.status) !== "Pending")
      return "This payment is no longer pending.";
    if (!safeStr(payment?.reference_number)) return "Reference number is missing.";
    if (!safeStr(payment?.gcash_number)) return "GCash number is missing.";
    if (!isPositiveAmount(payment?.amount)) return "Invalid amount.";
    return "";
  };

  const handleApprove = async (payment) => {
    const vErr = validatePaymentBeforeAction(payment);
    if (vErr) return Alert.alert("Cannot approve", vErr);

    Alert.alert(
      "Approve Payment",
      "Are you sure you want to approve this subscription?",
      [
        { text: "Cancel" },
        {
          text: "Approve",
          onPress: async () => {
            if (actionLockRef.current) return;
            actionLockRef.current = true;

            setActionLoading(true);
            try {
              const userRef = doc(db, "users", payment.user_id);
              const now = Timestamp.now();
              const expiresAt = Timestamp.fromMillis(
                Date.now() + 30 * 24 * 60 * 60 * 1000
              );

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

              const paymentRef = doc(db, "subscription_payments", payment.id);
              await updateDoc(paymentRef, { status: "Approved" });

              await notifyUserSubscription({
                userId: payment.user_id,
                approved: true,
                payment,
              });

              Alert.alert("Success", "Subscription upgraded!");
              await fetchPayments();
            } catch (error) {
              console.log("❌ approve error:", error?.message || error);
              Alert.alert("Error", "Failed to approve payment.");
            } finally {
              setActionLoading(false);
              actionLockRef.current = false;
            }
          },
        },
      ]
    );
  };

  const handleReject = async (payment) => {
    const vErr = validatePaymentBeforeAction(payment);
    if (vErr) return Alert.alert("Cannot reject", vErr);

    Alert.alert(
      "Reject Payment",
      "Are you sure you want to reject this subscription?",
      [
        { text: "Cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            if (actionLockRef.current) return;
            actionLockRef.current = true;

            setActionLoading(true);
            try {
              const userRef = doc(db, "users", payment.user_id);

              await updateDoc(userRef, {
                subscription_type: "Free",
                isPro: false,
                proStatus: "inactive",
                subscription_status: "rejected",
                subscription_updated_at: Timestamp.now(),
              });

              const paymentRef = doc(db, "subscription_payments", payment.id);
              await updateDoc(paymentRef, { status: "Rejected" });

              await notifyUserSubscription({
                userId: payment.user_id,
                approved: false,
                payment,
              });

              Alert.alert("Done", "Subscription request rejected.");
              await fetchPayments();
            } catch (e) {
              console.log("❌ reject error:", e?.message || e);
              Alert.alert("Error", "Failed to reject payment.");
            } finally {
              setActionLoading(false);
              actionLockRef.current = false;
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.mainContainer}>
      {/* ✅ Fixed, stable StatusBar behavior */}
      <StatusBar barStyle="light-content" backgroundColor={stylesVars.headerBg} />

      {/* ✅ Header (SafeAreaContext) — consistent on installed builds */}
      <View style={styles.headerWrap}>
        <SafeAreaView edges={["top"]} style={styles.headerSafe}>
          <View
            style={[
              styles.headerInner,
              { paddingTop: Math.max(insets.top, ) },
            ]}
          >
            <Text style={styles.headerTitle}>Subscriptions</Text>
            <Text style={styles.headerSubtitle}>
              Manage premium payment verifications
            </Text>
          </View>
        </SafeAreaView>
      </View>

      {/* Tabs */}
      <View style={styles.filterWrapper}>
        <View style={styles.filterContainer}>
          {["All", "Pending", "Approved", "Rejected"].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveFilter(tab)}
              activeOpacity={0.85}
              style={[
                styles.filterTab,
                activeFilter === tab && styles.activeFilterTab,
              ]}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeFilter === tab && styles.activeFilterTabText,
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
          <ActivityIndicator size="large" color={stylesVars.primary} />
          <Text style={styles.loadingText}>Fetching payments...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPayments}
          contentContainerStyle={styles.listContent}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const status = normalizePaymentStatus(item.status);

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
                    <Ionicons name="card" size={22} color={stylesVars.primary} />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {item.user?.name || "Unknown User"}
                    </Text>
                    <Text style={styles.refText} numberOfLines={1}>
                      Ref: {item.reference_number || "N/A"}
                    </Text>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {status}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardDetail}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>GCash Number</Text>
                    <Text style={styles.value} numberOfLines={1}>
                      {item.gcash_number || "N/A"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.label}>Amount</Text>
                    <Text style={styles.amountValue}>₱{item.amount ?? "0"}</Text>
                  </View>
                </View>

                {status === "Pending" && (
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
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={50} color="#CBD5E1" />
              <Text style={styles.emptyText}>
                No {activeFilter.toLowerCase()} payments found.
              </Text>
            </View>
          }
        />
      )}

      {/* ✅ Footer (BottomNavbar) stays stable because we reserve padding */}
      <BottomNavbar role="admin" />
    </View>
  );
}

/** ✅ UI Vars (design-only) */
const stylesVars = {
  primary: "#01579B",
  headerBg: "#01579B",
  bg: "#F1F5F9",
  textMid: "#64748B",
  cardBorder: "#F1F5F9",
};

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: stylesVars.bg },

  /** Header — stable in installed builds */
  headerWrap: {
    backgroundColor: stylesVars.headerBg,
    overflow: "hidden",
  },
  headerSafe: { backgroundColor: stylesVars.headerBg },
  headerInner: {
    paddingHorizontal: 20,
    // ✅ this is the “regular design padding” you asked to keep in styles
    paddingBottom: 18,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.78)",
    marginTop: 4,
  },

  /** Tabs */
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
  filterTabText: { color: stylesVars.textMid, fontSize: 12, fontWeight: "800" },
  activeFilterTabText: { color: stylesVars.primary },

  /** Loader */
  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: stylesVars.textMid, fontSize: 13, fontWeight: "700" },

  /** List — reserve space for footer so it won't overlap after install */
  listContent: {
    padding: 16,
    paddingBottom: 140, // ✅ keep footer safe
  },

  /** Card */
  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: stylesVars.cardBorder,
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
  amountValue: { fontSize: 16, fontWeight: "900", color: stylesVars.primary, marginTop: 2 },

  approveBtn: {
    backgroundColor: stylesVars.primary,
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
