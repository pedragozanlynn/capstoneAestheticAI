import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../../config/firebase";

export default function ManageSubscription() {
  const router = useRouter();
  const auth = getAuth();

  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSubscription = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          setUserData(snap.data());
        }
      } catch (e) {
        console.log("Subscription load error:", e);
      } finally {
        setLoading(false);
      }
    };

    loadSubscription();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#01579B" />
      </View>
    );
  }

  if (!userData) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>User data not found</Text>
      </View>
    );
  }

  const { subscription_type, subscription_expires_at, subscribed_at } = userData;

  // ✅ Keep your current logic; adjust if you use "Pro" or "Premium"
  const isPremium = subscription_type === "Premium";

  const formatNumericDate = (firebaseTimestamp) => {
    if (!firebaseTimestamp?.toDate) return "—";
    const date = firebaseTimestamp.toDate();
    return date.toLocaleDateString("en-US");
  };

  const handleUpgrade = () => {
    // If you prefer your Premium plan page instead:
    // router.push("/User/UpgradeInfo") or router.push("/User/UpdateInfo")
    router.push("/User/UpgradeInfo");
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFEFF" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== HEADER ===== */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backCircle} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Subscription</Text>
            <Text style={styles.headerSubtitle}>Manage your current plan</Text>
          </View>
        </View>

        {/* ===== HERO CARD ===== */}
        <View style={[styles.heroCard, isPremium ? styles.heroPremium : styles.heroFree]}>
          <View style={styles.heroTopRow}>
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: isPremium
                    ? "rgba(255,255,255,0.2)"
                    : "rgba(1, 87, 155, 0.05)",
                },
              ]}
            >
              <Ionicons
                name={isPremium ? "diamond" : "flash-outline"}
                size={32}
                color={isPremium ? "#FFF" : "#01579B"}
              />
            </View>

            <View
              style={[
                styles.planBadge,
                { backgroundColor: isPremium ? "#FFD700" : "#E2E8F0" },
              ]}
            >
              <Text style={[styles.planBadgeText, { color: "#01579B" }]}>
                {isPremium ? "PRO" : "BASIC"}
              </Text>
            </View>
          </View>

          <View style={styles.heroTextContainer}>
            <Text style={[styles.heroPlanName, { color: isPremium ? "#FFF" : "#01579B" }]}>
              {isPremium ? "Premium Member" : "Free Explorer"}
            </Text>
            <Text style={[styles.heroStatusText, { color: isPremium ? "#FFF" : "#64748B" }]}>
              {isPremium
                ? "Full access to AI tools & Consultations"
                : "Premium features are locked. Upgrade to unlock."}
            </Text>
          </View>

    
        </View>

        {/* ===== PLAN DETAILS CARD ===== */}
        <View style={styles.card}>
          <Text style={styles.cardSectionLabel}>Plan Details</Text>

          <InfoRow
            label="Current Status"
            value={isPremium ? "Active" : "Not Subscribed"}
            highlight={isPremium}
            icon={isPremium ? "shield-checkmark-outline" : "alert-circle-outline"}
          />

          <InfoRow label="Subscribed On" value={formatNumericDate(subscribed_at)} icon="calendar-outline" />

          <InfoRow
            label="Renewal Date"
            value={isPremium ? formatNumericDate(subscription_expires_at) : "—"}
            icon="time-outline"
            isLast
          />
        </View>

        {/* ===== PREMIUM FEATURES LOCKED CARD (when Free) ===== */}
        {!isPremium && (
          <View style={styles.card}>
            <Text style={styles.cardSectionLabel}>Premium Features</Text>

            <LockedFeatureRow icon="infinite" text="Unlimited AI Room Generations" />
            <LockedFeatureRow icon="bookmark" text="Unlimited Saved Projects" />
            <LockedFeatureRow icon="grid" text="AI Layout Suggestions" />
            <LockedFeatureRow icon="bag-handle" text="Furniture Matching" isLast />

           
          </View>
        )}

        {/* ===== FOOTER ACTIONS ===== */}
        <View style={styles.footer}>
          {isPremium ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => Alert.alert("Billing", "Opening billing settings...")}
            >
              <Ionicons
                name="card-outline"
                size={20}
                color="#01579B"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.secondaryText}>Manage Billing</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
            activeOpacity={0.9}
            style={styles.primaryBtn}
            onPress={handleUpgrade}
          >
            <Text style={styles.primaryText}>Upgrade to Premium</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
          )}

          <Text style={styles.footerHint}>
            {isPremium
              ? "Your Premium plan includes priority AI processing and expert consultation access."
              : "Upgrade to unlock premium AI tools, layout suggestions, furniture matching, and unlimited access."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const InfoRow = ({ label, value, highlight, icon, isLast }) => (
  <View style={[styles.infoRow, isLast && { borderBottomWidth: 0 }]}>
    <View style={styles.infoLeft}>
      <View style={styles.miniIconBg}>
        <Ionicons name={icon} size={18} color="#01579B" />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
    <Text style={[styles.infoValue, highlight && styles.highlightText]}>{value}</Text>
  </View>
);

const LockedRow = ({ label, value, icon, onPressUpgrade, isLast }) => (
  <View style={[styles.infoRow, isLast && { borderBottomWidth: 0 }]}>
    <View style={styles.infoLeft}>
      <View style={styles.miniIconBgLocked}>
        <Ionicons name={icon} size={18} color="#94A3B8" />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>

    <View style={styles.lockRight}>
      <View style={styles.lockPill}>
        <Ionicons name="lock-closed" size={12} color="#64748B" />
        <Text style={styles.lockPillText}>{value}</Text>
      </View>

      <TouchableOpacity
        onPress={onPressUpgrade}
        activeOpacity={0.85}
        style={styles.unlockBtn}
      >
        <Text style={styles.unlockBtnText}>Upgrade</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const LockedFeatureRow = ({ icon, text, isLast }) => (
  <View style={[styles.featureRow, isLast && { borderBottomWidth: 0 }]}>
    <View style={styles.featureLeft}>
      <View style={styles.miniIconBgLocked}>
        <Ionicons name={icon} size={18} color="#94A3B8" />
      </View>
      <Text style={styles.infoLabel}>{text}</Text>
    </View>

    <View style={styles.lockPill}>
      <Ionicons name="lock-closed" size={12} color="#64748B" />
      <Text style={styles.lockPillText}>Locked</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDFEFF" },
  scrollContent: {
    paddingHorizontal: 25,
    paddingBottom: 40,
    paddingTop: Platform.OS === "ios" ? 60 : 30,
  },

  header: { flexDirection: "row", alignItems: "center", marginBottom: 30 },
  backCircle: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTitle: { fontSize: 20, fontWeight: "900", color: "#2c4f4f", letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, color: "#000", fontWeight: "500", opacity: 0.6 },

  heroCard: {
    borderRadius: 30,
    padding: 25,
    marginBottom: 30,
    overflow: "hidden",
    minHeight: 210,
    justifyContent: "space-between",
  },
  heroPremium: {
    backgroundColor: "#01579B",
    shadowColor: "#01579B",
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  heroFree: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#F1F5F9" },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  iconBox: { width: 60, height: 60, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  planBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  planBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  heroPlanName: { fontSize: 24, fontWeight: "900", marginBottom: 4 },
  heroStatusText: { fontSize: 14, fontWeight: "600" },

  heroUpgradeBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#01579B",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  heroUpgradeText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 25,
    padding: 24,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    elevation: 2,
  },
  cardSectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 20,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  infoLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  miniIconBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  miniIconBgLocked: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  infoLabel: { color: "#64748B", fontSize: 14, fontWeight: "600" },
  infoValue: { color: "#01579B", fontSize: 14, fontWeight: "700" },
  highlightText: { color: "#01579B", fontWeight: "900" },

  lockRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  lockPillText: { fontSize: 12, fontWeight: "800", color: "#64748B" },
  unlockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#01579B",
  },
  unlockBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  featureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  featureLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },

  footer: { gap: 15 },
  primaryBtn: {
    backgroundColor: "#01579B",
    height: 65,
    borderRadius: 22,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 18,
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondaryBtn: {
    backgroundColor: "#FFF",
    height: 65,
    borderRadius: 22,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  secondaryText: { color: "#01579B", fontWeight: "800", fontSize: 16 },
  footerHint: {
    textAlign: "center",
    fontSize: 12,
    color: "#94A3B8",
    paddingHorizontal: 40,
    lineHeight: 18,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FDFEFF",
  },
  errorText: { color: "#64748B", fontWeight: "600" },
});
