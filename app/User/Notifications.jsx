// app/User/Notifications.jsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { db } from "../../config/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  limit, // ✅ ADDED
} from "firebase/firestore";

/* ---------------- THEME ---------------- */
const THEME = {
  primary: "#01579B",
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  surface2: "#F1F5F9",
  textDark: "#0F172A",
  textGray: "#64748B",
  border: "#E2E8F0",
  unreadBg: "#EFF6FF",
  readBg: "#FFFFFF",
  error: "#EF4444",
  success: "#16A34A",
  danger: "#DC2626",
  warn: "#F59E0B",
};

/* ---------------- TYPE HELPERS ---------------- */
const typeIcon = (type = "") => {
  const t = String(type || "").toLowerCase();
  if (t.includes("subscription") && (t.includes("accepted") || t.includes("approved"))) return "checkmark-circle";
  if (t.includes("subscription") && (t.includes("rejected") || t.includes("declined") || t.includes("cancel"))) return "close-circle";

  if (t.includes("accepted")) return "checkmark-circle";
  // ✅ rejected/declined treated as CANCELLED
  if (t.includes("rejected") || t.includes("declined") || t.includes("cancel")) return "close-circle";
  if (t.includes("reminder")) return "alarm";
  return "notifications";
};

const typeColor = (type = "") => {
  const t = String(type || "").toLowerCase();
  if (t.includes("subscription") && (t.includes("accepted") || t.includes("approved"))) return THEME.success;
  if (t.includes("subscription") && (t.includes("rejected") || t.includes("declined") || t.includes("cancel"))) return THEME.danger;

  if (t.includes("accepted")) return THEME.success;
  // ✅ rejected/declined treated as CANCELLED
  if (t.includes("rejected") || t.includes("declined") || t.includes("cancel")) return THEME.danger;
  if (t.includes("reminder")) return THEME.warn;
  return THEME.primary;
};

const formatTimeAgo = (ts) => {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = Math.max(0, now - d);

  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;

  const days = Math.floor(hrs / 24);
  return `${days}d`;
};

const formatAppointmentAt = (ts) => {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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

const pickName = (data) => {
  if (!data) return "";
  return (
    data.name ||
    data.fullName ||
    data.displayName ||
    data.username ||
    data.firstName ||
    ""
  );
};

// ✅ helper: small status line under the consultant name
// ✅ CHANGE: rejected => cancelled
const bookingStatusLine = (rawType = "", rawTitle = "") => {
  const t = String(rawType || "").toLowerCase();
  const s = String(rawTitle || "").toLowerCase();

  // ✅ subscription decisions
  const isSub = t.includes("subscription") || s.includes("subscription") || s.includes("premium") || s.includes("plan");

  const accepted =
    t.includes("accepted") ||
    t.includes("approved") ||
    s.includes("accept") ||
    s.includes("approved");

  const cancelled =
    t.includes("rejected") ||
    t.includes("declined") ||
    t.includes("cancel") ||
    s.includes("declin") ||
    s.includes("reject") ||
    s.includes("cancel");

  if (isSub) {
    if (accepted) return "Subscription approved";
    if (cancelled) return "Subscription rejected";
    return "Subscription update";
  }

  if (accepted) return "Accepted your booking";
  if (cancelled) return "Cancelled your booking";

  // fallback if unknown type/title
  return "Booking update";
};

/* ---------------- SUBSCRIPTION NOTIF FALLBACK ----------------
   ✅ If your admin updates the user's plan directly (users/{uid}.subscription_status)
   and you DON'T always create a notification document, this creates a local notification
   so something will still appear here.
   - Does NOT change UI.
   - Does NOT write to Firestore.
--------------------------------------------------------------- */
const buildSubscriptionLocalNotif = (status, updatedAt) => {
  const st = String(status || "").toLowerCase();
  const isApproved = st === "approved" || st === "accepted" || st === "active";
  const isRejected = st === "rejected" || st === "declined" || st === "cancelled" || st === "canceled";

  if (!isApproved && !isRejected) return null;

  return normalizeNotif({
    id: `local_subscription_${st}`,
    type: `subscription_${isApproved ? "accepted" : "rejected"}`,
    title: isApproved ? "Subscription Approved" : "Subscription Rejected",
    message: isApproved
      ? "Your subscription has been approved. Premium features are now available."
      : "Your subscription request was rejected. You can try again or contact support.",
    createdAt: updatedAt || new Date(),
    read: false,
    consultantId: "", // none
    _local: true,     // internal flag
  });
};

export default function NotificationsScreen() {
  const router = useRouter();
  const auth = getAuth();

  const [loading, setLoading] = useState(true);
  const [notificationsRaw, setNotificationsRaw] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const [consultantMap, setConsultantMap] = useState({});

  const [openItem, setOpenItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // ✅ subscription fallback state
  const [subLocalNotif, setSubLocalNotif] = useState(null);

  const uid = auth.currentUser?.uid;

  const listenToNotifications = (userId, cb) => {
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) =>
          normalizeNotif({ id: d.id, ...d.data() })
        );
        cb(list);
      },
      (err) => {
        console.log("❌ notifications listener error:", err?.message || err);
        cb([]);
      }
    );
  };

  const markNotificationAsRead = async (notifId) => {
    // ✅ ignore local items
    if (String(notifId || "").startsWith("local_")) return;
    await updateDoc(doc(db, "notifications", notifId), { read: true });
  };

  const hydrateConsultantNames = async (list = []) => {
    try {
      const ids = Array.from(
        new Set(
          list
            .map((n) => String(n?.consultantId || "").trim())
            .filter(Boolean)
        )
      );

      if (ids.length === 0) return;

      const missing = ids.filter((id) => !consultantMap?.[id]);
      if (missing.length === 0) return;

      const nextMap = { ...consultantMap };

      for (const id of missing) {
        let name = "";

        // 1) users/{id}
        try {
          const uSnap = await getDoc(doc(db, "users", id));
          if (uSnap.exists()) name = pickName(uSnap.data());
        } catch {}

        // 2) consultants/{id}
        if (!name) {
          try {
            const cSnap = await getDoc(doc(db, "consultants", id));
            if (cSnap.exists()) name = pickName(cSnap.data());
          } catch {}
        }

        if (name) nextMap[id] = name;
      }

      setConsultantMap(nextMap);
    } catch (e) {
      console.log("❌ hydrateConsultantNames error:", e?.message || e);
    }
  };

  // ✅ NEW: listen to user doc changes for subscription status (fallback)
  useEffect(() => {
    if (!uid) return;

    const uRef = doc(db, "users", uid);
    const unsub = onSnapshot(
      uRef,
      (snap) => {
        if (!snap.exists()) return;

        const data = snap.data() || {};

        // These fields are examples; use whichever you actually update in admin:
        // - subscription_status: "approved" | "rejected" | ...
        // - subscriptionStatus: ...
        // - premiumStatus: ...
        const status =
          data.subscription_status ||
          data.subscriptionStatus ||
          data.premiumStatus ||
          "";

        const updatedAt = data.subscription_updated_at || data.updatedAt || data.subscription_expires_at || null;

        const local = buildSubscriptionLocalNotif(status, updatedAt);
        setSubLocalNotif(local);
      },
      (err) => {
        console.log("❌ subscription listener error:", err?.message || err);
      }
    );

    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsub = listenToNotifications(uid, (list) => {
      setNotificationsRaw(list || []);
      hydrateConsultantNames(list || []);
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const notifications = useMemo(() => {
    const base = (notificationsRaw || []).map((n) => {
      const cId = String(n?.consultantId || "");
      const consultantName = consultantMap?.[cId] || "";
      return { ...n, consultantName };
    });

    // ✅ inject subscription fallback notification ONLY if there's no real one already
    // This avoids duplicates when you already create notifications in Firestore.
    if (subLocalNotif) {
      const alreadyHasSubNotif = base.some((n) => {
        const t = String(n?.type || "").toLowerCase();
        const title = String(n?.title || "").toLowerCase();
        return t.includes("subscription") || title.includes("subscription") || title.includes("premium");
      });

      if (!alreadyHasSubNotif) {
        // show it as newest
        return [subLocalNotif, ...base];
      }
    }

    return base;
  }, [notificationsRaw, consultantMap, subLocalNotif]);

  const sections = useMemo(() => {
    const unread = notifications.filter((n) => n?.read !== true);
    const read = notifications.filter((n) => n?.read === true);
    return { unread, read };
  }, [notifications]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  // Tap = mark as read + open modal
  const handlePressNotif = async (item) => {
    if (!uid || !item?.id) return;

    if (item?.read !== true) {
      try {
        await markNotificationAsRead(item.id);
      } catch (e) {
        console.log("❌ mark read error:", e?.message || e);
      }
    }

    setOpenItem(item);
    setModalVisible(true);
  };

  // X = keep READ (stays in Earlier)
  const handleCloseModal = async () => {
    const current = openItem;
    setModalVisible(false);

    if (current?.id) {
      try {
        await markNotificationAsRead(current.id);
      } catch (e) {
        console.log("❌ mark read on close error:", e?.message || e);
      }
    }

    setTimeout(() => setOpenItem(null), 0);
  };

  // ✅ Big: Consultant Name
  // ✅ Small: "Cancelled your booking" / "Accepted your booking" + optional message
  const buildRowText = (item) => {
    const isSub =
      String(item?.type || "").toLowerCase().includes("subscription") ||
      String(item?.title || "").toLowerCase().includes("subscription") ||
      String(item?.title || "").toLowerCase().includes("premium");

    const consultantName = String(item?.consultantName || "").trim();
    const status = bookingStatusLine(item?.type, item?.title);
    const msg = String(item?.message || "").trim();

    const line1 = isSub ? "AestheticAI Admin" : (consultantName || "Consultant");
    const line2 = status;
    const line3 = msg ? `— ${msg}` : "";

    return { line1, line2, line3 };
  };

  const renderNotifItem = ({ item }) => {
    const isUnread = item?.read !== true;
    const icon = typeIcon(item?.type);
    const iconClr = typeColor(item?.type);

    const { line1, line2, line3 } = buildRowText(item);

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => handlePressNotif(item)}
        style={[styles.row, isUnread ? styles.rowUnread : styles.rowRead]}
      >
        <View style={[styles.avatarCircle, { backgroundColor: iconClr + "18" }]}>
          <Ionicons name={icon} size={22} color={iconClr} />
        </View>

        <View style={{ flex: 1 }}>
          <View>
            <Text numberOfLines={1} style={styles.rowName}>
              {line1}
            </Text>

            <Text numberOfLines={2} style={styles.rowSub}>
              {line2}
              {!!line3 ? <Text style={styles.rowSubMuted}> {line3}</Text> : null}
            </Text>
          </View>

          <View style={styles.metaLine}>
            <Text style={styles.timeText}>{formatTimeAgo(item?.createdAt)}</Text>
            {!!item?.appointmentAt && (
              <>
                <Text style={styles.dotSep}>•</Text>
                <Text style={styles.timeText}>
                  {formatAppointmentAt(item.appointmentAt)}
                </Text>
              </>
            )}
          </View>
        </View>

        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <View style={{ paddingTop: 6 }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>New</Text>
      </View>
      {sections.unread.length === 0 ? (
        <View style={styles.sectionEmpty}>
          <Text style={styles.sectionEmptyText}>No new notifications</Text>
        </View>
      ) : null}
    </View>
  );

  const ListFooter = () => (
    <View style={{ paddingBottom: 24 }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Earlier</Text>
      </View>
      {sections.read.length === 0 ? (
        <View style={styles.sectionEmpty}>
          <Text style={styles.sectionEmptyText}>No earlier notifications</Text>
        </View>
      ) : (
        <View style={{ gap: 8, paddingTop: 6 }}>
          {sections.read.map((it) => (
            <View key={it.id} style={{ marginBottom: 8 }}>
              {renderNotifItem({ item: it })}
            </View>
          ))}
        </View>
      )}
    </View>
  );

  if (!uid) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.topbar}>
            <Text style={styles.topTitle}>Notifications</Text>
          </View>
          <View style={styles.centerBox}>
            <Ionicons name="lock-closed" size={26} color={THEME.textGray} />
            <Text style={styles.centerTitle}>You are not signed in</Text>
            <Text style={styles.centerSub}>Please sign in to view notifications.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* TOP BAR (NO bell + NO count) */}
        <View style={styles.topbar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={THEME.textDark} />
          </TouchableOpacity>

          <Text style={styles.topTitle}>Notifications</Text>

          {/* spacer */}
          <View style={{ width: 42 }} />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={THEME.primary} />
            <Text style={styles.loadingText}>Loading notifications...</Text>
          </View>
        ) : (
          <FlatList
            data={sections.unread}
            keyExtractor={(item) => item.id}
            renderItem={renderNotifItem}
            contentContainerStyle={{ paddingTop: 10, paddingBottom: 10 }}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={ListFooter}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* MODAL */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleCloseModal}
        >
          <Pressable style={styles.modalBackdrop} onPress={handleCloseModal}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleWrap}>
                  <View
                    style={[
                      styles.modalIconCircle,
                      { backgroundColor: typeColor(openItem?.type) + "18" },
                    ]}
                  >
                    <Ionicons
                      name={typeIcon(openItem?.type)}
                      size={22}
                      color={typeColor(openItem?.type)}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    {(() => {
                      const { line1, line2 } = buildRowText(openItem || {});
                      return (
                        <View>
                          <Text numberOfLines={1} style={styles.modalName}>
                            {line1}
                          </Text>
                          <Text numberOfLines={2} style={styles.modalSub}>
                            {line2}
                          </Text>
                        </View>
                      );
                    })()}

                    <Text style={styles.modalTime}>
                      {formatTimeAgo(openItem?.createdAt)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity onPress={handleCloseModal} style={styles.closeBtn}>
                  <Ionicons name="close" size={20} color={THEME.textGray} />
                </TouchableOpacity>
              </View>

              {!!openItem?.message && (
                <Text style={styles.modalMsg}>{openItem.message}</Text>
              )}

              <View style={styles.modalMeta}>
                {!!openItem?.appointmentAt && (
                  <View style={styles.modalMetaRow}>
                    <Ionicons name="calendar" size={14} color={THEME.textGray} />
                    <Text style={styles.modalMetaText}>
                      {formatAppointmentAt(openItem.appointmentAt)}
                    </Text>
                  </View>
                )}

                {!!openItem?.sessionFee && (
                  <View style={styles.modalMetaRow}>
                    <Ionicons name="cash" size={14} color={THEME.textGray} />
                    <Text style={styles.modalMetaText}>
                      ₱{openItem.sessionFee}.00
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  container: { flex: 1, backgroundColor: THEME.bg, paddingHorizontal: 16 },

  topbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 10,
    gap: 10,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  topTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "900",
    color: THEME.textDark,
  },

  sectionHeader: { paddingTop: 8, paddingBottom: 6 },
  sectionHeaderText: { fontSize: 14, fontWeight: "900", color: THEME.textDark },

  sectionEmpty: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 10,
  },
  sectionEmptyText: { color: THEME.textGray, fontWeight: "800", fontSize: 12 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surface,
  },
  rowUnread: { backgroundColor: THEME.unreadBg, borderColor: "#BFDBFE" },
  rowRead: { backgroundColor: THEME.readBg },

  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: THEME.surface2,
    borderWidth: 1,
    borderColor: THEME.border,
  },

  rowName: { color: THEME.textDark, fontSize: 14, fontWeight: "900" },
  rowSub: { marginTop: 2, color: THEME.textGray, fontSize: 12, fontWeight: "800" },
  rowSubMuted: { color: THEME.textGray, fontWeight: "700" },

  metaLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  timeText: { color: THEME.textGray, fontSize: 12, fontWeight: "800" },
  dotSep: { color: THEME.textGray, fontSize: 12, fontWeight: "900" },

  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.primary,
    marginLeft: 6,
  },

  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  loadingText: { color: THEME.textGray, fontWeight: "800" },

  centerBox: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  centerTitle: { color: THEME.textDark, fontWeight: "900", fontSize: 15 },
  centerSub: { color: THEME.textGray, fontWeight: "700", fontSize: 13 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitleWrap: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  modalIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: THEME.border,
  },

  modalName: { color: THEME.textDark, fontWeight: "900", fontSize: 15 },
  modalSub: { marginTop: 2, color: THEME.textGray, fontWeight: "800", fontSize: 12 },

  modalTime: { color: THEME.textGray, fontWeight: "800", fontSize: 12, marginTop: 2 },

  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: THEME.surface2,
    borderWidth: 1,
    borderColor: THEME.border,
    marginLeft: 10,
  },
  modalMsg: {
    marginTop: 12,
    color: THEME.textGray,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 18,
  },
  modalMeta: { marginTop: 12, gap: 8 },
  modalMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalMetaText: { color: THEME.textGray, fontWeight: "800", fontSize: 12 },
});
