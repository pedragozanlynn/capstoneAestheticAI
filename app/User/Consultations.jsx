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
  addDoc, // ✅ add this

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
  Platform, // ✅ add

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
// ✅ FIX: If declined/rejected/cancelled => never show as ongoing/upcoming
// -----------------------------
const getStatus = (item) => {
  const s = String(item?.status || "").toLowerCase();

  // ✅ hard-excludes
  if (s === "cancelled") return "cancelled";
  if (s === "declined" || s === "rejected") return "cancelled"; // treat as cancelled tab
  if (s === "completed") return "past";

  const start =
    item?.appointmentAt?.toDate?.() || parseLegacyDateTime(item?.date, item?.time);

  if (!start) return "upcoming";

  const now = new Date();
  const twelveHoursLater = new Date(start.getTime() + 12 * 60 * 60 * 1000);

  if (now < start) return "upcoming";
  if (now >= start && now <= twelveHoursLater) return "ongoing";

  return "past";
};

// -----------------------------
// 📱 MAIN SCREEN
// ✅ UPDATED (Validations + messages + safer guards)
// - Validate userUid exists
// - Validate required appointment fields before payment check & PaymentModal
// - Validate chatRoomId + consultantId before open chat
// - User-friendly Alert messages (no repeated spam)
// ❗ No other UI/layout/logic changes
// -----------------------------
export default function Consultations() {
  const [consultations, setConsultations] = useState([]);
  const [consultantMap, setConsultantMap] = useState({});
  const [activeTab, setActiveTab] = useState("upcoming");

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [currentPaymentData, setCurrentPaymentData] = useState(null);

  const router = useRouter();

  // ✅ prevent repeated alerts
  const didWarnNoUserRef = useRef(false);
  const didWarnLoadFailRef = useRef(false);

  const safeStr = (v) => String(v ?? "").trim();
  const isNonEmpty = (v) => safeStr(v).length > 0;

  const validateAppointment = (item) => {
    if (!item?.id) return "Missing appointment id.";
    if (!isNonEmpty(item?.userId)) return "Missing userId for this appointment.";
    if (!isNonEmpty(item?.consultantId)) return "Missing consultantId for this appointment.";
    return "";
  };

  const getAppointmentStart = (item) =>
    item?.appointmentAt?.toDate?.() || parseLegacyDateTime(item?.date, item?.time);

  // -----------------------------
  // 🔥 LOAD APPOINTMENTS
  // -----------------------------
  useEffect(() => {
    let unsub;

    const load = async () => {
      try {
        const userId = await AsyncStorage.getItem("userUid");

        if (!userId) {
          setConsultations([]);
          setConsultantMap({});
          if (!didWarnNoUserRef.current) {
            didWarnNoUserRef.current = true;
            Alert.alert("Session Required", "Please sign in again to view your consultations.");
          }
          return;
        }

        const q = query(
          collection(db, "appointments"),
          where("userId", "==", userId)
        );

        unsub = onSnapshot(
          q,
          async (snap) => {
            const items = snap.docs
              .map((d) => {
                const data = d.data() || {};
                const sortTime =
                  data.appointmentAt?.toDate?.() ||
                  parseLegacyDateTime(data.date, data.time);

                return {
                  id: d.id,
                  ...data,
                  computedStatus: getStatus(data),
                  _sortTime: sortTime || new Date(0),
                };
              })
              .sort(
                (a, b) =>
                  (b._sortTime?.getTime?.() || 0) - (a._sortTime?.getTime?.() || 0)
              );

            setConsultations(items);

            // build consultant name map
            const map = {};
            await Promise.all(
              items.map(async (i) => {
                if (i.consultantId && !map[i.consultantId]) {
                  try {
                    const s = await getDoc(doc(db, "consultants", i.consultantId));
                    if (s.exists()) {
                      map[i.consultantId] = s.data()?.fullName || "Consultant";
                    }
                  } catch (e) {
                    console.log("Consultant fetch failed:", e?.message || e);
                  }
                }
              })
            );
            setConsultantMap(map);
          },
          (err) => {
            console.log("Appointments snapshot error:", err?.message || err);
            setConsultations([]);
            if (!didWarnLoadFailRef.current) {
              didWarnLoadFailRef.current = true;
              Alert.alert("Error", "Failed to load consultations. Please try again.");
            }
          }
        );
      } catch (e) {
        console.log("Load consultations crash:", e?.message || e);
        setConsultations([]);
        if (!didWarnLoadFailRef.current) {
          didWarnLoadFailRef.current = true;
          Alert.alert("Error", "Failed to load consultations. Please try again.");
        }
      }
    };

    load();
    return () => unsub && unsub();
  }, []);

  const notifyConsultantCancelled = async (appointment) => {
    try {
      const consultantId = String(appointment?.consultantId || "").trim();
      const appointmentId = String(appointment?.id || "").trim();
      const userId = String(appointment?.userId || "").trim();
  
      if (!consultantId || !appointmentId || !userId) {
        console.log("notifyConsultantCancelled: missing fields", {
          consultantId,
          appointmentId,
          userId,
        });
        return;
      }
  
      const start =
        appointment?.appointmentAt?.toDate?.() ||
        parseLegacyDateTime(appointment?.date, appointment?.time);
  
      const whenText = start
        ? `${start.toLocaleDateString?.()} ${start.toLocaleTimeString?.()}`
        : `${appointment?.date || ""} ${appointment?.time || ""}`.trim();
  
      // ✅ Create notification for consultant
      await addDoc(collection(db, "notifications"), {
        // target
        recipientId: consultantId,     // ✅ consultant who should receive
        recipientRole: "consultant",
  
        // source
        senderId: userId,
        senderRole: "user",
  
        // context
        type: "appointment_cancelled",
        appointmentId,
  
        title: "Appointment Cancelled",
        body: whenText
          ? `The user cancelled the appointment scheduled at ${whenText}.`
          : "The user cancelled the appointment.",
  
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.log("notifyConsultantCancelled error:", e?.message || e);
    }
  };
  

  // -----------------------------
  // 💳 PAYMENT CHECK
  // -----------------------------
  const checkPayment = async (item) => {
    try {
      const err = validateAppointment(item);
      if (err) {
        console.log("Validation failed (checkPayment):", err, item);
        return false;
      }

      const q = query(
        collection(db, "payments"),
        where("userId", "==", item.userId),
        where("consultantId", "==", item.consultantId),
        where("appointmentId", "==", item.id),
        where("status", "==", "completed")
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (e) {
      console.log("checkPayment error:", e?.message || e);
      return false;
    }
  };

  const handleCancel = async (item) => {
    const id = item?.id;
  
    if (!id) {
      Alert.alert("Error", "Invalid appointment.");
      return;
    }
  
    Alert.alert("Cancel Appointment", "Are you sure you want to cancel this appointment?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        style: "destructive",
        onPress: async () => {
          try {
            // ✅ 1) update appointment status
            await updateDoc(doc(db, "appointments", id), {
              status: "cancelled",
              cancelledAt: serverTimestamp(),
              cancelledBy: "user",
            });
  
            // ✅ 2) notify consultant (best-effort)
            await notifyConsultantCancelled(item);
  
            Alert.alert("Cancelled", "Appointment cancelled successfully.");
          } catch (e) {
            console.log("Cancel error:", e?.message || e);
            Alert.alert("Error", "Failed to cancel appointment. Please try again.");
          }
        },
      },
    ]);
  };
  

  const openChat = async (item) => {
    try {
      // ✅ block if declined/rejected/cancelled
      const s = String(item?.status || "").toLowerCase();
      if (s === "declined" || s === "rejected" || s === "cancelled") {
        Alert.alert("Session not available", "This appointment is not active.");
        return;
      }

      // ✅ validate minimal appointment fields
      const err = validateAppointment(item);
      if (err) {
        Alert.alert("Chat not available", "This appointment is missing required details.");
        return;
      }

      // ✅ validate chat room exists
      if (!isNonEmpty(item.chatRoomId)) {
        Alert.alert("Chat not available", "Chat room is not ready yet.");
        return;
      }

      // ✅ validate schedule exists before payment modal
      const start = getAppointmentStart(item);
      if (!start) {
        Alert.alert("Missing schedule", "This booking has no schedule yet.");
        return;
      }

      const hasPaid = await checkPayment(item);

      if (!hasPaid) {
        // ✅ make sure PaymentModal gets consistent fields
        setCurrentPaymentData({
          ...item,
          roomId: item.chatRoomId,
          appointmentId: item.id,
          appointmentAt: item.appointmentAt || null,
          appointmentDate:
            item.date || start.toLocaleDateString?.() || "",
          appointmentTime:
            item.time || start.toLocaleTimeString?.() || "",
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
    } catch (e) {
      console.log("openChat error:", e?.message || e);
      Alert.alert("Error", "Something went wrong. Please try again.");
    }
  };

  // ✅ IMPORTANT: if declined/rejected, force it into "cancelled" tab via getStatus()
  const filtered = useMemo(
    () => consultations.filter((c) => c.computedStatus === activeTab),
    [consultations, activeTab]
  );

  const renderItem = ({ item }) => {
    const status = item.computedStatus;

    const statusColors = {
      ongoing: { bg: "#E8F5E9", text: "#2E7D32", icon: "radio-button-on" },
      upcoming: { bg: "#FFF3E0", text: "#EF6C00", icon: "time-outline" },
      cancelled: { bg: "#FFEBEE", text: "#C62828", icon: "close-circle-outline" },
      past: { bg: "#F5F5F5", text: "#616161", icon: "checkmark-done-circle-outline" },
    };

    const currentStyle = statusColors[status] || statusColors.upcoming;

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
          <TouchableOpacity style={styles.openChatBtn} onPress={() => openChat(item)}>
            <Ionicons name="chatbubbles-outline" size={16} color="#FFF" />
            <Text style={styles.openChatBtnText}>Open Chat</Text>
          </TouchableOpacity>
        )}

        {status === "upcoming" && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item)}>
            <Text style={styles.cancelBtnText}>Cancel Appointment</Text>
          </TouchableOpacity>
        )}

        {/* ✅ Optional: show info if cancelled/declined */}
        {status === "cancelled" && (
          <View style={styles.cancelInfoBox}>
            <Text style={styles.cancelInfoText}>This session is not active anymore.</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Consultations</Text>
          <Text style={styles.headerSubtitle}>
            {filtered.length} {activeTab} sessions
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
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <Ionicons name="calendar-outline" size={48} color="#CBD5E1" />
            <Text style={{ marginTop: 10, color: "#94A3B8", fontWeight: "700" }}>
              No {activeTab} sessions found
            </Text>
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

// -----------------------------
// 🎨 STYLES
// -----------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 20 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 10 : 16, // ✅ lower but safe
    paddingBottom: 20,
  },
  
  headerTitle: { fontSize: 25, fontWeight: "600", color: "#0F3E48" },
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

  cancelInfoBox: {
    backgroundColor: "#FFEBEE",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelInfoText: { color: "#C62828", fontWeight: "700", fontSize: 12 },
});
