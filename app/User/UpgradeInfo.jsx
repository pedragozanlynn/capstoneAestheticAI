import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";

const PRO_PRICE_PHP = 299; // ✅ Premium / Pro monthly price

export default function UpgradeInfo() {
  const router = useRouter();

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFEFF" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backCircle}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={20} color="#2c4f4f" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Premium Plan</Text>
        </View>

        {/* HERO */}
        <View style={styles.heroContainer}>
          <View style={styles.premiumBadge}>
            <Ionicons name="diamond" size={12} color="#01579B" />
            <Text style={styles.badgeText}>PRO EXCLUSIVE</Text>
          </View>

          <Text style={styles.title}>Unlock Everything in Premium</Text>
          <Text style={styles.subtitle}>
            Premium gives you full access to all AI tools—generation, saving, layout suggestions,
            and furniture matching.
          </Text>
        </View>

        {/* FEATURE LIST */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>PREMIUM FEATURES</Text>

          <FeatureRow icon="infinite" text="Unlimited AI Room Generations" rightBadge="PRO" />
          <FeatureRow icon="bookmark" text="Unlimited Saved Projects" rightBadge="PRO" />
          <FeatureRow icon="grid" text="AI Layout Suggestions" rightBadge="PRO" />
          <FeatureRow icon="bag-handle" text="Furniture Matching" rightBadge="PRO" />
          <FeatureRow icon="sparkles" text="Premium Tools & Suggestions" rightBadge="PRO" />
          <FeatureRow icon="shield-checkmark" text="Priority Support" rightBadge="PRO" />
        </View>

        {/* PRICE BOX */}
        <View style={styles.priceBox}>
          <View style={styles.priceRow}>
            <Text style={styles.currency}>₱</Text>
            <Text style={styles.price}>{PRO_PRICE_PHP}</Text>
            <Text style={styles.perMonth}>/mo</Text>
          </View>
          <Text style={styles.cancelText}>Cancel anytime. No hidden fees.</Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.upgradeButton}
          onPress={() => router.push("/User/UpgradePayment")}
        >
          <Text style={styles.upgradeText}>Continue to Upgrade</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const FeatureRow = ({ icon, text, rightBadge }) => (
  <View style={styles.row}>
    <View style={styles.left}>
      <View style={styles.iconWrapper}>
        <Ionicons name={icon} size={16} color="#01579B" />
      </View>
      <Text style={styles.feature}>{text}</Text>
    </View>

    {!!rightBadge && (
      <View style={styles.proChip}>
        <Text style={styles.proChipText}>{rightBadge}</Text>
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FDFEFF" },
  scrollContent: { paddingBottom: 30 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 45 : 15,
    marginBottom: 10,
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
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2c4f4f",
    marginLeft: 12,
  },

  heroContainer: {
    alignItems: "center",
    paddingHorizontal: 40,
    marginVertical: 15,
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
    marginBottom: 10,
    gap: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#01579B",
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2c4f4f",
    textAlign: "center",
    lineHeight: 28,
  },
  subtitle: {
    textAlign: "center",
    color: "#64748B",
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
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
  cardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 1,
    marginBottom: 15,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 1,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F0F7FF",
    justifyContent: "center",
    alignItems: "center",
  },
  feature: {
    fontSize: 13,
    color: "#1E293B",
    fontWeight: "600",
    flexShrink: 1,
  },

  proChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F0F7FF",
    borderWidth: 1,
    borderColor: "#DCEBFF",
  },
  proChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#01579B",
    letterSpacing: 0.6,
  },

  priceBox: { alignItems: "center", marginTop: 25 },
  priceRow: { flexDirection: "row", alignItems: "baseline" },
  currency: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2c4f4f",
    marginRight: 2,
  },
  price: {
    fontSize: 42,
    fontWeight: "900",
    color: "#2c4f4f",
    letterSpacing: -1.5,
  },
  perMonth: { fontSize: 14, color: "#64748B", fontWeight: "600" },
  cancelText: { fontSize: 11, color: "#94A3B8", marginTop: 4 },

  upgradeButton: {
    backgroundColor: "#3fa796",
    marginHorizontal: 35,
    height: 54,
    borderRadius: 18,
    marginTop: 25,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    elevation: 4,
  },
  upgradeText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
});
