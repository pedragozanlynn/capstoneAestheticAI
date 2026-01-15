import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  SafeAreaView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";

export default function Withdrawals() {
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all"); 
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [actionLoading, setActionLoading] = useState(false); // Loader para sa buttons

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
          timestamp: data.timestamp,
          status: data.status,
          notify: data.notify || false,
        });
      }
      setPayouts(list);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filteredPayouts = payouts.filter((item) => {
    if (activeFilter === "all") return true;
    return item.status === activeFilter;
  });

  const openPayoutModal = (item) => {
    setSelectedPayout(item);
    setModalVisible(true);
  };

  const isPending = selectedPayout?.status === "pending";

  const handleAction = async (action) => {
    if (!selectedPayout || selectedPayout.status !== "pending") return;
    
    setActionLoading(true);
    const newStatus = action === "approve" ? "approved" : "declined";
    const timestampField = action === "approve" ? "approvedAt" : "declinedAt";

    try {
      await updateDoc(doc(db, "payouts", selectedPayout.id), {
        status: newStatus,
        [timestampField]: serverTimestamp(),
      });
      setModalVisible(false);
      setSelectedPayout(null);
    } catch (error) {
      console.error("Action error:", error);
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

      {/* FIXED HEADER */}
      <View style={styles.header}>
        <SafeAreaView>
          <Text style={styles.headerTitle}>Withdrawals</Text>
          <Text style={styles.headerSubtitle}>Manage consultant payout requests</Text>
        </SafeAreaView>
      </View>

      {/* FIXED FILTERS */}
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

      {/* STABLE CONTENT AREA */}
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
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const statusStyle = getStatusConfig(item.status);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => openPayoutModal(item)}
                activeOpacity={0.8}
              >
                <View style={styles.cardTop}>
                  <View style={styles.profileCircle}>
                    <Text style={styles.profileLetter}>
                      {item.consultantName.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.consultantName}>{item.consultantName}</Text>
                    <Text style={styles.gcashLabel}>GCash: {item.gcash_number}</Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBottom}>
                  <View>
                    <Text style={styles.amountLabel}>Amount to Withdraw</Text>
                    <Text style={styles.amountValue}>
                      ₱{Number(item.amount).toLocaleString()}
                    </Text>
                  </View>
                  <Ionicons name={statusStyle.icon} size={24} color={statusStyle.text} />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cash-outline" size={50} color="#CBD5E1" />
              <Text style={styles.emptyText}>No {activeFilter} requests found.</Text>
            </View>
          }
        />
      )}

      {/* MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Payout Action</Text>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Recipient</Text>
              <Text style={styles.infoValue}>{selectedPayout?.consultantName}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Total Amount</Text>
              <Text style={[styles.infoValue, { color: "#01579B", fontSize: 18 }]}>
                ₱{Number(selectedPayout?.amount).toLocaleString()}
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.declineBtn, (!isPending || actionLoading) && { opacity: 0.5 }]}
                onPress={() => handleAction("decline")}
                disabled={!isPending || actionLoading}
              >
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.approveBtn, (!isPending || actionLoading) && { opacity: 0.5 }]}
                onPress={() => handleAction("approve")}
                disabled={!isPending || actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.approveBtnText}>Approve</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.closeBtn} 
              onPress={() => !actionLoading && setModalVisible(false)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <BottomNavbar role="admin" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#64748B", fontSize: 14 },
  
  header: {
    backgroundColor: "#01579B",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 4 },

  filterWrapper: { paddingHorizontal: 20, marginTop: 15, marginBottom: 5 },
  filterContainer: { flexDirection: "row", backgroundColor: "#E2E8F0", borderRadius: 15, padding: 5 },
  filterTab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 12 },
  activeFilterTab: { backgroundColor: "#FFF", elevation: 2 },
  filterTabText: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  activeFilterTabText: { color: "#01579B" },

  listContent: { padding: 16, paddingBottom: 120 },
  card: { backgroundColor: "#FFF", borderRadius: 20, padding: 16, marginBottom: 16, elevation: 3 },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  profileCircle: { width: 45, height: 45, borderRadius: 23, backgroundColor: "#E3F2FD", justifyContent: "center", alignItems: "center" },
  profileLetter: { color: "#01579B", fontWeight: "700", fontSize: 18 },
  consultantName: { fontSize: 16, fontWeight: "700", color: "#334155" },
  gcashLabel: { fontSize: 12, color: "#94A3B8" },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
  },
  amountLabel: { fontSize: 11, color: "#64748B", textTransform: "uppercase" },
  amountValue: { fontSize: 22, fontWeight: "800", color: "#1E293B" },
  
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: "#FFF", borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24 },
  modalHandle: { width: 50, height: 5, backgroundColor: "#E2E8F0", borderRadius: 10, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#1E293B", textAlign: "center", marginBottom: 20 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  infoLabel: { color: "#64748B", fontSize: 15 },
  infoValue: { fontWeight: "700", color: "#1E293B", fontSize: 15 },
  modalButtons: { flexDirection: "row", marginTop: 30, gap: 12 },
  approveBtn: { flex: 2, backgroundColor: "#01579B", paddingVertical: 16, borderRadius: 15, alignItems: "center", minHeight: 55, justifyContent: 'center' },
  approveBtnText: { color: "#FFF", fontWeight: "700" },
  declineBtn: { flex: 1, backgroundColor: "#FEE2E2", paddingVertical: 16, borderRadius: 15, alignItems: "center" },
  declineBtnText: { color: "#EF4444", fontWeight: "700" },
  closeBtn: { marginTop: 20, paddingBottom: 10 },
  closeBtnText: { textAlign: "center", color: "#94A3B8", fontWeight: "600" },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: "#94A3B8", marginTop: 10 },
});