// services/payConsultantService.js

import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";

export async function payConsultantService(data, amount) {
  try {

    if (!data || !data.consultantId || !data.id || !data.userId) {
      throw new Error("Missing rating data");
    }

    const consultantId = data.consultantId;

    // 1️⃣ Validate Consultant ID
    if (consultantId.trim() === "") {
      throw new Error("consultantId is EMPTY");
    }

    // 2️⃣ Consultant reference
    const consultantRef = doc(db, "consultants", consultantId);
    const consultantSnap = await getDoc(consultantRef);

    if (!consultantSnap.exists()) {
      throw new Error("Consultant not found");
    }

    // 3️⃣ Add earnings to consultant
    await updateDoc(consultantRef, {
      earningsAvailable: increment(amount),
      earningsTotal: increment(amount),
      updatedAt: serverTimestamp(),
    });

    // 4️⃣ Save earning history
    await addDoc(collection(db, "earningHistory"), {
      consultantId: consultantId,
      ratingId: data.id,
      userId: data.userId,
      amount: amount,
      date: serverTimestamp(),
    });

    // 5️⃣ Mark rating as paid
    const ratingRef = doc(db, "ratings", data.id);
    await updateDoc(ratingRef, {
      paid: true,
      paidAt: serverTimestamp(),
    });

    return { status: "success", message: "Consultant paid successfully!" };

  } catch (error) {
    console.error("🔥 PAY CONSULTANT ERROR:", error);
    return { status: "error", message: error.message };
  }
}
