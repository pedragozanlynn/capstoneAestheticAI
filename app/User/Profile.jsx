import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  StatusBar,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { useRouter } from "expo-router";

import { useFocusEffect } from "@react-navigation/native";

import useSubscriptionType from "../../services/useSubscriptionType";
import BottomNavbar from "../components/BottomNav";
import Button from "../components/Button";

const USER_ID_KEY = "aestheticai:current-user-id";

export default function Profile() {
  const router = useRouter();
  const subType = useSubscriptionType();

  const [userName, setUserName] = useState("Guest");
  const [gender, setGender] = useState("male");
  const [logoutVisible, setLogoutVisible] = useState(false);

  const loadUserFromDB = useCallback(async () => {
    try {
      const uid = await AsyncStorage.getItem(USER_ID_KEY);

      // ✅ Guard: if not logged in, force redirect (prevents back to protected screen)
      if (!uid) {
        try {
          if (typeof router.dismissAll === "function") router.dismissAll();
        } catch {}
        router.replace("/Login");
        return;
      }

      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) return;

      const data = snap.data();
      setUserName(data?.name || "Guest");
      setGender(data?.gender?.toLowerCase() || "male");
    } catch (err) {
      console.log("Error loading user from DB:", err);
    }
  }, [router]);

  // Initial load
  useEffect(() => {
    loadUserFromDB();
  }, [loadUserFromDB]);

  // ✅ Re-check every time screen is focused (important for Android back behavior)
  useFocusEffect(
    useCallback(() => {
      loadUserFromDB();
      return () => {};
    }, [loadUserFromDB])
  );

  const avatarSource =
    gender === "female"
      ? require("../../assets/office-woman.png")
      : require("../../assets/office-man.png");

  const handleLogoutConfirmed = async () => {
    try {
      const uid = await AsyncStorage.getItem(USER_ID_KEY);

      if (uid) {
        await updateDoc(doc(db, "users", uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
        });
      }

      // ✅ Clear local session
      await AsyncStorage.removeItem(USER_ID_KEY);

      // NOTE: keeping your AsyncStorage.clear() since you already use it
      // (but be aware it clears ALL keys for the app)
      await AsyncStorage.clear();

      setLogoutVisible(false);

      // ✅ Reset navigation stack so BACK won't return to Profile
      try {
        if (typeof router.dismissAll === "function") router.dismissAll();
      } catch {}

      router.replace("/Login");
    } catch (err) {
      console.log("Logout error:", err);
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" backgroundColor="#01579B" />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.avatarContainer}>
            <Image source={avatarSource} style={styles.avatarImage} />
            <View style={styles.onlineBadge} />
          </View>
          <View style={styles.headerTextInfo}>
            <Text style={styles.headerTitle}>{userName}</Text>
            <Text style={styles.headerSubtitle}>
              {subType ? `${subType} Member` : "Free Plan User"}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Account Settings</Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/User/EditProfile")}
        >
          <View style={[styles.iconCircle, { backgroundColor: "#E0F2FE" }]}>
            <Ionicons name="person-outline" size={22} color="#0284C7" />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Edit Profile</Text>
            <Text style={styles.cardSubtitle}>Update your name and gender</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/User/ChangePassword")}
        >
          <View style={[styles.iconCircle, { backgroundColor: "#FEF2F2" }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#DC2626" />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Security</Text>
            <Text style={styles.cardSubtitle}>Change your password</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/User/ManageSubscription")}
        >
          <View style={[styles.iconCircle, { backgroundColor: "#F0FDF4" }]}>
            <Ionicons name="card-outline" size={22} color="#16A34A" />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Subscription Plan</Text>
            <Text style={styles.cardSubtitle}>Current: {subType || "Free"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <View style={styles.logoutWrapper}>
          <Button
            icon={<Ionicons name="log-out-outline" size={22} color="#fff" />}
            title="Logout"
            onPress={() => setLogoutVisible(true)}
            textColor="#fff"
            backgroundColor="#0F3E48"
          />
        </View>
      </ScrollView>

      <BottomNavbar subType={subType} />

      <Modal visible={logoutVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirm Logout</Text>
            <Text style={styles.modalText}>
              Are you sure you want to logout from your account?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setLogoutVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleLogoutConfirmed}
              >
                <Text style={styles.confirmText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },

  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 50,
    paddingHorizontal: 25,
    paddingBottom: 35,
    backgroundColor: "#01579B",
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarContainer: {
    position: "relative",
  },
  avatarImage: {
    width: 70,
    height: 70,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  onlineBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#22C55E",
    borderWidth: 3,
    borderColor: "#01579B",
  },
  headerTextInfo: {
    marginLeft: 18,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
    fontWeight: "600",
  },

  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 25, paddingBottom: 120 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 35,
    marginBottom: 15,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: { flex: 1, marginLeft: 15 },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },

  logoutWrapper: {
    marginTop: 10,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 30,
    padding: 25,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F3E48",
    marginBottom: 10,
  },
  modalText: {
    fontSize: 15,
    color: "#64748B",
    marginBottom: 25,
    lineHeight: 22,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 18 },
  cancelText: { color: "#64748B", fontWeight: "700" },
  confirmBtn: {
    backgroundColor: "#DC2626",
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  confirmText: { color: "#fff", fontWeight: "700" },
});















