import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../config/firebase";

const PRIMARY = "#2c4f4f";

export default function BookConsultation() {
  const router = useRouter();

  // ✅ RECEIVE appointmentAt (ISO STRING)
  const { consultantId, appointmentAt, notes, fee } =
    useLocalSearchParams();

  const [consultant, setConsultant] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ Convert ISO → Date
  const appointmentDate = appointmentAt
    ? new Date(appointmentAt)
    : null;

  /* ================= FETCH CONSULTANT ================= */
  useEffect(() => {
    const fetchConsultant = async () => {
      try {
        const ref = doc(db, "consultants", consultantId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setConsultant({
            id: snap.id,
            ...snap.data(),
          });
        }
      } catch (error) {
        console.log("❌ Error fetching consultant:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchConsultant();
  }, [consultantId]);

  /* ================= CONFIRM BOOKING ================= */
  const handleConfirm = async () => {
    try {
      if (!consultant?.id || !appointmentDate) {
        alert("Invalid appointment data.");
        return;
      }

      const userId = auth.currentUser?.uid;

      await addDoc(collection(db, "appointments"), {
        consultantId: consultant.id,
        userId,

        // ✅ SINGLE SOURCE OF TRUTH
        appointmentAt: Timestamp.fromDate(appointmentDate),

        notes: notes || "",
        sessionFee: Number(fee) || 0,

        status: "pending",
        createdAt: serverTimestamp(),
      });

      alert("Appointment successfully booked!");
      router.replace("/User/Home");
    } catch (err) {
      console.log("❌ Error saving appointment:", err);
      alert("Failed to book appointment.");
    }
  };

  /* ================= LOADING ================= */
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  if (!consultant || !appointmentDate) {
    return (
      <View style={styles.center}>
        <Text>Invalid appointment details.</Text>
      </View>
    );
  }

  /* ================= UI ================= */
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Review Appointment</Text>
      <Text style={styles.subtitle}>
        Please review the details before confirming
      </Text>

      {/* CONSULTANT INFO */}
      <View style={styles.card}>
        <Text style={styles.section}>Consultant</Text>

        <Info label="Name" value={consultant.fullName} />
        <Info label="Specialization" value={consultant.specialization} />
        <Info label="Type" value={consultant.consultantType} />
      </View>

      {/* APPOINTMENT INFO */}
      <View style={styles.card}>
        <Text style={styles.section}>Schedule</Text>

        <Info
          label="Date"
          value={appointmentDate.toLocaleDateString()}
        />
        <Info
          label="Time"
          value={appointmentDate.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        />
        <Info
          label="Notes"
          value={notes || "No message provided"}
        />
      </View>

      {/* CTA */}
      <TouchableOpacity style={styles.button} onPress={handleConfirm}>
        <Text style={styles.buttonText}>Confirm Booking</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ================= SMALL COMPONENT ================= */

const Info = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#faf9f6",
    padding: 22,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    color: PRIMARY,
    textAlign: "center",
    marginTop: 10,
  },

  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E1E8EA",
    elevation: 2,
  },

  section: {
    fontSize: 16,
    fontWeight: "700",
    color: PRIMARY,
    marginBottom: 12,
  },

  row: {
    marginBottom: 10,
  },

  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#777",
  },

  value: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
    marginTop: 2,
  },

  button: {
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 10,
  },

  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
  },
});
