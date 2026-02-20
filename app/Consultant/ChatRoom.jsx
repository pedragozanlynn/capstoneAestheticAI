// app/Consultant/ChatRoom.jsx
// ✅ FIX: mas “itaas pa” ang na-i-scroll (may extra space sa baba) while keeping ALL logic
// ✅ NO LOGIC CHANGES: inverted + reverse + handlers + flows unchanged
//
// What changed (layout only):
// 1) Add SAFE extra bottom spacer for inverted list (ListHeaderComponent) so you can scroll past footer.
// 2) Ensure list content has enough scrollable padding, including safe area + keyboard.
// 3) Put the system “Pwede na mag start ng consult” as ListFooterComponent (top / oldest) again.

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
  Alert,
  Dimensions,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import {
  doc,
  onSnapshot,
  updateDoc,
  Timestamp,
  getDoc,
  serverTimestamp,
  writeBatch,
  collection,
  runTransaction,
} from "firebase/firestore";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { db } from "../../config/firebase";
import { listenToMessages } from "../../services/chatService";
import { pickFile } from "../../services/fileUploadService";
import { handleUnsendMessage } from "../../services/handleUnsendMessage";
import { useSendMessage } from "../../services/useSendMessage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

// Android: base footer height (approx) -> used for list padding (logic kept)
const FOOTER_BASE_H = 78;

// ✅ EXTRA SCROLL SPACE (tweakable)
const EXTRA_SCROLL_SPACE = 28;

const toMillisSafe = (ts) => {
  try {
    if (!ts) return null;
    if (typeof ts === "number") return ts;
    if (ts?.toMillis) return ts.toMillis();
    if (ts?.toDate) return ts.toDate().getTime();
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d.getTime();
  } catch {
    return null;
  }
};

const formatLastSeen = (timestamp) => {
  if (!timestamp) return "Active recently";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffMin = Math.floor((Date.now() - date) / 60000);
  if (diffMin < 1) return "Active just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return diffHr < 24 ? `${diffHr}h ago` : `${Math.floor(diffHr / 24)}d ago`;
};

export default function ChatRoom() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { roomId, userId: routeUserId } = useLocalSearchParams();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [consultant, setConsultant] = useState(null);
  const [chatUser, setChatUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [consultantStatus, setConsultantStatus] = useState(null);
  const [appointmentAt, setAppointmentAt] = useState(null);
  const [roomUserId, setRoomUserId] = useState(routeUserId ? String(routeUserId) : null);

  const [previewImage, setPreviewImage] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const appointmentFetchedRef = useRef(false);
  const latestRoomDataRef = useRef(null);

  // ✅ ANDROID KEYBOARD FIX (logic kept)
  const [kbHeight, setKbHeight] = useState(0);
  const kbVisibleRef = useRef(false);

  const listRef = useRef(null);

  // ✅ logic kept: inverted list needs reversed data
  const chatMessages = useMemo(() => [...messages].reverse(), [messages]);

  // ✅ Load consultant profile
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const key = keys.find((k) => k.startsWith("aestheticai:user-profile:"));
        if (!key) return;
        const data = await AsyncStorage.getItem(key);
        const parsed = JSON.parse(data);
        if (parsed?.uid) setConsultant({ id: parsed.uid, ...parsed });
      } catch (e) {
        console.error("Error loading profile", e);
      }
    };
    loadProfile();
  }, []);

  // ✅ Listen user profile for header
  useEffect(() => {
    if (!routeUserId) return;
    const unsub = onSnapshot(doc(db, "users", String(routeUserId)), (snap) => {
      if (snap.exists()) setChatUser(snap.data());
    });
    return () => unsub();
  }, [routeUserId]);

  // ✅ Keyboard listeners (Android only) (logic kept)
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      kbVisibleRef.current = true;
      const h = e?.endCoordinates?.height || 0;
      setKbHeight(h);

      setTimeout(() => {
        try {
          listRef.current?.scrollToOffset?.({ offset: 0, animated: true }); // inverted
        } catch {}
      }, 80);
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      kbVisibleRef.current = false;
      setKbHeight(0);

      setTimeout(() => {
        try {
          listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
        } catch {}
      }, 80);
    });

    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
    };
  }, []);

 // ✅ ADD TIME to the "first consultant message" notification (NO logic break)
// - Adds: appointmentAt (if available) + createdAtClient (Timestamp.now) + createdAtMs (Date.now)
// - Keeps createdAt: serverTimestamp() (for sorting)
// - Notification message becomes: "<old message>\n\nTime: <formatted>"

const formatNotifTime = (ts) => {
  try {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("en-PH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
};

/**
 * ✅ FIRST MESSAGE notification (ONCE) - transaction safe
 * ✅ UPDATED: includes time in notification document + message text
 */
const notifyUserOnFirstConsultantMessage = async ({ kind = "text" } = {}) => {
  if (!roomId || !consultant?.id) return;

  try {
    const roomRef = doc(db, "chatRooms", String(roomId));

    await runTransaction(db, async (tx) => {
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists()) return;

      const data = roomSnap.data() || {};
      if (data.firstMessageNotifiedAt) return;

      const targetUserId = String(data.userId || roomUserId || "");
      const targetConsultantId = String(data.consultantId || consultant.id || "");
      if (!targetUserId) return;

      const title = "New message";
      const baseMessage =
        kind === "file"
          ? "Your consultant sent you a file. You may now start the consultation."
          : kind === "image"
          ? "Your consultant sent you a photo. You may now start the consultation."
          : "Your consultant sent you a message. You may now start the consultation.";

      // ✅ include time (PH locale) inside message
      const nowLocal = new Date();
      const timeStr = formatNotifTime(nowLocal);
      const message = timeStr ? `${baseMessage}\n\nTime: ${timeStr}` : baseMessage;

      // ✅ keep your room flags
      tx.update(roomRef, {
        firstMessageNotifiedAt: serverTimestamp(),
        firstMessageNotifiedBy: "consultant",
        firstMessageKind: String(kind || "text"),
      });

      const notifRef = doc(collection(db, "notifications"));
      tx.set(notifRef, {
        userId: targetUserId,
        consultantId: targetConsultantId || "",
        type: "first_consultant_message",
        title,
        message,
        read: false,
        chatRoomId: String(roomId),
        appointmentId: String(data.appointmentId || roomId),

        // ✅ for your Notifications.jsx modal meta line
        // (if you already display appointmentAt there)
        appointmentAt: data.appointmentAt || appointmentAt || null,

        // ✅ keep server timestamp for ordering
        createdAt: serverTimestamp(),

        // ✅ optional: exact client time backups (useful if serverTimestamp pending)
        createdAtClient: Timestamp.now(),
        createdAtMs: Date.now(),
      });
    });
  } catch (e) {
    console.log("❌ notifyUserOnFirstConsultantMessage error:", e?.message || e);
  }
};

  /**
   * ✅ Rating notification (ONCE)
   */
  const markRatingRequiredAndNotifyUser = async ({ source = "manual", chatRoomData = null } = {}) => {
    if (!roomId) return;

    try {
      const roomRef = doc(db, "chatRooms", String(roomId));

      let data = chatRoomData;
      if (!data) {
        const snap = await getDoc(roomRef);
        data = snap.exists() ? snap.data() || {} : {};
      }

      const targetUserId = String(data.userId || roomUserId || "");
      const targetConsultantId = String(data.consultantId || consultant?.id || "");
      if (!targetUserId) return;

      if (data.ratingNotifiedAt) return;

      const batch = writeBatch(db);

      batch.update(roomRef, {
        ratingRequiredForUser: true,
        ratingAvailableAt: serverTimestamp(),
        ratingNotifiedAt: serverTimestamp(),
        ratingSource: String(source || "manual"),
      });

      const notifRef = doc(collection(db, "notifications"));
      batch.set(notifRef, {
        userId: targetUserId,
        consultantId: targetConsultantId || "",
        type: "session_rating",
        title: "Rate your consultation",
        message: "Your session is complete. Please rate your consultation.",
        read: false,
        chatRoomId: String(roomId),
        appointmentId: String(data.appointmentId || roomId),
        createdAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (e) {
      console.log("❌ markRatingRequiredAndNotifyUser error:", e?.message || e);
    }
  };

  const completeForConsultant = async (source = "manual") => {
    if (!roomId) return;

    try {
      const roomRef = doc(db, "chatRooms", String(roomId));
      const roomSnap = await getDoc(roomRef);
      const data = roomSnap.exists() ? roomSnap.data() || {} : {};

      const batch = writeBatch(db);

      batch.update(roomRef, {
        consultantStatus: "completed",
        consultantCompletedAt: serverTimestamp(),
        consultantCompletedSource: String(source || "manual"),
      });

      await batch.commit();
      setConsultantStatus("completed");

      await markRatingRequiredAndNotifyUser({ source: "manual", chatRoomData: data });
      Alert.alert("Completed", "Session marked as completed. User will be asked to rate.");
    } catch (e) {
      console.log("❌ completeForConsultant error:", e?.message || e);
      Alert.alert("Error", "Failed to complete session. Check permissions/rules.");
    }
  };

  // ✅ Listen chatRoom (appointmentAt + auto complete)
  useEffect(() => {
    if (!roomId) return;

    const unsub = onSnapshot(doc(db, "chatRooms", String(roomId)), async (snap) => {
      if (!snap.exists()) return;

      const data = snap.data() || {};
      latestRoomDataRef.current = data;

      if (data.userId) setRoomUserId(String(data.userId));

      const cs = String(data.consultantStatus || data.status || "").toLowerCase();
      setConsultantStatus(cs || null);

      const roomApptAt = data.appointmentAt || null;
      if (roomApptAt) setAppointmentAt(roomApptAt);

      if (!roomApptAt && !appointmentFetchedRef.current) {
        appointmentFetchedRef.current = true;
        try {
          const apptId = String(data.appointmentId || roomId);
          const apptSnap = await getDoc(doc(db, "appointments", apptId));
          if (apptSnap.exists()) {
            const appt = apptSnap.data() || {};
            if (appt.appointmentAt) setAppointmentAt(appt.appointmentAt);
          }
        } catch (e) {
          console.log("⚠️ appointment fallback fetch failed:", e?.message || e);
        }
      }

      const apptMs = toMillisSafe(roomApptAt || appointmentAt);
      const isDone = cs === "completed";

      if (apptMs && !isDone) {
        const shouldComplete = Date.now() - apptMs > TWELVE_HOURS;
        if (shouldComplete) {
          try {
            await updateDoc(doc(db, "chatRooms", String(roomId)), {
              consultantStatus: "completed",
              consultantCompletedAt: Timestamp.now(),
              consultantCompletedSource: "auto_12h",
            });
            setConsultantStatus("completed");
            await markRatingRequiredAndNotifyUser({ source: "auto_12h", chatRoomData: data });
          } catch (e) {
            console.log("❌ auto-complete update failed:", e?.message || e);
          }
        }
      }

      if (cs === "completed" && !data.ratingNotifiedAt) {
        await markRatingRequiredAndNotifyUser({ source: "completed_fix", chatRoomData: data });
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, appointmentAt, consultant?.id]);

  // ✅ Listen messages
  useEffect(() => {
    if (!roomId || !consultant?.id) return;
    setLoading(true);
    const unsub = listenToMessages(roomId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
    return () => unsub();
  }, [roomId, consultant?.id]);

  const { sendTextMessage, sendFileMessage } = useSendMessage({
    roomId,
    senderId: consultant?.id,
    senderType: "consultant",
    setMessages,
  });

  const isCompleted = String(consultantStatus || "").toLowerCase() === "completed";

  const handleSend = async () => {
    if (!text.trim() || isCompleted || isSending) return;
    const msgToSend = text.trim();
    setText("");
    setIsSending(true);
    try {
      await sendTextMessage(msgToSend);
      await notifyUserOnFirstConsultantMessage({ kind: "text" });
    } catch (error) {
      console.error("Send error:", error);
      Alert.alert("Error", "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  const handleFileAction = async () => {
    if (isCompleted || isSending) return;
    const file = await pickFile();
    if (!file) return;
    setIsSending(true);
    try {
      await sendFileMessage(file);
      await notifyUserOnFirstConsultantMessage({ kind: "file" });
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", "Failed to upload.");
    } finally {
      setIsSending(false);
    }
  };

  const handleCameraAction = async () => {
    if (isCompleted || isSending) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "We need camera access.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setIsSending(true);
      const imageAsset = result.assets[0];
      try {
        await sendFileMessage(imageAsset);
        await notifyUserOnFirstConsultantMessage({ kind: "image" });
      } catch (error) {
        Alert.alert("Error", "Failed to upload photo.");
      } finally {
        setIsSending(false);
      }
    }
  };

  const onLongPressMessage = (item) => {
    const isMe = item.senderType === "consultant";
    if (isMe && !item.unsent && consultant?.id) {
      handleUnsendMessage(item, roomId, consultant.id, setMessages);
    }
  };

  const renderMsg = ({ item }) => {
    const isMe = item.senderType === "consultant";
    const isImage = item.type === "image";
    const isFile = item.type === "file";

    return (
      <View style={[styles.messageWrapper, isMe ? styles.myWrapper : styles.theirWrapper]}>
        <TouchableOpacity
          activeOpacity={0.8}
          delayLongPress={500}
          onPress={() => {
            if (item.unsent) return;
            if (isImage) setPreviewImage(item.fileUrl);
            else if (isFile) Linking.openURL(item.fileUrl);
          }}
          onLongPress={() => onLongPressMessage(item)}
          style={[
            styles.messageBubble,
            isMe ? styles.myBubble : styles.theirBubble,
            (isImage || isFile) && !item.unsent && styles.mediaBubbleFix,
            item.unsent && styles.unsentBubble,
          ]}
        >
          {item.unsent ? (
            <View style={styles.unsentRow}>
              <Text style={styles.unsentText}>🚫 Message unsent</Text>
            </View>
          ) : isImage ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: item.fileUrl }} style={styles.imageMsg} resizeMode="cover" />
            </View>
          ) : isFile ? (
            <View style={styles.fileRow}>
              <Ionicons name="document-text" size={24} color={isMe ? "#FFF" : "#01579B"} />
              <Text style={[styles.fileText, isMe ? styles.myText : styles.theirText]} numberOfLines={1}>
                {item.fileName || "Document"}
              </Text>
            </View>
          ) : (
            <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>{item.text}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // ✅ Dynamic bottom padding (logic kept) + safe area + extra scroll
  const footerBottom = kbHeight > 0 ? kbHeight : 0;

  // ✅ IMPORTANT: because footer has paddingBottom too, add insets.bottom and extra.
  const listBottomPadding =
    FOOTER_BASE_H +
    (kbHeight > 0 ? kbHeight : 0) +
    Math.max(insets.bottom, Platform.OS === "ios" ? 35 : 15) +
    EXTRA_SCROLL_SPACE;

  // ✅ UI-safe header padding (UI only)
  const headerTopPad =
    Platform.OS === "android"
      ? Math.max(insets.top, StatusBar.currentHeight || 0)
      : insets.top;

  return (
    <View style={styles.mainContainer}>
      <StatusBar translucent={false} backgroundColor="#FFFFFF" barStyle="dark-content" />

      {/* ✅ HEADER */}
      <View style={[styles.header, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#0F3E48" />
        </TouchableOpacity>

        <Image
          source={
            chatUser?.gender === "Female"
              ? require("../../assets/office-woman.png")
              : require("../../assets/office-man.png")
          }
          style={styles.avatar}
        />

        <View style={styles.headerInfo}>
          <Text style={styles.nameText} numberOfLines={1}>
            {chatUser?.name || "Client"}
          </Text>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isCompleted ? "#94A3B8" : chatUser?.isOnline ? "#22C55E" : "#94A3B8",
                },
              ]}
            />
            <Text style={styles.statusText} numberOfLines={1}>
              {isCompleted
                ? "Consultation completed"
                : chatUser?.isOnline
                ? "Active now"
                : formatLastSeen(chatUser?.lastSeen)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => {
            if (isCompleted) return;
            Alert.alert(
              "Complete session?",
              "This will close chat for consultant view (12h auto will also do this).",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Complete", style: "destructive", onPress: () => completeForConsultant("manual") },
              ]
            );
          }}
          disabled={isCompleted}
          style={[styles.completeBtn, isCompleted && { opacity: 0.5 }]}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-done" size={20} color={isCompleted ? "#94A3B8" : "#065F46"} />
        </TouchableOpacity>
      </View>

      {/* ✅ CHAT AREA */}
      <View style={styles.chatArea}>
        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color="#01579B" />
        ) : (
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            data={chatMessages}
            renderItem={renderMsg}
            keyExtractor={(i) => i.id || Math.random().toString()}
            inverted
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            removeClippedSubviews={false}
            contentContainerStyle={styles.listContent}
            // ✅ inverted: HEADER is near bottom -> spacer controls "how far up" you can scroll
            ListHeaderComponent={<View style={{ height: listBottomPadding }} />}
            // ✅ inverted: FOOTER is top/oldest -> first system message here
         
          />
        )}
      </View>

      {/* ✅ FOOTER (absolute) — do NOT block list scrolling */}
      <View
        pointerEvents="box-none"
        style={[
          styles.footer,
          {
            bottom: footerBottom,
            paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 35 : 15),
          },
        ]}
      >
        <View pointerEvents="auto" style={styles.inputWrapper}>
          <TouchableOpacity disabled={isCompleted} onPress={handleFileAction}>
            <Ionicons
              name="add-circle"
              size={32}
              color={isCompleted || isSending ? "#CBD5E1" : "#01579B"}
            />
          </TouchableOpacity>

          <TouchableOpacity disabled={isCompleted} onPress={handleCameraAction} style={styles.directCameraBtn}>
            <Ionicons
              name="camera"
              size={32}
              color={isCompleted || isSending ? "#CBD5E1" : "#01579B"}
            />
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder={isCompleted ? "Chat closed (consultant)" : "Message..."}
            editable={!isCompleted}
            multiline
            onFocus={() => {
              setTimeout(() => {
                try {
                  listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
                } catch {}
              }, 60);
            }}
          />

          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || isSending || isCompleted}
            style={[
              styles.sendBtn,
              text.trim() && !isCompleted ? styles.sendBtnActive : styles.sendBtnInactive,
            ]}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={!!previewImage} transparent animationType="fade">
        <View style={styles.fullScreenOverlay}>
          <TouchableOpacity style={styles.closePreview} onPress={() => setPreviewImage(null)}>
            <Ionicons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
          <Image source={{ uri: previewImage }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#F8FAFC" },

  header: {
    top: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFF",
    zIndex: 100,
  },
  backBtn: { padding: 5 },
  avatar: { width: 42, height: 42, borderRadius: 21, marginLeft: 5 },
  headerInfo: { marginLeft: 12, flex: 1 },
  nameText: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  statusText: { fontSize: 12, color: "#64748B" },

  completeBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  chatArea: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 20 },

  systemWrap: {
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  systemText: { fontSize: 12, fontWeight: "700", color: "#334155" },

  messageWrapper: { marginVertical: 6, flexDirection: "row" },
  myWrapper: { justifyContent: "flex-end" },
  theirWrapper: { justifyContent: "flex-start" },

  messageBubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  myBubble: { backgroundColor: "#01579B", borderBottomRightRadius: 4 },
  theirBubble: {
    backgroundColor: "#FFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  mediaBubbleFix: { padding: 0, overflow: "hidden" },
  unsentBubble: {
    opacity: 0.6,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },

  messageText: { fontSize: 15, lineHeight: 22 },
  myText: { color: "#FFF" },
  theirText: { color: "#334155" },

  unsentRow: { flexDirection: "row", alignItems: "center" },
  unsentText: { color: "#8f2f52", fontStyle: "italic", fontSize: 13, fontWeight: "600" },

  imageContainer: { width: 230, height: 170 },
  imageMsg: { width: "100%", height: "100%", borderRadius: 15 },

  fileRow: { flexDirection: "row", alignItems: "center", padding: 12, minWidth: 180 },
  fileText: { marginLeft: 10, fontWeight: "600", fontSize: 14 },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingTop: 10,
    justifyContent: "center",
  },
  inputWrapper: { flexDirection: "row", alignItems: "flex-end", paddingBottom: 3 },
  directCameraBtn: { marginLeft: 5 },

  textInput: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    maxHeight: 110,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "transparent",
    fontSize: 15,
    color: "#0F172A",
  },

  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnActive: { backgroundColor: "#01579B" },
  sendBtnInactive: { backgroundColor: "#CBD5E1" },

  fullScreenOverlay: { flex: 1, backgroundColor: "black", justifyContent: "center" },
  closePreview: { position: "absolute", top: 50, right: 20, zIndex: 10 },
  fullImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.8 },
});
