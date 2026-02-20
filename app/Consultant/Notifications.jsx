// app/Consultant/Notifications.jsx
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
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { db } from "../../config/firebase";
import { collection, doc, getDoc, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";

/* =========================
   UI HELPERS (FROM USER UI)
========================= */
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

/* =========================
   LOGIC HELPERS (CONSULTANT)
========================= */
const safeStr = (v) => (v == null ? "" : String(v).trim());

const payoutIcon = (statusOrTitle = "", type = "") => {
  const s = safeStr(statusOrTitle).toLowerCase();
  const t = safeStr(type).toLowerCase();

  if (t === "payout_status" || s.includes("withdrawal")) {
    if (s.includes("approved") || s.includes("accept")) return "checkmark-circle";
    if (s.includes("declined") || s.includes("rejected") || s.includes("cancel")) return "close-circle";
    return "time";
  }

  if (t === "appointment_cancelled" || s.includes("appointment cancelled") || s.includes("cancelled appointment")) {
    return "close-circle";
  }

  return "notifications";
};

const payoutColor = (statusOrTitle = "", type = "") => {
  const s = safeStr(statusOrTitle).toLowerCase();
  const t = safeStr(type).toLowerCase();

  // payout status palette
  if (t === "payout_status" || s.includes("withdrawal")) {
    if (s.includes("approved") || s.includes("accept")) return "#16A34A"; // green
    if (s.includes("declined") || s.includes("rejected") || s.includes("cancel")) return "#E11D48"; // rose
    return "#D97706"; // amber
  }

  // appointment cancelled
  if (t === "appointment_cancelled" || s.includes("appointment cancelled") || s.includes("cancelled appointment")) {
    return "#E11D48";
  }

  return "#2563EB"; // blue
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

const formatDateTime = (ts) => {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
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
    body: d?.body || "",
    type: d?.type || "notifications",

    payoutId: d?.payoutId || "",
    amount: d?.amount ?? null,
    status: d?.status || "",

    senderId: d?.senderId || "",
    senderRole: d?.senderRole || "",
    recipientId: d?.recipientId || "",
    recipientRole: d?.recipientRole || "",
    appointmentId: d?.appointmentId || "",

    senderName: d?.senderName || d?.fromName || "",
  };
};

const buildStatusLine = (item = {}) => {
  const t = safeStr(item?.type).toLowerCase();
  const ti = safeStr(item?.title).toLowerCase();
  const m = safeStr(item?.message).toLowerCase();
  const b = safeStr(item?.body).toLowerCase();

  // appointment cancelled
  if (
    t === "appointment_cancelled" ||
    ti.includes("appointment cancelled") ||
    m.includes("appointment cancelled") ||
    b.includes("cancelled")
  ) {
    return "Appointment cancelled";
  }

  // payout
  if (t === "payout_status" || ti.includes("withdrawal") || m.includes("withdrawal")) {
    if (ti.includes("approved") || m.includes("approved")) return "Withdrawal approved";
    if (ti.includes("declined") || m.includes("declined") || ti.includes("rejected") || m.includes("rejected")) {
      return "Withdrawal declined";
    }
    return "Withdrawal update";
  }

  return "Admin update";
};

export default function ConsultantNotifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const uid = auth.currentUser?.uid;

  // header padding like your user UI
  const headerPadTop = useMemo(() => {
    const fallbackAndroid = Platform.OS === "android" ? 10 : 0;
    return Math.max(insets.top, fallbackAndroid);
  }, [insets.top]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [notificationsRaw, setNotificationsRaw] = useState([]);

  const [openItem, setOpenItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // sender name cache
  const [userNameMap, setUserNameMap] = useState({});
  const userNameMapRef = useRef({});
  useEffect(() => {
    userNameMapRef.current = userNameMap;
  }, [userNameMap]);

  /* =========================
     FIRESTORE LISTENER
  ========================= */
  const listenToNotifications = useCallback((consultantId, cb) => {
    const qy = query(
      collection(db, "notifications"),
      where("recipientRole", "==", "consultant"),
      where("recipientId", "==", consultantId),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      qy,
      (snap) => cb(snap.docs.map((d) => normalizeNotif({ id: d.id, ...d.data() }))),
      (err) => {
        console.log("❌ consultant notifications listener error:", err?.message || err);
        cb([]);
      }
    );
  }, []);

  const markNotificationAsRead = useCallback(async (notifId) => {
    if (!notifId) return;
    await updateDoc(doc(db, "notifications", notifId), { read: true });
  }, []);

  const fetchUserNameById = useCallback(async (userId) => {
    try {
      const id = safeStr(userId);
      if (!id) return "User";

      const cached = userNameMapRef.current?.[id];
      if (cached) return cached;

      const snap = await getDoc(doc(db, "users", id));
      if (!snap.exists()) return "User";

      const data = snap.data() || {};
      const name =
        data.fullName ||
        data.name ||
        data.displayName ||
        data.username ||
        [data.firstName, data.lastName].filter(Boolean).join(" ") ||
        "User";

      setUserNameMap((prev) => ({ ...prev, [id]: String(name || "User") }));
      return String(name || "User");
    } catch (e) {
      console.log("❌ fetchUserNameById error:", e?.message || e);
      return "User";
    }
  }, []);

  const hydrateSenderNames = useCallback(
    async (list = []) => {
      try {
        const ids = Array.from(
          new Set(
            list
              .filter((n) => safeStr(n?.type).toLowerCase() === "appointment_cancelled")
              .map((n) => {
                // if senderName already provided, no need
                if (safeStr(n?.senderName)) return "";
                return safeStr(n?.senderId);
              })
              .filter(Boolean)
          )
        );

        if (ids.length === 0) return;
        await Promise.all(ids.map((id) => fetchUserNameById(id)));
      } catch (e) {
        console.log("❌ hydrateSenderNames error:", e?.message || e);
      }
    },
    [fetchUserNameById]
  );

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsub = listenToNotifications(uid, (list) => {
      setNotificationsRaw(list || []);
      hydrateSenderNames(list || []);
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [uid, listenToNotifications, hydrateSenderNames]);

  /* =========================
     DERIVED DATA
  ========================= */
  const notifications = useMemo(() => notificationsRaw || [], [notificationsRaw]);

  const sections = useMemo(() => {
    const unread = notifications.filter((n) => !n.read);
    const read = notifications.filter((n) => n.read);
    return { unread, read };
  }, [notifications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const getSenderDisplay = useCallback(
    (item) => {
      const t = safeStr(item?.type).toLowerCase();
      if (t === "appointment_cancelled") {
        const fromPayload = safeStr(item?.senderName);
        const sid = safeStr(item?.senderId);
        const cached = sid ? userNameMap[sid] : "";
        return fromPayload || cached || "A user";
      }
      return "AestheticAI Admin";
    },
    [userNameMap]
  );

  const handlePressNotif = useCallback(
    async (item) => {
      if (!uid || !item?.id) return;

      if (!item.read) {
        try {
          markNotificationAsRead(item.id);
        } catch {}
      }

      // ensure sender name loaded for appointment_cancelled
      const t = safeStr(item?.type).toLowerCase();
      if (t === "appointment_cancelled") {
        const sid = safeStr(item?.senderId);
        if (sid && !safeStr(item?.senderName) && !userNameMapRef.current?.[sid]) {
          try {
            await fetchUserNameById(sid);
          } catch {}
        }
      }

      setOpenItem(item);
      setModalVisible(true);
    },
    [uid, markNotificationAsRead, fetchUserNameById]
  );

  /* =========================
     RENDER ROW (USER UI STYLE)
  ========================= */
  const renderNotifItem = useCallback(
    ({ item }) => {
      const isUnread = !item.read;

      const hint = item?.title || item?.message || item?.body || "";
      const icon = payoutIcon(hint, item?.type);
      const iconClr = payoutColor(hint, item?.type);

      const senderName = getSenderDisplay(item);
      const status = buildStatusLine(item);

      const msgLine = safeStr(item?.body || item?.message);

      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handlePressNotif(item)}
          style={[styles.row, isUnread ? styles.rowUnread : styles.rowRead]}
        >
          <View style={[styles.iconCircle, { backgroundColor: `${iconClr}15` }]}>
            <Ionicons name={icon} size={20} color={iconClr} />
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.rowHeader}>
              <Text numberOfLines={1} style={styles.rowName}>
                {senderName}
              </Text>
              <Text style={styles.timeText}>{formatTimeAgo(item.createdAt)}</Text>
            </View>

            <Text numberOfLines={1} style={styles.rowStatus}>
              {status}
            </Text>

            {!!msgLine && (
              <Text numberOfLines={1} style={styles.rowMsg}>
                {msgLine}
              </Text>
            )}
          </View>

          {isUnread && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      );
    },
    [handlePressNotif, getSenderDisplay]
  );

  /* =========================
     EMPTY STATE IF NOT SIGNED IN
  ========================= */
  if (!uid) {
    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />
        <View style={styles.container}>
          <View style={[styles.headerWrap, { paddingTop: headerPadTop }]}>
            <View style={styles.headerContent}>
              <TouchableOpacity onPress={router.back} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={22} color="#1E293B" />
              </TouchableOpacity>
              <View>
                <Text style={styles.headerTitle}>Notifications</Text>
                <Text style={styles.headerSub}>Please sign in to view notifications</Text>
              </View>
            </View>
          </View>

          <View style={styles.center}>
            <Ionicons name="lock-closed" size={26} color="#94A3B8" />
            <Text style={{ fontWeight: "800", color: "#0F172A", marginTop: 8 }}>You are not signed in</Text>
            <Text style={{ color: "#64748B", marginTop: 4 }}>Login as consultant to continue.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* =========================
     MAIN UI
  ========================= */
  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />

      <View style={styles.container}>
        {/* HEADER (FROM USER UI) */}
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
            ListHeaderComponent={() => (sections.unread.length > 0 ? <Text style={styles.sectionLabel}>NEW</Text> : null)}
            ListFooterComponent={() => (
              <View>
                {sections.read.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 20 }]}>EARLIER</Text>
                    {sections.read.map((it) => (
                      <View key={it.id} style={{ marginBottom: 12 }}>
                        {renderNotifItem({ item: it })}
                      </View>
                    ))}
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

        {/* MODAL (SLIDE, FROM USER UI STYLE) */}
        <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
            <Pressable style={styles.modalContent} onPress={() => {}}>
              <View style={styles.modalHandle} />

              {openItem && (
                <View>
                  {(() => {
                    const hint = openItem?.title || openItem?.message || openItem?.body || "";
                    const icon = payoutIcon(hint, openItem?.type);
                    const clr = payoutColor(hint, openItem?.type);
                    const senderName = getSenderDisplay(openItem);
                    const status = buildStatusLine(openItem);
                    const msgFull = safeStr(openItem?.body || openItem?.message);
                    return (
                      <>
                        <View style={styles.modalHeader}>
                          <View style={[styles.iconCircle, { backgroundColor: `${clr}15` }]}>
                            <Ionicons name={icon} size={24} color={clr} />
                          </View>

                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.modalTitle}>{senderName}</Text>
                            <Text style={styles.modalTimeFull}>{formatTimeAgo(openItem.createdAt)}</Text>
                            <Text style={styles.modalStatusFull}>{status}</Text>
                          </View>
                        </View>

                        {!!msgFull && <Text style={styles.modalMsgFull}>{msgFull}</Text>}

                        <View style={styles.modalFooter}>
                          {!!openItem?.amount && (
                            <View style={styles.tag}>
                              <Ionicons name="wallet-outline" size={14} color="#64748B" />
                              <Text style={styles.tagText}>₱{Number(openItem.amount).toLocaleString()}</Text>
                            </View>
                          )}

                          {!!safeStr(openItem?.payoutId) && (
                            <View style={styles.tag}>
                              <Ionicons name="document-text-outline" size={14} color="#64748B" />
                              <Text style={styles.tagText}>Payout: {openItem.payoutId}</Text>
                            </View>
                          )}

                          {!!safeStr(openItem?.appointmentId) && (
                            <View style={styles.tag}>
                              <Ionicons name="calendar-outline" size={14} color="#64748B" />
                              <Text style={styles.tagText}>Appt: {openItem.appointmentId}</Text>
                            </View>
                          )}

                          {!!openItem?.createdAt && (
                            <View style={styles.tag}>
                              <Ionicons name="time-outline" size={14} color="#64748B" />
                              <Text style={styles.tagText}>{formatDateTime(openItem.createdAt)}</Text>
                            </View>
                          )}
                        </View>
                      </>
                    );
                  })()}
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* =========================
   STYLES (FROM USER UI)
========================= */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC", paddingTop: 15 },
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 1,
    marginBottom: 12,
  },

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
  rowUnread: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E0E7FF",
    borderLeftWidth: 4,
    borderLeftColor: "#2563EB",
  },
  rowRead: { backgroundColor: "#FFFFFF" },

  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

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
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },

  modalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  modalTimeFull: { fontSize: 13, color: "#94A3B8", marginTop: 2 },
  modalStatusFull: { fontSize: 13, fontWeight: "700", color: "#475569", marginTop: 6 },

  modalMsgFull: { fontSize: 15, color: "#334155", lineHeight: 22, marginBottom: 18 },

  modalFooter: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tagText: { fontSize: 13, fontWeight: "700", color: "#475569" },
});