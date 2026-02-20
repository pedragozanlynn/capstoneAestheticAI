// ✅ UPDATED (oldest -> newest ONLY + keep keyboard-safe + scrollable)
// - Removed inverted list
// - FlatList reserves space using paddingBottom (since NOT inverted)
// - scrollToBottomSafe uses scrollToEnd (since NOT inverted)
// - Keeps: Android keyboard lift + footer height measurement
// - Keeps: "do not force scroll on every snapshot update" (so user can scroll)
//
// ✅ CHANGE (YOUR REQUEST):
// - Tap "+" icon = DIRECT FILE picker (documents) (no tray)
// - Long-press "+" icon = DIRECT GALLERY picker (photos) (optional but useful)
// - Tray UI removed to avoid extra UI and to ensure no break

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { db } from "../../config/firebase";
import { listenToMessages, markUserChatAsRead } from "../../services/chatService";
import { pickFile } from "../../services/fileUploadService";
import { handleUnsendMessage } from "../../services/handleUnsendMessage";
import { useSendMessage } from "../../services/useSendMessage";
import RatingModal from "../components/RatingModal";

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export default function ChatRoom() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const auth = getAuth();
  const insets = useSafeAreaInsets();

  const toStrParam = (v) => (Array.isArray(v) ? v[0] : v ? String(v) : "");
  const roomIdStr = toStrParam(params.roomId);
  const consultantIdStr = toStrParam(params.consultantId);

  const [user, setUser] = useState(null);
  const [consultant, setConsultant] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [isChatLocked, setIsChatLocked] = useState(false);

  const [previewImage, setPreviewImage] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [textError, setTextError] = useState("");

  const flatListRef = useRef(null);

  // ✅ Android keyboard height
  const [kbHeight, setKbHeight] = useState(0);

  // ✅ Footer height
  const [footerHeight, setFooterHeight] = useState(90);

  const safeStr = (v) => String(v ?? "").trim();
  const isNonEmpty = (v) => safeStr(v).length > 0;

  const validateChatContext = () => {
    if (!isNonEmpty(roomIdStr)) return "Missing roomId.";
    if (!isNonEmpty(consultantIdStr)) return "Missing consultantId.";
    const uid = String(auth.currentUser?.uid || user?.uid || "").trim();
    if (!uid) return "Missing user session.";
    return "";
  };

  const validateTextMessage = (msg) => {
    const s = safeStr(msg);
    if (!s) return "Please type a message before sending.";
    if (s.length > 2000) return "Message is too long (max 2000 characters).";
    return "";
  };

  const validateFile = (file) => {
    if (!file) return "No file selected.";
    const uri = safeStr(file.uri || file?.fileUri || file?.path);
    if (!uri) return "Selected file is invalid. Please choose another file.";
    return "";
  };

  const getReviewerNameSafe = async (uid) => {
    try {
      const cleanUid = safeStr(uid);
      if (!cleanUid) return "Anonymous";

      const uSnap = await getDoc(doc(db, "users", cleanUid));
      if (!uSnap.exists()) return "Anonymous";

      const u = uSnap.data() || {};
      return (
        safeStr(u.fullName) ||
        safeStr(u.name) ||
        safeStr(u.displayName) ||
        safeStr(u.username) ||
        "Anonymous"
      );
    } catch {
      return "Anonymous";
    }
  };

  // ✅ NOT inverted => scrollToEnd is correct
  const scrollToBottomSafe = (delay = 60) => {
    setTimeout(() => {
      try {
        flatListRef.current?.scrollToEnd?.({ animated: true });
      } catch {}
    }, delay);
  };

  /* ================= ANDROID KEYBOARD ================= */
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subShow = Keyboard.addListener("keyboardDidShow", (e) => {
      setKbHeight(e?.endCoordinates?.height || 0);
      scrollToBottomSafe(80);
    });

    const subHide = Keyboard.addListener("keyboardDidHide", () => {
      setKbHeight(0);
    });

    return () => {
      subShow?.remove?.();
      subHide?.remove?.();
    };
  }, []);

  /* ================= LOAD USER ================= */
  useEffect(() => {
    const loadUser = async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const key = keys.find((k) => k.startsWith("aestheticai:user-profile:"));
        if (!key) return;

        const raw = await AsyncStorage.getItem(key);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        const finalUid = parsed.uid || parsed.id || auth.currentUser?.uid;
        setUser({ ...parsed, uid: finalUid });
      } catch (err) {
        console.error(err);
      }
    };
    loadUser();
  }, [auth]);

  useEffect(() => {
    if (!consultantIdStr) return;
    return onSnapshot(doc(db, "consultants", consultantIdStr), (snap) => {
      if (snap.exists()) setConsultant(snap.data());
    });
  }, [consultantIdStr]);

  /* ================= LOCK / RATING ================= */
  useEffect(() => {
    if (!roomIdStr) return;

    return onSnapshot(doc(db, "chatRooms", roomIdStr), (snap) => {
      if (!snap.exists()) return;

      const data = snap.data() || {};
      const status = String(data.status || "").toLowerCase();
      const consultantStatus = String(data.consultantStatus || "").toLowerCase();

      const ratingRequired = !!data.ratingRequiredForUser;
      const ratingSubmitted = !!data.ratingSubmitted;

      const createdAt = data.createdAt?.toDate?.();
      const twelveHoursPassed = createdAt && Date.now() - createdAt.getTime() >= TWELVE_HOURS;

      const finished =
        ratingRequired ||
        status === "completed" ||
        consultantStatus === "completed" ||
        twelveHoursPassed;

      setIsChatLocked(finished);
      if (finished && !ratingSubmitted) setRatingModalVisible(true);
    });
  }, [roomIdStr]);

  /* ================= MESSAGES ================= */
  useEffect(() => {
    if (!roomIdStr || !user) return;
    setLoading(true);

    const unsub = listenToMessages(roomIdStr, (msgs) => {
      setMessages(msgs);
      setLoading(false);
      // ✅ IMPORTANT: DO NOT force scroll here (keeps manual scroll working)
    });

    markUserChatAsRead(roomIdStr).catch(() => {});
    return () => unsub();
  }, [roomIdStr, user]);

  const { sendTextMessage, sendFileMessage } = useSendMessage({
    roomId: roomIdStr,
    senderId: user?.uid,
    senderType: "user",
    setMessages,
  });

  /* ================= ACTIONS ================= */
  const handleSend = async () => {
    if (isChatLocked || isSending) return;

    const ctxErr = validateChatContext();
    if (ctxErr) {
      Alert.alert("Cannot send message", "Please reopen the conversation.");
      return;
    }

    const msg = safeStr(text);
    const err = validateTextMessage(msg);
    if (err) {
      setTextError(err);
      return;
    }

    setTextError("");
    setText("");
    setIsSending(true);

    try {
      await sendTextMessage(msg);
      scrollToBottomSafe(80);
    } catch {
      Alert.alert("Send failed", "Unable to send your message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleFileAction = async (type = "gallery") => {
    if (isChatLocked || isSending) return;

    const ctxErr = validateChatContext();
    if (ctxErr) {
      Alert.alert("Cannot attach file", "Please reopen the conversation.");
      return;
    }

    Keyboard.dismiss();

    try {
      const file = await pickFile(type);
      if (!file) return;

      const fileErr = validateFile(file);
      if (fileErr) {
        Alert.alert("Invalid file", fileErr);
        return;
      }

      setIsSending(true);
      await sendFileMessage(file);
      scrollToBottomSafe(80);
    } catch {
      Alert.alert("Upload failed", "Failed to process the selected media.");
    } finally {
      setIsSending(false);
    }
  };

  const handleCameraAction = async () => {
    if (isChatLocked || isSending) return;

    const ctxErr = validateChatContext();
    if (ctxErr) {
      Alert.alert("Cannot open camera", "Please reopen the conversation.");
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera Permission Needed", "Please allow camera access.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets?.length) {
      const asset = result.assets[0];
      const fileErr = validateFile(asset);
      if (fileErr) {
        Alert.alert("Invalid photo", "Please try again.");
        return;
      }

      setIsSending(true);
      try {
        await sendFileMessage(asset);
        scrollToBottomSafe(80);
      } catch {
        Alert.alert("Upload failed", "Failed to upload photo. Please try again.");
      } finally {
        setIsSending(false);
      }
    }
  };

  const onLongPressMessage = (item) => {
    if (item.unsent || !user?.uid) return;

    const myId = String(user.uid).trim();
    const msgSenderId = String(item.senderId).trim();
    const isMine = item.senderType === "user" || myId === msgSenderId;

    if (isMine) {
      handleUnsendMessage(item, roomIdStr, item.senderId || myId, setMessages);
    } else {
      Alert.alert("Notice", "You can only unsend your own messages.");
    }
  };

  const renderMessage = ({ item }) => {
    const isMe = item.senderType === "user";
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
            <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>
              {item.text}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const headerTopPad =
    Platform.OS === "android"
      ? Math.max(insets.top, StatusBar.currentHeight || 0)
      : insets.top;

  const footerBottom = Platform.OS === "android" ? kbHeight : 0;

  // ✅ NOT inverted => reserve footer space using paddingBottom
  const listPadBottom =
    footerHeight +
    Math.max(insets.bottom, Platform.OS === "ios" ? 35 : 15) +
    (Platform.OS === "android" ? kbHeight : 0);

  return (
    <View style={styles.mainContainer}>
      <StatusBar translucent={false} backgroundColor="#FFFFFF" barStyle="dark-content" />

      <View style={[styles.header, { paddingTop: headerTopPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#0F3E48" />
        </TouchableOpacity>

        <Image
          source={
            consultant?.gender === "Female"
              ? require("../../assets/office-woman.png")
              : require("../../assets/office-man.png")
          }
          style={styles.avatar}
        />

        <View style={styles.headerInfo}>
          <Text style={styles.nameText}>{consultant?.fullName || "Consultant"}</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: consultant?.isOnline ? "#22C55E" : "#94A3B8" },
              ]}
            />
            <Text style={styles.statusText}>
              {consultant?.isOnline ? "Active now" : "Offline"}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.chatArea}>
          {loading ? (
            <ActivityIndicator style={{ flex: 1 }} color="#01579B" />
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages} // ✅ oldest -> newest (service query is asc)
              renderItem={renderMessage}
              keyExtractor={(i) => i.id}
              contentContainerStyle={[styles.listContent, { paddingBottom: listPadBottom }]}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={false}
            />
          )}
        </View>

        <View
          onLayout={(e) => {
            const h = e?.nativeEvent?.layout?.height || 0;
            if (h > 0 && Math.abs(h - footerHeight) > 2) setFooterHeight(h);
          }}
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 35 : 15),
              bottom: footerBottom,
            },
          ]}
        >
          <View style={styles.inputWrapper}>
            {/* ✅ "+" = FILE picker (documents) */}
            <TouchableOpacity
              disabled={isChatLocked || isSending}
              onPress={() => {
                Keyboard.dismiss();
                handleFileAction("file");
              }}
              // ✅ optional: long press = gallery
              onLongPress={() => {
                Keyboard.dismiss();
                handleFileAction("gallery");
              }}
            >
              <Ionicons
                name="add-circle"
                size={32}
                color={isChatLocked || isSending ? "#CBD5E1" : "#01579B"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              disabled={isChatLocked || isSending}
              onPress={handleCameraAction}
              style={styles.directCameraBtn}
            >
              <Ionicons
                name="camera"
                size={32}
                color={isChatLocked || isSending ? "#CBD5E1" : "#01579B"}
              />
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <TextInput
                style={[styles.textInput, !!textError && styles.textInputError]}
                value={text}
                editable={!isChatLocked}
                placeholder={isChatLocked ? "Chat completed" : "Message..."}
                onChangeText={(t) => {
                  setText(t);
                  if (textError) setTextError("");
                }}
                multiline
                onFocus={() => scrollToBottomSafe(80)}
              />
              {!!textError && <Text style={styles.errorText}>{textError}</Text>}
            </View>

            <TouchableOpacity
              style={[
                styles.sendBtn,
                text.trim() && !isChatLocked ? styles.sendBtnActive : styles.sendBtnInactive,
              ]}
              disabled={!text.trim() || isChatLocked || isSending}
              onPress={handleSend}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
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

      <RatingModal
        visible={ratingModalVisible}
        reviewerName={user?.fullName || user?.name || "Anonymous"}
        onClose={() => setRatingModalVisible(false)}
        onSubmit={async ({ rating, feedback }) => {
          try {
            const authUid = String(auth.currentUser?.uid || user?.uid || "").trim();
            if (!authUid) return false;

            const reviewerNameFromUsers = await getReviewerNameSafe(authUid);

            await addDoc(collection(db, "ratings"), {
              roomId: String(roomIdStr),
              appointmentId: String(roomIdStr),
              userId: authUid,
              consultantId: String(consultantIdStr || ""),
              rating: Number(rating),
              feedback: String(feedback || ""),
              reviewerName: reviewerNameFromUsers,
              createdAt: serverTimestamp(),
            });

            await updateDoc(doc(db, "chatRooms", String(roomIdStr)), {
              ratingSubmitted: true,
              ratingRequiredForUser: false,
              status: "completed",
              completedAt: serverTimestamp(),
            });

            await updateDoc(doc(db, "appointments", String(roomIdStr)), {
              status: "completed",
              completedAt: serverTimestamp(),
            });

            return true;
          } catch (err) {
            console.log("❌ rating submit error:", err?.message || err);
            return false;
          }
        }}
      />
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
  },

  backBtn: { padding: 5 },
  avatar: { width: 42, height: 42, borderRadius: 21, marginLeft: 5 },
  headerInfo: { marginLeft: 12 },
  nameText: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  statusText: { fontSize: 12, color: "#64748B" },

  chatArea: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 20 },

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
    maxHeight: 100,
    borderWidth: 1,
    borderColor: "transparent",
  },
  textInputError: { borderColor: "#DC2626" },

  errorText: {
    marginTop: 6,
    marginLeft: 12,
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "800",
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
  fullImage: { width: "100%", height: "100%" },
});
