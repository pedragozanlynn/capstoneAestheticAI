import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  Pressable,
} from "react-native";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";

const TABS = ["pending", "accepted", "declined", "cancelled"];

const normalizeStatus = (s) => {
  if (!s) return "pending";
  const v = String(s).toLowerCase();
  if (v === "cancel" || v === "canceled") return "cancelled";
  if (v === "decline") return "declined";
  if (v === "complete" || v === "completed") return "completed";
  if (v === "ongoing") return "ongoing";
  return v;
};

export default function Requests() {
  const router = useRouter();
  const auth = getAuth();

  const [authUid, setAuthUid] = useState(null);
  const [requests, setRequests] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [loading, setLoading] = useState(true);

  // ✅ per-item loading
  const [actionId, setActionId] = useState(null); // appointment id currently being acted on

  // ✅ app-ready centered messages
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info"); // "success" | "error" | "info"
  const [msgTitle, setMsgTitle] = useState("");
  const [msgText, setMsgText] = useState("");

  const hideTimerRef = useRef(null);
  const fetchingRef = useRef(false);

  const showMessage = (type, title, text, autoHideMs = 1400) => {
    try {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } catch {}

    setMsgType(type || "info");
    setMsgTitle(String(title || ""));
    setMsgText(String(text || ""));
    setMsgVisible(true);

    if (autoHideMs && autoHideMs > 0) {
      hideTimerRef.current = setTimeout(() => {
        setMsgVisible(false);
      }, autoHideMs);
    }
  };

  const closeMessage = () => {
    try {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } catch {}
    setMsgVisible(false);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setAuthUid(user.uid);
      else setAuthUid(null);
    });
    return unsub;
  }, []);

  const fetchRequests = async () => {
    if (!authUid) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setLoading(true);
      const q = query(collection(db, "appointments"), where("consultantId", "==", authUid));
      const snap = await getDocs(q);

      const results = [];
      for (const d of snap.docs) {
        const data = d.data();
        const item = {
          id: d.id,
          ...data,
          status: normalizeStatus(data.status),
        };

        // ✅ hydrate user info safely
        if (item.userId) {
          try {
            const uSnap = await getDoc(doc(db, "users", item.userId));
            if (uSnap.exists()) {
              const u = uSnap.data();
              item.userName = u.name || u.fullName || "Unknown User";
              item.userEmail = u.email || "N/A";
            } else {
              item.userName = "Unknown User";
              item.userEmail = "N/A";
            }
          } catch {
            item.userName = "Unknown User";
            item.userEmail = "N/A";
          }
        } else {
          item.userName = "Unknown User";
          item.userEmail = "N/A";
        }

        results.push(item);
      }

      setRequests(results);
    } catch (err) {
      console.log("❌ Fetch requests error:", err);
      showMessage("error", "Fetch failed", "Unable to load requests. Please try again.", 1600);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    if (authUid) fetchRequests();
  }, [authUid]);

  // ✅ Reusable notification push (global notifications collection)
  const pushUserNotification = async ({ userId, type, title, message, item }) => {
    try {
      if (!userId || !authUid || !item?.id) return;

      await addDoc(collection(db, "notifications"), {
        userId: String(userId),
        consultantId: String(authUid),

        type: String(type),
        title: String(title),
        message: String(message),
        read: false,

        appointmentId: String(item.id),
        appointmentStatus: String(item.status || ""),
        appointmentAt: item?.appointmentAt || null,
        sessionFee: item?.sessionFee ?? null,

        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.log("❌ pushUserNotification error:", e?.message || e);
    }
  };

  // ✅ validations helper
  const validateAction = (item, action) => {
    if (!authUid) {
      showMessage("error", "Not signed in", "Please sign in again.", 1600);
      return false;
    }
    if (!item || !item.id) {
      showMessage("error", "Invalid request", "Missing appointment id.", 1600);
      return false;
    }
    if (!item.userId) {
      showMessage("error", "Invalid request", "Missing user id.", 1600);
      return false;
    }

    const status = normalizeStatus(item.status);
    if (status !== "pending") {
      // ✅ no top alert; centered info
      showMessage("info", "Action not allowed", `This request is already ${status}.`, 1500);
      return false;
    }

    // optional: ensure appointmentAt exists for accepted
    if (action === "accept" && !item.appointmentAt) {
      showMessage("error", "Missing schedule", "This request has no schedule date/time.", 1700);
      return false;
    }

    return true;
  };

  const acceptRequest = async (item) => {
    if (!validateAction(item, "accept")) return;
    if (actionId) return; // ✅ block parallel actions
    setActionId(item.id);

    try {
      const appointmentRef = doc(db, "appointments", item.id);
      const chatRoomRef = doc(db, "chatRooms", item.id);

      // ✅ 1) Update appointment status
      await updateDoc(appointmentRef, {
        status: "accepted",
        chatRoomId: item.id,
        acceptedAt: serverTimestamp(),
      });

      // ✅ 2) Create chatRoom if not exists
      const chatRoomSnap = await getDoc(chatRoomRef);
      if (!chatRoomSnap.exists()) {
        await setDoc(chatRoomRef, {
          appointmentId: item.id,
          consultantId: authUid,
          userId: item.userId,
          createdAt: serverTimestamp(),
          lastMessage: "Consultation started.",
          lastMessageAt: serverTimestamp(),
          lastSenderId: "",
          lastSenderType: "",
          ratingSubmitted: false,
          status: "ongoing",
          unreadForConsultant: false,
          unreadForUser: true,
        });
      }

      // ✅ 3) Notify user
      await pushUserNotification({
        userId: item.userId,
        type: "booking_accepted",
        title: "Booking Accepted",
        message: "Your consultation booking has been accepted.",
        item: { ...item, status: "accepted" },
      });

      showMessage("success", "Accepted", "Request accepted successfully.", 1400);
      await fetchRequests();
    } catch (error) {
      console.error("❌ Error sa acceptRequest:", error);
      showMessage("error", "Accept failed", "Please check permissions or try again.", 1700);
    } finally {
      setActionId(null);
    }
  };

  const declineRequest = async (item) => {
    if (!validateAction(item, "decline")) return;
    if (actionId) return;
    setActionId(item.id);

    try {
      await updateDoc(doc(db, "appointments", item.id), {
        status: "declined",
        declinedAt: serverTimestamp(),
      });

      await pushUserNotification({
        userId: item.userId,
        type: "booking_rejected",
        title: "Booking Declined",
        message: "Your consultation booking was declined.",
        item: { ...item, status: "declined" },
      });

      showMessage("success", "Declined", "Request declined successfully.", 1400);
      await fetchRequests();
    } catch (error) {
      console.error("❌ Decline error:", error);
      showMessage("error", "Decline failed", "Please try again.", 1600);
    } finally {
      setActionId(null);
    }
  };

  const openChat = (item) => {
    const status = normalizeStatus(item.status);

    if (status === "completed") {
      showMessage("info", "Completed", "This consultation is already completed.", 1500);
      return;
    }
    if (!item?.chatRoomId && status !== "accepted" && status !== "ongoing") {
      showMessage("info", "Not available", "Chat is available only for accepted sessions.", 1500);
      return;
    }

    router.push({
      pathname: "/Consultant/ChatRoom",
      params: {
        roomId: item.chatRoomId || item.id,
        userId: item.userId,
        appointmentId: item.id,
      },
    });
  };

  const filtered = useMemo(() => {
    return requests.filter((r) =>
      activeTab === "accepted"
        ? normalizeStatus(r.status) === "accepted" || normalizeStatus(r.status) === "completed" || normalizeStatus(r.status) === "ongoing"
        : normalizeStatus(r.status) === activeTab
    );
  }, [requests, activeTab]);

  const renderItem = ({ item }) => {
    const status = normalizeStatus(item.status);
    const isActing = actionId === item.id;
    const disableActions = isActing || !!actionId; // block if another action is running

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.clientInfo}>
            <View style={styles.avatarMini}>
              <Text style={styles.avatarText}>{String(item.userName || "U").charAt(0)}</Text>
            </View>
            <View>
              <Text style={styles.clientName}>{item.userName}</Text>
              <Text style={styles.clientEmail}>{item.userEmail}</Text>
            </View>
          </View>

          <View style={[styles.statusBadge, styles.statusBg(status)]}>
            <Text style={styles.statusText(status)}>{status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardBody}>
          <View style={styles.dateTimeContainer}>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={14} color="#64748B" />
              <Text style={styles.detailText}>
                {item.appointmentAt?.toDate?.().toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }) || "N/A"}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={14} color="#64748B" />
              <Text style={styles.detailText}>
                {item.appointmentAt?.toDate?.().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }) || "N/A"}
              </Text>
            </View>
          </View>

          {(status === "accepted" || status === "ongoing" || status === "completed") && (
            <TouchableOpacity
              style={[styles.chatBtn, isActing && { opacity: 0.7 }]}
              onPress={() => openChat(item)}
              disabled={isActing}
            >
              <Ionicons name="chatbubbles" size={16} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.chatBtnText}>Open Chat</Text>
            </TouchableOpacity>
          )}
        </View>

        {item.notes ? (
          <View style={styles.notesBox}>
            <View style={styles.notesHeader}>
              <Ionicons name="document-text-outline" size={14} color="#475569" />
              <Text style={styles.notesLabel}>Client Notes</Text>
            </View>
            <Text style={styles.notesText} numberOfLines={3} ellipsizeMode="tail">
              {item.notes}
            </Text>
          </View>
        ) : null}

        {status === "pending" && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.acceptBtn, disableActions && { opacity: 0.6 }]}
              onPress={() => acceptRequest(item)}
              disabled={disableActions}
              activeOpacity={0.8}
            >
              {isActing ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.acceptBtnText}>Accept</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.declineBtn, disableActions && { opacity: 0.6 }]}
              onPress={() => declineRequest(item)}
              disabled={disableActions}
              activeOpacity={0.8}
            >
              {isActing ? (
                <ActivityIndicator color="#0F172A" size="small" />
              ) : (
                <Text style={styles.declineBtnText}>Decline</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const msgConfig = useMemo(() => {
    if (msgType === "success") return { icon: "checkmark-circle", color: "#16A34A", bg: "#ECFDF5" };
    if (msgType === "error") return { icon: "close-circle", color: "#DC2626", bg: "#FEF2F2" };
    return { icon: "information-circle", color: "#01579B", bg: "#EFF6FF" };
  }, [msgType]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ✅ HEADER — UNCHANGED */}
      <View style={styles.headerArea}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Consultations</Text>
            <Text style={styles.headerSub}>Review and manage your sessions</Text>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.tabContainer}>
        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setActiveTab(t)}
              style={[styles.tabItem, activeTab === t && styles.activeTabItem]}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabLabel, activeTab === t && styles.activeTabLabel]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
              {activeTab === t && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color="#01579B" />
          <Text style={styles.loadingText}>Fetching schedules...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="calendar-outline" size={60} color="#CBD5E1" />
              <Text style={styles.emptyText}>No {activeTab} appointments found</Text>
            </View>
          }
        />
      )}

      {/* ✅ Centered Message Modal (app-ready) */}
      <Modal visible={msgVisible} transparent animationType="fade" onRequestClose={closeMessage}>
        <Pressable style={styles.msgBackdrop} onPress={closeMessage}>
          <Pressable style={[styles.msgCard, { backgroundColor: msgConfig.bg }]} onPress={() => {}}>
            <View style={styles.msgRow}>
              <Ionicons name={msgConfig.icon} size={22} color={msgConfig.color} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                {!!msgTitle && <Text style={styles.msgTitle}>{msgTitle}</Text>}
                {!!msgText && <Text style={styles.msgText}>{msgText}</Text>}
              </View>
            </View>

            <TouchableOpacity style={styles.msgClose} onPress={closeMessage} activeOpacity={0.8}>
              <Ionicons name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <BottomNavbar role="consultant" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  // 🔒 HEADER — UNCHANGED
  headerArea: { backgroundColor: "#01579B", paddingBottom: 20, paddingTop: 30 },
  headerContent: { paddingHorizontal: 25, paddingTop: 40 },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#fff" },
  headerSub: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 4 },

  tabContainer: { backgroundColor: "#FFF", marginTop: 20, marginHorizontal: 20, borderRadius: 20, elevation: 4 },
  tabRow: { flexDirection: "row", paddingHorizontal: 10 },
  tabItem: { paddingVertical: 15, flex: 1, alignItems: "center" },
  activeTabItem: {},
  tabLabel: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  activeTabLabel: { color: "#01579B" },
  tabIndicator: { position: "absolute", bottom: 10, width: 20, height: 3, backgroundColor: "#01579B", borderRadius: 2 },

  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },

  card: { backgroundColor: "#fff", borderRadius: 24, padding: 20, marginBottom: 16 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  clientInfo: { flexDirection: "row", alignItems: "center" },
  avatarMini: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#E0F2F1", justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { color: "#01579B", fontWeight: "bold", fontSize: 16 },
  clientName: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  clientEmail: { fontSize: 12, color: "#64748B" },

  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10 },
  statusText: (s) => ({
    fontSize: 10,
    fontWeight: "800",
    color:
      s === "pending" ? "#B45309"
      : s === "accepted" || s === "ongoing" || s === "completed" ? "#065F46"
      : "#7F1D1D",
  }),
  statusBg: (s) => ({
    backgroundColor:
      s === "pending" ? "#FEF3C7"
      : s === "accepted" || s === "ongoing" || s === "completed" ? "#D1FAE5"
      : "#FEE2E2",
  }),

  divider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 15 },
  cardBody: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  dateTimeContainer: { gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 13, color: "#475569", fontWeight: "500" },

  chatBtn: { backgroundColor: "#01579B", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  chatBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 15 },
  acceptBtn: { flex: 1, backgroundColor: "#3fa796", paddingVertical: 12, borderRadius: 14, alignItems: "center", minHeight: 44, justifyContent: "center" },
  acceptBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  declineBtn: { flex: 1, backgroundColor: "#FFF", paddingVertical: 12, borderRadius: 14, alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0", minHeight: 44, justifyContent: "center" },
  declineBtnText: { color: "#912f56", fontWeight: "800", fontSize: 13 },

  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#64748B" },

  emptyBox: { alignItems: "center", justifyContent: "center", marginTop: 80, padding: 30 },
  emptyText: { color: "#64748B", marginTop: 12, fontWeight: "600", fontSize: 14 },

  notesBox: { marginTop: 14, backgroundColor: "#F8FAFC", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0" },
  notesHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  notesLabel: { fontSize: 12, fontWeight: "700", color: "#475569" },
  notesText: { fontSize: 13, color: "#334155", lineHeight: 18 },

  // ✅ Centered message modal (stable on device)
  msgBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  msgCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    position: "relative",
  },
  msgRow: { flexDirection: "row", alignItems: "flex-start" },
  msgTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  msgText: { marginTop: 3, fontSize: 13, fontWeight: "700", color: "#475569", lineHeight: 18 },
  msgClose: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
});
