import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker"; // In-add ito
import { useLocalSearchParams, useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
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
  View
} from "react-native";

import { db } from "../../config/firebase";
import { listenToMessages, markUserChatAsRead } from "../../services/chatService";
import { pickFile } from "../../services/fileUploadService";
import { handleUnsendMessage } from "../../services/handleUnsendMessage";
import { useSendMessage } from "../../services/useSendMessage";
import RatingModal from "../components/RatingModal";


const THEME = {
  primary: "#01579B",
  bg: "#F8FAFC",
  textDark: "#0F3E48",
  textGray: "#64748B",
};

export default function ChatRoom() {
  const router = useRouter();
  const { roomId, userId, consultantId } = useLocalSearchParams();
  const auth = getAuth();

  const [user, setUser] = useState(null);
  const [consultant, setConsultant] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [isChatLocked, setIsChatLocked] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [showFileTray, setShowFileTray] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const flatListRef = useRef(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const key = keys.find((k) => k.startsWith("aestheticai:user-profile:"));
        if (!key) return;
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const finalUid = parsed.uid || parsed.id || auth.currentUser?.uid;
          setUser({ ...parsed, uid: finalUid });
        }
      } catch (err) { console.error(err); }
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (!consultantId) return;
    return onSnapshot(doc(db, "consultants", consultantId), (snap) => {
      if (snap.exists()) setConsultant(snap.data());
    });
  }, [consultantId]);

  useEffect(() => {
    if (!roomId) return;
    return onSnapshot(doc(db, "chatRooms", roomId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const createdAt = data.createdAt?.toDate?.();
        const twelveHoursPassed = createdAt && (Date.now() - createdAt.getTime() >= 12 * 60 * 60 * 1000);
        const finished = data.status === "completed" || twelveHoursPassed;
        setIsChatLocked(finished);
        if (finished && !data.ratingSubmitted) setRatingModalVisible(true);
      }
    });
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !user) return;
    setLoading(true);
    const unsub = listenToMessages(roomId, (msgs) => {
        setMessages(msgs);
        setLoading(false);
    });
    markUserChatAsRead(roomId).catch(() => {});
    return () => unsub();
  }, [roomId, user]);

  const { sendTextMessage, sendFileMessage } = useSendMessage({
    roomId,
    senderId: user?.uid,
    senderType: "user",
    setMessages,
  });

  const handleSend = async () => {
    if (!text.trim() || isChatLocked || isSending) return;
    const msg = text.trim();
    setText("");
    setIsSending(true);
    try { await sendTextMessage(msg); } 
    catch (err) { console.log(err); } 
    finally { setIsSending(false); }
  };

  const handleFileAction = async (type = 'gallery') => {
    if (isChatLocked || isSending) return;
    Keyboard.dismiss();
    setShowFileTray(false);

    try {
      const file = await pickFile(type); 
      if (!file) return;

      setIsSending(true);
      await sendFileMessage(file);
    } catch (error) {
      Alert.alert("Error", "Failed to process media.");
    } finally {
      setIsSending(false);
    }
  };

  // BAGONG CAMERA FUNCTION MULA SA CONSULTANT CODE
  const handleCameraAction = async () => {
    if (isChatLocked || isSending) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permission Denied", "We need camera access to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setIsSending(true);
      try {
        await sendFileMessage(result.assets[0]);
      } catch (error) {
        Alert.alert("Error", "Failed to upload photo.");
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
      handleUnsendMessage(item, roomId, item.senderId || myId, setMessages);
    } else {
      Alert.alert("Notice", "You can only unsend your own messages.");
    }
  };

  const renderMessage = ({ item }) => {
    // Ito ang logic para sa kulay ng bubbles
    const isMe = item.senderType === "user";
    const isImage = item.type === "image";
    const isFile = item.type === "file";

    return (
      <View style={[styles.messageWrapper, isMe ? styles.myWrapper : styles.theirWrapper]}>
        <TouchableOpacity
          activeOpacity={0.8}
          delayLongPress={500} // Importante para ma-trigger ang long press
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


  return (
    <View style={styles.mainContainer}>
<StatusBar
  translucent={false}
  backgroundColor="#FFFFFF"
  barStyle="dark-content"
/>

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#0F3E48" />
        </TouchableOpacity>
        <Image
          source={consultant?.gender === "Female" ? require("../../assets/office-woman.png") : require("../../assets/office-man.png")}
          style={styles.avatar}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.nameText}>{consultant?.fullName || "Consultant"}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: consultant?.isOnline ? "#22C55E" : "#94A3B8" }]} />
            <Text style={styles.statusText}>{consultant?.isOnline ? "Active now" : "Offline"}</Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>

        <View style={styles.chatArea}>
          {loading ? (
            <ActivityIndicator style={{ flex: 1 }} color={THEME.primary} />
          ) : (
            <FlatList
              ref={flatListRef}
              data={[...messages].reverse()}
              renderItem={renderMessage}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.listContent}
              inverted
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={false}
            />
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.inputWrapper}>
            {/* TRAY TOGGLE BUTTON */}
            <TouchableOpacity disabled={isChatLocked} onPress={() => { Keyboard.dismiss(); setShowFileTray(!showFileTray); }}>
              <Ionicons name={showFileTray ? "close-circle" : "add-circle"} size={32} color={isChatLocked ? "#CBD5E1" : THEME.primary} />
            </TouchableOpacity>

            {/* DIRECT CAMERA BUTTON (GINAMIT ANG HANDLE CAMERA ACTION) */}
            <TouchableOpacity 
              disabled={isChatLocked} 
              onPress={handleCameraAction}
              style={styles.directCameraBtn}
            >
              <Ionicons name="camera" size={32} color={isChatLocked ? "#CBD5E1" : "#01579B"} />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              value={text}
              editable={!isChatLocked}
              placeholder={isChatLocked ? "Chat completed" : "Message..."}
              onChangeText={(t) => { setText(t); if(showFileTray) setShowFileTray(false); }}
              multiline
            />

            <TouchableOpacity
              style={[styles.sendBtn, text.trim() && !isChatLocked ? styles.sendBtnActive : styles.sendBtnInactive]}
              disabled={!text.trim() || isChatLocked || isSending}
              onPress={handleSend}
            >
              {isSending ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>

          {showFileTray && !isChatLocked && (
            <View style={styles.tray}>
              <TouchableOpacity style={styles.trayItem} onPress={() => handleFileAction('gallery')}>
                <View style={[styles.trayIcon, { backgroundColor: '#E0F2FE' }]}><Ionicons name="image" size={26} color="#0284C7" /></View>
                <Text style={styles.trayLabel}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.trayItem} onPress={() => handleFileAction('file')}>
                <View style={[styles.trayIcon, { backgroundColor: '#DCFCE7' }]}><Ionicons name="document" size={26} color="#16A34A" /></View>
                <Text style={styles.trayLabel}>File</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View >

      <Modal visible={!!previewImage} transparent animationType="fade">
        <View style={styles.fullScreenOverlay}>
          <TouchableOpacity style={styles.closePreview} onPress={() => setPreviewImage(null)}><Ionicons name="close" size={30} color="#FFF" /></TouchableOpacity>
          <Image source={{ uri: previewImage }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>

      <RatingModal
        visible={ratingModalVisible}
        reviewerName={user?.fullName || user?.name || "Anonymous"}
        onClose={() => setRatingModalVisible(false)}
        onSubmit={async ({ rating, feedback, reviewerName }) => {
          try {
            await addDoc(collection(db, "ratings"), { roomId, userId: user?.uid, consultantId, rating, feedback, reviewerName, createdAt: serverTimestamp() });
            await updateDoc(doc(db, "chatRooms", roomId), { ratingSubmitted: true, status: "completed" });
            return true;
          } catch (err) { return false; }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: THEME.bg },
  header: { 
    flexDirection: "row", alignItems: "center", paddingHorizontal: 15, 
    height: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 70 : 110,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 50,
    borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#FFF",
  },
  backBtn: { padding: 5 },
  avatar: { width: 42, height: 42, borderRadius: 21, marginLeft: 5 },
  headerInfo: { marginLeft: 12 },
  nameText: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  statusText: { fontSize: 12, color: "#64748B" },
  chatArea: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 20 },
  messageWrapper: { marginVertical: 6, flexDirection: "row" },
  myWrapper: { justifyContent: "flex-end" },
  theirWrapper: { justifyContent: "flex-start" },
  messageBubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  myBubble: { backgroundColor: "#01579B", borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: "#FFF", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "#E2E8F0" },
  mediaBubbleFix: { padding: 0, overflow: 'hidden' },
  unsentBubble: { opacity: 0.6, borderStyle: "dashed", borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  messageText: { fontSize: 15, lineHeight: 22 },
  myText: { color: "#FFF" },
  theirText: { color: "#334155" },
  unsentRow: { flexDirection: 'row', alignItems: 'center' },
  unsentText: { color: "#8f2f52", fontStyle: 'italic', fontSize: 13, fontWeight: "600" },
  imageContainer: { width: 230, height: 170 },
  imageMsg: { width: "100%", height: "100%", borderRadius: 15 },
  fileRow: { flexDirection: "row", alignItems: "center", padding: 12, minWidth: 180 },
  fileText: { marginLeft: 10, fontWeight: "600", fontSize: 14 },
  footer: { 
    backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: "#E2E8F0", 
    paddingHorizontal: 12, paddingTop: 10, 
    paddingBottom: Platform.OS === 'ios' ? 35 : 15, 
    minHeight: Platform.OS === 'ios' ? 100 : 80, justifyContent: 'center'
  },
  inputWrapper: { flexDirection: "row", alignItems: "center" },
  directCameraBtn: { marginLeft: 5 },
  textInput: { flex: 1, marginLeft: 8, marginRight: 8, backgroundColor: "#F1F5F9", borderRadius: 22, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 8, maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  sendBtnActive: { backgroundColor: "#01579B" },
  sendBtnInactive: { backgroundColor: "#CBD5E1" },
  tray: { flexDirection: "row", justifyContent: "space-around", paddingTop: 15, height: 100 },
  trayItem: { alignItems: 'center' },
  trayIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  trayLabel: { fontSize: 12, color: '#64748B' },
  fullScreenOverlay: { flex: 1, backgroundColor: "black", justifyContent: "center" },
  closePreview: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  fullImage: {
    width: "100%",
    height: "100%",
  }
  });