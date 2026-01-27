// services/userService.js
import { doc, getDoc, onSnapshot } from "firebase/firestore";

export const subscribeToProStatus = ({ db, uid, onChange, onError }) => {
  if (!uid) return () => {};

  const userDocRef = doc(db, "users", uid);

  const unsub = onSnapshot(
    userDocRef,
    (snap) => {
      const d = snap.data() || {};
      const pro = d?.isPro === true;
      onChange?.(pro);
    },
    (err) => onError?.(err)
  );

  return () => {
    try {
      unsub?.();
    } catch {}
  };
};

export const getProStatusOnce = async ({ db, uid }) => {
  if (!uid) return false;
  const snap = await getDoc(doc(db, "users", uid));
  const d = snap.data() || {};
  return d?.isPro === true;
};
