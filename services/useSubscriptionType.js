import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebase";

export default function useSubscriptionType() {
  const [subType, setSubType] = useState("Free");

  useEffect(() => {
    if (!auth.currentUser) return;

    const uid = auth.currentUser.uid;
    const userRef = doc(db, "users", uid);

    const unsubscribe = onSnapshot(userRef, async (snap) => {
      if (!snap.exists()) return;
      let data = snap.data();
      const now = Date.now();
      let expiry = 0;

      if (data.subscription_expires_at?.toDate) {
        expiry = data.subscription_expires_at.toDate().getTime();
      } else if (data.subscription_expires_at?.seconds) {
        expiry = data.subscription_expires_at.seconds * 1000;
      }

      // Determine current subscription
      let currentType = "Free";
      if (expiry && expiry > now) currentType = "Premium";

      setSubType(currentType);

      // Auto-downgrade / upgrade
      if (currentType !== data.subscription_type) {
        const updatePayload =
          currentType === "Premium"
            ? { subscription_type: "Premium" }
            : { subscription_type: "Free", subscription_at: null, subscription_expired_at: null };

        await updateDoc(userRef, updatePayload);
      }
    });

    return () => unsubscribe();
  }, []);

  return subType;
}
