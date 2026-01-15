// hooks/useNotifications.js
import {
    collection,
    onSnapshot,
    orderBy,
    query
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../config/firebase";

export const useNotifications = (userId) => {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!userId) return;

    const notifRef = collection(db, "users", userId, "notifications");
    const q = query(notifRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setNotifications(data);

      setUnread(data.filter((n) => !n.isRead).length);
    });

    return unsub;
  }, [userId]);

  return { notifications, unread };
};
