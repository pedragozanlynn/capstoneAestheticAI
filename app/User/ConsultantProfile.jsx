// ConsultantProfile.jsx
// ✅ CLEANED + FIXED (ratings show):
// - Safe consultantId param parsing
// - Cleaner fetch flow
// - Ratings query safe + permission-aware
// - Reviewer names: prefer reviewerName in ratings; fallback to users doc if allowed
// - No UI/layout changes

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const THEME = {
  header: "#01579B",
  icon: "#2c4f4f",
  button: "#3fa796",
  bg: "#faf9f6",
  accentBlue: "#B3E5FC",
  danger: "#DC2626",
};

const toStrParam = (v) => (Array.isArray(v) ? v[0] : v ? String(v) : "");
const safeStr = (v) => String(v ?? "").trim();

export default function ConsultantProfile() {
  const params = useLocalSearchParams();
  const router = useRouter();

  const consultantId = toStrParam(params.consultantId);

  const [consultant, setConsultant] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [reviewerMap, setReviewerMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [ratingsLoading, setRatingsLoading] = useState(true);
  const [scheduleVisible, setScheduleVisible] = useState(false);

  const [pageError, setPageError] = useState("");

  const validateConsultantId = () => {
    if (!safeStr(consultantId)) return "Missing consultantId.";
    return "";
  };

  const validateCanRequest = () => {
    if (!consultant) return "Consultant data is not available.";
    const availability = Array.isArray(consultant.availability) ? consultant.availability : [];
    const rate = Number(consultant.rate || 0);

    if (availability.length === 0) return "This consultant has no schedule available yet.";
    if (!Number.isFinite(rate) || rate <= 0) return "This consultant has no consultation fee set yet.";
    return "";
  };

  useEffect(() => {
    const idErr = validateConsultantId();
    if (idErr) {
      console.log("⚠️ Validation (consultantId):", idErr, { consultantId });
      setPageError("Invalid consultant. Please go back and try again.");
      setLoading(false);
      setRatingsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchAll = async () => {
      try {
        setLoading(true);
        setRatingsLoading(true);
        setPageError("");

        // 1) Consultant
        const cSnap = await getDoc(doc(db, "consultants", consultantId));
        if (!cSnap.exists()) {
          setConsultant(null);
          setPageError("Consultant not found.");
          return;
        }

        const cData = { id: cSnap.id, ...cSnap.data() };
        if (!cancelled) setConsultant(cData);

        // 2) Ratings (NOTE: requires rules allow read/list)
        let rList = [];
        try {
          const qRatings = query(
            collection(db, "ratings"),
            where("consultantId", "==", consultantId),
            orderBy("createdAt", "desc")
          );

          const rSnap = await getDocs(qRatings);
          rList = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (!cancelled) setRatings(rList);
        } catch (e) {
          console.log("⚠️ Ratings fetch failed:", e?.message || e);

          // If permission denied, show helpful message instead of silent empty list
          const msg = String(e?.message || "");
          if (msg.toLowerCase().includes("permission")) {
            Alert.alert(
              "Ratings unavailable",
              "Your Firestore rules currently block reading ratings. Allow 'read/list' on /ratings for signed-in users to show feedback."
            );
          }
          if (!cancelled) setRatings([]);
        }

        // 3) Reviewer map (optional; may be blocked by /users rules)
        // Prefer reviewerName stored in rating docs (best practice).
        const map = {};
        const uniqueUserIds = new Set(
          (rList || [])
            .map((r) => safeStr(r?.userId))
            .filter(Boolean)
        );

        // Only attempt user doc lookup if there are ids
        await Promise.all(
          Array.from(uniqueUserIds).map(async (uid) => {
            try {
              const uSnap = await getDoc(doc(db, "users", uid));
              if (uSnap.exists()) {
                const u = uSnap.data() || {};
                map[uid] =
                  u.name ||
                  u.fullName ||
                  u.displayName ||
                  u.username ||
                  "Anonymous";
              }
            } catch {
              // ignore; fallback handled in UI
            }
          })
        );

        if (!cancelled) setReviewerMap(map);
      } catch (e) {
        console.error("Data fetch error:", e);
        setPageError("Failed to load consultant profile. Please try again.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRatingsLoading(false);
        }
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultantId]);

  const availability = useMemo(() => {
    return Array.isArray(consultant?.availability) ? consultant.availability : [];
  }, [consultant]);

  const avgRating = useMemo(() => {
    if (!ratings || ratings.length === 0) return "0.0";
    const sum = ratings.reduce((acc, r) => acc + Number(r.rating || 0), 0);
    return (sum / ratings.length).toFixed(1);
  }, [ratings]);

  const handleOpenSchedule = () => {
    const err = validateCanRequest();
    if (err) {
      Alert.alert("Cannot request consultation", err);
      return;
    }
    setScheduleVisible(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={THEME.header} />
      </View>
    );
  }

  if (pageError) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={28} color={THEME.danger} />
        <Text style={styles.errorTitle}>{pageError}</Text>
        <TouchableOpacity
          style={styles.errorBtn}
          onPress={() => router.back()}
          activeOpacity={0.9}
        >
          <Text style={styles.errorBtnText}>Go Back</Text>
        </TouchableOpacity>
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.header} />

      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={router.back}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>

          <View style={styles.profileInfo}>
            <Image
              source={
                consultant.avatar
                  ? { uri: consultant.avatar }
                  : consultant.gender === "Female"
                    ? require("../../assets/office-woman.png")
                    : require("../../assets/office-man.png")
              }
              style={styles.avatar}
            />
            <Text style={styles.headerTitle}>{consultant.fullName}</Text>
            <Text style={styles.headerSubtitle}>{consultant.specialization}</Text>

            <View style={styles.priceTag}>
              <Text style={styles.priceText}>
                ₱{consultant.rate || "0"}.00 / session
              </Text>
            </View>
          </View>

          <View style={styles.headerStats}>
            <Stat label="Rating" value={avgRating} />
            <Stat label="Reviews" value={ratings.length} />
            <Stat label="Schedules" value={availability.length} />
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.card}>
            <Text
              style={[
                styles.sectionTitle,
                { color: THEME.header, borderLeftColor: THEME.button },
              ]}
            >
              Expert Details
            </Text>

            <InfoRow icon="cash-outline" label="Consultation Fee" value={`₱${consultant.rate || "0"}.00`} />
            <InfoRow icon="school-outline" label="Education" value={consultant.education || "Not provided"} />
            <InfoRow icon="people-outline" label="Gender" value={consultant.gender || "Not provided"} />
            <InfoRow icon="mail-outline" label="Email" value={consultant.email || "Not provided"} />
            <InfoRow icon="location-outline" label="Address" value={consultant.address || "Not provided"} />
          </View>

          <View style={styles.card}>
            <Text
              style={[
                styles.sectionTitle,
                { color: THEME.header, borderLeftColor: THEME.button },
              ]}
            >
              Working Days
            </Text>

            <View style={styles.availabilityGrid}>
              {availability.length > 0 ? (
                availability.map((day, i) => (
                  <View key={`${day}-${i}`} style={styles.dayChip}>
                    <Text style={styles.dayText}>{day}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>No schedule set</Text>
              )}
            </View>

            {availability.length === 0 ? (
              <Text style={styles.inlineWarn}>
                Schedule is not available yet. You cannot request a consultation.
              </Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text
              style={[
                styles.sectionTitle,
                { color: THEME.header, borderLeftColor: THEME.button },
              ]}
            >
              User Feedback
            </Text>

            {ratingsLoading ? (
              <ActivityIndicator color={THEME.header} />
            ) : ratings.length === 0 ? (
              <Text style={styles.muted}>No ratings yet</Text>
            ) : (
              ratings.map((r) => {
                const displayName =
                  // best: reviewerName stored in rating
                  safeStr(r.reviewerName) ||
                  // fallback: fetched from users doc if allowed
                  reviewerMap[safeStr(r.userId)] ||
                  "Anonymous";

                const dateText = r.createdAt?.toDate?.()
                  ? r.createdAt.toDate().toLocaleDateString()
                  : "";

                const ratingNum = Number(r.rating || 0);

                return (
                  <View key={r.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewName}>{displayName}</Text>
                      <Text style={styles.reviewDate}>{dateText}</Text>
                    </View>

                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Ionicons
                          key={i}
                          name={i <= ratingNum ? "star" : "star-outline"}
                          size={14}
                          color="#F59E0B"
                        />
                      ))}
                    </View>

                    {!!safeStr(r.feedback) && (
                      <Text style={styles.reviewText}>{safeStr(r.feedback)}</Text>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomCta}>
        <TouchableOpacity style={styles.ctaButton} onPress={handleOpenSchedule}>
          <Ionicons name="calendar-outline" size={20} color="#fff" />
          <Text style={styles.ctaText}>Request Consultation</Text>
        </TouchableOpacity>
      </View>

      {consultant && (
        <ScheduleModal
          visible={scheduleVisible}
          onClose={() => setScheduleVisible(false)}
          consultantId={consultant.id}
          availability={availability}
          sessionFee={consultant.rate}
        />
      )}
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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: THEME.bg,
    padding: 24,
    gap: 10,
  },

  errorTitle: { color: "#0F172A", fontWeight: "900", fontSize: 14, textAlign: "center" },
  errorBtn: {
    marginTop: 8,
    backgroundColor: THEME.header,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  errorBtnText: { color: "#fff", fontWeight: "900" },

  header: {
    backgroundColor: THEME.header,
    paddingTop: 65,
    paddingBottom: 35,
    alignItems: "center",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  backBtn: { position: "absolute", top: 45, left: 15, padding: 5 },
  profileInfo: { alignItems: "center" },
  avatar: { width: 110, height: 110, borderRadius: 30, borderWidth: 4, borderColor: "rgba(255,255,255,0.3)" },
  headerTitle: { fontSize: 24, fontWeight: "900", color: "#fff", marginTop: 12 },
  headerSubtitle: { color: THEME.accentBlue, fontSize: 15, fontWeight: "500" },

  priceTag: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  priceText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  headerStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 25,
    paddingHorizontal: 20,
  },
  statBox: {
    alignItems: "center",
    width: 95,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  statValue: { fontSize: 18, fontWeight: "800", color: "#fff" },
  statLabel: { fontSize: 11, color: "#fff", opacity: 0.8, marginTop: 2 },

  content: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 130 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 25,
    padding: 22,
    marginBottom: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 15,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginBottom: 18, borderLeftWidth: 5, paddingLeft: 12 },

  infoRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 18 },
  infoLabel: { fontSize: 12, color: "#94A3B8", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 14, color: "#1E293B", fontWeight: "600", marginTop: 2 },

  availabilityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  dayChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: "#E0F2F1", borderWidth: 1, borderColor: "#B2DFDB" },
  dayText: { fontSize: 13, fontWeight: "700", color: "#00796B" },

  inlineWarn: { marginTop: 12, color: THEME.danger, fontWeight: "800", fontSize: 12 },

  reviewCard: { backgroundColor: "#F8FAFC", padding: 15, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: "#F1F5F9" },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewName: { fontWeight: "800", fontSize: 14, color: "#1E293B" },
  reviewDate: { fontSize: 11, color: "#94A3B8" },
  starsRow: { flexDirection: "row", marginVertical: 6 },
  reviewText: { fontSize: 13, color: "#475569", lineHeight: 19 },

  muted: { color: "#94A3B8", fontStyle: "italic", textAlign: "center", width: "100%" },

  bottomCta: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    padding: 20,
    paddingBottom: 35,
    backgroundColor: "rgba(250, 249, 246, 0.98)",
  },
  ctaButton: {
    backgroundColor: THEME.button,
    height: 60,
    borderRadius: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    elevation: 5,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
});
