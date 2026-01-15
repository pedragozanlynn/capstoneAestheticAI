import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  SafeAreaView,
} from "react-native";
import { db } from "../../config/firebase";
import PaymentModal from "../components/PaymentModal";

const THEME = {
  primary: "#01579B",
  bg: "#F8FAFC",
  avatarBg: "#DBEAFE",
  avatarText: "#1E40AF",
  textDark: "#0F172A",
  textGray: "#64748B",
};

export default function ChatList() {
  const [rooms, setRooms] = useState([]);
  const [activeTab, setActiveTab] = useState("ongoing"); // Idinagdag na state
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [currentPaymentData, setCurrentPaymentData] = useState(null);
  const router = useRouter();

  /* ================= HELPERS (Same Logic) ================= */
  const fetchConsultantInfo = async (consultantId) => {
    try {
      const snap = await getDoc(doc(db, "consultants", consultantId));
      if (!snap.exists()) return { name: "Consultant" };
      const c = snap.data();
      return { name: c.fullName || "Consultant" };
    } catch {
      return { name: "Consultant" };
    }
  };

  const fetchAppointmentInfo = async (appointmentId) => {
    try {
      const snap = await getDoc(doc(db, "appointments", appointmentId));
      if (!snap.exists()) return null;
      const a = snap.data();
      return { date: a.appointmentAt, time: a.appointmentAt };
    } catch (e) { return null; }
  };

  const checkPayment = async (room) => {
    try {
      const q = query(
        collection(db, "payments"),
        where("userId", "==", room.userId),
        where("consultantId", "==", room.consultantId),
        where("appointmentId", "==", room.appointmentId),
        where("status", "==", "completed")
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch { return false; }
  };

  const openChatWithPaymentCheck = async (room) => {
    const hasPaid = await checkPayment(room);
    if (!hasPaid) {
      const appointment = await fetchAppointmentInfo(room.appointmentId);
      setCurrentPaymentData({
        ...room,
        appointmentDate: appointment?.date || null,
        appointmentTime: appointment?.time || null,
      });
      setPaymentModalVisible(true);
      return;
    }
    router.push({
      pathname: "/User/ChatRoom",
      params: { roomId: room.id, userId: room.userId, consultantId: room.consultantId },
    });
  };

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    let unsub;
    const loadRooms = async () => {
      const userId = await AsyncStorage.getItem("userUid");
      if (!userId) return;
      const q = query(collection(db, "chatRooms"), where("userId", "==", userId), orderBy("lastMessageAt", "desc"));
      unsub = onSnapshot(q, async (snap) => {
        const enriched = await Promise.all(snap.docs.map(async (d) => {
          const room = { id: d.id, ...d.data() };
          const consultant = await fetchConsultantInfo(room.consultantId);
          return { ...room, consultantName: consultant.name };
        }));
        setRooms(enriched);
      });
    };
    loadRooms();
    return () => unsub && unsub();
  }, []);

  // Filter Logic para sa Tabs
  const filteredRooms = rooms.filter((room) => {
    if (activeTab === "ongoing") return room.status !== "completed";
    return room.status === "completed";
  });

  /* ================= UI ================= */
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.primary} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity 
                style={styles.backBtn} 
                onPress={() => router.push("/User/Consultants")}
              >
                <Ionicons name="chevron-back" size={24} color="#FFF" />
              </TouchableOpacity>
              <View style={styles.headerTextGroup}>
                <Text style={styles.headerTitle}>Messages</Text>
                <Text style={styles.headerSub}>Active consultations</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* FLOATING TABS (Ongoing & Completed) */}
      <View style={styles.filterWrapper}>
        <View style={styles.tabBar}>
          {["ongoing", "completed"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, activeTab === tab && styles.activeTabItem]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabLabel, activeTab === tab && styles.activeTabLabel]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              {activeTab === tab && <View style={styles.activeDot} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredRooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.chatCard}
            onPress={() => openChatWithPaymentCheck(item)}
            activeOpacity={0.8}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.consultantName?.[0]}</Text>
            </View>

            <View style={styles.chatInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{item.consultantName}</Text>
                <Text style={styles.timeText}>
                  {item.lastMessageAt ? new Date(item.lastMessageAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                </Text>
              </View>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.lastMessage || "No messages yet"}
              </Text>
            </View>
            <Ionicons 
                name={activeTab === 'ongoing' ? "chevron-forward" : "checkmark-circle"} 
                size={16} 
                color={activeTab === 'ongoing' ? "#CBD5E1" : "#10B981"} 
            />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="chatbubbles-outline" size={50} color="#CBD5E1" />
            <Text style={styles.emptyText}>No {activeTab} conversations</Text>
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
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    backgroundColor: THEME.primary,
    paddingTop: 30,
    paddingBottom: 20, // Dinagdagan para sa overlap
   
  },
  headerContent: { paddingHorizontal: 15, paddingTop: 10 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  headerTextGroup: { flex: 1 },
  headerTitle: { color: "#fff", fontSize: 24, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: -2 },

  /* TABS STYLING */
  filterWrapper: {
    paddingHorizontal: 20,
    marginTop: 25, // Overlap sa header
    marginBottom: 5,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 15,
    padding: 5,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderRadius: 10,
  },
  activeTabItem: {
    backgroundColor: '#F1F5F9',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  activeTabLabel: {
    color: THEME.primary,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: THEME.primary,
    marginLeft: 6,
  },

  listContainer: { padding: 16, paddingTop: 15, paddingBottom: 100 },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: THEME.avatarBg,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  avatarText: { color: THEME.avatarText, fontWeight: "bold", fontSize: 20 },
  chatInfo: { flex: 1, marginRight: 10 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: "700", color: THEME.textDark },
  timeText: { fontSize: 11, color: THEME.textGray },
  lastMessage: { fontSize: 13, color: THEME.textGray, marginTop: 3 },
  emptyBox: { alignItems: 'center', marginTop: 100 },
  emptyText: { textAlign: 'center', marginTop: 15, color: '#94A3B8', fontSize: 14 }
});