import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  SafeAreaView,
} from "react-native";

import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import Button from "../components/Button";

export default function ConsultantProfile() {
  const router = useRouter();
  const [consultantName, setConsultantName] = useState("Consultant");
  const [logoutVisible, setLogoutVisible] = useState(false);

  const avatarSource = require("../../assets/office-woman.png");

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const uid = await AsyncStorage.getItem("aestheticai:current-user-id");
        if (!uid) return;

        const snap = await getDoc(doc(db, "consultants", uid));
        if (!snap.exists()) return;

        const data = snap.data();
        setConsultantName(data.fullName || "Consultant");

        await AsyncStorage.setItem(
          "aestheticai:consultant-profile",
          JSON.stringify(data)
        );
      } catch (err) {
        console.log("Load consultant profile error:", err);
      }
    };
    loadProfile();
  }, []);

  const confirmLogout = async () => {
    try {
      const uid = await AsyncStorage.getItem("aestheticai:current-user-id");
      if (uid) {
        await updateDoc(doc(db, "consultants", uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
        });
      }
      await AsyncStorage.multiRemove([
        "aestheticai:current-user-id",
        "aestheticai:current-user-role",
        "aestheticai:consultant-profile",
      ]);
      setLogoutVisible(false);
      router.replace({
        pathname: "/Login",
        params: { role: "consultant" },
      });
    } catch (err) {
      console.log("Logout error:", err);
    }
  };

  const ProfileOption = ({ icon, title, subtitle, onPress, color }) => (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconWrap, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" />
      
      {/* ===== HEADER ===== */}
      <View style={styles.headerArea}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <View style={styles.profileRow}>
              <View style={styles.avatarContainer}>
                <Image source={avatarSource} style={styles.avatarImage} />
                <View style={styles.onlineBadge} />
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.headerName}>{consultantName}</Text>
                <View style={styles.roleTag}>
                  <Text style={styles.roleText}>Verified Consultant</Text>
                </View>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Account Settings</Text>
        
        <ProfileOption 
          icon="person-outline" 
          title="Edit Profile" 
          subtitle="Update your professional details"
          color="#0288D1"
          onPress={() => router.push("/Consultant/EditProfile")}
        />

        <ProfileOption 
          icon="calendar-outline" 
          title="Manage Availability" 
          subtitle="View and update your schedule"
          color="#00897B"
          onPress={() => router.push("/Consultant/EditAvailability")}
        />

        <ProfileOption 
          icon="shield-checkmark-outline" 
          title="Security" 
          subtitle="Change password and secure account"
          color="#7E57C2"
          onPress={() => router.push("/Consultant/ChangePassword")}
        />

        {/* LOGOUT BUTTON - PINALITAN: Ibinalik sa original mo na may subtitle */}
        <View style={{ marginTop: 10 }}>
          <Button
            icon={<Ionicons name="log-out-outline" size={28} color="#fff" />}
            title="Logout"
            subtitle="Sign out of your consultant account"
            onPress={() => setLogoutVisible(true)}
            backgroundColor="#C44569"
            textColor="#fff"
          />
        </View>

        <Text style={styles.versionText}>AestheticAI Consultant v1.0.2</Text>
      </ScrollView>

      <BottomNavbar role="consultant" />

      {/* ===== LOGOUT MODAL ===== */}
      <Modal transparent animationType="fade" visible={logoutVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalText}>Do you want to logout?</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setLogoutVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={confirmLogout}
              >
                <Text style={styles.logoutBtnText}>Logout</Text>
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
  headerArea: {
    backgroundColor: "#01579B",
    paddingTop: 25,
    paddingBottom: 15,
  },
  headerContent: { paddingHorizontal: 25, paddingTop: 10 },
  profileRow: { flexDirection: "row", alignItems: "center" },
  avatarContainer: { position: 'relative' },
  avatarImage: {
    width: 70,
    height: 70,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  onlineBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#4ADE80",
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderWidth: 3,
    borderColor: "#01579B",
  },
  profileInfo: { marginLeft: 18 },
  headerName: { fontSize: 21, fontWeight: "900", color: "#FFF" },
  roleTag: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
    alignSelf: 'flex-start'
  },
  roleText: { color: "#E0F7FA", fontSize: 11, fontWeight: "700", textTransform: 'uppercase' },

  container: { padding: 25, paddingBottom: 120 },
  sectionLabel: { fontSize: 14, fontWeight: "800", color: "#64748B", marginBottom: 15, textTransform: 'uppercase' },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 16,
    marginBottom: 15,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: { flex: 1, marginLeft: 15 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  cardSubtitle: { fontSize: 12, color: "#94A3B8", marginTop: 2 },

  versionText: { marginTop: 20, textAlign: 'center', color: "#CBD5E1", fontSize: 12, fontWeight: "600" },

  /* MODAL ORIGINAL FEEL */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#2C3E50", marginBottom: 6 },
  modalText: { fontSize: 14, color: "#555", marginBottom: 20 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 18 },
  cancelText: { fontWeight: "700", color: "#777" },
  logoutBtn: { backgroundColor: "#C44569", paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  logoutBtnText: { color: "#fff", fontWeight: "800" },
});