import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * Listen to user notifications (real-time)
 */
export const listenToNotifications = (userId, callback) => {
  const q = query(
    collection(db, "users", userId, "notifications"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const notifs = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    callback(notifs);
  });
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (userId, notificationId) => {
  const ref = doc(db, "users", userId, "notifications", notificationId);
  await updateDoc(ref, { read: true });
};
