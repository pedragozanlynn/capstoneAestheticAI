import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LineChart, PieChart } from "react-native-chart-kit";
import { auth, db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";

const screenWidth = Dimensions.get("window").width;

/* =========================
   SAFE HELPERS (CLEAN)
========================= */
const safeStr = (v) => (v == null ? "" : String(v).trim());
const safeNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isFsTimestamp = (t) => !!t && typeof t === "object" && typeof t.toDate === "function";

const toMillisSafe = (ts) => {
  try {
    if (!ts) return 0;
    if (typeof ts === "number") return ts;
    if (isFsTimestamp(ts)) return ts.toMillis ? ts.toMillis() : ts.toDate().getTime();
    const d = new Date(ts);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
};

const toDateSafe = (ts) => {
  try {
    if (!ts) return null;
    if (isFsTimestamp(ts)) return ts.toDate();
    if (typeof ts === "number") return new Date(ts);
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
};

const formatMoney = (amt) =>
  `₱${safeNum(amt, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const normalizeConsultantStatus = (s) => {
  const x = safeStr(s).toLowerCase();
  if (x === "accepted") return "accepted";
  if (x === "rejected") return "rejected";
  return "pending";
};

const normalizePaymentStatus = (s) => safeStr(s).toLowerCase();

const pickUnifiedDate = (p) =>
  p?.createdAt || p?.timestamp || p?.paidAt || p?.date || p?.updatedAt || null;

const isAdminIncome = (p) => safeStr(p?.type).toLowerCase() === "admin_income";
const isApprovedSub = (p) => normalizePaymentStatus(p?.status) === "approved";
const isCompletedIncome = (p) => normalizePaymentStatus(p?.status) === "completed";

export default function Dashboard() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [totalUsers, setTotalUsers] = useState(0);
  const [totalConsultants, setTotalConsultants] = useState(0);

  // [pending, accepted, rejected, total]
  const [conTrend, setConTrend] = useState([0, 0, 0, 0]);

  const [grandTotalSubs, setGrandTotalSubs] = useState(0);
  const [grandTotalAdmin, setGrandTotalAdmin] = useState(0);

  const [payments, setPayments] = useState([]);
  const [activeTab, setActiveTab] = useState("all"); // all | subscription | session

  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleLogout = () => {
    setShowProfileMenu(false);
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            router.replace("/");
            setTimeout(() => router.replace("/Admin/Login"), 50);
          } catch {
            Alert.alert("Error", "Failed to logout.");
          }
        },
      },
    ]);
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const [uSnap, cSnap, paymentsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "consultants")),
          getDocs(collection(db, "subscription_payments")),
        ]);

        // USERS
        setTotalUsers(uSnap.size);

        // CONSULTANTS
        const consData = cSnap.docs.map((d) => d.data() || {});
        setTotalConsultants(consData.length);

        const pending = consData.filter((c) => normalizeConsultantStatus(c.status) === "pending").length;
        const accepted = consData.filter((c) => normalizeConsultantStatus(c.status) === "accepted").length;
        const rejected = consData.filter((c) => normalizeConsultantStatus(c.status) === "rejected").length;
        setConTrend([pending, accepted, rejected, consData.length]);

        // PAYMENTS (SUBS + ADMIN INCOME)
        let subsTotal = 0;
        let adminTotal = 0;
        const combinedList = [];

        paymentsSnap.forEach((docSnap) => {
          const d = docSnap.data() || {};
          const amt = safeNum(d.amount, 0);

          // ✅ SESSION FEE ADMIN INCOME (type=admin_income AND status=completed)
          if (isAdminIncome(d) && isCompletedIncome(d)) {
            adminTotal += amt;
            combinedList.push({
              id: docSnap.id,
              ...d,
              categoryType: "session",
              displayAmount: amt,
              unifiedDate: pickUnifiedDate(d),
            });
            return;
          }

          // ✅ SUBSCRIPTION (status=approved AND NOT admin_income)
          if (!isAdminIncome(d) && isApprovedSub(d)) {
            subsTotal += amt;
            combinedList.push({
              id: docSnap.id,
              ...d,
              categoryType: "subscription",
              displayAmount: amt,
              unifiedDate: pickUnifiedDate(d),
            });
          }
        });

        setGrandTotalSubs(subsTotal);
        setGrandTotalAdmin(adminTotal);

        combinedList.sort((a, b) => toMillisSafe(b.unifiedDate) - toMillisSafe(a.unifiedDate));
        setPayments(combinedList);
      } catch (e) {
        console.error("Dashboard Fetch Error:", e);
        Alert.alert(
          "Error",
          "Unable to load dashboard data. Please check your internet connection and try again.",
          [{ text: "OK" }]
        );
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [router]);

  const formatDateTime = (ts) => {
    const date = toDateSafe(ts);
    if (!date) return "N/A";
    return date.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredPayments = useMemo(() => {
    if (activeTab === "all") return payments;
    if (activeTab === "subscription") return payments.filter((p) => p.categoryType === "subscription");
    return payments.filter((p) => p.categoryType === "session");
  }, [activeTab, payments]);

  const totalRevenue = grandTotalSubs + grandTotalAdmin;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />

      {/* ✅ HEADER (SAFE AREA ONLY) */}
      <SafeAreaView edges={["top"]} style={styles.headerSafe}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Admin Insights</Text>
            <Text style={styles.subGreeting}>System monitoring & analytics</Text>
          </View>

          <TouchableOpacity
            onPress={() => setShowProfileMenu(true)}
            style={styles.profileBtn}
            activeOpacity={0.85}
          >
            <Ionicons name="person-circle" size={44} color="#01579B" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <View style={styles.innerLoader}>
            <ActivityIndicator size="large" color="#01579B" />
            <Text style={styles.loaderText}>Updating insights...</Text>
          </View>
        ) : (
          <>
            {/* Trend */}
            <Text style={styles.sectionTitle}>Consultant Application Trend</Text>
            <View style={styles.card}>
              <LineChart
                data={{
                  labels: ["Pend", "Appr", "Rej", "Total"],
                  datasets: [{ data: conTrend.map((n) => safeNum(n, 0)) }],
                }}
                width={screenWidth - 40}
                height={210}
                chartConfig={lineChartConfig}
                bezier
                style={styles.chartStyle}
              />
            </View>

            {/* Summary cards */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <View style={[styles.iconBox, { backgroundColor: "#E3F2FD" }]}>
                  <Ionicons name="people" size={20} color="#01579B" />
                </View>
                <Text style={styles.summaryValue}>{safeNum(totalUsers, 0)}</Text>
                <Text style={styles.summaryLabel}>Total Users</Text>
              </View>

              <View style={styles.summaryCard}>
                <View style={[styles.iconBox, { backgroundColor: "#E0F2F1" }]}>
                  <Ionicons name="school" size={20} color="#2c4f4f" />
                </View>
                <Text style={styles.summaryValue}>{safeNum(totalConsultants, 0)}</Text>
                <Text style={styles.summaryLabel}>Consultants</Text>
              </View>
            </View>

            {/* Revenue Distribution */}
            <Text style={styles.sectionTitle}>Revenue Distribution</Text>
            <View style={styles.cardCenter}>
              <View style={styles.totalOverlay}>
                <Text style={styles.overlayLabel}>Total Revenue</Text>
                <Text style={styles.overlayValue}>{formatMoney(totalRevenue)}</Text>
              </View>

              <PieChart
                data={[
                  {
                    name: "Subs",
                    population: grandTotalSubs > 0 ? grandTotalSubs : 0.1,
                    color: "#8f2f52",
                    legendFontColor: "#64748B",
                    legendFontSize: 12,
                  },
                  {
                    name: "Income",
                    population: grandTotalAdmin > 0 ? grandTotalAdmin : 0.1,
                    color: "#2c4f4f",
                    legendFontColor: "#64748B",
                    legendFontSize: 12,
                  },
                ]}
                width={screenWidth - 40}
                height={220}
                chartConfig={{ color: () => "#000" }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="35"
                absolute
              />
            </View>

            {/* Recent Transactions */}
            <View style={styles.tabHeader}>
              <Text style={styles.sectionTitleNoTop}>Recent Transactions</Text>

              <View style={styles.tabRow}>
                {[
                  { id: "all", label: "All" },
                  { id: "subscription", label: "Subs" },
                  { id: "session", label: "Income" },
                ].map((tab) => (
                  <TouchableOpacity
                    key={tab.id}
                    onPress={() => setActiveTab(tab.id)}
                    activeOpacity={0.85}
                    style={[styles.tabButton, activeTab === tab.id && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.listWrapper}>
              {filteredPayments.length > 0 ? (
                filteredPayments.map((p) => {
                  const isSub = p.categoryType === "subscription";
                  const accent = isSub ? "#8f2f52" : "#2c4f4f";
                  const bg = isSub ? "#FCE4EC" : "#E0F2F1";

                  return (
                    <View key={p.id} style={styles.paymentCard}>
                      <View style={[styles.iconCircle, { backgroundColor: bg }]}>
                        <Ionicons name={isSub ? "card" : "cash"} size={18} color={accent} />
                      </View>

                      <View style={styles.paymentMid}>
                        <Text style={styles.paymentTitle}>{isSub ? "Subscription" : "Admin Income"}</Text>
                        <Text style={styles.paymentDate}>{formatDateTime(p.unifiedDate)}</Text>
                      </View>

                      <Text style={[styles.paymentAmount, { color: accent }]}>
                        {formatMoney(p.displayAmount)}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No transactions found.</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Profile Menu */}
      <Modal
        visible={showProfileMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProfileMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowProfileMenu(false)}
        >
          <View style={styles.dropdownMenu}>
            <View style={styles.adminInfo}>
              <Ionicons name="shield-checkmark" size={18} color="#01579B" />
              <Text style={styles.adminLabel}>Administrator</Text>
            </View>

            <View style={styles.menuDivider} />

            <TouchableOpacity onPress={handleLogout} style={styles.logoutMenuItem} activeOpacity={0.85}>
              <Ionicons name="log-out-outline" size={20} color="#D32F2F" />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <BottomNavbar role="admin" />
    </View>
  );
}

const lineChartConfig = {
  backgroundColor: "#fff",
  backgroundGradientFrom: "#fff",
  backgroundGradientTo: "#fff",
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(1, 87, 155, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
  propsForDots: { r: "5", strokeWidth: "2", stroke: "#01579B" },
  propsForBackgroundLines: { strokeDasharray: "" },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FA" },

  headerSafe: {
    backgroundColor: "#FFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 25,
    paddingTop: 15,
    paddingBottom: 12,
  },
  greeting: { fontSize: 22, fontWeight: "900", color: "#01579B" },
  subGreeting: { fontSize: 12, color: "#64748B", marginTop: 2, fontWeight: "600" },
  profileBtn: { padding: 2, borderRadius: 999 },

  container: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  innerLoader: { marginTop: 120, alignItems: "center", justifyContent: "center" },
  loaderText: { marginTop: 10, color: "#64748B", fontWeight: "700" },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    paddingHorizontal: 20,
    marginTop: 22,
    marginBottom: 12,
  },
  sectionTitleNoTop: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 10,
  },

  card: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    borderRadius: 22,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardCenter: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    borderRadius: 22,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    alignItems: "center",
  },
  chartStyle: { borderRadius: 16, paddingRight: 36 },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 14,
  },
  summaryCard: {
    backgroundColor: "#fff",
    width: "48%",
    padding: 16,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  summaryValue: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  summaryLabel: { fontSize: 11, color: "#64748B", fontWeight: "800", marginTop: 2 },

  totalOverlay: {
    position: "absolute",
    top: "40%",
    zIndex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  overlayLabel: { fontSize: 10, color: "#64748B", fontWeight: "900", textTransform: "uppercase" },
  overlayValue: { fontSize: 14, fontWeight: "900", color: "#01579B", marginTop: 2 },

  tabHeader: { paddingHorizontal: 20, marginTop: 6 },
  tabRow: { flexDirection: "row", marginBottom: 10 },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
    marginRight: 8,
  },
  tabActive: { backgroundColor: "#01579B" },
  tabText: { fontSize: 12, fontWeight: "900", color: "#64748B" },
  tabTextActive: { color: "#fff" },

  listWrapper: { paddingHorizontal: 20, paddingBottom: 10 },
  paymentCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  iconCircle: { width: 40, height: 40, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  paymentMid: { flex: 1, marginLeft: 12 },
  paymentTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  paymentDate: { fontSize: 11, color: "#94A3B8", marginTop: 3, fontWeight: "700" },
  paymentAmount: { fontSize: 14, fontWeight: "900" },

  emptyBox: { padding: 40, alignItems: "center" },
  emptyText: { color: "#94A3B8", fontWeight: "800" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.22)" },
  dropdownMenu: {
    position: "absolute",
    top: Platform.OS === "android" ? 92 : 110,
    right: 18,
    backgroundColor: "#fff",
    borderRadius: 16,
    width: 190,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  adminInfo: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 6 },
  adminLabel: { marginLeft: 8, fontWeight: "900", color: "#334155", fontSize: 14 },
  menuDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 8 },
  logoutMenuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 8 },
  logoutText: { marginLeft: 10, color: "#D32F2F", fontWeight: "900" },
});
