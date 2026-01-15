// services/chatService.js
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc, // ✅ ADD ONLY
} from "firebase/firestore";
import { db } from "../config/firebase";

export const ensureChatRoom = async (appointmentId, userId, consultantId) => {
  const roomId = `appointment_${appointmentId}`;
  const roomRef = doc(db, "chatRooms", roomId);

  const snap = await getDoc(roomRef);

  if (!snap.exists()) {
    await setDoc(roomRef, {
      appointmentId,
      userId,
      consultantId,
      createdAt: serverTimestamp(),
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      lastSenderId: "",
      lastSenderType: "",
      unreadForUser: false,
      unreadForConsultant: false,
    });
  }

  return roomId;
};

export const listenToMessages = (roomId, callback) => {
  const messagesRef = collection(db, "chatRooms", roomId, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(messages);
  });
};

/* =================================================
   ✅ ADD ONLY BELOW (NO CHANGES ABOVE)
================================================= */

export const markUserChatAsRead = async (roomId) => {
  if (!roomId) return;

  try {
    await updateDoc(doc(db, "chatRooms", roomId), {
      unreadForUser: false,
    });
  } catch (err) {
    console.log("❌ markUserChatAsRead error:", err);
  }
};

export const markConsultantChatAsRead = async (roomId) => {
  if (!roomId) return;

  try {
    await updateDoc(doc(db, "chatRooms", roomId), {
      unreadForConsultant: false,
    });
  } catch (err) {
    console.log("❌ markConsultantChatAsRead error:", err);
  }
};
