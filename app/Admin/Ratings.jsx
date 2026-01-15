import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View
} from "react-native";
import { db } from "../../config/firebase";

export default function Ratings() {
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔥 FETCH RATINGS
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "ratings"), async (snapshot) => {
      const items = [];

      for (const snap of snapshot.docs) {
        const data = snap.data();

        // Consultant Name
        let consultantName = "Unknown Consultant";
        if (data.consultantId) {
          const cRef = await getDoc(doc(db, "consultants", data.consultantId));
          if (cRef.exists()) consultantName = cRef.data().fullName;
        }

        // User Name
        let userName = "Unknown User";
        if (data.userId) {
          const uRef = await getDoc(doc(db, "users", data.userId));
          if (uRef.exists()) userName = uRef.data().name;
        }

        items.push({
          id: snap.id,
          consultantName,
          userName,
          rating: data.rating,
          feedback: data.feedback || "No feedback",
        });
      }

      setRatings(items);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // UI
  if (loading) {
    return <ActivityIndicator size="large" style={{ marginTop: 40 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 26, fontWeight: "bold", marginBottom: 15 }}>
        Consultant Ratings Review
      </Text>

      <FlatList
        data={ratings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>Consultant: {item.consultantName}</Text>
            <Text style={styles.user}>User: {item.userName}</Text>
            <Text style={styles.rating}>⭐ Rating: {item.rating}</Text>
            <Text style={styles.feedback}>Feedback: "{item.feedback}"</Text>
          </View>
        )}
      />
    </View>
  );
}

/* ============ STYLES ============ */
const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
  },
  title: { fontSize: 18, fontWeight: "bold" },
  user: { fontSize: 16 },
  rating: { marginTop: 10, fontSize: 18 },
  feedback: { marginTop: 5, fontStyle: "italic" },
});
