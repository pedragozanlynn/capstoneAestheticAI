import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import ConsultantDetailsModal from "../components/ConsultantDetailsModal";

/** -----------------------------
 * ✅ Validation helpers (NO UI logic changes)
 * ----------------------------- */
const safeStr = (v) => (v == null ? "" : String(v).trim());

const normalizeStatus = (status) => {
  const s = safeStr(status).toLowerCase();
  if (s === "accepted") return "accepted";
  if (s === "rejected") return "rejected";
  if (s === "pending") return "pending";
  return "pending";
};

const toMillisSafe = (ts) => {
  try {
    if (!ts) return 0;
    if (typeof ts?.toMillis === "function") return ts.toMillis();
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
};

const validateConsultantDoc = (docData, docId) => {
  const fullName = safeStr(docData?.fullName);
  const email = safeStr(docData?.email);
  const status = normalizeStatus(docData?.status);

  const issues = [];
  if (!fullName) issues.push("missing fullName");
  if (!email || !email.includes("@")) issues.push("invalid email");

  return {
    id: docId,
    ...docData, // ✅ keep ALL fields for modal
    fullName: fullName || "(No name)",
    email: email || "(No email)",
    status,
    __issues: issues,
  };
};

export default function Consultantst() {
  const [consultants, setConsultants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedConsultant, setSelectedConsultant] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // ✅ prevent repeated alert spam on refresh
  const warnedInvalidRef = useRef(false);

  const fetchConsultants = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "consultants"));

      const raw = querySnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const normalized = raw.map((r) => validateConsultantDoc(r, r.id));

      // ✅ newest first
      const sorted = normalized.sort((a, b) => {
        const am = toMillisSafe(a.createdAt || a.created_at || a.timestamp);
        const bm = toMillisSafe(b.createdAt || b.created_at || b.timestamp);
        return bm - am;
      });

      const invalidCount = sorted.filter((x) => x.__issues?.length).length;
      if (invalidCount > 0 && !warnedInvalidRef.current) {
        warnedInvalidRef.current = true;
        Alert.alert(
          "Some profiles need attention",
          `${invalidCount} consultant record(s) have missing/invalid fields (e.g., name/email). They will still appear with placeholders.`,
          [{ text: "OK" }]
        );
      }

      setConsultants(sorted);
    } catch (error) {
      Alert.alert(
        "Error",
        "Failed to load consultant data. Please check your internet connection and try again.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Retry", onPress: fetchConsultants },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsultants();
  }, []);

  const filteredConsultants = useMemo(() => {
    return consultants.filter((c) => {
      if (activeFilter === "all") return true;
      return c.status === activeFilter;
    });
  }, [consultants, activeFilter]);

  const openModal = (consultant) => {
    if (consultant.__issues?.length) {
      Alert.alert(
        "Incomplete profile",
        "This consultant profile has missing/invalid details. Please fix the record in Firestore before verifying.",
        [{ text: "OK" }]
      );
      return;
    }
    setSelectedConsultant(consultant);
    setModalVisible(true);
  };

  const handleStatusUpdated = (id, status) => {
    const nextStatus = normalizeStatus(status);
    const allowed = ["pending", "accepted", "rejected"];
    if (!allowed.includes(nextStatus)) {
      Alert.alert(
        "Invalid status",
        "Status must be Pending, Verified, or Rejected only."
      );
      return;
    }

    setConsultants((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: nextStatus } : c))
    );

    setSelectedConsultant((prev) =>
      prev?.id === id ? { ...prev, status: nextStatus } : prev
    );

    if (nextStatus === "accepted") {
      setActiveFilter("accepted");
      Alert.alert("Updated", "Consultant has been verified successfully.");
      return;
    }
    if (nextStatus === "rejected") {
      setActiveFilter("rejected");
      Alert.alert("Updated", "Consultant has been rejected.");
      return;
    }

    setActiveFilter("pending");
    Alert.alert("Updated", "Consultant status has been set to pending.");
  };

  return (
    <View style={styles.mainContainer}>
    {/* FIXED HEADER */}
<View style={styles.header}>
  <SafeAreaView>
    <Text style={styles.headerTitle}>Consultants</Text>
    <Text style={styles.headerSubtitle}>
      Manage consultants verifications
    </Text>
  </SafeAreaView>
</View>

      {/* ✅ Tabs */}
      <View style={styles.filterWrapper}>
        <View style={styles.filterContainer}>
          {[
            { id: "all", label: "All" },
            { id: "pending", label: "Pending" },
            { id: "accepted", label: "Verified" },
            { id: "rejected", label: "Rejected" },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveFilter(tab.id)}
              activeOpacity={0.85}
              style={[
                styles.filterTab,
                activeFilter === tab.id && styles.activeFilterTab,
              ]}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeFilter === tab.id && styles.activeFilterTabText,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={stylesVars.primary} />
          <Text style={styles.loadingText}>Loading consultants...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...(Platform.OS === "ios"
            ? { contentInsetAdjustmentBehavior: "never" }
            : {})}
        >
          {filteredConsultants.length > 0 ? (
            filteredConsultants.map((c) => {
              const isValid = !c.__issues?.length;
              const isAccepted = c.status === "accepted" && isValid;
              const isRejected = c.status === "rejected" && isValid;

              const badgeBg = isAccepted
                ? "#E8F5E9"
                : isRejected
                ? "#FEE2E2"
                : "#FFF3E0";

              const dotColor = isAccepted
                ? "#2ecc71"
                : isRejected
                ? "#DC2626"
                : "#f39c12";

              const badgeTextColor = isAccepted
                ? "#1B5E20"
                : isRejected
                ? "#991B1B"
                : "#E65100";

              const badgeLabel = isAccepted
                ? "Verified Consultant"
                : isRejected
                ? "Rejected"
                : "Pending Review";

              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.card}
                  onPress={() => openModal(c)}
                  activeOpacity={0.9}
                >
                  <View style={styles.cardInner}>
                    <View style={styles.topSection}>
                      <View style={styles.avatarContainer}>
                        <Ionicons name="person" size={22} color="#64748B" />
                      </View>

                      <View style={styles.infoContainer}>
                        <View style={styles.nameHeader}>
                          <Text style={styles.nameText} numberOfLines={1}>
                            {c.fullName}
                          </Text>

                          {isAccepted && (
                            <Ionicons
                              name="checkmark-circle"
                              size={18}
                              color="#2ecc71"
                              style={{ marginLeft: 6 }}
                            />
                          )}

                          {isRejected && (
                            <Ionicons
                              name="close-circle"
                              size={18}
                              color="#DC2626"
                              style={{ marginLeft: 6 }}
                            />
                          )}
                        </View>

                        <Text style={styles.emailText} numberOfLines={1}>
                          {c.email}
                        </Text>

                        {c.__issues?.length ? (
                          <Text style={styles.validationHint} numberOfLines={1}>
                            Needs update: {c.__issues.join(", ")}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.bottomSection}>
                      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: dotColor },
                          ]}
                        />
                        <Text
                          style={[styles.badgeText, { color: badgeTextColor }]}
                          numberOfLines={1}
                        >
                          {badgeLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={58} color="#CBD5E1" />
              <Text style={styles.emptyText}>No consultants found.</Text>

              <TouchableOpacity
                onPress={fetchConsultants}
                style={styles.retryBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {selectedConsultant && (
        <ConsultantDetailsModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          data={selectedConsultant}
          onStatusUpdated={handleStatusUpdated}
        />
      )}

      {/* ✅ Footer stable: we already padded scrollContent enough */}
      <BottomNavbar role="admin" />
    </View>
  );
}

/** ✅ UI Vars (design-only) */
const stylesVars = {
  primary: "#01579B",
  headerBg: "#01579B",
  bg: "#F8FAFC",
  cardBorder: "#F1F5F9",
  textMid: "#64748B",
};

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: stylesVars.bg },

  header: {
    backgroundColor: "#01579B",
    paddingHorizontal: 20,
  
    // ✅ fixed layout (no insets math)
    paddingTop: 56,     // stable top spacing
    paddingBottom: 22,  // stable bottom spacing
  
    // ✅ prevents shrinking in production builds
    minHeight: 110,
  
    justifyContent: "flex-end",
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  

  /** Tabs */
  filterWrapper: { paddingHorizontal: 16, marginTop: 12, marginBottom: 6 },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 16,
    padding: 6,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  activeFilterTab: {
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  filterTabText: {
    color: stylesVars.textMid,
    fontSize: 12,
    fontWeight: "800",
  },
  activeFilterTabText: { color: stylesVars.primary },

  /** Loader */
  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: {
    marginTop: 10,
    color: stylesVars.textMid,
    fontSize: 13,
    fontWeight: "700",
  },

  /** List */
  scrollContent: {
    padding: 16,
    // ✅ THIS is what keeps content from going under BottomNavbar after install
    paddingBottom: 140,
  },

  /** Card */
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: stylesVars.cardBorder,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardInner: { padding: 16 },

  topSection: { flexDirection: "row", alignItems: "center" },
  avatarContainer: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  infoContainer: { flex: 1, marginLeft: 12 },
  nameHeader: { flexDirection: "row", alignItems: "center" },
  nameText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.2,
  },
  emailText: { fontSize: 13, color: stylesVars.textMid, marginTop: 2 },

  validationHint: {
    marginTop: 4,
    fontSize: 11,
    color: "#E11D48",
    fontWeight: "700",
  },

  divider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 14 },

  bottomSection: { flexDirection: "row" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  statusDot: { width: 7, height: 7, borderRadius: 99, marginRight: 8 },
  badgeText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  /** Empty */
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 10,
    textAlign: "center",
    fontWeight: "700",
  },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
  },
  retryText: { color: stylesVars.primary, fontWeight: "900", fontSize: 12 },
});
