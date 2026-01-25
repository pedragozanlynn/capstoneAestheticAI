import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";

export default function Homepage() {
  const router = useRouter();
  const auth = getAuth();

  const [consultant, setConsultant] = useState(null);
  const [recentRequests, setRecentRequests] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // ✅ Notification badge
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const keys = await AsyncStorage.getAllKeys();
        const profileKey = keys.find((k) =>
          k.startsWith(`aestheticai:user-profile:${currentUser.uid}`)
        );

        if (profileKey) {
          const data = await AsyncStorage.getItem(profileKey);
          setConsultant(JSON.parse(data));
        } else {
          const docRef = doc(db, "consultants", currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setConsultant({ uid: currentUser.uid, ...docSnap.data() });
          }
        }
      } catch (err) {
        console.error("Error loading consultant profile:", err);
      }
    };
    loadProfile();
  }, []);

  const currentUid = useMemo(() => {
    return consultant?.uid || auth.currentUser?.uid || null;
  }, [consultant, auth.currentUser]);

  // ✅ App-ready: realtime unread notifications for consultant
  useEffect(() => {
    if (!currentUid) return;

    const notifQ = query(
      collection(db, "notifications"),
      where("recipientRole", "==", "consultant"),
      where("recipientId", "==", currentUid),
      where("read", "==", false)
    );

    const unsubNotif = onSnapshot(
      notifQ,
      (snap) => setUnreadNotifCount(snap.size || 0),
      (err) => console.error("Notif listener error:", err)
    );

    return () => unsubNotif();
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid) return;

    setLoading(true);

    const appointmentsQuery = query(
      collection(db, "appointments"),
      where("consultantId", "==", currentUid),
      orderBy("appointmentAt", "desc"),
      limit(3)
    );

    const unsubAppointments = onSnapshot(appointmentsQuery, async (snapshot) => {
      const requests = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let userName = "Unknown User";

          if (data.userId) {
            try {
              const userDoc = await getDoc(doc(db, "users", data.userId));
              if (userDoc.exists()) {
                const u = userDoc.data();
                userName = u.fullName || u.name || "Unnamed User";
              }
            } catch (err) {
              console.log("User fetch error:", err);
            }
          }

          return { id: docSnap.id, ...data, userName };
        })
      );

      setRecentRequests(requests);
      setLoading(false);
    });

    const paymentsQuery = query(
      collection(db, "payments"),
      where("consultantId", "==", currentUid)
    );

    const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
      let totalBalance = 0;
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        totalBalance += Number(data.amount) || 0;
      });
      setBalance(totalBalance);
    });

    return () => {
      unsubAppointments();
      unsubPayments();
    };
  }, [currentUid]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent={false} />

      {/* ✅ App-ready SafeArea (safe-area-context) */}
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.headerArea}>
          <View style={styles.welcomeRow}>
            <View>
              <Text style={styles.header}>
                Hi, {consultant?.fullName || "Consultant"}
              </Text>
              <Text style={styles.subtext}>
                {consultant?.consultantType || "Professional"} •{" "}
                {consultant?.specialization || "Expert"}
              </Text>
            </View>

            {/* ✅ Notification icon (replaces the circle) */}
            <TouchableOpacity
              style={styles.notifBtn}
              onPress={() => router.push("/Consultant/Notifications")}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={24} color="#0F172A" />
              {unreadNotifCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadNotifCount > 99 ? "99+" : String(unreadNotifCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.balanceCard}>
            <View>
              <Text style={styles.balanceLabel}>Current Balance</Text>
              <Text style={styles.balanceAmount}>
                ₱{" "}
                {balance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.withdrawBtn}
              onPress={() => router.push("/Consultant/EarningsScreen")}
              activeOpacity={0.7}
            >
              <Text style={styles.withdrawText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={loading ? [] : recentRequests}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <>
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={[styles.actionCard, styles.actionCardTeal]}
                onPress={() => router.push("/Consultant/EditProfile")}
              >
                <Image
                  source={require("../../assets/edit.png")}
                  style={styles.actionIcon}
                />
                <Text style={styles.actionText}>Edit Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, styles.actionCardPurple]}
                onPress={() => router.push("/Consultant/EditAvailability")}
              >
                <Image
                  source={require("../../assets/schedule.png")}
                  style={styles.actionIcon}
                />
                <Text style={styles.actionText}>Availability</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Appointments</Text>
              <TouchableOpacity onPress={() => router.push("/Consultant/Requests")}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            {loading && (
              <View style={styles.listLoader}>
                <ActivityIndicator color="#01579B" />
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.requestItem}>
            <View style={styles.requestInfo}>
              <Text style={styles.requestName}>{item.userName}</Text>
              <View style={styles.requestMeta}>
                <Text style={styles.requestTime}>
                  {item.appointmentAt
                    ?.toDate()
                    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Text style={styles.dot}>•</Text>
                <Text style={styles.requestDate}>
                  {item.appointmentAt?.toDate().toLocaleDateString()}
                </Text>
              </View>
            </View>
            <View style={styles.statusDot} />
          </View>
        )}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <Text style={styles.placeholderText}>No recent appointments</Text>
            </View>
          )
        }
      />

      <BottomNavbar role="consultant" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  // ✅ App-ready safe area
  safeArea: { backgroundColor: "#FFF" },

  headerArea: {
    paddingHorizontal: 20,
    // ✅ “ibaba yung header” in an app-safe way:
    // keep a small consistent top padding without hardcoding huge values
    paddingTop: Platform.OS === "android" ? 25 : 6,
    paddingBottom: 10,
   
  },

  welcomeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
  },

  header: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
    // ✅ remove the old hard paddingTop:20 so it won’t break on devices
    paddingTop: 0,
  },

  subtext: { fontSize: 13, color: "#64748B", marginTop: 2 },

  // ✅ Notification bell
  notifBtn: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  notifBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "900" },

  balanceCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 22,
    borderRadius: 24,
    backgroundColor: "#01579B",
    marginBottom: 5,
    elevation: 8,
    shadowColor: "#01579B",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    marginTop: 10,
  },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  balanceAmount: { fontSize: 26, fontWeight: "900", color: "#FFF", marginTop: 4 },
  withdrawBtn: {
    backgroundColor: "#3fa796",
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  withdrawText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
  quickActions: { flexDirection: "row", justifyContent: "space-between", marginBottom: 25 },
  actionCard: {
    flex: 1,
    marginHorizontal: 6,
    height: 95,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
  },
  actionCardTeal: { backgroundColor: "#E0F7FA" },
  actionCardPurple: { backgroundColor: "#F3E5F5" },
  actionIcon: { width: 32, height: 32, marginBottom: 8, resizeMode: "contain" },
  actionText: { fontWeight: "800", fontSize: 12, color: "#334155" },

  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: "#1E293B" },
  viewAllText: { fontSize: 13, fontWeight: "700", color: "#01579B" },

  requestItem: {
    backgroundColor: "#FFF",
    padding: 18,
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.03,
  },
  requestInfo: { flex: 1 },
  requestName: { fontSize: 16, fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  requestMeta: { flexDirection: "row", alignItems: "center" },
  requestTime: { fontSize: 12, color: "#64748B" },
  requestDate: { fontSize: 12, color: "#64748B" },
  dot: { marginHorizontal: 6, color: "#CBD5E1" },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#912f56" },

  listLoader: { padding: 20 },
  emptyContainer: { alignItems: "center", marginTop: 20 },
  placeholderText: { textAlign: "center", color: "#94A3B8", fontSize: 14 },
});
