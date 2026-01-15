import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import ScheduleModal from "../components/ScheduleModal";

// UPDATED THEME COLORS
const THEME = {
  header: "#01579B",      // Bagong Blue Color
  icon: "#2c4f4f",        // Dark Icon Color
  button: "#3fa796",      // Original Green Button
  bg: "#faf9f6",          // Off-white Background
  accentBlue: "#B3E5FC"   // Light Blue for Subtitles
};

export default function ConsultantProfile() {
  const { consultantId } = useLocalSearchParams();
  const router = useRouter();

  const [consultant, setConsultant] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [reviewerMap, setReviewerMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [ratingsLoading, setRatingsLoading] = useState(true);
  const [scheduleVisible, setScheduleVisible] = useState(false);

  useEffect(() => {
    if (!consultantId) return;

    const fetchData = async () => {
      try {
        const cSnap = await getDoc(doc(db, "consultants", consultantId));
        if (cSnap.exists()) {
          setConsultant({ id: cSnap.id, ...cSnap.data() });
        }

        const q = query(
          collection(db, "ratings"),
          where("consultantId", "==", consultantId),
          orderBy("createdAt", "desc")
        );
        const rSnap = await getDocs(q);
        const rList = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRatings(rList);

        const map = {};
        await Promise.all(
          rList.map(async (r) => {
            if (r.userId && !map[r.userId]) {
              const uSnap = await getDoc(doc(db, "users", r.userId));
              if (uSnap.exists()) map[r.userId] = uSnap.data().name;
            }
          })
        );
        setReviewerMap(map);
      } catch (e) {
        console.error("Data fetch error:", e);
      } finally {
        setLoading(false);
        setRatingsLoading(false);
      }
    };

    fetchData();
  }, [consultantId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={THEME.header} />
      </View>
    );
  }

  if (!consultant) {
    return (
      <View style={styles.center}>
        <Text>Consultant not found</Text>
      </View>
    );
  }

  const availability = Array.isArray(consultant.availability) ? consultant.availability : [];
  const avgRating = ratings.length > 0
    ? (ratings.reduce((sum, r) => sum + (r.rating || 0), 0) / ratings.length).toFixed(1)
    : "0.0";

  return (
    <View style={styles.container}>
      {/* StatusBar adjusted for the blue header */}
      <StatusBar barStyle="light-content" backgroundColor={THEME.header} />
      
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={router.back}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.profileInfo}>
            <Image
              source={consultant.avatar ? { uri: consultant.avatar } : (consultant.gender === "Female" ? require("../../assets/office-woman.png") : require("../../assets/office-man.png"))}
              style={styles.avatar}
            />
            <Text style={styles.headerTitle}>{consultant.fullName}</Text>
            <Text style={styles.headerSubtitle}>{consultant.specialization}</Text>
          </View>

          <View style={styles.headerStats}>
            <Stat label="Rating" value={avgRating} />
            <Stat label="Reviews" value={ratings.length} />
            <Stat label="Schedules" value={availability.length} />
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { color: THEME.header, borderLeftColor: THEME.button }]}>Expert Details</Text>
            <InfoRow icon="briefcase-outline" label="Type" value={consultant.consultantType} />
            <InfoRow icon="school-outline" label="Education" value={consultant.education || "Not provided"} />
            <InfoRow icon="people-outline" label="Gender" value={consultant.gender} />
            <InfoRow icon="mail-outline" label="Email" value={consultant.email} />
            <InfoRow icon="location-outline" label="Address" value={consultant.address} />
          </View>

          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { color: THEME.header, borderLeftColor: THEME.button }]}>Working Days</Text>
            <View style={styles.availabilityGrid}>
              {availability.length > 0 ? (
                availability.map((day, i) => (
                  <View key={i} style={styles.dayChip}><Text style={styles.dayText}>{day}</Text></View>
                ))
              ) : (
                <Text style={styles.muted}>No schedule set</Text>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { color: THEME.header, borderLeftColor: THEME.button }]}>User Feedback</Text>
            {ratingsLoading ? (
              <ActivityIndicator color={THEME.header} />
            ) : ratings.length === 0 ? (
              <Text style={styles.muted}>No ratings yet</Text>
            ) : (
              ratings.map((r) => (
                <View key={r.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewName}>{reviewerMap[r.userId] || "Anonymous"}</Text>
                    <Text style={styles.reviewDate}>{r.createdAt?.toDate?.().toLocaleDateString()}</Text>
                  </View>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Ionicons key={i} name={i <= r.rating ? "star" : "star-outline"} size={14} color="#F59E0B" />
                    ))}
                  </View>
                  {!!r.feedback && <Text style={styles.reviewText}>{r.feedback}</Text>}
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomCta}>
        <TouchableOpacity style={styles.ctaButton} onPress={() => setScheduleVisible(true)}>
          <Ionicons name="calendar-outline" size={20} color="#fff" />
          <Text style={styles.ctaText}>Request Consultation</Text>
        </TouchableOpacity>
      </View>

      <ScheduleModal
        visible={scheduleVisible}
        onClose={() => setScheduleVisible(false)}
        consultantId={consultant.id}
        availability={availability}
      />
    </View>
  );
}

const Stat = ({ label, value }) => (
  <View style={styles.statBox}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const InfoRow = ({ icon, label, value }) => (
  <View style={styles.infoRow}>
    <Ionicons name={icon} size={18} color={THEME.header} style={{ width: 28 }} />
    <View style={{ flex: 1 }}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: THEME.bg },
  header: {
    backgroundColor: THEME.header,
    paddingTop: 65,
    paddingBottom: 35,
    alignItems: "center",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  backBtn: { position: "absolute", top: 45, left: 15, padding: 5 },
  profileInfo: { alignItems: 'center' },
  avatar: { width: 110, height: 110, borderRadius: 30, borderWidth: 4, borderColor: "rgba(255,255,255,0.3)" },
  headerTitle: { fontSize: 24, fontWeight: "900", color: "#fff", marginTop: 12 },
  headerSubtitle: { color: THEME.accentBlue, fontSize: 15, fontWeight: "500" },
  headerStats: { flexDirection: "row", justifyContent: "space-around", width: "100%", marginTop: 25, paddingHorizontal: 20 },
  statBox: { alignItems: "center", width: 95, paddingVertical: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  statValue: { fontSize: 18, fontWeight: "800", color: "#fff" },
  statLabel: { fontSize: 11, color: "#fff", opacity: 0.8, marginTop: 2 },
  content: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 130 },
  card: { backgroundColor: "#fff", borderRadius: 25, padding: 22, marginBottom: 20, elevation: 3, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 15 },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginBottom: 18, borderLeftWidth: 5, paddingLeft: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  infoLabel: { fontSize: 12, color: "#94A3B8", fontWeight: "700", textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, color: "#1E293B", fontWeight: "600", marginTop: 2 },
  availabilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dayChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: "#E0F2F1", borderWidth: 1, borderColor: "#B2DFDB" },
  dayText: { fontSize: 13, fontWeight: "700", color: "#00796B" },
  reviewCard: { backgroundColor: "#F8FAFC", padding: 15, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: "#F1F5F9" },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewName: { fontWeight: "800", fontSize: 14, color: "#1E293B" },
  reviewDate: { fontSize: 11, color: "#94A3B8" },
  starsRow: { flexDirection: 'row', marginVertical: 6 },
  reviewText: { fontSize: 13, color: "#475569", lineHeight: 19 },
  muted: { color: "#94A3B8", fontStyle: "italic", textAlign: 'center', width: '100%' },
  bottomCta: { position: 'absolute', bottom: 0, width: '100%', padding: 20, paddingBottom: 35, backgroundColor: 'rgba(250, 249, 246, 0.98)' },
  ctaButton: { backgroundColor: THEME.button, height: 60, borderRadius: 20, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12, elevation: 5 },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
});