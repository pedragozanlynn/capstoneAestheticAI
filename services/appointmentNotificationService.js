import { db } from "../config/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  updateDoc,
} from "firebase/firestore";

export const listenToNotifications = (uid, cb) => {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cb(list);
  });
};

export const markNotificationAsRead = (uid, notifId) => {
  // uid not needed now, but keep signature to avoid changing your screen
  return updateDoc(doc(db, "notifications", notifId), { read: true });
};
