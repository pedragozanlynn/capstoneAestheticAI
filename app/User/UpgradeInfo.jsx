// app/User/UpgradeInfo.jsx
// ✅ UPDATED:
// - Choose plan (Monthly / Yearly) with selectable pills
// - Passes selected plan to UpgradePayment via route param (?plan=monthly|yearly)
// - Premium features wording updated based on your list:
//   ✅ Unlimited AI generations
//   ✅ Unlimited AI customizations
//   ✅ AI layout suggestions
//   ✅ Furniture matching
// - Header stays visible (SafeAreaView + header outside ScrollView)

import React, { useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

/* =========================
   CONFIG
========================= */
const PLAN_NAME = "Premium";
const PLAN_BADGE = "PREMIUM";

const PREMIUM_PRICE_MONTHLY_PHP = 299;
const PREMIUM_PRICE_YEARLY_PHP = 2999;

const FEATURES = [
  { icon: "infinite", text: "Unlimited AI Room Generations" },
  { icon: "color-wand", text: "Unlimited AI Customizations" },
  { icon: "grid", text: "AI Layout Suggestions" },
  { icon: "bag-handle", text: "Furniture Matching" },
];

export default function UpgradeInfo() {
  const router = useRouter();

  const [plan, setPlan] = useState("monthly"); // "monthly" | "yearly"

  const monthlyLabel = useMemo(() => `₱${PREMIUM_PRICE_MONTHLY_PHP}/mo`, []);
  const yearlyLabel = useMemo(() => `₱${PREMIUM_PRICE_YEARLY_PHP}/year`, []);

  const selectedAmount = useMemo(
    () => (plan === "yearly" ? PREMIUM_PRICE_YEARLY_PHP : PREMIUM_PRICE_MONTHLY_PHP),
    [plan]
  );

  const selectedPlanLabel = useMemo(
    () => (plan === "yearly" ? "Yearly Plan" : "Monthly Plan"),
    [plan]
  );

  const goToPayment = useCallback(() => {
    router.push(`/User/UpgradePayment?plan=${plan}`);
  }, [plan, router]);

  return (
    <SafeAreaView style={styles.page} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFEFF" />

      {/* HEADER (fixed visibility) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backCircle} onPress={router.back} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color="#2c4f4f" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{PLAN_NAME} Plan</Text>
          <Text style={styles.headerSubtitle}>Upgrade your subscription</Text>
        </View>
      </View>

      {/* CONTENT */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* HERO */}
        <View style={styles.heroContainer}>
          <View style={styles.premiumBadge}>
            <Ionicons name="diamond" size={12} color="#01579B" />
            <Text style={styles.badgeText}>{PLAN_BADGE}</Text>
          </View>

          <Text style={styles.title}>Unlock Everything in {PLAN_NAME}</Text>
          <Text style={styles.subtitle}>
            Enjoy unlimited AI generations and customizations, plus smart layout and furniture recommendations.
          </Text>

          <Text style={styles.noteText}>
            To keep results fast and reliable, some AI features may apply fair-use limits.
          </Text>
        </View>

        {/* FEATURES */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{PLAN_NAME.toUpperCase()} FEATURES</Text>

          {FEATURES.map((f) => (
            <FeatureRow key={f.text} icon={f.icon} text={f.text} badge={PLAN_NAME} />
          ))}
        </View>

        {/* PLAN CHOICE */}
        <View style={styles.priceBox}>
          <Text style={styles.priceTitle}>Choose your plan</Text>

          <View style={styles.pricePills}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setPlan("monthly")}
              style={[styles.pricePill, plan === "monthly" && styles.pricePillActive]}
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={plan === "monthly" ? "#01579B" : "#64748B"}
              />
              <Text style={[styles.pricePillText, plan === "monthly" && styles.pricePillTextActive]}>
                {monthlyLabel}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setPlan("yearly")}
              style={[styles.pricePillAlt, plan === "yearly" && styles.pricePillAltActive]}
            >
              <Ionicons
                name="pricetag-outline"
                size={16}
                color={plan === "yearly" ? "#0F3E48" : "#64748B"}
              />
              <Text style={[styles.pricePillTextAlt, plan === "yearly" && styles.pricePillTextAltActive]}>
                {yearlyLabel}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.selectedText}>
            Selected: <Text style={{ fontWeight: "900" }}>{selectedPlanLabel}</Text> •{" "}
            <Text style={{ fontWeight: "900", color: "#3fa796" }}>₱{selectedAmount}</Text>
          </Text>

          <Text style={styles.cancelText}>Cancel anytime. No hidden fees.</Text>
        </View>

        {/* CTA */}
        <TouchableOpacity activeOpacity={0.85} style={styles.upgradeButton} onPress={goToPayment}>
          <Text style={styles.upgradeText}>Continue to Upgrade</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

/* =========================
   SMALL COMPONENTS
========================= */
function FeatureRow({ icon, text, badge }) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.iconWrapper}>
          <Ionicons name={icon} size={16} color="#01579B" />
        </View>
        <Text style={styles.feature}>{text}</Text>
      </View>

      <View style={styles.proChip}>
        <Text style={styles.proChipText}>{badge}</Text>
      </View>
    </View>
  );
}

/* =========================
   STYLES
========================= */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FDFEFF" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 6 : 20,
    paddingBottom: 12,
    backgroundColor: "#FDFEFF",
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    marginRight: 12,
  },
  headerTitle: { fontSize: 16, fontWeight: "900", color: "#2c4f4f" },
  headerSubtitle: { fontSize: 12, color: "#64748B", fontWeight: "600", marginTop: 2 },

  scrollContent: { paddingBottom: 30 },

  heroContainer: { alignItems: "center", paddingHorizontal: 40, marginVertical: 15 },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
    marginBottom: 10,
    gap: 6,
  },
  badgeText: { fontSize: 9, fontWeight: "900", color: "#01579B", letterSpacing: 0.6 },

  title: { fontSize: 22, fontWeight: "900", color: "#2c4f4f", textAlign: "center", lineHeight: 28 },
  subtitle: { textAlign: "center", color: "#64748B", marginTop: 8, fontSize: 13, lineHeight: 18 },
  noteText: {
    textAlign: "center",
    color: "#94A3B8",
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },

  card: {
    backgroundColor: "#fff",
    marginHorizontal: 30,
    borderRadius: 20,
    padding: 20,
    marginTop: 15,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  cardLabel: { fontSize: 10, fontWeight: "800", color: "#94A3B8", letterSpacing: 1, marginBottom: 15 },

  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  left: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F0F7FF",
    justifyContent: "center",
    alignItems: "center",
  },
  feature: { fontSize: 13, color: "#1E293B", fontWeight: "700", flexShrink: 1 },

  proChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F0F7FF",
    borderWidth: 1,
    borderColor: "#DCEBFF",
  },
  proChipText: { fontSize: 10, fontWeight: "900", color: "#01579B", letterSpacing: 0.4 },

  priceBox: { alignItems: "center", marginTop: 22 },
  priceTitle: { fontSize: 12, fontWeight: "800", color: "#64748B" },

  pricePills: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  pricePill: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pricePillActive: { backgroundColor: "#F0F7FF", borderColor: "#DCEBFF" },
  pricePillText: { fontWeight: "900", color: "#475569" },
  pricePillTextActive: { color: "#01579B" },

  pricePillAlt: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pricePillAltActive: { backgroundColor: "#ECFEFF", borderColor: "#CFFAFE" },
  pricePillTextAlt: { fontWeight: "900", color: "#475569" },
  pricePillTextAltActive: { color: "#0F3E48" },

  selectedText: { marginTop: 10, color: "#64748B", fontWeight: "700", fontSize: 12 },
  cancelText: { fontSize: 11, color: "#94A3B8", marginTop: 6, fontWeight: "700" },

  upgradeButton: {
    backgroundColor: "#3fa796",
    marginHorizontal: 35,
    height: 54,
    borderRadius: 18,
    marginTop: 22,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    elevation: 4,
    marginBottom: 10,
  },
  upgradeText: { color: "#FFF", fontWeight: "900", fontSize: 16 },
});
