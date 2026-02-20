import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { db } from "../../config/firebase";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

/* ---------------- UI HELPERS ---------------- */
const shadowCard = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 3 },
});

const shadowHeader = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 2 },
});

/* ---------------- LOGIC HELPERS ---------------- */
const BELL_ICON = "notifications";

const typeColor = (type = "") => {
  const t = String(type || "").toLowerCase();
  if (t.includes("subscription") && (t.includes("accepted") || t.includes("approved"))) return "#059669"; // Emerald
  if (t.includes("accepted")) return "#059669";
  if (t.includes("subscription") && (t.includes("rejected") || t.includes("declined") || t.includes("cancel"))) return "#E11D48"; // Rose
  if (t.includes("rejected") || t.includes("declined") || t.includes("cancel")) return "#E11D48";
  if (t.includes("reminder")) return "#D97706"; // Amber
  return "#2563EB"; // Blue
};

const formatTimeAgo = (ts) => {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = Math.max(0, now - d);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

const formatAppointmentAt = (ts) => {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const normalizeNotif = (d = {}) => {
  const createdAt = d?.createdAt;
  return {
    ...d,
    createdAt: createdAt || new Date(),
    read: d?.read === true,
    title: d?.title || "Notification",
    message: d?.message || "",
    type: d?.type || "notifications",
    consultantId: d?.consultantId || "",
  };
};

const pickName = (data) =>
  data?.name || data?.fullName || data?.displayName || data?.username || data?.firstName || "";

const bookingStatusLine = (rawType = "", rawTitle = "") => {
  const t = String(rawType || "").toLowerCase();
  const s = String(rawTitle || "").toLowerCase();
  const isSub = t.includes("subscription") || s.includes("subscription") || s.includes("premium");
  const accepted = t.includes("accepted") || t.includes("approved") || s.includes("accept") || s.includes("approved");
  const cancelled = t.includes("rejected") || t.includes("declined") || t.includes("cancel");

  if (isSub) {
    if (accepted) return "Subscription approved";
    if (cancelled) return "Subscription rejected";
    return "Subscription update";
  }
  if (accepted) return "Accepted your booking";
  if (cancelled) return "Cancelled your booking";
  return "Booking update";
};

const buildSubscriptionLocalNotif = (status, updatedAt) => {
  const st = String(status || "").toLowerCase();
  const isApproved = st === "approved" || st === "accepted" || st === "active";
  const isRejected = st === "rejected" || st === "declined" || st === "cancelled" || st === "canceled";
  if (!isApproved && !isRejected) return null;
  return normalizeNotif({
    id: `local_subscription_${st}`,
    type: `subscription_${isApproved ? "accepted" : "rejected"}`,
    title: isApproved ? "Subscription Approved" : "Subscription Rejected",
    message: isApproved ? "Your subscription is now active! Enjoy premium features." : "Your subscription request was declined.",
    createdAt: updatedAt || new Date(),
    read: false,
    consultantId: "",
    _local: true,
  });
};

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const uid = auth.currentUser?.uid;

  const headerPadTop = useMemo(() => {
    const fallbackAndroid = Platform.OS === "android" ? 10 : 0;
    return Math.max(insets.top, fallbackAndroid);
  }, [insets.top]);

  const [loading, setLoading] = useState(true);
  const [notificationsRaw, setNotificationsRaw] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [consultantMap, setConsultantMap] = useState({});
  const consultantMapRef = useRef({});
  useEffect(() => { consultantMapRef.current = consultantMap; }, [consultantMap]);

  const [openItem, setOpenItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [subLocalNotif, setSubLocalNotif] = useState(null);

  const listenToNotifications = useCallback((userId, cb) => {
    const qy = query(collection(db, "notifications"), where("userId", "==", userId), orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(qy, (snap) => cb(snap.docs.map((d) => normalizeNotif({ id: d.id, ...d.data() }))), () => cb([]));
  }, []);

  const markNotificationAsRead = useCallback(async (notifId) => {
    if (String(notifId || "").startsWith("local_")) return;
    await updateDoc(doc(db, "notifications", notifId), { read: true });
  }, []);

  const hydrateConsultantNames = useCallback(async (list = []) => {
    try {
      const ids = Array.from(new Set(list.map((n) => String(n?.consultantId || "").trim()).filter(Boolean)));
      if (ids.length === 0) return;
      const currentMap = consultantMapRef.current || {};
      const missing = ids.filter((id) => !currentMap[id]);
      if (missing.length === 0) return;
      const nextMap = { ...currentMap };
      for (const id of missing) {
        let name = "";
        const uSnap = await getDoc(doc(db, "users", id));
        if (uSnap.exists()) name = pickName(uSnap.data());
        if (!name) {
          const cSnap = await getDoc(doc(db, "consultants", id));
          if (cSnap.exists()) name = pickName(cSnap.data());
        }
        if (name) nextMap[id] = name;
      }
      setConsultantMap(nextMap);
    } catch {}
  }, []);

  useEffect(() => {
    if (!uid) return;
    const uRef = doc(db, "users", uid);
    return onSnapshot(uRef, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setSubLocalNotif(buildSubscriptionLocalNotif(d.subscription_status || d.subscriptionStatus, d.subscription_updated_at));
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    return listenToNotifications(uid, (list) => {
      setNotificationsRaw(list);
      hydrateConsultantNames(list);
      setLoading(false);
      setRefreshing(false);
    });
  }, [uid, listenToNotifications, hydrateConsultantNames]);

  const notifications = useMemo(() => {
    const base = notificationsRaw.map((n) => ({ ...n, consultantName: consultantMap[n.consultantId] || "" }));
    if (subLocalNotif && !base.some(n => n.type.includes("subscription"))) return [subLocalNotif, ...base];
    return base;
  }, [notificationsRaw, consultantMap, subLocalNotif]);

  const sections = useMemo(() => ({
    unread: notifications.filter((n) => !n.read),
    read: notifications.filter((n) => n.read),
  }), [notifications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handlePressNotif = useCallback(async (item) => {
    if (!uid || !item?.id) return;
    if (!item.read) markNotificationAsRead(item.id);
    setOpenItem(item);
    setModalVisible(true);
  }, [uid, markNotificationAsRead]);

  const renderNotifItem = useCallback(({ item }) => {
    const isUnread = !item.read;
    const bellColor = typeColor(item.type);
    const consultantName = item.consultantName || "AestheticAI Admin";
    const status = bookingStatusLine(item.type, item.title);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handlePressNotif(item)}
        style={[styles.row, isUnread ? styles.rowUnread : styles.rowRead]}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${bellColor}15` }]}>
          <Ionicons name={BELL_ICON} size={20} color={bellColor} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.rowHeader}>
            <Text numberOfLines={1} style={styles.rowName}>{consultantName}</Text>
            <Text style={styles.timeText}>{formatTimeAgo(item.createdAt)}</Text>
          </View>
          
          <Text numberOfLines={1} style={styles.rowStatus}>{status}</Text>
          {!!item.message && (
            <Text numberOfLines={1} style={styles.rowMsg}>{item.message}</Text>
          )}
        </View>

        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  }, [handlePressNotif]);

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
 <StatusBar
  barStyle="dark-content"
  backgroundColor="#FFFFFF"
  translucent={false}
/>
      <View style={styles.container}>
        
        {/* HEADER */}
        <View style={[styles.headerWrap, { paddingTop: headerPadTop }]}>
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={router.back} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#1E293B" />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Notifications</Text>
              <Text style={styles.headerSub}>
                {sections.unread.length > 0 ? `You have ${sections.unread.length} new messages` : "No new notifications"}
              </Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color="#2563EB" />
          </View>
        ) : (
          <FlatList
            data={sections.unread}
            keyExtractor={(item) => item.id}
            renderItem={renderNotifItem}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={() => (
              sections.unread.length > 0 && <Text style={styles.sectionLabel}>NEW</Text>
            )}
            ListFooterComponent={() => (
              <View>
                {sections.read.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 20 }]}>EARLIER</Text>
                    {sections.read.map(it => <View key={it.id} style={{ marginBottom: 12 }}>{renderNotifItem({ item: it })}</View>)}
                  </>
                )}
                <View style={{ height: 40 }} />
              </View>
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* MODAL */}
        <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
            <Pressable style={styles.modalContent}>
              <View style={styles.modalHandle} />
              {openItem && (
                <View>
                  <View style={styles.modalHeader}>
                    <View style={[styles.iconCircle, { backgroundColor: `${typeColor(openItem.type)}15` }]}>
                      <Ionicons name={BELL_ICON} size={24} color={typeColor(openItem.type)} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.modalTitle}>{openItem.consultantName || "System Notification"}</Text>
                      <Text style={styles.modalTimeFull}>{formatTimeAgo(openItem.createdAt)}</Text>
                    </View>
                  </View>
                  
                  <Text style={styles.modalMsgFull}>{openItem.message}</Text>
                  
                  <View style={styles.modalFooter}>
                    {openItem.appointmentAt && (
                      <View style={styles.tag}>
                        <Ionicons name="calendar-outline" size={14} color="#64748B" />
                        <Text style={styles.tagText}>{formatAppointmentAt(openItem.appointmentAt)}</Text>
                      </View>
                    )}
                    {openItem.sessionFee && (
                      <View style={styles.tag}>
                        <Ionicons name="wallet-outline" size={14} color="#64748B" />
                        <Text style={styles.tagText}>₱{openItem.sessionFee}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" , paddingTop: 15,},
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  
  /* Header */
  headerWrap: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingBottom: 16,
    ...shadowHeader,
  },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 15 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  headerSub: { fontSize: 13, color: "#64748B", marginTop: 1 },

  /* List */
  listContent: { padding: 20 },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: "#94A3B8", letterSpacing: 1, marginBottom: 12 },

  /* Row Card */
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    ...shadowCard,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  rowUnread: { backgroundColor: "#FFFFFF", borderColor: "#E0E7FF", borderLeftWidth: 4, borderLeftColor: "#2563EB" },
  iconCircle: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center", right: 5, },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowName: { fontSize: 15, fontWeight: "700", color: "#1E293B", flex: 1 },
  rowStatus: { fontSize: 13, fontWeight: "600", color: "#475569", marginTop: 2 },
  rowMsg: { fontSize: 13, color: "#64748B", marginTop: 2 },
  timeText: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2563EB", marginLeft: 10 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 12,
    minHeight: 300,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: "#E2E8F0", borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  modalTimeFull: { fontSize: 13, color: "#94A3B8", marginTop: 2 },
  modalMsgFull: { fontSize: 15, color: "#334155", lineHeight: 22, marginBottom: 24 },
  modalFooter: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F1F5F9", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  tagText: { fontSize: 13, fontWeight: "700", color: "#475569" },
});