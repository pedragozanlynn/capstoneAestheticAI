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
  ScrollView,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth, db } from "../../config/firebase";

const PRIMARY = "#2c4f4f";
const ACCENT = "#01579B";

export default function BookConsultation() {
  const router = useRouter();
  const { consultantId, appointmentAt, notes, fee } = useLocalSearchParams();

  const [consultant, setConsultant] = useState(null);
  const [loading, setLoading] = useState(true);

  const appointmentDate = appointmentAt ? new Date(appointmentAt) : null;

  useEffect(() => {
    const fetchConsultant = async () => {
      try {
        const ref = doc(db, "consultants", consultantId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setConsultant({ id: snap.id, ...snap.data() });
        }
      } catch (error) {
        console.log("❌ Error fetching consultant:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchConsultant();
  }, [consultantId]);

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={PRIMARY} />
          </TouchableOpacity>
          <Text style={styles.title}>Review & Confirm</Text>
          <View style={{ width: 40 }} /> 
        </View>

        <Text style={styles.subtitle}>
          Please check the details of your consultation session.
        </Text>

        {/* CONSULTANT CARD */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle-outline" size={24} color={ACCENT} />
            <Text style={styles.sectionTitle}>Consultant Information</Text>
          </View>
          <View style={styles.divider} />
          <Info label="Name" value={consultant?.fullName} />
          <Info label="Specialization" value={consultant?.specialization} />
          <Info label="Type" value={consultant?.consultantType} />
        </View>

        {/* SCHEDULE CARD */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={24} color={ACCENT} />
            <Text style={styles.sectionTitle}>Schedule Details</Text>
          </View>
          <View style={styles.divider} />
          <Info label="Date" value={appointmentDate?.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} />
          <Info label="Time" value={appointmentDate?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
          <Info label="Notes" value={notes || "No additional notes provided."} isNotes />
        </View>

        {/* PAYMENT SUMMARY CARD */}
        <View style={styles.paymentCard}>
          <Text style={styles.paymentTitle}>Payment Summary</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Consultation Fee</Text>
            <Text style={styles.priceValue}>₱{Number(fee).toFixed(2)}</Text>
          </View>
          <View style={[styles.priceRow, { marginTop: 8 }]}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>₱{Number(fee).toFixed(2)}</Text>
          </View>
          <View style={styles.infoBox}>
            <Ionicons name="time-outline" size={16} color="#0369A1" />
            <Text style={styles.infoText}>Chat access is valid for 12 hours after confirmation.</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleConfirm}>
          <Text style={styles.buttonText}>Confirm & Book Now</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const Info = ({ label, value, isNotes }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, isNotes && styles.notesValue]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { padding: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backBtn: {
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  title: { fontSize: 22, fontWeight: "900", color: PRIMARY },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 25,
    lineHeight: 20,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: PRIMARY },
  divider: { hieght: 1, backgroundColor: '#F1F5F9', height: 1, marginBottom: 15 },

  row: { marginBottom: 15 },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 15, fontWeight: "600", color: "#1E293B", marginTop: 4 },
  notesValue: { fontStyle: 'italic', color: '#475569', fontWeight: '400' },

  paymentCard: {
    backgroundColor: "#F0F9FF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  paymentTitle: { fontSize: 16, fontWeight: "800", color: "#0369A1", marginBottom: 15 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 14, color: "#0369A1" },
  priceValue: { fontSize: 15, fontWeight: "700", color: "#0369A1" },
  totalLabel: { fontSize: 16, fontWeight: "800", color: PRIMARY },
  totalValue: { fontSize: 20, fontWeight: "900", color: ACCENT },
  
  infoBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginTop: 15, 
    backgroundColor: 'rgba(255,255,255,0.5)', 
    padding: 10, 
    borderRadius: 10 
  },
  infoText: { fontSize: 11, color: "#0369A1", flex: 1 },

  button: {
    backgroundColor: PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 18,
    gap: 10,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});