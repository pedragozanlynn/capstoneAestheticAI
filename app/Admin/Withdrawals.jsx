import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";

export default function Withdrawals() {
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "payouts"), async (snapshot) => {
      const list = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let consultantName = "Unknown";

        if (data.consultantId) {
          const cRef = await getDoc(doc(db, "consultants", data.consultantId));
          if (cRef.exists()) consultantName = cRef.data().fullName;
        }

        list.push({
          id: docSnap.id,
          consultantId: data.consultantId,
          consultantName,
          amount: data.amount,
          gcash_number: data.gcash_number,
          status: data.status || "pending",
        });
      }

      setPayouts(list);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filteredPayouts = useMemo(() => {
    if (activeFilter === "all") return payouts;
    return payouts.filter((p) => p.status === activeFilter);
  }, [payouts, activeFilter]);

  const openPayoutModal = (item) => {
    setSelectedPayout(item);
    setModalVisible(true);
  };

  const closeModal = () => {
    if (actionLoading) return; // lock closing while saving
    setModalVisible(false);
    setSelectedPayout(null);
  };

  const isPending = selectedPayout?.status === "pending";

  const handleAction = async (action) => {
    if (!selectedPayout || !isPending) return;

    setActionLoading(true);

    const newStatus = action === "approve" ? "approved" : "declined";
    const timestampField = action === "approve" ? "approvedAt" : "declinedAt";

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "payouts", selectedPayout.id), {
        status: newStatus,
        [timestampField]: serverTimestamp(),
      });

      batch.set(doc(collection(db, "notifications")), {
        recipientId: selectedPayout.consultantId,
        recipientRole: "consultant",
        type: "payout_status",
        title: newStatus === "approved" ? "Withdrawal Approved" : "Withdrawal Declined",
        message:
          newStatus === "approved"
            ? `Your withdrawal of ₱${Number(selectedPayout.amount).toLocaleString()} was approved.`
            : `Your withdrawal of ₱${Number(selectedPayout.amount).toLocaleString()} was declined.`,
        payoutId: selectedPayout.id,
        amount: Number(selectedPayout.amount),
        read: false,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      closeModal();
    } catch (err) {
      console.error("Action error:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case "approved":
        return { bg: "#E8F5E9", text: "#2E7D32", icon: "checkmark-circle" };
      case "declined":
        return { bg: "#FFEBEE", text: "#C62828", icon: "close-circle" };
      default:
        return { bg: "#FFF3E0", text: "#EF6C00", icon: "time" };
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* 🔒 HEADER — UNCHANGED */}
      <View style={styles.header}>
        <SafeAreaView>
          <Text style={styles.headerTitle}>Withdrawals</Text>
          <Text style={styles.headerSubtitle}>
            Manage consultant payout requests
          </Text>
        </SafeAreaView>
      </View>

      {/* FILTERS */}
      <View style={styles.filterWrapper}>
        <View style={styles.filterContainer}>
          {["all", "pending", "approved", "declined"].map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={[
                styles.filterTab,
                activeFilter === filter && styles.activeFilterTab,
              ]}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeFilter === filter && styles.activeFilterTabText,
                ]}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* LIST */}
      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color="#01579B" />
          <Text style={styles.loadingText}>Fetching requests...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPayouts}
          contentContainerStyle={styles.listContent}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const statusStyle = getStatusConfig(item.status);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => openPayoutModal(item)}
              >
                <View style={styles.cardTop}>
                  <View style={styles.profileCircle}>
                    <Text style={styles.profileLetter}>
                      {item.consultantName.charAt(0)}
                    </Text>
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.consultantName}>
                      {item.consultantName}
                    </Text>
                    <Text style={styles.gcashLabel}>
                      GCash: {item.gcash_number}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusChip,
                      { backgroundColor: statusStyle.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: statusStyle.text },
                      ]}
                    >
                      {item.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBottom}>
                  <View>
                    <Text style={styles.amountLabel}>Amount</Text>
                    <Text style={styles.amountValue}>
                      ₱{Number(item.amount).toLocaleString()}
                    </Text>
                  </View>
                  <Ionicons
                    name={statusStyle.icon}
                    size={24}
                    color={statusStyle.text}
                  />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ✅ MODAL (APP-READY) */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal} // ✅ Android back button support
      >
        <View style={styles.modalOverlay}>
          {/* ✅ Tap outside to close (optional common behavior) */}
          <Pressable style={styles.backdrop} onPress={closeModal} />

          <SafeAreaView edges={["bottom"]} style={styles.modalSafe}>
            {/* stop propagation so tap inside doesn't close */}
            <Pressable style={styles.modalBox} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Payout Action</Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Recipient</Text>
                <Text style={styles.infoValue}>
                  {selectedPayout?.consultantName}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Amount</Text>
                <Text style={styles.amountHighlight}>
                  ₱{Number(selectedPayout?.amount).toLocaleString()}
                </Text>
              </View>

              {/* ✅ SAME SIZE BUTTONS */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[
                    styles.declineBtn,
                    (!isPending || actionLoading) && styles.disabledBtn,
                  ]}
                  onPress={() => handleAction("decline")}
                  disabled={!isPending || actionLoading}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.approveBtn,
                    (!isPending || actionLoading) && styles.disabledBtn,
                  ]}
                  onPress={() => handleAction("approve")}
                  disabled={!isPending || actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.approveBtnText}>Approve</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.closeBtn} onPress={closeModal} disabled={actionLoading}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>

      <BottomNavbar role="admin" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#64748B" },

  /* 🔒 HEADER STYLES — UNCHANGED */
  header: {
    backgroundColor: "#01579B",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },

  filterWrapper: { paddingHorizontal: 20, marginVertical: 10 },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 15,
    padding: 5,
  },
  filterTab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  activeFilterTab: { backgroundColor: "#FFF", borderRadius: 12 },
  filterTabText: { color: "#64748B", fontWeight: "700" },
  activeFilterTabText: { color: "#01579B" },

  listContent: { padding: 16, paddingBottom: 120 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },

  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  profileCircle: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: "#E3F2FD",
    alignItems: "center",
    justifyContent: "center",
  },
  profileLetter: { fontSize: 18, fontWeight: "700", color: "#01579B" },

  consultantName: { fontSize: 16, fontWeight: "700", color: "#334155" },
  gcashLabel: { fontSize: 12, color: "#94A3B8" },

  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: "700" },

  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
  },
  amountLabel: { fontSize: 11, color: "#64748B" },
  amountValue: { fontSize: 22, fontWeight: "800", color: "#1E293B" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  backdrop: { ...StyleSheet.absoluteFillObject }, // full-screen clickable area
  modalSafe: { width: "100%" },

  modalBox: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
  },
  modalHandle: {
    width: 50,
    height: 5,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    borderRadius: 10,
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 8,
  },
  infoLabel: { color: "#64748B" },
  infoValue: { fontWeight: "700" },
  amountHighlight: { color: "#01579B", fontSize: 18, fontWeight: "800" },

  modalButtons: { flexDirection: "row", gap: 12, marginTop: 25 },
  approveBtn: {
    flex: 1,
    backgroundColor: "#01579B",
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: "center",
  },
  approveBtnText: { color: "#FFF", fontWeight: "800" },
  declineBtn: {
    flex: 1,
    backgroundColor: "#FEE2E2",
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: "center",
  },
  declineBtnText: { color: "#EF4444", fontWeight: "800" },
  disabledBtn: { opacity: 0.5 },

  closeBtn: { marginTop: 18 },
  closeBtnText: {
    textAlign: "center",
    color: "#94A3B8",
    fontWeight: "700",
  },
});
