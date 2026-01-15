import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import { Ionicons } from "@expo/vector-icons";

export default function EarningsScreen() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const auth = getAuth();
  const consultantUid = auth?.currentUser?.uid;

  /* ================= LOAD EARNINGS ================= */
  useEffect(() => {
    if (!consultantUid) return;
    const ref = collection(db, "payments");
    const q = query(
      ref,
      where("consultantId", "==", consultantUid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const items = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let userName = "System";

          if (data.userId && data.type === "consultant_earning") {
            try {
              const userDoc = await getDoc(doc(db, "users", data.userId));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                userName = userData.name || userData.fullName || "User";
              }
            } catch {}
          }

          return {
            id: docSnap.id,
            ...data,
            userName,
            consultantAmount: Number(data.amount) || 0,
          };
        })
      );

      setEntries(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [consultantUid]);

  const total = entries.reduce(
    (sum, e) => sum + (Number(e.consultantAmount) || 0),
    0
  );

  const filteredEntries = entries.filter((item) => {
    if (activeTab === "all") return true;
    if (activeTab === "earned") return item.type === "consultant_earning";
    if (activeTab === "withdraw") return item.type === "withdraw";
    if (activeTab === "reversal") return item.type === "withdraw_reversal";
    return true;
  });

  const submitWithdraw = async () => {
    if (!withdrawAmount.trim() || !gcashNumber.trim()) {
      Alert.alert("Missing Info", "Please enter amount and GCash number.");
      return;
    }
    const amountNum = parseFloat(withdrawAmount);
    if (amountNum <= 0 || amountNum > total) {
      Alert.alert("Invalid Amount", "Withdrawal exceeds balance.");
      return;
    }

    try {
      await addDoc(collection(db, "payouts"), {
        consultantId: consultantUid,
        amount: amountNum,
        gcash_number: gcashNumber,
        createdAt: serverTimestamp(),
        status: "pending",
      });

      await addDoc(collection(db, "payments"), {
        consultantId: consultantUid,
        userId: consultantUid,
        type: "withdraw",
        amount: -amountNum,
        createdAt: serverTimestamp(),
        status: "pending",
      });

      Alert.alert("Success", "Withdrawal request submitted.");
      setWithdrawVisible(false);
      setWithdrawAmount("");
      setGcashNumber("");
    } catch (err) {
      Alert.alert("Error", "Failed to submit withdrawal.");
    }
  };

  const renderTransaction = ({ item }) => {
    const isEarning = item.type === "consultant_earning" || item.type === "withdraw_reversal";
    const isWithdraw = item.type === "withdraw";

    return (
      <View style={styles.card}>
        <View style={styles.cardIconWrap(item.type)}>
          <Ionicons 
            name={isEarning ? "arrow-down-outline" : "arrow-up-outline"} 
            size={20} 
            color={isEarning ? "#065F46" : "#991B1B"} 
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {item.type === "consultant_earning" ? "Consultation Fee" : 
             item.type === "withdraw" ? "Withdrawal" : "Refund Reversal"}
          </Text>
          <Text style={styles.cardDate}>
            {item.createdAt?.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <Text style={[styles.amount, { color: isEarning ? "#059669" : "#DC2626" }]}>
          {isEarning ? "+" : "-"} ₱{Math.abs(item.consultantAmount).toFixed(2)}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.headerArea}>
        <SafeAreaView>
          <View style={styles.balanceCard}>
            <View>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceAmount}>₱ {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            </View>
            <TouchableOpacity
              style={styles.balanceWithdrawBtn}
              onPress={() => setWithdrawVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="wallet-outline" size={18} color="#FFF" style={{marginRight: 6}} />
              <Text style={styles.balanceWithdrawText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.content}>
        <Text style={styles.historyTitle}>Transactions</Text>
        
        <View style={styles.tabsRow}>
          {["all", "earned", "withdraw", "reversal"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === "all" ? "All" : tab === "earned" ? "Fees" : tab === "withdraw" ? "Paid" : "Rev"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}>
             <Text style={styles.loadingText}>Updating balance...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredEntries}
            keyExtractor={(item) => item.id}
            renderItem={renderTransaction}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Ionicons name="receipt-outline" size={50} color="#CBD5E1" />
                <Text style={styles.emptyText}>No transactions in this category</Text>
              </View>
            }
          />
        )}
      </View>

      {/* WITHDRAW MODAL */}
      <Modal visible={withdrawVisible} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw via GCash</Text>
              <TouchableOpacity onPress={() => setWithdrawVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Withdrawal Amount</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.currencyPrefix}>₱</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>GCash Mobile Number</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="phone-portrait-outline" size={18} color="#94A3B8" style={{marginLeft: 10}} />
                <TextInput
                  style={[styles.input, { paddingLeft: 10 }]}
                  keyboardType="phone-pad"
                  placeholder="0912 345 6789"
                  value={gcashNumber}
                  onChangeText={setGcashNumber}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={submitWithdraw}>
              <Text style={styles.submitText}>Submit Request</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <BottomNavbar role="consultant" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  headerArea: { backgroundColor: "#01579B", paddingBottom: 20 , paddingTop:10,},
  balanceCard: { paddingHorizontal: 25, paddingTop: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: '600' },
  balanceAmount: { fontSize: 32, fontWeight: "900", color: "#fff", marginTop: 2 },
  balanceWithdrawBtn: { backgroundColor: "#3fa796", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 15, flexDirection: 'row', alignItems: 'center' },
  balanceWithdrawText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  content: { flex: 1, paddingHorizontal: 20, paddingTop: 25 },
  historyTitle: { fontSize: 18, fontWeight: "800", color: "#1E293B", marginBottom: 15 },

  tabsRow: { flexDirection: "row", marginBottom: 20, gap: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#F1F5F9", alignItems: "center" },
  tabActive: { backgroundColor: "#01579B" },
  tabText: { fontSize: 11, fontWeight: "800", color: "#64748B" },
  tabTextActive: { color: "#fff" },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: "#fff", padding: 16, borderRadius: 20, marginBottom: 12, elevation: 2, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10 },
  cardIconWrap: (type) => ({ width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15, backgroundColor: type.includes('withdraw') ? '#FEE2E2' : '#D1FAE5' }),
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#1E293B" },
  cardDate: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  amount: { fontSize: 16, fontWeight: "900" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "center", padding: 25 },
  modalBox: { backgroundColor: "#fff", borderRadius: 30, padding: 25, elevation: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#1E293B" },
  
  inputGroup: { marginBottom: 18 },
  inputLabel: { fontSize: 13, fontWeight: "700", color: "#64748B", marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 15, borderWidth: 1, borderColor: '#E2E8F0' },
  currencyPrefix: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginLeft: 15 },
  input: { flex: 1, padding: 15, fontSize: 16, color: '#1E293B', fontWeight: '600' },
  
  submitBtn: { backgroundColor: "#01579B", paddingVertical: 16, borderRadius: 15, marginTop: 10, elevation: 4, shadowColor: '#01579B', shadowOpacity: 0.3, shadowRadius: 8 },
  submitText: { color: "#fff", textAlign: "center", fontWeight: "800", fontSize: 16 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#64748B', fontWeight: '600' },
  emptyBox: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: "#94A3B8", marginTop: 10, fontWeight: "600" }
});