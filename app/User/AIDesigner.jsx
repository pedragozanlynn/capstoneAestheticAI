import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import useSubscriptionType from "../../services/useSubscriptionType";
import BottomNavbar from "../components/BottomNav";
import CenterMessageModal from "../components/CenterMessageModal";

// ✅ Firebase
import { getAuth } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getApp } from "firebase/app";
import { db } from "../../config/firebase";

/* =========================
   HELPERS
========================= */
function formatChatDate(tsLike) {
  try {
    if (!tsLike) return "";
    const d =
      typeof tsLike?.toDate === "function" ? tsLike.toDate() : new Date(tsLike);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  } catch {
    return "";
  }
}

function safeString(v) {
  return typeof v === "string" ? v.trim() : "";
}

/* =========================
   SCREEN
========================= */
export default function AIDesigner() {
  const router = useRouter();
  const subType = useSubscriptionType();
  const auth = getAuth();

  /* -------------------------
     AUTH STATE
  ------------------------- */
  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  /* -------------------------
     CHAT LIST STATE
  ------------------------- */
  const [loadingChats, setLoadingChats] = useState(true);
  const [chatSummaries, setChatSummaries] = useState([]);

  // main conversation listener (root or users/{uid})
  const unsubMainRef = useRef(null);

  // per-conversation message listeners (to fill missing lastMessage/title/date)
  const messageUnsubsRef = useRef(new Map());

  // fallback mode tracker
  const usedFallbackRef = useRef(false);

  /* -------------------------
     MENU STATE (positioned)
  ------------------------- */
  const [menuChat, setMenuChat] = useState(null); // selected chat
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 }); // dropdown position
  const moreBtnRefs = useRef(new Map()); // chatId -> ref

  /* -------------------------
     CenterMessageModal STATE
  ------------------------- */
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgType, setMsgType] = useState("info"); // "success" | "error" | "info"
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");

  const showMsg = (type, title, body = "") => {
    setMsgType(type);
    setMsgTitle(title);
    setMsgBody(body);
    setMsgOpen(true);
  };

  /* =========================
     NAVIGATION ACTIONS
  ========================= */
  // ✅ NEW CHAT
  const openChatScreen = () => {
    router.push({
      pathname: "/User/AIDesignerChat",
      params: { tab: "design", chatId: "new" },
    });
  };

  // ✅ OPEN EXISTING CHAT (Resume)
  const openChatHistory = (chat) => {
    router.push({
      pathname: "/User/AIDesignerChat",
      params: {
        tab: "design",
        chatId: chat.id,
        sessionId: chat.sessionId || "",
        source: chat.source || "root",
        title: chat.title || "Aesthetic AI",
      },
    });
  };

  /* =========================
     MENU ACTIONS
  ========================= */
  const closeChatMenu = () => setMenuChat(null);

  // ✅ open menu near pressed button
  const openChatMenu = (chat) => {
    const ref = moreBtnRefs.current.get(chat.id);

    if (ref?.measureInWindow) {
      ref.measureInWindow((x, y, w, h) => {
        setMenuPos({ x: x + w - 170, y: y + h + 8 }); // 170 = menu width
        setMenuChat(chat);
      });
      return;
    }

    // fallback position
    setMenuPos({ x: 22, y: 250 });
    setMenuChat(chat);
  };

  const handleDeleteChat = (chat) => {
    if (!uid || !chat?.id) return;

    Alert.alert("Delete chat?", "This will permanently remove this chat.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const src = chat.source === "user" ? "user" : "root";

            const convoRef =
              src === "user"
                ? doc(db, "users", uid, "aiConversations", chat.id)
                : doc(db, "aiConversations", chat.id);

            await deleteDoc(convoRef);

            const key = `${src}::${chat.id}`;
            const unsub = messageUnsubsRef.current.get(key);
            if (unsub) {
              try {
                unsub();
              } catch {}
              messageUnsubsRef.current.delete(key);
            }

            setChatSummaries((prev) => prev.filter((c) => c.id !== chat.id));

            // ✅ SUCCESS MESSAGE
            showMsg("success", "Deleted", "Chat removed successfully.");
          } catch (e) {
            console.warn("Delete chat failed:", e?.message || e);

            // ✅ ERROR MESSAGE
            showMsg("error", "Delete failed", "Unable to delete chat right now.");
          }
        },
      },
    ]);
  };

  /* =========================
     ROUTER PARAM ALERT: saved
  ========================= */
  useEffect(() => {
    const sub = (event) => {
      const saved =
        event?.data?.state?.routes?.[event?.data?.state?.index]?.params?.saved;

      if (!saved) return;

      Alert.alert(
        "Saved",
        typeof saved === "string" && saved !== "1" && saved !== "true"
          ? `Project saved: ${saved}`
          : "Project saved successfully."
      );

      try {
        router.setParams({ saved: undefined });
      } catch {}
    };

    let unsub;
    try {
      unsub = router?.addListener?.("state", sub);
    } catch {
      unsub = null;
    }

    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, [router]);

  /* =========================
     AUTH LISTENER
  ========================= */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      const nextUid = u?.uid || null;
      setUid(nextUid);
      setAuthReady(true);

      try {
        console.log("AUTH uid:", nextUid);
        console.log("Firebase projectId:", getApp().options.projectId);
      } catch {}
    });

    return unsub;
  }, [auth]);

  /* =========================
     SNAPSHOT MAPPING
  ========================= */
  const mapDocs = (snap, source) => {
    return snap.docs.map((d) => {
      const data = d.data() || {};
      const title = safeString(data.title) || "Aesthetic AI";
      const lastMessage = safeString(data.lastMessage);

      return {
        id: d.id,
        title,
        lastMessage,
        date: formatChatDate(data.updatedAt || data.createdAt),
        updatedAt: data.updatedAt || null,
        createdAt: data.createdAt || null,
        sessionId: data.sessionId || null,
        _needsEnrich: !lastMessage || !data.updatedAt,
        source,
      };
    });
  };

  /* =========================
     CLEANUP HELPERS
  ========================= */
  const clearMessageListeners = () => {
    try {
      const map = messageUnsubsRef.current;
      for (const [, unsub] of map.entries()) {
        try {
          unsub?.();
        } catch {}
      }
      map.clear();
    } catch {}
  };

  /* =========================
     ENRICH: listen to last msg
  ========================= */
  const ensureMessageListener = ({ source, chatId }) => {
    const src = source === "user" ? "user" : "root";
    const key = `${src}::${chatId}`;

    if (messageUnsubsRef.current.has(key)) return;
    if (!uid) return;

    const messagesCol =
      src === "user"
        ? collection(db, "users", uid, "aiConversations", chatId, "messages")
        : collection(db, "aiConversations", chatId, "messages");

    const mq = query(messagesCol, orderBy("createdAt", "desc"), limit(1));

    const unsub = onSnapshot(
      mq,
      (snap) => {
        const m = snap.docs?.[0]?.data?.() || {};

        const text =
          safeString(m.text) ||
          safeString(m.message) ||
          safeString(m.content) ||
          "";

        const createdAt = m.createdAt || m.timestamp || null;

        setChatSummaries((prev) =>
          prev.map((c) => {
            if (c.id !== chatId) return c;

            const nextLast = c.lastMessage || text;
            const nextDate =
              c.date || formatChatDate(createdAt || c.updatedAt || c.createdAt);

            const maybeTitle = safeString(m.title);
            const nextTitle =
              c.title === "Aesthetic AI" && maybeTitle ? maybeTitle : c.title;

            return {
              ...c,
              title: nextTitle,
              lastMessage: nextLast,
              date: nextDate,
              _needsEnrich: false,
            };
          })
        );
      },
      (err) => {
        console.warn("Message enrich snapshot error:", err?.message || String(err));
      }
    );

    messageUnsubsRef.current.set(key, unsub);
  };

  /* =========================
     MAIN LISTENER (root -> fallback)
  ========================= */
  const attachMainListener = ({ useFallback }) => {
    const basePath = useFallback ? `users/${uid}/aiConversations` : "aiConversations";

    const conversationsCol =
      basePath === "aiConversations"
        ? collection(db, "aiConversations")
        : collection(db, "users", uid, "aiConversations");

    const qUpdated = query(
      conversationsCol,
      where("userId", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(20)
    );

    const qCreated = query(
      conversationsCol,
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const attach = (q, tag) =>
      onSnapshot(
        q,
        (snap) => {
          const rows = mapDocs(snap, useFallback ? "user" : "root");

          setChatSummaries(rows);
          setLoadingChats(false);

          // ✅ auto fallback to user path if root empty
          if (!useFallback && !usedFallbackRef.current && rows.length === 0) {
            usedFallbackRef.current = true;
            try {
              unsubMainRef.current?.();
            } catch {}
            unsubMainRef.current = attachMainListener({ useFallback: true });
          }
        },
        (err) => {
          const msg = err?.message || String(err);
          console.warn(`Recent chats realtime error (${tag}):`, msg);

          // ✅ if updatedAt index/order fails, fallback to createdAt
          if (tag === "updatedAt") {
            try {
              unsubMainRef.current?.();
            } catch {}
            unsubMainRef.current = attach(qCreated, "createdAt");
            return;
          }

          setChatSummaries([]);
          setLoadingChats(false);
        }
      );

    return attach(qUpdated, "updatedAt");
  };

  /* =========================
     (RE)ATTACH LISTENERS WHEN AUTH/UID CHANGES
  ========================= */
  useEffect(() => {
    if (unsubMainRef.current) {
      try {
        unsubMainRef.current();
      } catch {}
      unsubMainRef.current = null;
    }

    clearMessageListeners();
    usedFallbackRef.current = false;

    if (!authReady) {
      setLoadingChats(true);
      return;
    }

    if (!uid) {
      setChatSummaries([]);
      setLoadingChats(false);
      return;
    }

    setLoadingChats(true);
    unsubMainRef.current = attachMainListener({ useFallback: false });

    return () => {
      if (unsubMainRef.current) {
        try {
          unsubMainRef.current();
        } catch {}
        unsubMainRef.current = null;
      }
      clearMessageListeners();
    };
  }, [uid, authReady]);

  /* =========================
     ENRICH ITEMS THAT NEED IT
  ========================= */
  useEffect(() => {
    if (!uid) return;
    if (!chatSummaries?.length) return;

    chatSummaries.forEach((c) => {
      if (!c?._needsEnrich) return;

      ensureMessageListener({
        source: c.source === "user" ? "user" : "root",
        chatId: c.id,
      });
    });
  }, [chatSummaries, uid]);

  /* =========================
     DERIVED
  ========================= */
  const historyList = useMemo(() => chatSummaries.map((c) => ({ ...c })), [chatSummaries]);

  /* =========================
     RENDER
  ========================= */
  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" translucent={false} />
      <SafeAreaView style={styles.safeTop} />

      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionHint}>Create a new design session</Text>
        </View>

        <View style={styles.primaryCard}>
  <View style={styles.primaryCardTop}>
    <View style={styles.primaryIconWrap}>
      <Image source={require("../../assets/design.png")} style={styles.primaryIcon} />
    </View>

    <View style={styles.primaryTextWrap}>
      <Text style={styles.primaryTitle}>AI Interior Assistant</Text>
      <Text style={styles.primaryDesc} numberOfLines={2}>
        Generate layouts, refine styles, and modify furniture using a conversational interface.
      </Text>
    </View>
  </View>

  <View style={styles.primaryCardBottom}>
    <View style={styles.miniPillsRow}>
      <View style={styles.miniPill}>
        <Ionicons name="image" size={14} color="#0F3E48" />
        <Text style={styles.miniPillText}>Image-based</Text>
      </View>
      <View style={styles.miniPill}>
        <Ionicons name="chatbubble-ellipses" size={14} color="#0F3E48" />
        <Text style={styles.miniPillText}>Prompt-driven</Text>
      </View>
    </View>

    {/* ✅ ONLY THIS BUTTON IS TOUCHABLE */}
    <TouchableOpacity
      style={styles.startBtn}
      onPress={openChatScreen}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Text style={styles.startBtnText}>Start Chat</Text>
      <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
    </TouchableOpacity>
  </View>
</View>


        <View style={styles.historyHeaderRow}>
          <View>
            <Text style={styles.historyTitle}>Recent Chats</Text>
            <Text style={styles.historySubtitle}>Resume your previous design sessions</Text>
          </View>
        </View>

        {!authReady ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Checking account…</Text>
          </View>
        ) : loadingChats ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading chats…</Text>
          </View>
        ) : !uid ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Sign in required</Text>
            <Text style={styles.emptySubtitle}>Please sign in to view your chat history.</Text>
          </View>
        ) : historyList.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No recent chats</Text>
            <Text style={styles.emptySubtitle}>Start a new session to see it appear here.</Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {historyList.map((chat) => (
              <TouchableOpacity
                key={chat.id}
                style={styles.historyItem}
                onPress={() => openChatHistory(chat)}
                activeOpacity={0.85}
              >
                <View style={styles.historyIconBox}>
                  <Ionicons name="color-wand" size={20} color="#01579B" />
                </View>

                <View style={styles.historyTextContent}>
                  <View style={styles.historyTopLine}>
                    <Text style={styles.historyItemTitle} numberOfLines={1}>
                      {chat.title}
                    </Text>
                    <Text style={styles.historyItemDate}>{chat.date || ""}</Text>
                  </View>

                  <Text style={styles.historyItemSnippet} numberOfLines={1}>
                    {chat.lastMessage || "Tap to continue…"}
                  </Text>
                </View>

                <View style={styles.historyActions}>
                  {/* ✅ FIX: make ... button clickable (stop parent row press) */}
                  <View
                    collapsable={false}
                    ref={(r) => {
                      if (r) moreBtnRefs.current.set(chat.id, r);
                    }}
                  >
                    <Pressable
                      onPress={(e) => {
                        e?.stopPropagation?.(); // ✅ prevents row onPress
                        openChatMenu(chat);
                      }}
                      style={styles.moreBtn}
                      hitSlop={10}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color="#64748B" />
                    </Pressable>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ✅ ONE footer only */}
      <SafeAreaView style={styles.safeBottom}>
        <View style={styles.footerLift}>
          <BottomNavbar subType={subType} />
        </View>
      </SafeAreaView>

      {/* 🔽 DROPDOWN MENU */}
      {menuChat && (
        <View style={styles.menuOverlay}>
          <Pressable style={styles.menuBackdrop} onPress={closeChatMenu} />

          <View style={[styles.chatMenu, { left: menuPos.x, top: menuPos.y }]}>
            <TouchableOpacity
              style={styles.chatMenuItem}
              onPress={() => {
                closeChatMenu();
                handleDeleteChat(menuChat);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
              <Text style={styles.chatMenuTextDelete}>Delete chat</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <CenterMessageModal
        visible={msgOpen}
        type={msgType}
        title={msgTitle}
        message={msgBody}
        onClose={() => setMsgOpen(false)}
      />
    </View>
  );
}

/* =========================
   STYLES (unchanged)
========================= */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },
  safeTop: { backgroundColor: "#F8FAFC" },
  safeBottom: { backgroundColor: "#F8FAFC" },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 22, paddingBottom: 150 },

  footerLift: { paddingBottom: 14 },

  sectionHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 60,
    paddingBottom: 20,
  },
  sectionHint: { fontSize: 12, color: "#94A3B8", fontWeight: "700", marginBottom: 5 },

  primaryCard: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
    overflow: "hidden",
  },
  primaryCardTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  primaryIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  primaryIcon: { width: 30, height: 30, resizeMode: "contain" },
  primaryTextWrap: { flex: 1 },
  primaryTitle: { fontSize: 16, fontWeight: "900", color: "#0F3E48" },
  primaryDesc: { fontSize: 12, color: "#64748B", marginTop: 4, lineHeight: 16 },

  primaryCardBottom: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  miniPillsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", flex: 1 },
  miniPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  miniPillText: { fontSize: 11, fontWeight: "800", color: "#0F3E48" },

  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#01579B",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  startBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },

  historyHeaderRow: { marginTop: 26, marginBottom: 12 },
  historyTitle: { fontSize: 16, fontWeight: "900", color: "#0F3E48" },
  historySubtitle: { fontSize: 12, color: "#94A3B8", marginTop: 3, fontWeight: "700" },

  historyList: { gap: 12 },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  historyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    marginRight: 12,
  },
  historyTextContent: { flex: 1 },
  historyTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F3E48",
    flex: 1,
    paddingRight: 10,
  },
  historyItemDate: { fontSize: 11, color: "#94A3B8", fontWeight: "800" },
  historyItemSnippet: { fontSize: 12, color: "#64748B" },

  historyActions: { marginLeft: 10, justifyContent: "center", alignItems: "center" },
  moreBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  loadingWrap: { paddingVertical: 18, alignItems: "center" },
  loadingText: { marginTop: 8, fontSize: 12, color: "#64748B", fontWeight: "700" },

  emptyWrap: {
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  emptyTitle: { fontSize: 13, fontWeight: "900", color: "#0F3E48" },
  emptySubtitle: { marginTop: 6, fontSize: 12, color: "#64748B", fontWeight: "700", lineHeight: 16 },

  // ✅ menu overlay
  menuOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
  },
  chatMenu: {
    position: "absolute",
    width: 170,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  chatMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chatMenuTextDelete: { fontSize: 13, fontWeight: "800", color: "#EF4444" },
});
