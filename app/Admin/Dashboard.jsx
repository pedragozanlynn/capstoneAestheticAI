import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useState } from "react";
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
  SafeAreaView,
  Platform
} from "react-native";
import { LineChart, PieChart } from "react-native-chart-kit";
import { auth, db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";

const screenWidth = Dimensions.get("window").width;

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalConsultants, setTotalConsultants] = useState(0);
  const [conTrend, setConTrend] = useState([0, 0, 0, 0]);
  const [grandTotalSubs, setGrandTotalSubs] = useState(0);
  const [grandTotalAdmin, setGrandTotalAdmin] = useState(0);
  const [payments, setPayments] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
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
            setTimeout(() => {
              router.replace("/Admin/Login");
            }, 50);
          } catch (error) {
            Alert.alert("Error", "Failed to logout.");
          }
        },
      },
    ]);
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const [uSnap, cSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "consultants"))
        ]);
        
        setTotalUsers(uSnap.size);
        const consData = cSnap.docs.map(d => d.data());
        setTotalConsultants(consData.length);
        setConTrend([
          consData.filter(c => c.status === "pending").length,
          consData.filter(c => c.status === "accepted").length,
          consData.filter(c => c.status === "rejected").length,
          consData.length
        ]);

        const paymentsSnap = await getDocs(collection(db, "subscription_payments"));
        let sTotal = 0;
        let aTotal = 0;
        const combinedList = [];

        paymentsSnap.forEach((doc) => {
          const d = doc.data();
          const amt = Number(d.amount) || 0;
          if (d.type === "admin_income" && d.status === "completed") {
            aTotal += amt;
            combinedList.push({ id: doc.id, ...d, categoryType: 'session', displayAmount: amt, unifiedDate: d.createdAt });
          } else if (d.status === "Approved") {
            sTotal += amt;
            combinedList.push({ id: doc.id, ...d, categoryType: 'subscription', displayAmount: amt, unifiedDate: d.timestamp });
          }
        });

        setGrandTotalSubs(sTotal);
        setGrandTotalAdmin(aTotal);
        const sorted = combinedList.sort((a, b) => (b.unifiedDate?.toMillis?.() || 0) - (a.unifiedDate?.toMillis?.() || 0));
        setPayments(sorted);
      } catch (e) {
        console.error("Dashboard Fetch Error:", e);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  const formatDateTime = (ts) => {
    if (!ts) return "N/A";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredPayments = activeTab === "all" 
    ? payments 
    : payments.filter(p => activeTab === "subscription" ? p.categoryType === "subscription" : p.categoryType === "session");

  return (
    <View style={{ flex: 1, backgroundColor: "#F4F7FA" }}>
      {/* 1. Tinitiyak na ang status bar ay visible at may background */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent={false} />
      
      {/* 2. SafeAreaView wrapper para sa Header */}
      <SafeAreaView style={styles.headerSafe}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Admin Insights</Text>
            <Text style={styles.subGreeting}>System monitoring & analytics</Text>
          </View>
          <TouchableOpacity onPress={() => setShowProfileMenu(true)} style={styles.profileBtn}>
            <Ionicons name="person-circle" size={45} color="#01579B" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 120}}>
        
        {loading ? (
          <View style={styles.innerLoader}>
            <ActivityIndicator size="large" color="#01579B" />
            <Text style={styles.loaderText}>Updating insights...</Text>
          </View>
        ) : (
          <>
            {/* CONSULTANT TREND */}
            <Text style={styles.sectionTitle}>Consultant Application Trend</Text>
            <View style={styles.chartCard}>
              <LineChart
                data={{
                  labels: ["Pend", "Appr", "Rej", "Total"],
                  datasets: [{ data: conTrend }]
                }}
                width={screenWidth - 40}
                height={200}
                chartConfig={lineChartConfig}
                bezier
                style={styles.chartStyle}
              />
            </View>

            {/* SUMMARY CARDS */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <View style={[styles.iconBox, {backgroundColor: '#E3F2FD'}]}>
                  <Ionicons name="people" size={20} color="#01579B" />
                </View>
                <Text style={styles.summaryValue}>{totalUsers}</Text>
                <Text style={styles.summaryLabel}>Total Users</Text>
              </View>
              <View style={styles.summaryCard}>
                <View style={[styles.iconBox, {backgroundColor: '#E0F2F1'}]}>
                  <Ionicons name="school" size={20} color="#2c4f4f" />
                </View>
                <Text style={styles.summaryValue}>{totalConsultants}</Text>
                <Text style={styles.summaryLabel}>Consultants</Text>
              </View>
            </View>

            {/* REVENUE CHART */}
            <Text style={styles.sectionTitle}>Revenue Distribution</Text>
            <View style={styles.whiteCard}>
              <View style={styles.totalOverlay}>
                <Text style={styles.overlayLabel}>Total Revenue</Text>
                <Text style={styles.overlayValue}>₱{(grandTotalSubs + grandTotalAdmin).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              </View>
              <PieChart
                data={[
                  { name: "Subs", population: grandTotalSubs || 0.1, color: "#8f2f52", legendFontColor: "#7F7F7F", legendFontSize: 12 },
                  { name: "Income", population: grandTotalAdmin || 0.1, color: "#2c4f4f", legendFontColor: "#7F7F7F", legendFontSize: 12 },
                ]}
                width={screenWidth - 40}
                height={200}
                chartConfig={{ color: () => "#000" }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="35"
                absolute={true} 
              />
            </View>

            {/* TRANSACTIONS */}
            <View style={styles.tabHeader}>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              <View style={styles.tabRow}>
                {["all", "subscription", "session"].map((tab) => (
                  <TouchableOpacity 
                    key={tab} 
                    onPress={() => setActiveTab(tab)}
                    style={[styles.tabButton, activeTab === tab && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                      {tab === "all" ? "All" : tab === "subscription" ? "Subs" : "Income"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.listWrapper}>
              {filteredPayments.length > 0 ? (
                filteredPayments.map((p) => (
                  <View key={p.id} style={styles.paymentCard}>
                    <View style={[styles.iconCircle, {backgroundColor: p.categoryType === 'subscription' ? '#FCE4EC' : '#E0F2F1'}]}>
                      <Ionicons name={p.categoryType === 'subscription' ? "card" : "cash"} size={18} color={p.categoryType === 'subscription' ? '#8f2f52' : '#2c4f4f'} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.paymentTitle}>{p.categoryType === 'subscription' ? 'Subscription' : 'Admin Share'}</Text>
                      <Text style={styles.paymentDate}>{formatDateTime(p.unifiedDate)}</Text>
                    </View>
                    <Text style={[styles.paymentAmount, {color: p.categoryType === 'subscription' ? '#8f2f52' : '#2c4f4f'}]}>
                      ₱{(p.displayAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                ))
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No transactions found.</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* PROFILE MODAL */}
      <Modal visible={showProfileMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowProfileMenu(false)}>
          <View style={styles.dropdownMenu}>
            <View style={styles.adminInfo}>
              <Ionicons name="shield-checkmark" size={18} color="#01579B" />
              <Text style={styles.adminLabel}>Administrator</Text>
            </View>
            <View style={styles.menuDivider} />
            <TouchableOpacity onPress={handleLogout} style={styles.logoutMenuItem}>
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
  propsForBackgroundLines: { strokeDasharray: "" }
};

const styles = StyleSheet.create({
  headerSafe: { 
    backgroundColor: '#FFF', 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowRadius: 5 
  },
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 25, 
    // In-adjust ang padding para magmukhang balance sa safe area
    paddingVertical: Platform.OS === 'android' ? 20 : 15 
  },
  greeting: { fontSize: 22, fontWeight: "800", color: "#01579B" },
  subGreeting: { fontSize: 12, color: '#64748B', marginTop: -2 },
  container: { flex: 1 },
  innerLoader: { marginTop: 100, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 10, color: '#64748B', fontWeight: '500' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  dropdownMenu: { position: 'absolute', top: 100, right: 20, backgroundColor: '#fff', borderRadius: 15, width: 180, padding: 12, elevation: 10 },
  adminInfo: { flexDirection: 'row', alignItems: 'center', padding: 5 },
  adminLabel: { marginLeft: 8, fontWeight: '700', color: '#334155', fontSize: 14 },
  menuDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 8 },
  logoutMenuItem: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  logoutText: { marginLeft: 10, color: '#D32F2F', fontWeight: '700' },

  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1E293B", paddingHorizontal: 20, marginTop: 25, marginBottom: 12 },
  chartCard: { backgroundColor: "#fff", marginHorizontal: 20, borderRadius: 24, padding: 15, elevation: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  chartStyle: { borderRadius: 16, marginVertical: 0, paddingRight: 40 },
  
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 15 },
  summaryCard: { backgroundColor: '#fff', width: '48%', padding: 18, borderRadius: 24, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05 },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#1E293B' },
  summaryLabel: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 2 },

  whiteCard: { backgroundColor: "#fff", marginHorizontal: 20, borderRadius: 24, padding: 20, elevation: 4, alignItems: 'center' },
  totalOverlay: { position: 'absolute', top: '40%', zIndex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)', padding: 10, borderRadius: 50 }, 
  overlayLabel: { fontSize: 10, color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' },
  overlayValue: { fontSize: 14, fontWeight: '800', color: '#01579B' },

  tabHeader: { paddingHorizontal: 20 },
  tabRow: { flexDirection: 'row', marginBottom: 10 },
  tabButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#E2E8F0', marginRight: 8 },
  tabActive: { backgroundColor: '#01579B' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#fff' },

  listWrapper: { paddingHorizontal: 20 },
  paymentCard: { backgroundColor: "#fff", padding: 16, borderRadius: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  iconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  paymentTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  paymentDate: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  paymentAmount: { fontSize: 16, fontWeight: '800' },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#94A3B8' }
});