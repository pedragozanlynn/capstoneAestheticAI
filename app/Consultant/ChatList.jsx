import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
  Image,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Modal,
  Pressable,
} from "react-native";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import { Ionicons } from "@expo/vector-icons";

export default function ConsultantChatList() {
  const [rooms, setRooms] = useState([]);
  const [activeTab, setActiveTab] = useState("ongoing"); // 'ongoing' or 'completed'
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  // ✅ centered message modal (no alerts)
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info"); // success | error | info
  const [msgTitle, setMsgTitle] = useState("");
  const [msgText, setMsgText] = useState("");
  const hideTimerRef = useRef(null);

  const showMessage = (type, title, text, autoHideMs = 1400) => {
    try {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } catch {}
    setMsgType(type || "info");
    setMsgTitle(String(title || ""));
    setMsgText(String(text || ""));
    setMsgVisible(true);

    if (autoHideMs && autoHideMs > 0) {
      hideTimerRef.current = setTimeout(() => setMsgVisible(false), autoHideMs);
    }
  };

  const closeMessage = () => {
    try {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } catch {}
    setMsgVisible(false);
  };

  const msgConfig = useMemo(() => {
    if (msgType === "success") return { icon: "checkmark-circle", color: "#16A34A", bg: "#ECFDF5" };
    if (msgType === "error") return { icon: "close-circle", color: "#DC2626", bg: "#FEF2F2" };
    return { icon: "information-circle", color: "#01579B", bg: "#EFF6FF" };
  }, [msgType]);

  const fetchUserInfo = async (userId) => {
    try {
      if (!userId) return { name: "User", avatar: null };
      const snap = await getDoc(doc(db, "users", userId));
      if (!snap.exists()) return { name: "User", avatar: null };
      const u = snap.data() || {};
      return {
        name: u.fullName || u.name || "User",
        avatar: u.avatarUrl || null,
      };
    } catch {
      return { name: "User", avatar: null };
    }
  };

  useEffect(() => {
    let unsub = null;
    let alive = true;

    const init = async () => {
      setLoading(true);

      try {
        const consultantId = await AsyncStorage.getItem("consultantUid");

        if (!consultantId) {
          setRooms([]);
          showMessage("error", "Missing session", "Consultant ID not found. Please login again.", 1800);
          setLoading(false);
          return;
        }

        const q = query(
          collection(db, "chatRooms"),
          where("consultantId", "==", consultantId),
          orderBy("lastMessageAt", "desc")
        );

        unsub = onSnapshot(
          q,
          async (snap) => {
            try {
              const enriched = await Promise.all(
                snap.docs.map(async (d) => {
                  const room = { id: d.id, ...d.data() };

                  // Safety: userId required for hydration and routing
                  if (!room.userId) return { ...room, userName: "User", avatar: null };

                  if (room.userName) return room;

                  const user = await fetchUserInfo(room.userId);
                  return { ...room, userName: user.name, avatar: user.avatar };
                })
              );

              if (!alive) return;
              setRooms(enriched || []);
              setLoading(false);
            } catch (e) {
              console.log("❌ chatRooms enrich error:", e?.message || e);
              if (!alive) return;
              setRooms([]);
              setLoading(false);
              showMessage("error", "Load failed", "Unable to load messages. Try again.", 1600);
            }
          },
          (err) => {
            console.log("❌ chatRooms listener error:", err?.message || err);
            if (!alive) return;
            setRooms([]);
            setLoading(false);
            showMessage("error", "Permission error", "Missing permissions or rules issue.", 1800);
          }
        );
      } catch (e) {
        console.log("❌ init chat list error:", e?.message || e);
        setRooms([]);
        setLoading(false);
        showMessage("error", "Error", "Something went wrong. Please try again.", 1600);
      }
    };

    init();

    return () => {
      alive = false;
      try {
        unsub && unsub();
      } catch {}
    };
  }, []);

  // Filter Logic
  const filteredRooms = useMemo(() => {
    return (rooms || []).filter((room) => {
      const st = String(room?.status || "").toLowerCase();
      if (activeTab === "ongoing") return st !== "completed";
      return st === "completed";
    });
  }, [rooms, activeTab]);

  const safeTime = (ts) => {
    try {
      if (!ts) return "";
      const ms = ts?.toMillis ? ts.toMillis() : null;
      const d = ms ? new Date(ms) : ts?.toDate ? ts.toDate() : new Date(ts);
      if (!d || isNaN(d.getTime())) return "";
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const openChat = async (room) => {
    if (!room?.id) {
      showMessage("error", "Invalid chat", "Missing room ID.", 1600);
      return;
    }
    if (!room?.userId) {
      showMessage("error", "Invalid chat", "Missing user ID.", 1600);
      return;
    }

    // ✅ optional: mark unreadForConsultant false when opening
    try {
      if (room.unreadForConsultant === true) {
        await updateDoc(doc(db, "chatRooms", room.id), { unreadForConsultant: false });
      }
    } catch (e) {
      // ignore; not blocking navigation
      console.log("⚠️ mark unreadForConsultant false failed:", e?.message || e);
    }

    router.push({
      pathname: "/Consultant/ChatRoom",
      params: { roomId: room.id, userId: room.userId },
    });
  };

  const renderChatItem = ({ item }) => {
    const isCompleted = activeTab === "completed";
    return (
      <TouchableOpacity
        style={[styles.chatItem, isCompleted && { opacity: 0.85 }]}
        onPress={() => openChat(item)}
        activeOpacity={0.75}
      >
        <View style={styles.avatarWrap}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.placeholderAvatar, isCompleted && { backgroundColor: "#F1F5F9" }]}>
              <Text style={[styles.avatarLetter, isCompleted && { color: "#94A3B8" }]}>
                {String(item.userName || "U").charAt(0)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.contentWrap}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.userName || "User"}
            </Text>

            {!!item.lastMessageAt && (
              <Text style={styles.timeText}>{safeTime(item.lastMessageAt)}</Text>
            )}
          </View>

          <View style={styles.messageRow}>
            <Text style={styles.message} numberOfLines={1}>
              {item.lastMessage || "No messages yet"}
            </Text>

            {activeTab === "ongoing" && item.unreadForConsultant && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadCount}>!</Text>
              </View>
            )}

            {activeTab === "completed" && (
              <Ionicons name="archive-outline" size={14} color="#94A3B8" />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#01579B" />

      {/* ✅ Header style aligned with Requests */}
      <View style={styles.headerArea}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Messages</Text>
            <Text style={styles.headerSub}>Client consultations</Text>
          </View>
        </SafeAreaView>
      </View>

      {/* ✅ Tabs below header (same concept as Requests tabs block) */}
      <View style={styles.tabContainer}>
        <View style={styles.tabRow}>
          {["ongoing", "completed"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, activeTab === tab && styles.activeTabItem]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabLabel, activeTab === tab && styles.activeTabLabel]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              {activeTab === tab && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color="#01579B" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRooms}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          renderItem={renderChatItem}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={60} color="#CBD5E1" />
              <Text style={styles.emptyText}>No {activeTab} conversations</Text>
            </View>
          }
        />
      )}

      {/* ✅ Centered Message Modal */}
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

  // ✅ Header style aligned with Requests
  headerArea: { backgroundColor: "#01579B", paddingBottom: 20, paddingTop: 40 },
  headerContent: { paddingHorizontal: 25, paddingTop: 30 },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#fff" },
  headerSub: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 4 },

  // ✅ Tabs block aligned with Requests pattern
  tabContainer: { backgroundColor: "#FFF", marginTop: 20, marginHorizontal: 20, borderRadius: 20, elevation: 4 },
  tabRow: { flexDirection: "row", paddingHorizontal: 10 },
  tabItem: { paddingVertical: 15, flex: 1, alignItems: "center" },
  activeTabItem: {},
  tabLabel: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  activeTabLabel: { color: "#01579B" },
  tabIndicator: { position: "absolute", bottom: 10, width: 20, height: 3, backgroundColor: "#01579B", borderRadius: 2 },

  listContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },

  chatItem: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },

  avatarWrap: { width: 54, height: 54, marginRight: 15 },
  avatar: { width: 54, height: 54, borderRadius: 18 },

  placeholderAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: { color: "#01579B", fontWeight: "800", fontSize: 20 },

  contentWrap: { flex: 1, marginRight: 10 },

  nameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "800", fontSize: 16, color: "#1E293B", flex: 1, marginRight: 8 },
  timeText: { fontSize: 11, color: "#94A3B8", fontWeight: "700" },

  messageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4, gap: 10 },
  message: { color: "#64748B", fontSize: 14, flex: 1 },

  unreadBadge: {
    backgroundColor: "#01579B",
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadCount: { color: "#fff", fontSize: 10, fontWeight: "bold" },

  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#64748B", fontWeight: "700" },

  emptyContainer: { alignItems: "center", marginTop: 80 },
  emptyText: { color: "#94A3B8", marginTop: 15, fontSize: 15, fontWeight: "700" },

  // ✅ Centered message modal
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
