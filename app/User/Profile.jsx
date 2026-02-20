import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";

import useSubscriptionType from "../../services/useSubscriptionType";
import BottomNavbar from "../components/BottomNav";
import Button from "../components/Button";
import CenterMessageModal from "../components/CenterMessageModal";

const USER_ID_KEY = "aestheticai:current-user-id";

export default function Profile() {
  const router = useRouter();
  const subType = useSubscriptionType();

  const [userName, setUserName] = useState("Guest");
  const [gender, setGender] = useState("male");

  const [logoutVisible, setLogoutVisible] = useState(false);

  // Center modal for success/error messages
  const [centerModal, setCenterModal] = useState({
    visible: false,
    type: "success",
    title: "Success",
    message: "",
  });

  const closeCenterModal = useCallback(() => {
    setCenterModal((m) => ({ ...m, visible: false }));
  }, []);

  const avatarSource = useMemo(() => {
    return gender === "female"
      ? require("../../assets/office-woman.png")
      : require("../../assets/office-man.png");
  }, [gender]);

  const membershipLabel = useMemo(() => {
    return subType ? `${subType} Member` : "Free Plan User";
  }, [subType]);

  const loadUserFromDB = useCallback(async () => {
    try {
      const uid = await AsyncStorage.getItem(USER_ID_KEY);

      // Guard: no session -> back to Login
      if (!uid) {
        try {
          if (typeof router.dismissAll === "function") router.dismissAll();
        } catch {}
        router.replace("/Login");
        return;
      }

      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) return;

      const data = snap.data() || {};
      setUserName(data?.name || "Guest");
      setGender(String(data?.gender || "male").toLowerCase());
    } catch (err) {
      console.log("Error loading user from DB:", err);
    }
  }, [router]);

  useEffect(() => {
    loadUserFromDB();
  }, [loadUserFromDB]);

  useFocusEffect(
    useCallback(() => {
      loadUserFromDB();
      return () => {};
    }, [loadUserFromDB])
  );

  const navigateToLogin = useCallback(() => {
    try {
      if (typeof router.dismissAll === "function") router.dismissAll();
    } catch {}
    router.replace("/Login");
  }, [router]);

  const handleLogoutConfirmed = useCallback(async () => {
    try {
      const uid = await AsyncStorage.getItem(USER_ID_KEY);

      if (uid) {
        await updateDoc(doc(db, "users", uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
        });
      }

      // Clear local session
      await AsyncStorage.removeItem(USER_ID_KEY);

      // NOTE: This clears ALL keys for the app (kept because you already use it)
      await AsyncStorage.clear();

      setLogoutVisible(false);

      // Show success message via center modal
      setCenterModal({
        visible: true,
        type: "success",
        title: "Logged Out",
        message: "You have been logged out successfully.",
      });
    } catch (err) {
      console.log("Logout error:", err);
      setLogoutVisible(false);
      setCenterModal({
        visible: true,
        type: "error",
        title: "Logout Failed",
        message: "Unable to logout right now. Please try again.",
      });
    }
  }, []);

  return (
    <View style={styles.page}>
      {/* ✅ STATUS BAR (clean + consistent) */}
      <StatusBar
        barStyle="light-content"
        backgroundColor="#0B4F7B"
        translucent={Platform.OS === "android"}
      />

      {/* ✅ HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.avatarContainer}>
            <Image source={avatarSource} style={styles.avatarImage} />
            <View style={styles.onlineBadge} />
          </View>

          <View style={styles.headerTextInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {userName}
            </Text>
            <View style={styles.planRow}>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {membershipLabel}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ✅ CONTENT */}
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Account Settings</Text>

        <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => router.push("/User/EditProfile")}>
          <View style={[styles.iconCircle, { backgroundColor: "#E0F2FE" }]}>
            <Ionicons name="person-outline" size={22} color="#0284C7" />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Edit Profile</Text>
            <Text style={styles.cardSubtitle}>Update your name and gender</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => router.push("/User/ChangePassword")}>
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
          activeOpacity={0.9}
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

      {/* ✅ LOGOUT CONFIRM MODAL (UI improved) */}
      <Modal visible={logoutVisible} transparent animationType="fade" onRequestClose={() => setLogoutVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="log-out-outline" size={26} color="#DC2626" />
            </View>

            <Text style={styles.modalTitle}>Confirm Logout</Text>
            <Text style={styles.modalText}>Are you sure you want to logout from your account?</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.9} onPress={() => setLogoutVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.confirmBtn} activeOpacity={0.9} onPress={handleLogoutConfirmed}>
                <Text style={styles.confirmText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ CENTER MESSAGE MODAL */}
      <CenterMessageModal
        visible={centerModal.visible}
        type={centerModal.type}
        title={centerModal.title}
        message={centerModal.message}
        primaryText="OK"
        onPrimaryPress={() => {
          closeCenterModal();
          // If logout succeeded, go to login. (title is “Logged Out”)
          if (centerModal.title === "Logged Out") navigateToLogin();
        }}
        onClose={() => {
          closeCenterModal();
          if (centerModal.title === "Logged Out") navigateToLogin();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },

  header: {
    backgroundColor: "#0B4F7B",
    paddingTop: Platform.OS === "ios" ? 60 : 70, // android translucent bar
    paddingHorizontal: 22,
    paddingBottom: 18,

    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center" },

  avatarContainer: { position: "relative" },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
  },
  onlineBadge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#22C55E",
    borderWidth: 3,
    borderColor: "#0B4F7B",
  },

  headerTextInfo: { marginLeft: 14, flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#FFFFFF" },

  planRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  headerSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: "700" },

  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 22, paddingBottom: 120, paddingTop: 16 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 14,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: { flex: 1, marginLeft: 14 },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  cardSubtitle: { fontSize: 12.5, color: "#64748B", marginTop: 3, fontWeight: "700" },

  logoutWrapper: { marginTop: 10 },

  /* ===== MODAL ===== */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  modalBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  modalIconCircle: {
    alignSelf: "center",
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginBottom: 10,
  },
  modalTitle: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900",
    color: "#0F3E48",
    marginBottom: 6,
  },
  modalText: {
    textAlign: "center",
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  modalActions: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  cancelText: { color: "#475569", fontWeight: "900" },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#DC2626",
    alignItems: "center",
  },
  confirmText: { color: "#fff", fontWeight: "900" },
});
