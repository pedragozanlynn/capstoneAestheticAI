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
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from "react-native";
import { db } from "../../config/firebase";
import PaymentModal from "../components/PaymentModal";

// -----------------------------
// 🔧 DATE PARSER (UNCHANGED)
// -----------------------------
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

// -----------------------------
// ✅ STATUS LOGIC (12 HOURS)
// -----------------------------
const getStatus = (item) => {
  if (item.status === "cancelled") return "cancelled";
  if (item.status === "completed") return "past";

  const start =
    item.appointmentAt?.toDate?.() ||
    parseLegacyDateTime(item.date, item.time);

  if (!start) return "upcoming";

  const now = new Date();
  const twelveHoursLater = new Date(
    start.getTime() + 12 * 60 * 60 * 1000
  );

  if (now < start) return "upcoming";
  if (now >= start && now <= twelveHoursLater) return "ongoing";

  return "past";
};

// -----------------------------
// 📱 MAIN SCREEN
// -----------------------------
export default function Consultations() {
  const [consultations, setConsultations] = useState([]);
  const [consultantMap, setConsultantMap] = useState({});
  const [activeTab, setActiveTab] = useState("upcoming");

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [currentPaymentData, setCurrentPaymentData] = useState(null);

  const router = useRouter();

  // -----------------------------
  // 🔥 LOAD APPOINTMENTS
  // -----------------------------
  useEffect(() => {
    let unsub;
    const load = async () => {
      const userId = await AsyncStorage.getItem("userUid");
      if (!userId) return;

      const q = query(
        collection(db, "appointments"),
        where("userId", "==", userId)
      );

      unsub = onSnapshot(q, async (snap) => {
        const items = snap.docs
          .map((d) => {
            const data = d.data();
            const sortTime =
              data.appointmentAt?.toDate?.() ||
              parseLegacyDateTime(data.date, data.time);

            return {
              id: d.id,
              ...data,
              computedStatus: getStatus(data),
              _sortTime: sortTime,
            };
          })
          .sort((a, b) => b._sortTime - a._sortTime);

        setConsultations(items);

        const map = {};
        await Promise.all(
          items.map(async (i) => {
            if (i.consultantId && !map[i.consultantId]) {
              const s = await getDoc(
                doc(db, "consultants", i.consultantId)
              );
              if (s.exists()) map[i.consultantId] = s.data().fullName;
            }
          })
        );
        setConsultantMap(map);
      });
    };

    load();
    return () => unsub && unsub();
  }, []);

  // -----------------------------
  // 💳 PAYMENT CHECK
  // -----------------------------
  const checkPayment = async (item) => {
    try {
      const q = query(
        collection(db, "payments"),
        where("userId", "==", item.userId),
        where("consultantId", "==", item.consultantId),
        where("appointmentId", "==", item.id),
        where("status", "==", "completed")
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch {
      return false;
    }
  };

  const handleCancel = async (id) => {
    Alert.alert("Cancel Appointment", "Are you sure?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        onPress: async () => {
          await updateDoc(doc(db, "appointments", id), {
            status: "cancelled",
            cancelledAt: serverTimestamp(),
            cancelledBy: "user",
          });
        },
      },
    ]);
  };

  const openChat = async (item) => {
    if (!item.chatRoomId) {
      Alert.alert("Chat not available", "Chat room is not ready yet.");
      return;
    }

    const hasPaid = await checkPayment(item);

    if (!hasPaid) {
      setCurrentPaymentData({
        ...item,
        roomId: item.chatRoomId,
        appointmentId: item.id,
        appointmentDate:
          item.date ||
          item.appointmentAt?.toDate()?.toLocaleDateString(),
        appointmentTime:
          item.time ||
          item.appointmentAt?.toDate()?.toLocaleTimeString(),
      });
      setPaymentModalVisible(true);
      return;
    }

    router.push({
      pathname: "/User/ChatRoom",
      params: {
        roomId: item.chatRoomId,
        consultantId: item.consultantId,
        appointmentId: item.id,
      },
    });
  };

  const filtered = consultations.filter(
    (c) => c.computedStatus === activeTab
  );

  const renderItem = ({ item }) => {
    const status = item.computedStatus;
    const statusColors = {
      ongoing: { bg: "#E8F5E9", text: "#2E7D32", icon: "radio-button-on" },
      upcoming: { bg: "#FFF3E0", text: "#EF6C00", icon: "time-outline" },
      cancelled: { bg: "#FFEBEE", text: "#C62828", icon: "close-circle-outline" },
      past: { bg: "#F5F5F5", text: "#616161", icon: "checkmark-done-circle-outline" },
    };

    const currentStyle = statusColors[status];

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.consultantInfo}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={16} color="#01579B" />
            </View>
            <Text style={styles.consultantName}>
              {consultantMap[item.consultantId] || "Consultant"}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: currentStyle.bg }]}>
            <Ionicons
              name={currentStyle.icon}
              size={12}
              color={currentStyle.text}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.statusBadgeText, { color: currentStyle.text }]}>
              {status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        {status === "ongoing" && (
          <TouchableOpacity
            style={styles.openChatBtn}
            onPress={() => openChat(item)}
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#FFF" />
            <Text style={styles.openChatBtnText}>Open Chat</Text>
          </TouchableOpacity>
        )}

        {status === "upcoming" && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancel(item.id)}
          >
            <Text style={styles.cancelBtnText}>Cancel Appointment</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* 🔥 HEADER RESTORED */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Consultations</Text>
          <Text style={styles.headerSubtitle}>
            {filtered.length} active sessions
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push("/User/Consultants")}
          >
            <Ionicons name="people" size={22} color="#01579B" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push("/User/ChatList")}
          >
            <Ionicons name="chatbubble-ellipses" size={22} color="#01579B" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabWrapper}>
        {["upcoming", "ongoing", "past", "cancelled"].map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setActiveTab(t)}
            style={[
              styles.tabItem,
              activeTab === t && styles.activeTabItem,
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === t && styles.activeTabLabel,
              ]}
            >
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

// -----------------------------
// 🎨 STYLES
// -----------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 20 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#0F3E48" },
  headerSubtitle: { fontSize: 14, color: "#64748B", marginTop: -2 },
  headerActions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },

  tabWrapper: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: "center" },
  activeTabItem: { backgroundColor: "#FFF", borderRadius: 10 },
  tabLabel: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  activeTabLabel: { color: "#01579B" },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  consultantInfo: { flexDirection: "row", alignItems: "center" },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E1F5FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  consultantName: { fontSize: 16, fontWeight: "800", color: "#0F3E48" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },
  cardDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 12 },

  openChatBtn: {
    backgroundColor: "#01579B",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  openChatBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },

  cancelBtn: {
    backgroundColor: "#FFF1F0",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtnText: { color: "#CF1322", fontWeight: "700", fontSize: 13 },
});
