import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
  Dimensions,
  Pressable,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { doc, onSnapshot, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { listenToMessages } from "../../services/chatService";
import { pickFile } from "../../services/fileUploadService";
import { handleUnsendMessage } from "../../services/handleUnsendMessage";
import { useSendMessage } from "../../services/useSendMessage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

const isAfter12Hours = (timestamp) => {
  if (!timestamp?.toDate) return false;
  return Date.now() - timestamp.toDate().getTime() > TWELVE_HOURS;
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

/* ✅ centered message modal helper */
const MSG_COLORS = {
  info: { bg: "#EFF6FF", border: "#BFDBFE", icon: "information-circle", iconColor: "#01579B" },
  success: { bg: "#ECFDF5", border: "#BBF7D0", icon: "checkmark-circle", iconColor: "#16A34A" },
  error: { bg: "#FEF2F2", border: "#FECACA", icon: "close-circle", iconColor: "#DC2626" },
};

export default function ChatRoom() {
  const router = useRouter();
  const { roomId, userId: routeUserId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [consultant, setConsultant] = useState(null);
  const [chatUser, setChatUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roomStatus, setRoomStatus] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isSending, setIsSending] = useState(false);

  // ✅ message modal (instead of Alert)
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  // ✅ prevent repeated auto-complete update loops
  const completedOnceRef = useRef(false);

  const showMessage = (type = "info", title = "", body = "", autoHideMs = 1500) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}

    setMsgType(type);
    setMsgTitle(String(title || ""));
    setMsgBody(String(body || ""));
    setMsgVisible(true);

    if (autoHideMs && autoHideMs > 0) {
      msgTimerRef.current = setTimeout(() => setMsgVisible(false), autoHideMs);
    }
  };

  const closeMessage = () => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setMsgVisible(false);
  };

  const chatMessages = useMemo(() => {
    // listenToMessages usually returns ASC (oldest->newest)
    // you were reversing then FlatList inverted; keep same behavior
    return [...messages].reverse();
  }, [messages]);

  useEffect(() => {
    if (!roomId) showMessage("error", "Missing room", "Room ID is required.", 1800);
    if (!routeUserId) showMessage("error", "Missing user", "User ID is required.", 1800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, routeUserId]);

  // ✅ load consultant profile
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const key = keys.find((k) => k.startsWith("aestheticai:user-profile:"));
        if (!key) {
          showMessage("error", "Not signed in", "Consultant profile not found. Please login again.", 1800);
          return;
        }
        const data = await AsyncStorage.getItem(key);
        const parsed = JSON.parse(data || "{}");
        if (parsed?.uid) setConsultant({ id: parsed.uid, ...parsed });
        else showMessage("error", "Invalid profile", "Consultant ID missing. Please login again.", 1800);
      } catch (e) {
        console.error("Error loading profile", e);
        showMessage("error", "Load failed", "Unable to load profile. Try again.", 1600);
      }
    };
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ listen to user info
  useEffect(() => {
    if (!routeUserId) return;

    const unsub = onSnapshot(
      doc(db, "users", String(routeUserId)),
      (snap) => {
        if (snap.exists()) setChatUser(snap.data());
      },
      (err) => {
        console.log("❌ user listener error:", err?.message || err);
        showMessage("error", "Permission error", "Unable to load client profile.", 1600);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeUserId]);

  // ✅ room status + auto complete after 12h
  useEffect(() => {
    if (!roomId) return;

    const unsub = onSnapshot(
      doc(db, "chatRooms", String(roomId)),
      async (snap) => {
        if (!snap.exists()) return;

        const data = snap.data() || {};
        setRoomStatus(data.status);

        if (
          data.status !== "completed" &&
          !completedOnceRef.current &&
          data.createdAt &&
          isAfter12Hours(data.createdAt)
        ) {
          completedOnceRef.current = true;
          try {
            await updateDoc(doc(db, "chatRooms", String(roomId)), {
              status: "completed",
              completedAt: Timestamp.now(),
            });
            showMessage("info", "Chat closed", "This consultation was automatically completed.", 1600);
          } catch (e) {
            console.log("❌ auto-complete error:", e?.message || e);
            completedOnceRef.current = false;
          }
        }
      },
      (err) => {
        console.log("❌ room listener error:", err?.message || err);
        showMessage("error", "Permission error", "Unable to load chat room.", 1600);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ✅ messages listener
  useEffect(() => {
    if (!roomId || !consultant?.id) return;

    setLoading(true);
    const unsub = listenToMessages(String(roomId), (msgs) => {
      setMessages(msgs || []);
      setLoading(false);
    });

    return () => unsub();
  }, [roomId, consultant?.id]);

  const { sendTextMessage, sendFileMessage } = useSendMessage({
    roomId: String(roomId || ""),
    senderId: consultant?.id,
    senderType: "consultant",
    setMessages,
  });

  const isCompleted = roomStatus === "completed";

  const handleSend = async () => {
    const clean = String(text || "").trim();

    if (!roomId) return showMessage("error", "Missing room", "Room ID is required.", 1600);
    if (!consultant?.id) return showMessage("error", "Not signed in", "Consultant profile missing.", 1600);
    if (!clean) return;
    if (isCompleted) return showMessage("info", "Chat closed", "You can no longer send messages.", 1400);
    if (isSending) return;

    setText("");
    setIsSending(true);

    try {
      await sendTextMessage(clean);
    } catch (error) {
      console.error("Send error:", error);
      showMessage("error", "Send failed", "Unable to send message. Check connection or rules.", 1700);
      setText(clean);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileAction = async () => {
    if (!roomId) return showMessage("error", "Missing room", "Room ID is required.", 1600);
    if (!consultant?.id) return showMessage("error", "Not signed in", "Consultant profile missing.", 1600);
    if (isCompleted) return showMessage("info", "Chat closed", "You can no longer send files.", 1400);
    if (isSending) return;

    const file = await pickFile();
    if (!file) return;

    setIsSending(true);
    try {
      await sendFileMessage(file);
      showMessage("success", "Uploaded", "File sent successfully.", 1200);
    } catch (error) {
      console.error("Upload error:", error);
      showMessage("error", "Upload failed", "Unable to upload file.", 1600);
    } finally {
      setIsSending(false);
    }
  };

  const handleCameraAction = async () => {
    if (!roomId) return showMessage("error", "Missing room", "Room ID is required.", 1600);
    if (!consultant?.id) return showMessage("error", "Not signed in", "Consultant profile missing.", 1600);
    if (isCompleted) return showMessage("info", "Chat closed", "You can no longer send photos.", 1400);
    if (isSending) return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showMessage("error", "Permission denied", "Camera access is required to take a photo.", 1700);
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
        showMessage("success", "Uploaded", "Photo sent successfully.", 1200);
      } catch (error) {
        console.error("Camera upload error:", error);
        showMessage("error", "Upload failed", "Unable to upload photo.", 1600);
      } finally {
        setIsSending(false);
      }
    }
  };

  const onLongPressMessage = (item) => {
    const isMe = item.senderType === "consultant";
    if (!consultant?.id) return;
    if (isMe && !item.unsent) {
      handleUnsendMessage(item, String(roomId), consultant.id, setMessages);
    }
  };

  const openUrlSafe = async (url) => {
    try {
      if (!url) return;
      const can = await Linking.canOpenURL(url);
      if (!can) {
        showMessage("error", "Cannot open", "This file link is invalid.", 1600);
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      showMessage("error", "Open failed", "Unable to open the file.", 1600);
    }
  };

  const clientName = chatUser?.name || chatUser?.fullName || "Client";

  // ✅ Determine if this message starts a new sender group
  // IMPORTANT: because list is inverted + we reversed, index+1 is the "previous bubble visually below"
  const isStartOfGroup = (index, item) => {
    const nextItem = chatMessages[index + 1]; // visually below
    if (!nextItem) return true;
    return String(nextItem?.senderType || "") !== String(item?.senderType || "");
  };

  const renderMsg = ({ item, index }) => {
    const isMe = item.senderType === "consultant";
    const isImage = item.type === "image";
    const isFile = item.type === "file";

    const startGroup = isStartOfGroup(index, item);

    return (
      <View style={[styles.messageWrapper, isMe ? styles.myWrapper : styles.theirWrapper]}>
        <View style={{ maxWidth: "80%" }}>
          {/* ✅ GROUP LABEL */}
          {startGroup && (
            <Text style={[styles.groupLabel, isMe ? styles.groupLabelRight : styles.groupLabelLeft]}>
              {isMe ? "You" : clientName}
            </Text>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              if (item.unsent) return;
              if (isImage) setPreviewImage(item.fileUrl);
              else if (isFile) openUrlSafe(item.fileUrl);
            }}
            onLongPress={() => onLongPressMessage(item)}
            style={[
              styles.messageBubble,
              isMe ? styles.myBubble : styles.theirBubble,
              (isImage || isFile) && !item.unsent && styles.mediaBubbleFix,
              item.unsent && styles.unsentBubble,
              // ✅ extra separation between groups
              startGroup && styles.groupStartBubble,
            ]}
          >
            {item.unsent ? (
              <Text style={styles.unsentText}>🚫 Message unsent</Text>
            ) : isImage ? (
              <View style={styles.imageContainer}>
                <Image source={{ uri: item.fileUrl }} style={styles.imageMsg} resizeMode="cover" />
              </View>
            ) : isFile ? (
              <View style={styles.fileRow}>
                <Ionicons name="document-text" size={24} color={isMe ? "#FFF" : "#01579B"} />
                <Text
                  style={[styles.fileText, isMe ? styles.myText : styles.theirText]}
                  numberOfLines={1}
                >
                  {item.fileName || "Document"}
                </Text>
              </View>
            ) : (
              <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>
                {item.text}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ✅ FIX: make footer safe from device navigation / gesture area
  const footerPadBottom = Math.max(insets.bottom, Platform.OS === "ios" ? 12 : 12);
  const listPadBottom = 20 + 70 + footerPadBottom; // 70 ≈ footer height incl. input row

  return (
    <View style={styles.mainContainer}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* HEADER (fixed) */}
      <View style={styles.header}>
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

        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={styles.nameText} numberOfLines={1}>
            {clientName}
          </Text>
          <Text style={styles.statusText}>
            {chatUser?.isOnline ? "Active now" : formatLastSeen(chatUser?.lastSeen)}
          </Text>
        </View>

        {roomStatus === "completed" && (
          <View style={styles.closedChip}>
            <Text style={styles.closedChipText}>Closed</Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.chatArea}>
          {loading ? (
            <View style={styles.centerLoader}>
              <ActivityIndicator color="#005696" />
              <Text style={styles.loadingText}>Loading chat...</Text>
            </View>
          ) : (
            <FlatList
              data={chatMessages}
              renderItem={renderMsg}
              keyExtractor={(i) => i.id || `${i.createdAt?.toMillis?.() || Math.random()}`}
              contentContainerStyle={[styles.listContent, { paddingBottom: listPadBottom }]}
              inverted
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>

        {/* FOOTER */}
        <View style={[styles.footer, { paddingBottom: footerPadBottom }]}>
          <View style={styles.inputWrapper}>
            <TouchableOpacity
              disabled={isCompleted || isSending}
              onPress={handleFileAction}
              style={styles.actionIcon}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={32} color={isCompleted ? "#CBD5E1" : "#005696"} />
            </TouchableOpacity>

            <TouchableOpacity
              disabled={isCompleted || isSending}
              onPress={handleCameraAction}
              style={styles.actionIcon}
              activeOpacity={0.7}
            >
              <Ionicons name="camera" size={32} color={isCompleted ? "#CBD5E1" : "#005696"} />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={setText}
              placeholder={isCompleted ? "Chat closed" : "Type a message..."}
              editable={!isCompleted}
              multiline
              textAlignVertical="center"
            />

            <TouchableOpacity
              onPress={handleSend}
              disabled={!String(text || "").trim() || isSending || isCompleted}
              style={[
                styles.sendBtn,
                String(text || "").trim() && !isCompleted ? styles.sendBtnActive : styles.sendBtnInactive,
              ]}
              activeOpacity={0.8}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="send" size={18} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* IMAGE PREVIEW */}
      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.fullScreenOverlay}>
          <TouchableOpacity style={styles.closePreview} onPress={() => setPreviewImage(null)} activeOpacity={0.8}>
            <Ionicons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
          <Image source={{ uri: previewImage }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>

      {/* MESSAGE MODAL */}
      <Modal visible={msgVisible} transparent animationType="fade" onRequestClose={closeMessage}>
        <Pressable style={styles.msgBackdrop} onPress={closeMessage}>
          <Pressable
            style={[
              styles.msgCard,
              {
                backgroundColor: (MSG_COLORS[msgType] || MSG_COLORS.info).bg,
                borderColor: (MSG_COLORS[msgType] || MSG_COLORS.info).border,
              },
            ]}
            onPress={() => {}}
          >
            <View style={styles.msgRow}>
              <Ionicons
                name={(MSG_COLORS[msgType] || MSG_COLORS.info).icon}
                size={22}
                color={(MSG_COLORS[msgType] || MSG_COLORS.info).iconColor}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                {!!msgTitle && <Text style={styles.msgTitle}>{msgTitle}</Text>}
                {!!msgBody && <Text style={styles.msgBody}>{msgBody}</Text>}
              </View>
            </View>

            <TouchableOpacity style={styles.msgClose} onPress={closeMessage} activeOpacity={0.8}>
              <Ionicons name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#F8F9FA" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 12 : 55,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
    backgroundColor: "#FFF",
    zIndex: 100,
  },
  backBtn: { padding: 5 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginLeft: 5 },
  nameText: { fontSize: 17, fontWeight: "700", color: "#343A40" },
  statusText: { fontSize: 13, color: "#6C757D" },

  closedChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  closedChipText: { fontSize: 12, fontWeight: "800", color: "#64748B" },

  chatArea: { flex: 1, backgroundColor: "#F8F9FA" },
  listContent: { paddingHorizontal: 15, paddingVertical: 20 },

  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  loadingText: { color: "#64748B", fontWeight: "700" },

  messageWrapper: { marginVertical: 4, flexDirection: "row" },
  myWrapper: { justifyContent: "flex-end" },
  theirWrapper: { justifyContent: "flex-start" },

  /* ✅ Group label */
  groupLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    marginBottom: 6,
  },
  groupLabelLeft: { textAlign: "left", paddingLeft: 8 },
  groupLabelRight: { textAlign: "right", paddingRight: 8 },

  messageBubble: {
    maxWidth: "100%",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    elevation: 1,
  },

  /* ✅ bigger spacing at group start so “hiwalay” clearly */
  groupStartBubble: { marginTop: 8 },

  mediaBubbleFix: { padding: 0, overflow: "hidden" },

  myBubble: { backgroundColor: "#005696", borderBottomRightRadius: 4 },
  theirBubble: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E9ECEF",
  },

  unsentBubble: {
    opacity: 0.6,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },

  messageText: { fontSize: 16, lineHeight: 22 },
  myText: { color: "#FFF" },
  theirText: { color: "#495057" },

  unsentText: { color: "#8f2f52", fontStyle: "italic", fontSize: 13, fontWeight: "600" },

  imageContainer: { width: 240, height: 180, backgroundColor: "#E2E8F0" },
  imageMsg: { width: "100%", height: "100%" },

  fileRow: { flexDirection: "row", alignItems: "center", padding: 14, minWidth: 200, gap: 12 },
  fileText: { flex: 1, fontWeight: "600", fontSize: 14 },

  footer: {
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
    paddingHorizontal: 10,
    paddingTop: 10,
    // ✅ removed fixed huge paddingBottom; now handled by safe-area in inline style
    paddingBottom: 12,
    minHeight: 80,
    justifyContent: "center",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    justifyContent: "space-between",
  },
  textInput: {
    flex: 1,
    marginHorizontal: 8,
    backgroundColor: "#F1F3F5",
    borderRadius: 25,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    maxHeight: 100,
    fontSize: 16,
    color: "#212529",
  },
  actionIcon: { padding: 4 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  sendBtnActive: { backgroundColor: "#005696" },
  sendBtnInactive: { backgroundColor: "#CED4DA" },

  fullScreenOverlay: { flex: 1, backgroundColor: "black", justifyContent: "center" },
  closePreview: { position: "absolute", top: 50, right: 20, zIndex: 10 },
  fullImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.8 },

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
    position: "relative",
  },
  msgRow: { flexDirection: "row", alignItems: "flex-start" },
  msgTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  msgBody: { marginTop: 3, fontSize: 13, fontWeight: "700", color: "#475569", lineHeight: 18 },
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
