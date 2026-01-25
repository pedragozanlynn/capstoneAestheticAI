// app/Consultant/Notifications.jsx
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
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
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
  danger: "#DC2626",
  success: "#16A34A",
  warn: "#F59E0B",
};

/* ---------------- HELPERS ---------------- */
const payoutIcon = (statusOrTitle = "", type = "") => {
  const s = String(statusOrTitle || "").toLowerCase();
  const t = String(type || "").toLowerCase();

  // primary: payout status
  if (t === "payout_status" || s.includes("withdrawal")) {
    if (s.includes("approved") || s.includes("accept")) return "checkmark-circle";
    if (s.includes("declined") || s.includes("rejected") || s.includes("cancel")) return "close-circle";
    return "time";
  }

  return "notifications";
};

const payoutColor = (statusOrTitle = "", type = "") => {
  const s = String(statusOrTitle || "").toLowerCase();
  const t = String(type || "").toLowerCase();

  if (t === "payout_status" || s.includes("withdrawal")) {
    if (s.includes("approved") || s.includes("accept")) return THEME.success;
    if (s.includes("declined") || s.includes("rejected") || s.includes("cancel")) return THEME.danger;
    return THEME.warn;
  }

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

const formatDateTime = (ts) => {
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
    payoutId: d?.payoutId || "",
    amount: d?.amount ?? null,
    status: d?.status || "", // optional if you store it
  };
};

const buildStatusLine = (type = "", title = "", message = "") => {
  const t = String(type || "").toLowerCase();
  const ti = String(title || "").toLowerCase();
  const m = String(message || "").toLowerCase();

  if (t === "payout_status" || ti.includes("withdrawal") || m.includes("withdrawal")) {
    if (ti.includes("approved") || m.includes("approved")) return "Withdrawal approved";
    if (ti.includes("declined") || m.includes("declined") || ti.includes("rejected") || m.includes("rejected"))
      return "Withdrawal declined";
    return "Withdrawal update";
  }
  return "Admin update";
};

export default function ConsultantNotifications() {
  const router = useRouter();
  const auth = getAuth();

  const [loading, setLoading] = useState(true);
  const [notificationsRaw, setNotificationsRaw] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const [openItem, setOpenItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const uid = auth.currentUser?.uid;

  const listenToNotifications = (consultantId, cb) => {
    const q = query(
      collection(db, "notifications"),
      where("recipientRole", "==", "consultant"),
      where("recipientId", "==", consultantId),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => normalizeNotif({ id: d.id, ...d.data() }));
        cb(list);
      },
      (err) => {
        console.log("❌ consultant notifications listener error:", err?.message || err);
        cb([]);
      }
    );
  };

  const markNotificationAsRead = async (notifId) => {
    await updateDoc(doc(db, "notifications", notifId), { read: true });
  };

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsub = listenToNotifications(uid, (list) => {
      setNotificationsRaw(list || []);
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [uid]);

  const notifications = useMemo(() => notificationsRaw || [], [notificationsRaw]);

  const sections = useMemo(() => {
    const unread = notifications.filter((n) => n?.read !== true);
    const read = notifications.filter((n) => n?.read === true);
    return { unread, read };
  }, [notifications]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

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

  const buildRowText = (item) => {
    const line1 = "AestheticAI Admin";
    const line2 = buildStatusLine(item?.type, item?.title, item?.message);
    const msg = String(item?.message || "").trim();
    const line3 = msg ? `— ${msg}` : "";
    return { line1, line2, line3 };
  };

  const renderNotifItem = ({ item }) => {
    const isUnread = item?.read !== true;

    // use title/message to decide icon + color
    const icon = payoutIcon(item?.title || item?.message, item?.type);
    const iconClr = payoutColor(item?.title || item?.message, item?.type);

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
            {!!item?.createdAt && (
              <>
                <Text style={styles.dotSep}>•</Text>
                <Text style={styles.timeText}>{formatDateTime(item?.createdAt)}</Text>
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
        {/* TOP BAR */}
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
                      { backgroundColor: payoutColor(openItem?.title || openItem?.message, openItem?.type) + "18" },
                    ]}
                  >
                    <Ionicons
                      name={payoutIcon(openItem?.title || openItem?.message, openItem?.type)}
                      size={22}
                      color={payoutColor(openItem?.title || openItem?.message, openItem?.type)}
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

                    <Text style={styles.modalTime}>{formatDateTime(openItem?.createdAt)}</Text>
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
                {/* ✅ amount */}
                {openItem?.amount != null && (
                  <View style={styles.modalMetaRow}>
                    <Ionicons name="cash" size={14} color={THEME.textGray} />
                    <Text style={styles.modalMetaText}>
                      ₱{Number(openItem.amount).toLocaleString()}
                    </Text>
                  </View>
                )}

                {/* ✅ payout id */}
                {!!openItem?.payoutId && (
                  <View style={styles.modalMetaRow}>
                    <Ionicons name="document-text" size={14} color={THEME.textGray} />
                    <Text style={styles.modalMetaText}>Payout ID: {openItem.payoutId}</Text>
                  </View>
                )}

                {/* ✅ createdAt */}
                {!!openItem?.createdAt && (
                  <View style={styles.modalMetaRow}>
                    <Ionicons name="time" size={14} color={THEME.textGray} />
                    <Text style={styles.modalMetaText}>{formatDateTime(openItem.createdAt)}</Text>
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

  modalTime: { color: THEME.textGray, fontWeight: "800", fontSize: 12, marginTop: 6 },

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
