import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import CenterMessageModal from "../components/CenterMessageModal";

export default function Withdrawals() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [centerModal, setCenterModal] = useState({
    visible: false,
    type: "info", // success | error | info | warning
    title: "",
    message: "",
  });

  const mountedRef = useRef(true);
  const consultantNameCache = useRef(new Map()); // consultantId -> fullName

  const showCenterModal = (type, title, message) => {
    setCenterModal({
      visible: true,
      type,
      title: String(title || ""),
      message: String(message || ""),
    });
  };

  const closeCenterModal = () => {
    setCenterModal((m) => ({ ...m, visible: false }));
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

  const filteredPayouts = useMemo(() => {
    if (activeFilter === "all") return payouts;
    return payouts.filter((p) => p.status === activeFilter);
  }, [payouts, activeFilter]);

  const openPayoutModal = (item) => {
    setSelectedPayout(item);
    setModalVisible(true);
  };

  const closeModal = () => {
    if (actionLoading) return;
    setModalVisible(false);
    setSelectedPayout(null);
  };

  const isPending = selectedPayout?.status === "pending";

  // ✅ Realtime load payouts + safe consultant name lookups
  useEffect(() => {
    mountedRef.current = true;

    // If you have createdAt, you can use orderBy:
    // const qy = query(collection(db, "payouts"), orderBy("createdAt", "desc"));
    const qy = query(collection(db, "payouts"));

    const unsub = onSnapshot(
      qy,
      async (snapshot) => {
        try {
          const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

          // collect unique consultantIds
          const ids = Array.from(
            new Set(docs.map((x) => x.consultantId).filter(Boolean))
          );

          // fetch missing consultant names only (cache)
          const missing = ids.filter((id) => !consultantNameCache.current.has(id));

          if (missing.length) {
            await Promise.all(
              missing.map(async (id) => {
                try {
                  const snap = await getDoc(doc(db, "consultants", id));
                  const name = snap.exists() ? String(snap.data()?.fullName || "Unknown") : "Unknown";
                  consultantNameCache.current.set(id, name);
                } catch {
                  consultantNameCache.current.set(id, "Unknown");
                }
              })
            );
          }

          const list = docs.map((data) => {
            const consultantId = data.consultantId || null;
            const consultantName = consultantId
              ? consultantNameCache.current.get(consultantId) || "Unknown"
              : "Unknown";

            return {
              id: data.id,
              consultantId,
              consultantName,
              amount: data.amount ?? 0,
              gcash_number: data.gcash_number || "",
              status: data.status || "pending",
            };
          });

          if (!mountedRef.current) return;
          setPayouts(list);
          setLoading(false);
        } catch (e) {
          console.log("Withdrawals snapshot error:", e?.message || e);
          if (!mountedRef.current) return;
          setLoading(false);
          showCenterModal("error", "Load Failed", "Unable to load payouts. Please try again.");
        }
      },
      (err) => {
        console.log("Withdrawals listener error:", err?.message || err);
        if (!mountedRef.current) return;
        setLoading(false);
        showCenterModal("error", "Load Failed", "Unable to load payouts. Please try again.");
      }
    );

    return () => {
      mountedRef.current = false;
      try {
        unsub?.();
      } catch {}
    };
  }, []);

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

      showCenterModal(
        "success",
        "Updated",
        newStatus === "approved"
          ? "Withdrawal approved successfully."
          : "Withdrawal declined successfully."
      );

      closeModal();
    } catch (err) {
      console.error("Action error:", err);
      showCenterModal("error", "Action Failed", "Unable to update payout. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ✅ App-safe StatusBar: header is dark blue, so light content */}
      <StatusBar barStyle="light-content" backgroundColor="#01579B" />

      {/* ✅ HEADER: SafeAreaView handles notch properly */}
      <SafeAreaView edges={["top"]} style={styles.headerSafe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Withdrawals</Text>
          <Text style={styles.headerSubtitle}>Manage consultant payout requests</Text>
        </View>
      </SafeAreaView>

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
              activeOpacity={0.85}
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
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 120 + insets.bottom }, // ✅ not hidden by BottomNavbar
          ]}
          renderItem={({ item }) => {
            const statusStyle = getStatusConfig(item.status);
            const firstLetter = (item.consultantName || "U").trim().charAt(0).toUpperCase();

            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => openPayoutModal(item)}
                activeOpacity={0.9}
              >
                <View style={styles.cardTop}>
                  <View style={styles.profileCircle}>
                    <Text style={styles.profileLetter}>{firstLetter}</Text>
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
                    <Text style={styles.amountLabel}>Amount</Text>
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
            <View style={{ paddingTop: 40, alignItems: "center" }}>
              <Text style={{ color: "#64748B", fontWeight: "700" }}>
                No payouts found.
              </Text>
            </View>
          }
        />
      )}

      {/* MODAL */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.backdrop} onPress={closeModal} />

          <SafeAreaView edges={["bottom"]} style={styles.modalSafe}>
            <Pressable style={styles.modalBox} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Payout Action</Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Recipient</Text>
                <Text style={styles.infoValue}>{selectedPayout?.consultantName}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Amount</Text>
                <Text style={styles.amountHighlight}>
                  ₱{Number(selectedPayout?.amount).toLocaleString()}
                </Text>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[
                    styles.declineBtn,
                    (!isPending || actionLoading) && styles.disabledBtn,
                  ]}
                  onPress={() => handleAction("decline")}
                  disabled={!isPending || actionLoading}
                  activeOpacity={0.9}
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
                  activeOpacity={0.9}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.approveBtnText}>Approve</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={closeModal}
                disabled={actionLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>

      {/* CENTER MESSAGE MODAL */}
      <CenterMessageModal
        visible={centerModal.visible}
        type={centerModal.type}
        title={centerModal.title}
        message={centerModal.message}
        onClose={closeCenterModal}
      />

      <BottomNavbar role="admin" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },

  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#64748B", fontWeight: "600" },

  // ✅ header safe wrapper
  headerSafe: { backgroundColor: "#01579B" },
  header: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 15, // ✅ stable, no negative margins
  },
  headerTitle: { fontSize: 25, fontWeight: "800", color: "#FFF" },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
    marginTop: 4,
  },

  filterWrapper: { paddingHorizontal: 16, marginVertical: 10 },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 15,
    padding: 5,
  },
  filterTab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  activeFilterTab: { backgroundColor: "#FFF", borderRadius: 12 },
  filterTabText: { color: "#64748B", fontWeight: "800", fontSize: 12 },
  activeFilterTabText: { color: "#01579B" },

  listContent: { padding: 16 },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
  profileLetter: { fontSize: 18, fontWeight: "800", color: "#01579B" },

  consultantName: { fontSize: 16, fontWeight: "800", color: "#334155" },
  gcashLabel: { fontSize: 12, color: "#94A3B8", marginTop: 2 },

  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },

  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
    alignItems: "center",
  },
  amountLabel: { fontSize: 11, color: "#64748B", fontWeight: "700" },
  amountValue: { fontSize: 22, fontWeight: "900", color: "#1E293B", marginTop: 2 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
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
    marginBottom: 18,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", textAlign: "center" },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 8,
  },
  infoLabel: { color: "#64748B", fontWeight: "700" },
  infoValue: { fontWeight: "900", color: "#0F172A" },
  amountHighlight: { color: "#01579B", fontSize: 18, fontWeight: "900" },

  modalButtons: { flexDirection: "row", gap: 12, marginTop: 22 },
  approveBtn: {
    flex: 1,
    backgroundColor: "#01579B",
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: "center",
  },
  approveBtnText: { color: "#FFF", fontWeight: "900" },
  declineBtn: {
    flex: 1,
    backgroundColor: "#FEE2E2",
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: "center",
  },
  declineBtnText: { color: "#EF4444", fontWeight: "900" },
  disabledBtn: { opacity: 0.5 },

  closeBtn: { marginTop: 16 },
  closeBtnText: {
    textAlign: "center",
    color: "#94A3B8",
    fontWeight: "800",
  },
});
