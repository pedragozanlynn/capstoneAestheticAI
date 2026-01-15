import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { Alert } from "react-native";
import { auth, db } from "../config/firebase";
import { uploadToSupabase } from "./fileUploadService";

/**
 * useSendMessage
 * - Pinatibay ang security sa pamamagitan ng pag-verify sa Firebase Auth session
 */
export function useSendMessage({
  roomId,
  senderType, // "user" | "consultant"
  setMessages, 
}) {
  
  // Helper function para i-verify ang Auth
  const getAuthenticatedId = () => {
    const user = auth.currentUser;
    if (!user) {
      console.log("❌ Walang active Firebase Auth session.");
      return null;
    }
    return user.uid;
  };

  // ----------------------------
  // SEND TEXT MESSAGE
  // ----------------------------
  const sendTextMessage = async (text) => {
    const currentUid = getAuthenticatedId();
    if (!text?.trim() || !roomId || !currentUid) {
      if (!currentUid) Alert.alert("Session Expired", "Please log in again.");
      return;
    }

    const tempId = `temp-${Date.now()}`;

    // 🔹 Optimistic UI
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text,
        senderId: currentUid,
        senderType,
        type: "text",
        sending: true,
        failed: false,
        createdAt: new Date(),
      },
    ]);

    try {
      const messagesRef = collection(db, "chatRooms", roomId, "messages");

      const docRef = await addDoc(messagesRef, {
        text,
        senderId: currentUid,
        senderType,
        type: "text",
        createdAt: serverTimestamp(),
        unsent: false,
      });

      // 🔹 Replace temp message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: docRef.id, sending: false }
            : m
        )
      );

      // 🔥 UPDATE METADATA (Idinagdag ang Sender Info)
      await setDoc(
        doc(db, "chatRooms", roomId),
        {
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          lastSenderId: currentUid,    // FIX: Idinagdag ito
          lastSenderType: senderType,  // FIX: Idinagdag ito
          unreadForUser: senderType === "consultant",
          unreadForConsultant: senderType === "user",
        },
        { merge: true }
      );

      return docRef.id;
    } catch (err) {
      console.log("❌ sendTextMessage failed:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, sending: false, failed: true } : m
        )
      );
      throw err;
    }
  };

  // ----------------------------
  // SEND FILE / IMAGE MESSAGE
  // ----------------------------
  const sendFileMessage = async (file) => {
    const currentUid = getAuthenticatedId();
    if (!file || !roomId || !currentUid) return;

    const isImage = file.mimeType?.startsWith("image/");
    const tempId = `temp-file-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        senderId: currentUid,
        senderType,
        type: isImage ? "image" : "file",
        fileName: file.name,
        fileType: file.mimeType,
        localUri: file.uri,
        sending: true,
        failed: false,
        createdAt: new Date(),
      },
    ]);

    try {
      const uploaded = await uploadToSupabase(file);
      if (!uploaded?.fileUrl) throw new Error("Upload failed");

      const messagesRef = collection(db, "chatRooms", roomId, "messages");

      const docRef = await addDoc(messagesRef, {
        text: uploaded.fileName,
        senderId: currentUid,
        senderType,
        type: isImage ? "image" : "file",
        fileUrl: uploaded.fileUrl,
        fileName: uploaded.fileName,
        fileType: uploaded.fileType,
        createdAt: serverTimestamp(),
        unsent: false,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                id: docRef.id,
                sending: false,
                fileUrl: uploaded.fileUrl,
                localUri: null,
              }
            : m
        )
      );

      // 🔥 UPDATE METADATA (Idinagdag ang Sender Info)
      await setDoc(
        doc(db, "chatRooms", roomId),
        {
          lastMessage: isImage ? "📷 Image" : uploaded.fileName,
          lastMessageAt: serverTimestamp(),
          lastSenderId: currentUid,    // FIX: Idinagdag ito
          lastSenderType: senderType,  // FIX: Idinagdag ito
          unreadForUser: senderType === "consultant",
          unreadForConsultant: senderType === "user",
        },
        { merge: true }
      );

      return docRef.id;
    } catch (err) {
      console.log("❌ sendFileMessage failed:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, sending: false, failed: true } : m
        )
      );
      throw err;
    }
  };

  return {
    sendTextMessage,
    sendFileMessage,
  };
}