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
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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

  // ✅ Optional refresh UX (does not change Firestore logic)
  const [refreshing, setRefreshing] = useState(false);

  // -----------------------------
  // Load consultant profile
  // -----------------------------
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
          return;
        }

        const docRef = doc(db, "consultants", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setConsultant({ uid: currentUser.uid, ...docSnap.data() });
        }
      } catch (err) {
        console.error("Error loading consultant profile:", err);
      }
    };

    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentUid = useMemo(() => {
    return consultant?.uid || auth.currentUser?.uid || null;
  }, [consultant, auth.currentUser]);

  // -----------------------------
  // Realtime unread notifications
  // -----------------------------
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

  // -----------------------------
  // Recent appointments + balance
  // -----------------------------
  useEffect(() => {
    if (!currentUid) return;

    setLoading(true);

    const appointmentsQuery = query(
      collection(db, "appointments"),
      where("consultantId", "==", currentUid),
      orderBy("appointmentAt", "desc"),
      limit(3)
    );

    const unsubAppointments = onSnapshot(
      appointmentsQuery,
      async (snapshot) => {
        try {
          const requests = await Promise.all(
            snapshot.docs.map(async (docSnap) => {
              const data = docSnap.data() || {};
              let userName = "Unknown User";

              if (data.userId) {
                try {
                  const userDoc = await getDoc(doc(db, "users", String(data.userId)));
                  if (userDoc.exists()) {
                    const u = userDoc.data() || {};
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
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.log("Appointments listener error:", err);
        setLoading(false);
      }
    );

    const paymentsQuery = query(
      collection(db, "payments"),
      where("consultantId", "==", currentUid)
    );

    const unsubPayments = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        let totalBalance = 0;
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          totalBalance += Number(data.amount) || 0;
        });
        setBalance(totalBalance);
      },
      (err) => console.log("Payments listener error:", err)
    );

    return () => {
      unsubAppointments();
      unsubPayments();
    };
  }, [currentUid]);

  const formatTime = (ts) => {
    const d = ts?.toDate?.();
    if (!d) return "—";
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true, // ✅ AM/PM
    });
  };
  

  const formatDate = (ts) => {
    const d = ts?.toDate?.();
    if (!d) return "—";
    return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  };

  const onRefresh = async () => {
    // Since Firestore is realtime, refresh is just UX (spinner)
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  };

  // -----------------------------
  // UI: Appointment Card
  // -----------------------------
  const renderAppointment = ({ item }) => {
    const time = formatTime(item.appointmentAt);
    const date = formatDate(item.appointmentAt);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.apptCard}
        onPress={() => {
          // OPTIONAL: open requests or chat room
          // router.push("/Consultant/Requests");
          // If you have chatRoomId stored in appointment:
          // if (item.chatRoomId && item.userId) router.push({ pathname: "/Consultant/ChatRoom", params: { roomId: item.chatRoomId, userId: item.userId } });
          router.push("/Consultant/Requests");
        }}
      >
        <View style={styles.apptLeft}>
          <View style={styles.apptAvatar}>
            <Ionicons name="person" size={18} color="#0F172A" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.apptName} numberOfLines={1}>
              {item.userName}
            </Text>

            <View style={styles.apptMetaRow}>
              <Ionicons name="time-outline" size={14} color="#64748B" />
              <Text style={styles.apptMetaText}>{time}</Text>
              <Text style={styles.apptDot}>•</Text>
              <Ionicons name="calendar-outline" size={14} color="#64748B" />
              <Text style={styles.apptMetaText}>{date}</Text>
            </View>
          </View>
        </View>

        <View style={styles.apptRight}>
          <View style={styles.apptChip}>
            <Text style={styles.apptChipText}>Appointment</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent={false} />

      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.headerArea}>
          <View style={styles.welcomeRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.header} numberOfLines={1}>
                Hi, {consultant?.fullName || "Consultant"}
              </Text>
              <Text style={styles.subtext} numberOfLines={1}>
                {consultant?.consultantType || "Professional"} •{" "}
                {consultant?.specialization || "Expert"}
              </Text>
            </View>

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
                {Number(balance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.withdrawBtn}
              onPress={() => router.push("/Consultant/EarningsScreen")}
              activeOpacity={0.85}
            >
              <Ionicons name="wallet-outline" size={16} color="#fff" style={{ marginRight: 7 }} />
              <Text style={styles.withdrawText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={loading ? [] : recentRequests}
        keyExtractor={(item) => item.id}
        renderItem={renderAppointment}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={[styles.actionCard, styles.actionCardTeal]}
                onPress={() => router.push("/Consultant/EditProfile")}
                activeOpacity={0.85}
              >
                <Image source={require("../../assets/edit.png")} style={styles.actionIcon} />
                <Text style={styles.actionText}>Edit Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, styles.actionCardPurple]}
                onPress={() => router.push("/Consultant/EditAvailability")}
                activeOpacity={0.85}
              >
                <Image source={require("../../assets/schedule.png")} style={styles.actionIcon} />
                <Text style={styles.actionText}>Availability</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Appointments</Text>
              <TouchableOpacity onPress={() => router.push("/Consultant/Requests")} activeOpacity={0.85}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            {loading && (
              <View style={styles.listLoader}>
                <ActivityIndicator color="#01579B" />
                <Text style={styles.loadingHint}>Loading appointments…</Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons name="calendar-outline" size={28} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>No recent appointments</Text>
              <Text style={styles.emptySub}>New bookings will appear here.</Text>
            </View>
          ) : null
        }
      />

      <BottomNavbar role="consultant" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  safeArea: { backgroundColor: "#FFF" },

  headerArea: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 25 : 6,
    paddingBottom: 10,
    backgroundColor: "#FFF",
  },

  welcomeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },

  header: {
    fontSize: 22,
    fontWeight: "900",
    color: "#1E293B",
  },
  subtext: { fontSize: 13, color: "#64748B", marginTop: 2 },

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
    padding: 20,
    borderRadius: 22,
    backgroundColor: "#01579B",
    marginTop: 8,
    shadowColor: "#01579B",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 7,
  },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: "700" },
  balanceAmount: { fontSize: 26, fontWeight: "900", color: "#FFF", marginTop: 3 },

  withdrawBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3fa796",
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
  },
  withdrawText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 120 },

  quickActions: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  actionCard: {
    flex: 1,
    marginHorizontal: 6,
    height: 95,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  actionCardTeal: { backgroundColor: "#E0F7FA" },
  actionCardPurple: { backgroundColor: "#F3E5F5" },
  actionIcon: { width: 32, height: 32, marginBottom: 8, resizeMode: "contain" },
  actionText: { fontWeight: "900", fontSize: 12, color: "#334155" },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "900", color: "#1E293B" },
  viewAllText: { fontSize: 13, fontWeight: "800", color: "#01579B" },

  listLoader: { paddingVertical: 18, flexDirection: "row", alignItems: "center", gap: 10 },
  loadingHint: { color: "#64748B", fontWeight: "700" },

  // ✅ Improved appointment cards
  apptCard: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  apptLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 },
  apptAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  apptName: { fontSize: 15, fontWeight: "900", color: "#0F172A", marginBottom: 4 },
  apptMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  apptMetaText: { fontSize: 12, color: "#64748B", fontWeight: "700", marginLeft: 5 },
  apptDot: { marginHorizontal: 8, color: "#CBD5E1", fontWeight: "900" },

  apptRight: { alignItems: "flex-end", gap: 6 },
  apptChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  apptChipText: { fontSize: 11, fontWeight: "900", color: "#334155" },

  emptyContainer: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 14, fontWeight: "900", color: "#1E293B" },
  emptySub: { marginTop: 2, fontSize: 12, color: "#64748B", fontWeight: "700" },
});
