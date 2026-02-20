// app/Consultant/Requests.jsx
// ✅ UPDATED (your request):
// - Decline now notifies the USER and includes who declined (consultant name)
// ✅ Everything else kept the same

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
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import CenterMessageModal from "../components/CenterMessageModal";

const TAB_OPTIONS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" }, // ✅ includes completed now
  { key: "declined", label: "Declined" },
  { key: "cancelled", label: "Cancelled" },
];

const normalizeStatus = (s) => {
  if (!s) return "pending";
  const v = String(s).trim().toLowerCase().replace(/\s+/g, " ");

  if (v === "cancel" || v === "canceled" || v === "cancelled") return "cancelled";
  if (v === "decline" || v === "declined" || v === "rejected") return "declined";
  if (v === "accept" || v === "accepted") return "accepted";
  if (v === "ongoing" || v === "in progress" || v === "in-progress" || v === "active") return "ongoing";

  if (
    v === "complete" ||
    v === "completed" ||
    v === "done" ||
    v === "finished" ||
    v === "finish" ||
    v === "ended" ||
    v === "end" ||
    v === "resolved" ||
    v === "close" ||
    v === "closed"
  ) {
    return "completed";
  }

  return v;
};

const labelForTab = (key) => {
  const found = TAB_OPTIONS.find((o) => o.key === key);
  return found ? found.label : "All";
};

const STATUS_KIND = (s) =>
  s === "pending"
    ? "pending"
    : s === "accepted" || s === "ongoing" || s === "completed"
    ? "good"
    : "bad";

export default function Requests() {
  const router = useRouter();
  const auth = getAuth();

  const [authUid, setAuthUid] = useState(null);
  const [requests, setRequests] = useState([]);

  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);

  const [actionId, setActionId] = useState(null);

  // ✅ consultant display name for notifications
  const [consultantName, setConsultantName] = useState("");

  // ✅ CenterMessageModal state (UI only)
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");

  const hideTimerRef = useRef(null);
  const fetchingRef = useRef(false);

  const getUid = () => auth.currentUser?.uid || null;

  const showMessage = (type, title, text, autoHideMs = 1400) => {
    try {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } catch {}
    setMsgType(type || "info");
    setMsgTitle(String(title || ""));
    setMsgBody(String(text || ""));
    setMsgOpen(true);

    if (autoHideMs && autoHideMs > 0) {
      hideTimerRef.current = setTimeout(() => setMsgOpen(false), autoHideMs);
    }
  };

  const closeMessage = () => {
    try {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } catch {}
    setMsgOpen(false);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setAuthUid(user.uid);
      else setAuthUid(null);
    });
    return unsub;
  }, [auth]);

  // ✅ Load consultant name once (for user notification)
  useEffect(() => {
    const run = async () => {
      const uid = getUid();
      if (!uid) {
        setConsultantName("");
        return;
      }

      // fallback: auth displayName
      const fallback = auth.currentUser?.displayName || "your consultant";

      try {
        const snap = await getDoc(doc(db, "consultants", String(uid)));
        if (snap.exists()) {
          const d = snap.data() || {};
          const name = d.fullName || d.name || d.displayName || fallback;
          setConsultantName(String(name || fallback));
          return;
        }
      } catch {}

      setConsultantName(String(fallback));
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUid]);

  const fetchRequests = async () => {
    const uid = getUid();
    if (!uid) {
      setRequests([]);
      setLoading(false);
      return;
    }
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setLoading(true);

      const qy = query(collection(db, "appointments"), where("consultantId", "==", uid));
      const snap = await getDocs(qy);

      const results = [];
      for (const d of snap.docs) {
        const data = d.data() || {};
        const item = { id: d.id, ...data, status: normalizeStatus(data.status) };

        if (item.userId) {
          try {
            const uSnap = await getDoc(doc(db, "users", item.userId));
            if (uSnap.exists()) {
              const u = uSnap.data() || {};
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUid]);

  // ✅ UPDATED: add recipientRole/recipientId + consultantName
  const pushUserNotification = async ({ userId, type, title, message, item }) => {
    try {
      const uid = getUid();
      if (!userId || !uid || !item?.id) return;

      await addDoc(collection(db, "notifications"), {
        // user targeting (for user notifications screen)
        recipientRole: "user",
        recipientId: String(userId),

        // legacy fields (kept, in case other screens still use these)
        userId: String(userId),
        consultantId: String(uid),

        // extra context
        consultantName: String(consultantName || auth.currentUser?.displayName || "Consultant"),

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

  const validateAction = (item, action) => {
    const uid = getUid();
    if (!uid) {
      showMessage("error", "Not signed in", "Please sign in again.", 1600);
      return false;
    }
    if (!item?.id) {
      showMessage("error", "Invalid request", "Missing appointment id.", 1600);
      return false;
    }
    if (!item?.userId) {
      showMessage("error", "Invalid request", "Missing user id.", 1600);
      return false;
    }

    const status = normalizeStatus(item.status);
    if (status !== "pending") {
      showMessage("info", "Action not allowed", `This request is already ${status}.`, 1500);
      return false;
    }

    if (action === "accept" && !item.appointmentAt) {
      showMessage("error", "Missing schedule", "This request has no schedule date/time.", 1700);
      return false;
    }

    return true;
  };

  const acceptRequest = async (item) => {
    if (!validateAction(item, "accept")) return;
    if (actionId) return;

    const uid = getUid();
    if (!uid) {
      showMessage("error", "Not signed in", "Please sign in again.", 1600);
      return;
    }

    setActionId(item.id);

    try {
      const appointmentRef = doc(db, "appointments", item.id);
      const chatRoomRef = doc(db, "chatRooms", item.id);

      await runTransaction(db, async (tx) => {
        const [apptSnap, roomSnap] = await Promise.all([tx.get(appointmentRef), tx.get(chatRoomRef)]);
        if (!apptSnap.exists()) throw new Error("APPT_NOT_FOUND");

        const appt = apptSnap.data() || {};
        const currentStatus = normalizeStatus(appt.status);

        if (String(appt.consultantId || "") !== String(uid)) throw new Error("NOT_OWNER");
        if (currentStatus !== "pending") throw new Error("NOT_PENDING");
        if (!appt.appointmentAt) throw new Error("NO_SCHEDULE");

        tx.update(appointmentRef, {
          status: "accepted",
          chatRoomId: item.id,
          acceptedAt: serverTimestamp(),
        });

        if (!roomSnap.exists()) {
          tx.set(chatRoomRef, {
            appointmentId: item.id,
            consultantId: uid,
            userId: appt.userId || item.userId,
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
      });

      await pushUserNotification({
        userId: item.userId,
        type: "booking_accepted",
        title: "Booking Accepted",
        message: `Your consultation booking with ${String(
          consultantName || auth.currentUser?.displayName || "your consultant"
        )} has been accepted.`,
        item: { ...item, status: "accepted" },
      });

      showMessage("success", "Accepted", "Request accepted successfully.", 1400);
      await fetchRequests();
    } catch (error) {
      console.error("❌ acceptRequest:", error);

      const msg =
        error?.message === "NOT_OWNER"
          ? "You are not allowed to accept this request (owner mismatch)."
          : error?.message === "NOT_PENDING"
          ? "This request is no longer pending (maybe already processed)."
          : error?.message === "NO_SCHEDULE"
          ? "This request has no schedule date/time."
          : error?.message === "APPT_NOT_FOUND"
          ? "Appointment not found."
          : String(error?.message || "Please check Firestore rules/permissions then try again.");

      showMessage("error", "Accept failed", msg, 1900);
    } finally {
      setActionId(null);
    }
  };

  const declineRequest = async (item) => {
    if (!validateAction(item, "decline")) return;
    if (actionId) return;

    const uid = getUid();
    if (!uid) {
      showMessage("error", "Not signed in", "Please sign in again.", 1600);
      return;
    }

    setActionId(item.id);

    try {
      const appointmentRef = doc(db, "appointments", item.id);

      await runTransaction(db, async (tx) => {
        const apptSnap = await tx.get(appointmentRef);
        if (!apptSnap.exists()) throw new Error("APPT_NOT_FOUND");

        const appt = apptSnap.data() || {};
        const currentStatus = normalizeStatus(appt.status);

        if (String(appt.consultantId || "") !== String(uid)) throw new Error("NOT_OWNER");
        if (currentStatus !== "pending") throw new Error("NOT_PENDING");

        tx.update(appointmentRef, {
          status: "declined",
          declinedAt: serverTimestamp(),
        });
      });

      // ✅ UPDATED MESSAGE: includes who declined
      await pushUserNotification({
        userId: item.userId,
        type: "booking_rejected",
        title: "Booking Declined",
        message: `Your consultation booking with ${String(
          consultantName || auth.currentUser?.displayName || "your consultant"
        )} was declined.`,
        item: { ...item, status: "declined" },
      });

      showMessage("success", "Declined", "Request declined successfully.", 1400);
      await fetchRequests();
    } catch (error) {
      console.error("❌ declineRequest:", error);

      const msg =
        error?.message === "NOT_OWNER"
          ? "You are not allowed to decline this request (owner mismatch)."
          : error?.message === "NOT_PENDING"
          ? "This request is no longer pending (maybe already processed)."
          : error?.message === "APPT_NOT_FOUND"
          ? "Appointment not found."
          : "Please check Firestore rules/permissions then try again.";

      showMessage("error", "Decline failed", msg, 1900);
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

  const getTime = (x) =>
    Number(
      x?.createdAt?.toDate?.()?.getTime?.() ||
        x?.acceptedAt?.toDate?.()?.getTime?.() ||
        x?.appointmentAt?.toDate?.()?.getTime?.() ||
        0
    ) || 0;

  const filtered = useMemo(() => {
    const list = requests.filter((r) => {
      const st = normalizeStatus(r.status);
      if (activeTab === "all") return true;

      if (activeTab === "accepted") return st === "accepted" || st === "ongoing" || st === "completed";
      return st === activeTab;
    });

    if (activeTab === "all") {
      list.sort((a, b) => {
        const sa = normalizeStatus(a.status);
        const sb = normalizeStatus(b.status);

        if (sa === "pending" && sb !== "pending") return -1;
        if (sb === "pending" && sa !== "pending") return 1;

        return getTime(b) - getTime(a);
      });
      return list;
    }

    list.sort((a, b) => getTime(b) - getTime(a));
    return list;
  }, [requests, activeTab]);

  const renderItem = useCallback(
    ({ item }) => {
      const status = normalizeStatus(item.status);
      const kind = STATUS_KIND(status);

      const isActing = actionId === item.id;
      const disableActions = isActing || !!actionId;

      const isAcceptedOrOngoing = status === "accepted" || status === "ongoing";
      const isCompleted = status === "completed";

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

            <View style={[styles.statusBadge, styles[`statusBg_${kind}`]]}>
              <Text style={[styles.statusTextBase, styles[`statusText_${kind}`]]}>
                {status.toUpperCase()}
              </Text>
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
                  {item.appointmentAt?.toDate?.().toLocaleTimeString("en-PH", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  }) || "N/A"}
                </Text>
              </View>
            </View>

            {isAcceptedOrOngoing && (
              <TouchableOpacity
                style={[
                  styles.chatBtn,
                  isAcceptedOrOngoing ? styles.chatBtnAccepted : null,
                  isActing && { opacity: 0.7 },
                ]}
                onPress={() => openChat(item)}
                disabled={isActing}
                activeOpacity={0.85}
              >
                <Ionicons name="chatbubbles" size={16} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.chatBtnText}>Open Chat</Text>
              </TouchableOpacity>
            )}

            {isCompleted && (
              <View style={styles.completedNote}>
                <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                <Text style={styles.completedNoteText}>Completed</Text>
              </View>
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
    },
    [actionId, consultantName]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#01579B" />

      <View style={styles.headerArea}>
        <SafeAreaView edges={[]}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Consultations</Text>
            <Text style={styles.headerSub}>Review and manage your sessions</Text>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.tabsWrap}>
        <FlatList
          data={TAB_OPTIONS}
          horizontal
          keyExtractor={(t) => t.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsList}
          renderItem={({ item: t }) => {
            const active = t.key === activeTab;
            return (
              <TouchableOpacity
                style={[styles.tabPill, active && styles.tabPillActive]}
                onPress={() => setActiveTab(t.key)}
                activeOpacity={0.85}
              >
                {active ? (
                  <Ionicons name="checkmark" size={18} color="#01579B" />
                ) : (
                  <Ionicons name="funnel-outline" size={16} color="#64748B" />
                )}
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
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
              <Text style={styles.emptyText}>No {labelForTab(activeTab)} appointments found</Text>
            </View>
          }
        />
      )}

      <CenterMessageModal
        visible={msgOpen}
        onClose={closeMessage}
        type={msgType}
        title={msgTitle}
        message={msgBody}
      />

      <BottomNavbar role="consultant" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  headerArea: { backgroundColor: "#01579B", paddingBottom: 20, paddingTop: 30 },
  headerContent: { paddingHorizontal: 25, paddingTop: 40 },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#fff" },
  headerSub: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 4 },

  tabsWrap: { marginTop: 14 },
  tabsList: { paddingHorizontal: 20, gap: 10 },
  tabPill: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tabPillActive: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  tabText: { fontSize: 12, fontWeight: "800", color: "#0F172A" },
  tabTextActive: { color: "#01579B" },

  listContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 100 },

  card: { backgroundColor: "#fff", borderRadius: 24, padding: 20, marginBottom: 16 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  clientInfo: { flexDirection: "row", alignItems: "center" },
  avatarMini: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#E0F2F1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { color: "#01579B", fontWeight: "bold", fontSize: 16 },
  clientName: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  clientEmail: { fontSize: 12, color: "#64748B" },

  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 5 },
  statusTextBase: { fontSize: 13, fontWeight: "900" },

  statusText_pending: { color: "#B45309" },
  statusText_good: { color: "#065F46" },
  statusText_bad: { color: "#7F1D1D" },

  divider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 15 },
  cardBody: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  dateTimeContainer: { gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 13, color: "#475569", fontWeight: "500" },

  chatBtn: {
    backgroundColor: "#01579B",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  chatBtnAccepted: { backgroundColor: "#0EA5E9" },
  chatBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  completedNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  completedNoteText: { fontSize: 12, fontWeight: "900", color: "#065F46" },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 15 },
  acceptBtn: {
    flex: 1,
    backgroundColor: "#3fa796",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  acceptBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  declineBtn: {
    flex: 1,
    backgroundColor: "#FFF",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minHeight: 44,
    justifyContent: "center",
  },
  declineBtnText: { color: "#912f56", fontWeight: "800", fontSize: 13 },

  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#64748B" },

  emptyBox: { alignItems: "center", justifyContent: "center", marginTop: 80, padding: 30 },
  emptyText: { color: "#64748B", marginTop: 12, fontWeight: "600", fontSize: 14 },

  notesBox: {
    marginTop: 14,
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  notesHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  notesLabel: { fontSize: 12, fontWeight: "700", color: "#475569" },
  notesText: { fontSize: 13, color: "#334155", lineHeight: 18 },
});
