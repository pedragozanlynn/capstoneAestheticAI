import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  updateDoc,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Platform,
} from "react-native";
import { db } from "../../config/firebase";
import PaymentModal from "../components/PaymentModal";

/* =============================
    DATE PARSER (UNCHANGED)
============================= */
const parseLegacyDateTime = (dateStr, timeStr) => {
  try {
    if (!dateStr || !timeStr) return null;
    const [time, modifier] = timeStr.replace(/\u202F/g, " ").split(" ");
    let [h, m] = time.split(":").map(Number);
    if (modifier === "PM" && h < 12) h += 12;
    if (modifier === "AM" && h === 12) h = 0;
    const [y, mo, d] = dateStr.split("-").map(Number);
    return new Date(y, mo - 1, d, h, m || 0);
  } catch {
    return null;
  }
};

/* =============================
    STATUS SOURCE (UNCHANGED)
============================= */
const pickRawStatus = (item) => {
  const candidates = [item?.status, item?.appointmentStatus, item?.sessionStatus];
  for (const v of candidates) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

const normalizeStatus = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,./:;<=>?@[\\\]^_`{|}~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isCompletedLike = (s) => {
  const v = normalizeStatus(s);
  if (!v) return false;
  if (v.includes("complete") || v.includes("completed")) return true;
  if (v.includes("done")) return true;
  if (v.includes("finish") || v.includes("finished")) return true;
  if (v === "ended" || v.includes(" ended")) return true;
  if (v === "end" || v.includes(" end ")) return true;
  if (v.includes("closed") || v.includes("close")) return true;
  return false;
};

const isCancelledLike = (s) => {
  const v = normalizeStatus(s);
  if (!v) return false;
  return v.includes("cancel") || v.includes("declin") || v.includes("reject");
};

const isOngoingLike = (s) => {
  const v = normalizeStatus(s);
  return v === "ongoing" || v.includes("in progress") || v.includes("inprogress");
};
const isUpcomingLike = (s) => {
  const v = normalizeStatus(s);
  return v === "upcoming" || v.includes("scheduled") || v.includes("pending");
};

const getStatus = (item) => {
  const raw = pickRawStatus(item);
  const norm = normalizeStatus(raw);
  if (isCancelledLike(norm)) return "cancelled";
  if (item?.completedAt?.toDate?.() || item?.completedAt) return "completed";
  if (item?.isCompleted === true) return "completed";
  if (isCompletedLike(norm)) return "completed";
  if (isOngoingLike(norm)) return "ongoing";
  if (isUpcomingLike(norm)) return "upcoming";
  const start = item?.appointmentAt?.toDate?.() || parseLegacyDateTime(item?.date, item?.time);
  if (!start) return "upcoming";
  const now = new Date();
  const twelveHoursLater = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  if (now < start) return "upcoming";
  if (now >= start && now <= twelveHoursLater) return "ongoing";
  return "completed";
};

export default function Consultations() {
  const [consultations, setConsultations] = useState([]);
  const [consultantMap, setConsultantMap] = useState({});
  const [activeTab, setActiveTab] = useState("upcoming");
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [currentPaymentData, setCurrentPaymentData] = useState(null);

  const router = useRouter();
  const didWarnNoUserRef = useRef(false);
  const didWarnLoadFailRef = useRef(false);
  const autoCompleteRanRef = useRef(new Set());

  const isNonEmpty = (v) => String(v ?? "").trim().length > 0;

  const validateAppointment = (item) => {
    if (!item?.id) return "Missing appointment id.";
    if (!isNonEmpty(item?.userId)) return "Missing userId.";
    if (!isNonEmpty(item?.consultantId)) return "Missing consultantId.";
    return "";
  };

  const getAppointmentStart = (item) =>
    item?.appointmentAt?.toDate?.() || parseLegacyDateTime(item?.date, item?.time);

  const autoCompleteIfExpired = async (items) => {
    try {
      const now = Date.now();
      const candidates = (items || []).filter((i) => {
        const id = String(i?.id || "");
        if (!id) return false;
        const raw = pickRawStatus(i);
        if (isCompletedLike(raw) || isCancelledLike(raw)) return false;
        if (i?.completedAt?.toDate?.() || i?.completedAt) return false;
        const start = getAppointmentStart(i);
        if (!start) return false;
        const expired = now > start.getTime() + 12 * 60 * 60 * 1000;
        return expired && !autoCompleteRanRef.current.has(id);
      });
      if (candidates.length === 0) return;
      candidates.forEach((c) => autoCompleteRanRef.current.add(String(c.id)));
      await Promise.all(
        candidates.map(async (c) => {
          try {
            await updateDoc(doc(db, "appointments", String(c.id)), {
              status: "completed",
              completedAt: serverTimestamp(),
            });
          } catch (e) {
            autoCompleteRanRef.current.delete(String(c.id));
          }
        })
      );
    } catch (e) {
      console.log("autoComplete error", e);
    }
  };

  useEffect(() => {
    let unsub;
    const load = async () => {
      try {
        const userId = await AsyncStorage.getItem("userUid");
        if (!userId) {
          setConsultations([]);
          setConsultantMap({});
          return;
        }
        const q = query(collection(db, "appointments"), where("userId", "==", userId));
        unsub = onSnapshot(q, async (snap) => {
          const rawItems = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          autoCompleteIfExpired(rawItems);
          const items = rawItems.map((data) => ({
            ...data,
            computedStatus: getStatus(data),
            _sortTime: getAppointmentStart(data) || new Date(0),
          })).sort((a, b) => b._sortTime - a._sortTime);
          setConsultations(items);
          const map = {};
          await Promise.all(items.map(async (i) => {
            if (i.consultantId && !map[i.consultantId]) {
              const s = await getDoc(doc(db, "consultants", i.consultantId));
              if (s.exists()) map[i.consultantId] = s.data()?.fullName || "Consultant";
            }
          }));
          setConsultantMap(map);
        });
      } catch (e) {
        console.log(e);
      }
    };
    load();
    return () => unsub && unsub();
  }, []);

  const handleCancel = async (item) => {
    Alert.alert("Cancel Appointment", "Are you sure you want to cancel?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        style: "destructive",
        onPress: async () => {
          try {
            await updateDoc(doc(db, "appointments", item.id), {
              status: "cancelled",
              cancelledAt: serverTimestamp(),
              cancelledBy: "user",
            });
            Alert.alert("Success", "Cancelled.");
          } catch (e) {
            Alert.alert("Error", "Could not cancel.");
          }
        },
      },
    ]);
  };

  const openChat = async (item) => {
    const computed = item?.computedStatus || getStatus(item);
    if (computed === "cancelled" || computed === "completed") return;
    if (!isNonEmpty(item.chatRoomId)) return Alert.alert("Wait", "Chat room not ready.");
    
    // Original payment check logic...
    router.push({
      pathname: "/User/ChatRoom",
      params: { roomId: item.chatRoomId, consultantId: item.consultantId, appointmentId: item.id },
    });
  };

  const filtered = useMemo(
    () => consultations.filter((c) => c.computedStatus === activeTab),
    [consultations, activeTab]
  );

  const renderItem = ({ item }) => {
    const status = item.computedStatus;
    const statusColors = {
      ongoing: { bg: "#DCFCE7", text: "#15803D", icon: "radio-button-on" },
      upcoming: { bg: "#FEF3C7", text: "#B45309", icon: "calendar-outline" },
      cancelled: { bg: "#FEE2E2", text: "#B91C1C", icon: "close-circle-outline" },
      completed: { bg: "#F1F5F9", text: "#475569", icon: "checkmark-done-circle" },
    };
    const currentStyle = statusColors[status] || statusColors.upcoming;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.consultantInfo}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={20} color="#01579B" />
            </View>
            <View>
              <Text style={styles.consultantName}>
                {consultantMap[item.consultantId] || "Consultant"}
              </Text>
              <Text style={styles.cardDateText}>
                {item.date || "No date set"} • {item.time || "No time set"}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: currentStyle.bg }]}>
            <Ionicons name={currentStyle.icon} size={12} color={currentStyle.text} />
            <Text style={[styles.statusBadgeText, { color: currentStyle.text }]}>
              {status}
            </Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardFooter}>
          {status === "ongoing" && (
            <TouchableOpacity style={styles.openChatBtn} onPress={() => openChat(item)}>
              <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
              <Text style={styles.openChatBtnText}>Enter Chat Room</Text>
            </TouchableOpacity>
          )}

          {status === "upcoming" && (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item)}>
              <Ionicons name="close-outline" size={18} color="#CF1322" />
              <Text style={styles.cancelBtnText}>Cancel Appointment</Text>
            </TouchableOpacity>
          )}

          {(status === "cancelled" || status === "completed") && (
            <View style={[styles.infoBox, status === "completed" && { backgroundColor: "#F8FAFC" }]}>
              <Ionicons 
                name={status === "completed" ? "ribbon-outline" : "alert-circle-outline"} 
                size={16} 
                color={status === "completed" ? "#64748B" : "#C62828"} 
              />
              <Text style={[styles.infoBoxText, status === "completed" && { color: "#64748B" }]}>
                {status === "completed" ? "This consultation has ended." : "This appointment was cancelled."}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Consultations</Text>
          <Text style={styles.headerSubtitle}>
            {filtered.length} {activeTab} bookings
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push("/User/Consultants")}>
            <Ionicons name="people" size={22} color="#01579B" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push("/User/ChatList")}>
            <Ionicons name="chatbubble-ellipses" size={22} color="#01579B" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabWrapper}>
        {["upcoming", "ongoing", "completed", "cancelled"].map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setActiveTab(t)}
            style={[styles.tabItem, activeTab === t && styles.activeTabItem]}
          >
            <Text style={[styles.tabLabel, activeTab === t && styles.activeTabLabel]}>
              {t.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-clear-outline" size={60} color="#CBD5E1" />
            <Text style={styles.emptyText}>No {activeTab} sessions found</Text>
          </View>
        }
      />

      {currentPaymentData && (
        <PaymentModal
          visible={paymentModalVisible}
          onClose={() => setPaymentModalVisible(false)}
          {...currentPaymentData}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 13 : 18,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#0F3E48", letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: "#64748B", marginTop: -2 },
  headerActions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  tabWrapper: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: "center" },
  activeTabItem: { backgroundColor: "#FFF", borderRadius: 10 },
  tabLabel: { fontSize: 10, fontWeight: "700", color: "#94A3B8" },
  activeTabLabel: { color: "#01579B" },

  /* ✅ ENHANCED CARDS SECTION */
  card: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    ...Platform.select({
      ios: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  consultantInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F0F9FF",
    alignItems: "center",
    justifyContent: "center",
  },
  consultantName: { fontSize: 17, fontWeight: "700", color: "#1E293B" },
  cardDateText: { fontSize: 13, color: "#64748B", marginTop: 2 },
  
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  
  cardDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 18 },

  cardFooter: { marginTop: 4 },

  openChatBtn: {
    backgroundColor: "#01579B",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  openChatBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  cancelBtn: {
    backgroundColor: "#FFF1F0",
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#FFA39E",
  },
  cancelBtnText: { color: "#CF1322", fontWeight: "700", fontSize: 14 },

  infoBox: {
    backgroundColor: "#FEF2F2",
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  infoBoxText: { color: "#C62828", fontWeight: "600", fontSize: 13 },

  emptyContainer: { alignItems: "center", marginTop: 80, gap: 15 },
  emptyText: { color: "#94A3B8", fontSize: 16, fontWeight: "600" },
});