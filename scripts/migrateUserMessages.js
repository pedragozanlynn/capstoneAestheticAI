import { initializeApp } from "firebase/app";
import { collectionGroup, getDocs, getFirestore, updateDoc } from "firebase/firestore";
import { firebaseConfig } from "../config/firebase";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const migrateUserMessages = async () => {
  const messagesSnap = await getDocs(collectionGroup(db, "messages"));
  for (const docSnap of messagesSnap.docs) {
    const data = docSnap.data();
    if (!data.senderType) {
      await updateDoc(docSnap.ref, {
        senderType: "user",
        senderId: data.senderId || "",
        type: data.type || "text"
      });
      console.log("✅ Fixed:", docSnap.id);
    }
  }
  console.log("Migration complete");
};

migrateUserMessages();
