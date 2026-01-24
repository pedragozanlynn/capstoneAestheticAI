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
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";

export default function Subscription() {
  const router = useRouter();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState("Pending");

  const fetchPayments = async () => {
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
          return { id: docSnap.id, ...data, user: userData };
        })
      );
      setPayments(allPayments);
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

  const filteredPayments = payments.filter((p) => {
    if (activeFilter === "All") return true;
    return p.status === activeFilter;
  });

  // ✅ NEW: helper to create a notification doc
  const notifyUserSubscription = async ({ userId, approved, payment }) => {
    if (!userId) return;

    const title = approved ? "Subscription Approved" : "Subscription Rejected";
    const type = approved ? "subscription_accepted" : "subscription_rejected";

    // Optional: use details if present
    const amount =
      payment?.amount != null ? `₱${Number(payment.amount).toFixed?.(2) || payment.amount}` : "";
    const ref = payment?.reference_number ? `Ref: ${payment.reference_number}` : "";
    const message = approved
      ? `Your Premium subscription is now active. ${amount ? `(${amount})` : ""} ${ref ? `• ${ref}` : ""}`.trim()
      : `Your subscription request was rejected. ${ref ? `(${ref})` : ""}`.trim();

    try {
      await addDoc(collection(db, "notifications"), {
        userId,
        title,
        message,
        type,
        read: false,
        createdAt: serverTimestamp(),
        // ✅ optional meta (your Notifications modal already reads these if present)
        amount: payment?.amount ?? null,
        sessionFee: payment?.amount ?? null, // if you want it to show under cash line
      });
    } catch (e) {
      console.log("❌ notifyUserSubscription failed:", e?.message || e);
      // Do not block approval if notification fails
    }
  };

  const handleApprove = async (payment) => {
    Alert.alert(
      "Approve Payment",
      "Are you sure you want to approve this subscription?",
      [
        { text: "Cancel" },
        {
          text: "Approve",
          onPress: async () => {
            setActionLoading(true);
            try {
              if (!payment?.user_id) {
                Alert.alert("Error", "Missing user ID for this payment.");
                return;
              }

              const userRef = doc(db, "users", payment.user_id);
              const now = Timestamp.now();
              const expiresAt = Timestamp.fromMillis(
                Date.now() + 30 * 24 * 60 * 60 * 1000
              );

              // ✅ set users/{uid}.isPro = true on approval
              await updateDoc(userRef, {
                subscription_type: "Premium",
                subscribed_at: now,
                subscription_expires_at: expiresAt,

                // ✅ required by your AIDesignerChat gating
                isPro: true,

                // optional helpers (safe even if unused)
                proStatus: "active",
                proActivatedAt: now,
                subscription_status: "approved",
                subscription_updated_at: now,
              });

              const paymentRef = doc(db, "subscription_payments", payment.id);
              await updateDoc(paymentRef, { status: "Approved" });

              // ✅ NEW: push notification to user
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
            }
          },
        },
      ]
    );
  };

  // ✅ OPTIONAL: Add Reject handler (so you also notify on reject)
  // If you already have a reject action elsewhere, copy the notifyUserSubscription call there.
  const handleReject = async (payment) => {
    Alert.alert(
      "Reject Payment",
      "Are you sure you want to reject this subscription?",
      [
        { text: "Cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            try {
              if (!payment?.user_id) {
                Alert.alert("Error", "Missing user ID for this payment.");
                return;
              }

              const userRef = doc(db, "users", payment.user_id);

              // Keep user as Free / not Pro
              await updateDoc(userRef, {
                subscription_type: "Free",
                isPro: false,
                proStatus: "inactive",
                subscription_status: "rejected",
                subscription_updated_at: Timestamp.now(),
              });

              const paymentRef = doc(db, "subscription_payments", payment.id);
              await updateDoc(paymentRef, { status: "Rejected" });

              // ✅ NEW: push notification to user
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
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <SafeAreaView>
          <Text style={styles.headerTitle}>Subscriptions</Text>
          <Text style={styles.headerSubtitle}>
            Manage premium payment verifications
          </Text>
        </SafeAreaView>
      </View>

      <View style={styles.filterWrapper}>
        <View style={styles.filterContainer}>
          {["All", "Pending", "Approved", "Rejected"].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveFilter(tab)}
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
          <ActivityIndicator size="large" color="#01579B" />
          <Text style={styles.loadingText}>Fetching payments...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPayments}
          contentContainerStyle={styles.listContent}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.avatarCircle}>
                  <Ionicons name="card" size={22} color="#01579B" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.userName}>
                    {item.user?.name || "Unknown User"}
                  </Text>
                  <Text style={styles.refText}>Ref: {item.reference_number}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        item.status === "Approved"
                          ? "#E8F5E9"
                          : item.status === "Rejected"
                          ? "#FEE2E2"
                          : "#FFF3E0",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          item.status === "Approved"
                            ? "#2E7D32"
                            : item.status === "Rejected"
                            ? "#DC2626"
                            : "#EF6C00",
                      },
                    ]}
                  >
                    {item.status}
                  </Text>
                </View>
              </View>

              <View style={styles.cardDetail}>
                <View>
                  <Text style={styles.label}>GCash Number</Text>
                  <Text style={styles.value}>{item.gcash_number}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.label}>Amount</Text>
                  <Text style={styles.amountValue}>₱{item.amount}</Text>
                </View>
              </View>

              {item.status === "Pending" && (
                <View style={{ gap: 10 }}>
                  <TouchableOpacity
                    style={[
                      styles.approveBtn,
                      actionLoading && { opacity: 0.7 },
                    ]}
                    onPress={() => handleApprove(item)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text style={styles.approveText}>Approve Subscription</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.rejectBtn,
                      actionLoading && { opacity: 0.7 },
                    ]}
                    onPress={() => handleReject(item)}
                    disabled={actionLoading}
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
          )}
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

      <BottomNavbar role="admin" />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#F1F5F9" },
  header: {
    backgroundColor: "#01579B",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 25,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  filterWrapper: { paddingHorizontal: 20, marginTop: 15, marginBottom: 5 },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 15,
    padding: 5,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  activeFilterTab: { backgroundColor: "#FFF", elevation: 2 },
  filterTabText: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  activeFilterTabText: { color: "#01579B" },
  listContent: { padding: 16, paddingBottom: 120 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
  },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  avatarCircle: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: "#E3F2FD",
    justifyContent: "center",
    alignItems: "center",
  },
  userName: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  refText: { fontSize: 12, color: "#94A3B8" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: "800" },
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
    fontWeight: "600",
  },
  value: { fontSize: 14, color: "#1E293B", fontWeight: "600" },
  amountValue: { fontSize: 16, fontWeight: "800", color: "#01579B" },

  approveBtn: {
    backgroundColor: "#01579B",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    minHeight: 45,
    justifyContent: "center",
  },
  approveText: { color: "#FFF", fontWeight: "700" },

  // ✅ NEW reject button style (minimal, does not affect other UI)
  rejectBtn: {
    backgroundColor: "#DC2626",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    minHeight: 45,
    justifyContent: "center",
  },
  rejectText: { color: "#FFF", fontWeight: "700" },

  centerLoader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 50,
  },
  loadingText: { marginTop: 10, color: "#64748B", fontSize: 14 },
  emptyContainer: { flex: 1, alignItems: "center", marginTop: 50 },
  emptyText: {
    textAlign: "center",
    color: "#94A3B8",
    marginTop: 10,
    fontSize: 14,
  },
});
