import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Alert } from "react-native";
import { db } from "../config/firebase";
import { deleteFromSupabase } from "./fileUploadService";

/**
 * Handle Unsend Message for both User and Consultant
 */
export const handleUnsendMessage = async (
  msg,
  roomId,
  currentUserId,
  setMessages
) => {
  // 1. Basic validation
  if (!msg || !roomId || !currentUserId || !msg.id) return;

  // 2. CHECK PERMISSION
  const isOwner = String(msg.senderId) === String(currentUserId);

  if (!isOwner) {
    // Isinalin sa English: Action Denied
    Alert.alert("Action Denied", "You can only unsend your own messages.");
    return;
  }

  // 3. CONFIRMATION ALERT (Isinalin sa English)
  Alert.alert("Unsend Message", "Do you want to unsend this message?", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Unsend",
      style: "destructive",
      onPress: async () => {
        // ✅ OPTIMISTIC UI
        if (setMessages) {
          setMessages(prev =>
            prev.map(m =>
              m.id === msg.id
                ? { ...m, unsent: true, text: "Message unsent" }
                : m
            )
          );
        }

        try {
          if (!msg.id.toString().startsWith("temp-")) {
            const msgRef = doc(db, "chatRooms", roomId, "messages", msg.id);
            
            // ✅ FIRESTORE UPDATE
            await updateDoc(msgRef, {
              unsent: true,
              text: "Message unsent",
              unsentAt: serverTimestamp(),
            });

            // ✅ SUPABASE DELETE
            if (msg.fileUrl && (msg.type === "image" || msg.type === "file")) {
              try {
                await deleteFromSupabase(msg.fileUrl);
              } catch (err) {
                console.log("⚠️ Storage delete failed (Non-critical):", err);
              }
            }
          }
        } catch (err) {
          console.error("❌ Failed to unsend message:", err);
          // Isinalin sa English: Error message
          Alert.alert("Error", "Could not unsend the message. Please check your connection.");
        }
      },
    },
  ]);
};