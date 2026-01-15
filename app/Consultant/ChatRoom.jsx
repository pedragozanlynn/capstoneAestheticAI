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
  Alert,
  Dimensions,
  Keyboard,
} from "react-native";

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

export default function ChatRoom() {
  const router = useRouter();
  const { roomId, userId: routeUserId } = useLocalSearchParams();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [consultant, setConsultant] = useState(null);
  const [chatUser, setChatUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roomStatus, setRoomStatus] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const chatMessages = useMemo(() => {
    return [...messages].reverse();
  }, [messages]);

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

  useEffect(() => {
    if (!routeUserId) return;
    const unsub = onSnapshot(doc(db, "users", routeUserId), (snap) => {
      if (snap.exists()) setChatUser(snap.data());
    });
    return () => unsub();
  }, [routeUserId]);

  useEffect(() => {
    if (!roomId) return;
    const unsub = onSnapshot(doc(db, "chatRooms", roomId), async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setRoomStatus(data.status);
      
      if (data.status !== "completed" && isAfter12Hours(data.createdAt)) {
        await updateDoc(doc(db, "chatRooms", roomId), {
          status: "completed",
          completedAt: Timestamp.now(),
        });
      }
    });
    return () => unsub();
  }, [roomId]);

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

  const isCompleted = roomStatus === "completed";

  const handleSend = async () => {
    if (!text.trim() || isCompleted || isSending) return;
    const msgToSend = text.trim();
    setText("");
    setIsSending(true);
    try {
      await sendTextMessage(msgToSend);
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
    if (status !== 'granted') {
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
            <Text style={styles.unsentText}>🚫 Message unsent</Text>
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
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* HEADER: Outside KeyboardAvoidingView to keep it fixed */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#0F3E48" />
        </TouchableOpacity>
        <Image
          source={chatUser?.gender === "Female" ? require("../../assets/office-woman.png") : require("../../assets/office-man.png")}
          style={styles.avatar}
        />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={styles.nameText} numberOfLines={1}>{chatUser?.name || "Client"}</Text>
          <Text style={styles.statusText}>
            {chatUser?.isOnline ? "Active now" : formatLastSeen(chatUser?.lastSeen)}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
       style={{ flex: 1 }}
       behavior={Platform.OS === "ios" ? "padding" : "height"} // Subukan ang "height" sa Android kung ayaw ng undefined
       keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.chatArea}>
          {loading ? (
            <ActivityIndicator style={{ flex: 1 }} color="#005696" />
          ) : (
            <FlatList
              data={chatMessages}
              renderItem={renderMsg}
              keyExtractor={(i) => i.id || Math.random().toString()}
              contentContainerStyle={styles.listContent}
              inverted 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.inputWrapper}>
            <TouchableOpacity 
              disabled={isCompleted}
              onPress={handleFileAction}
              style={styles.actionIcon}
            >
              <Ionicons name="add-circle" size={32} color={isCompleted ? "#CCC" : "#005696"} />
            </TouchableOpacity>

            <TouchableOpacity 
              disabled={isCompleted}
              onPress={handleCameraAction}
              style={styles.actionIcon}
            >
              <Ionicons name="camera" size={32} color={isCompleted ? "#CCC" : "#005696"} />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={(t) => setText(t)}
              placeholder={isCompleted ? "Chat closed" : "Type a message..."}
              editable={!isCompleted}
              multiline
            />

            <TouchableOpacity 
              onPress={handleSend} 
              disabled={!text.trim() || isSending || isCompleted}
              style={[styles.sendBtn, (text.trim() && !isCompleted) ? styles.sendBtnActive : styles.sendBtnInactive]}
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
  mainContainer: { flex: 1, backgroundColor: "#F8F9FA" },
  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 15, 
    // Manual handling of padding to prevent double space or "sobrang taas"
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 55,
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
  chatArea: { flex: 1, backgroundColor: "#F8F9FA" },
  listContent: { paddingHorizontal: 15, paddingVertical: 20 },
  messageWrapper: { marginVertical: 4, flexDirection: "row" },
  myWrapper: { justifyContent: "flex-end" },
  theirWrapper: { justifyContent: "flex-start" },
  messageBubble: { 
    maxWidth: "75%", 
    paddingVertical: 10, 
    paddingHorizontal: 16, 
    borderRadius: 20,
    elevation: 1,
  },
  mediaBubbleFix: { padding: 0, overflow: 'hidden' },
  myBubble: { backgroundColor: "#005696", borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: "#FFF", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "#E9ECEF" },
  unsentBubble: { opacity: 0.6, borderStyle: "dashed", borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  messageText: { fontSize: 16, lineHeight: 22 },
  myText: { color: "#FFF" },
  theirText: { color: "#495057" },
  unsentText: { color: "#8f2f52", fontStyle: 'italic', fontSize: 13, fontWeight: "600" },
  imageContainer: { width: 240, height: 180, backgroundColor: '#E2E8F0' },
  imageMsg: { width: "100%", height: "100%" },
  fileRow: { flexDirection: "row", alignItems: "center", padding: 14, minWidth: 200, gap: 12 },
  fileText: { flex: 1, fontWeight: "600", fontSize: 14, color: "#FFF" },
  footer: { 
    backgroundColor: "#FFF", 
    borderTopWidth: 1, 
    borderTopColor: "#E9ECEF", 
    paddingHorizontal: 10,
    paddingTop: 10,
    // Para hindi magbago ang sukat ng footer kahit mag-type
    paddingBottom: Platform.OS === 'ios' ? 35 : 15, 
    height: Platform.OS === 'ios' ? 100 : 80, 
    justifyContent: 'center', 
  },
  inputWrapper: { 
    flexDirection: "row", 
    alignItems: "center",
    height: 50, 
    justifyContent: "space-between" 
  },
  textInput: { 
    flex: 1, 
    marginHorizontal: 8, 
    backgroundColor: "#F1F3F5", 
    borderRadius: 25, 
    paddingHorizontal: 18, 
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    maxHeight: 100,
    fontSize: 16,
    color: '#212529'
  },
  actionIcon: { padding: 4 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendBtnActive: { backgroundColor: "#005696" },
  sendBtnInactive: { backgroundColor: "#CED4DA" },
  fullScreenOverlay: { flex: 1, backgroundColor: "black", justifyContent: "center" },
  closePreview: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  fullImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.8 },
});