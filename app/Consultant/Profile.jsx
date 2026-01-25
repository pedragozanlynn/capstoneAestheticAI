import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  SafeAreaView,
  Pressable,
  Platform,
} from "react-native";

import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import Button from "../components/Button";

/* ---------------- CENTER MESSAGE MODAL ---------------- */
const MSG_COLORS = {
  info: { bg: "#EFF6FF", border: "#BFDBFE", icon: "information-circle", iconColor: "#01579B" },
  success: { bg: "#ECFDF5", border: "#BBF7D0", icon: "checkmark-circle", iconColor: "#16A34A" },
  error: { bg: "#FEF2F2", border: "#FECACA", icon: "close-circle", iconColor: "#DC2626" },
};

export default function ConsultantProfile() {
  const router = useRouter();
  const [consultantName, setConsultantName] = useState("Consultant");
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // ✅ Center message modal
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  const avatarSource = require("../../assets/office-woman.png");

  const showMessage = (type = "info", title = "", body = "", autoHideMs = 1600) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setMsgType(type);
    setMsgTitle(String(title || ""));
    setMsgBody(String(body || ""));
    setMsgVisible(true);

    if (autoHideMs && autoHideMs > 0) {
      msgTimerRef.current = setTimeout(() => setMsgVisible(false), autoHideMs);
    }
  };

  const closeMessage = () => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setMsgVisible(false);
  };

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      setLoadingProfile(true);

      try {
        const uid = await AsyncStorage.getItem("aestheticai:current-user-id");

        // ✅ Validation: must be logged in
        if (!uid) {
          if (!mounted) return;
          setLoadingProfile(false);
          showMessage("error", "Not signed in", "Please login again to continue.", 1800);
          return;
        }

        const snap = await getDoc(doc(db, "consultants", uid));
        if (!snap.exists()) {
          if (!mounted) return;
          setLoadingProfile(false);
          showMessage("error", "Profile missing", "Consultant profile not found.", 1800);
          return;
        }

        const data = snap.data() || {};
        if (!mounted) return;

        setConsultantName(data.fullName || "Consultant");

        // cache
        await AsyncStorage.setItem("aestheticai:consultant-profile", JSON.stringify(data));

        setLoadingProfile(false);
      } catch (err) {
        console.log("Load consultant profile error:", err?.message || err);
        if (!mounted) return;
        setLoadingProfile(false);
        showMessage("error", "Load failed", "Unable to load profile. Please try again.", 1800);
      }
    };

    loadProfile();

    return () => {
      mounted = false;
      try {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      const uid = await AsyncStorage.getItem("aestheticai:current-user-id");

      // ✅ Guard
      if (!uid) {
        showMessage("error", "Not signed in", "Session not found. Returning to login.", 1600);
        setLogoutVisible(false);
        setLoggingOut(false);
        try { router.dismissAll(); } catch {}
        router.replace({ pathname: "/Login", params: { role: "consultant" } });
                return;
      }

      // best-effort: mark offline
      try {
        await updateDoc(doc(db, "consultants", uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
        });
      } catch (e) {
        // do not block logout; show info only
        console.log("Set offline failed:", e?.message || e);
      }

      await AsyncStorage.multiRemove([
        "aestheticai:current-user-id",
        "aestheticai:current-user-role",
        "aestheticai:consultant-profile",
      ]);

      setLogoutVisible(false);
      showMessage("success", "Logged out", "You have been signed out.", 900);

      setTimeout(() => {
        try { router.dismissAll(); } catch {}
        router.replace({ pathname: "/Login", params: { role: "consultant" } });
      }, 250);
      
    } catch (err) {
      console.log("Logout error:", err?.message || err);
      showMessage("error", "Logout failed", "Unable to logout. Please try again.", 1800);
    } finally {
      setLoggingOut(false);
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
      {/* ✅ App-ready status bar */}
      <StatusBar barStyle="light-content" backgroundColor="#01579B" translucent={false} />

      {/* ===== HEADER (lowered, app-ready) ===== */}
      <View style={styles.headerArea}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <View style={styles.profileRow}>
              <View style={styles.avatarContainer}>
                <Image source={avatarSource} style={styles.avatarImage} />
                <View style={styles.onlineBadge} />
              </View>

              <View style={styles.profileInfo}>
                {loadingProfile ? (
                  <View style={{ gap: 6 }}>
                    <View style={styles.skelLineLg} />
                    <View style={styles.skelLineSm} />
                  </View>
                ) : (
                  <>
                    <Text style={styles.headerName} numberOfLines={1}>
                      {consultantName}
                    </Text>
                    <View style={styles.roleTag}>
                      <Text style={styles.roleText}>Verified Consultant</Text>
                    </View>
                  </>
                )}
              </View>

              {loadingProfile ? (
                <ActivityIndicator color="#fff" style={{ marginLeft: 10 }} />
              ) : null}
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

        {/* LOGOUT */}
        <View style={{ marginTop: 10 }}>
          <Button
            icon={<Ionicons name="log-out-outline" size={28} color="#fff" />}
            title="Logout"
            subtitle="Sign out of your consultant account"
            onPress={() => {
              // ✅ Validation: block logout if profile not loaded but allow if user wants
              setLogoutVisible(true);
            }}
            backgroundColor="#C44569"
            textColor="#fff"
          />
        </View>

        <Text style={styles.versionText}>AestheticAI Consultant v1.0.2</Text>
      </ScrollView>

      <BottomNavbar role="consultant" />

      {/* ===== LOGOUT MODAL ===== */}
      <Modal transparent animationType="fade" visible={logoutVisible} onRequestClose={() => !loggingOut && setLogoutVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => !loggingOut && setLogoutVisible(false)}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalText}>Do you want to logout?</Text>

            {/* ✅ same-size buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn, loggingOut && { opacity: 0.6 }]}
                onPress={() => setLogoutVisible(false)}
                disabled={loggingOut}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.logoutBtn, loggingOut && { opacity: 0.85 }]}
                onPress={confirmLogout}
                disabled={loggingOut}
                activeOpacity={0.85}
              >
                {loggingOut ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.logoutBtnText}>Logout</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== CENTER MESSAGE MODAL ===== */}
      <Modal visible={msgVisible} transparent animationType="fade" onRequestClose={closeMessage}>
        <Pressable style={styles.msgBackdrop} onPress={closeMessage}>
          <Pressable
            style={[
              styles.msgCard,
              {
                backgroundColor: (MSG_COLORS[msgType] || MSG_COLORS.info).bg,
                borderColor: (MSG_COLORS[msgType] || MSG_COLORS.info).border,
              },
            ]}
            onPress={() => {}}
          >
            <View style={styles.msgRow}>
              <Ionicons
                name={(MSG_COLORS[msgType] || MSG_COLORS.info).icon}
                size={22}
                color={(MSG_COLORS[msgType] || MSG_COLORS.info).iconColor}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                {!!msgTitle && <Text style={styles.msgTitle}>{msgTitle}</Text>}
                {!!msgBody && <Text style={styles.msgBody}>{msgBody}</Text>}
              </View>
            </View>

            <TouchableOpacity style={styles.msgClose} onPress={closeMessage} activeOpacity={0.85}>
              <Ionicons name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },

  /* ✅ lowered header spacing */
  headerArea: {
    backgroundColor: "#01579B",
    paddingTop: 58,   // ✅ binaba
    paddingBottom: 12,
  },
  headerContent: { paddingHorizontal: 20, paddingTop: 6 }, // ✅ binaba
  profileRow: { flexDirection: "row", alignItems: "center" },

  avatarContainer: { position: "relative" },
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
    position: "absolute",
    bottom: -2,
    right: -2,
    borderWidth: 3,
    borderColor: "#01579B",
  },
  profileInfo: { marginLeft: 16, flex: 1 },
  headerName: { fontSize: 20, fontWeight: "900", color: "#FFF" },

  roleTag: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  roleText: {
    color: "#E0F7FA",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  // Skeleton lines for loading (app-ready feel)
  skelLineLg: { width: 180, height: 14, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.22)" },
  skelLineSm: { width: 130, height: 10, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.18)" },

  container: { padding: 22, paddingBottom: 120 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#64748B",
    marginBottom: 14,
    textTransform: "uppercase",
  },

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

  versionText: {
    marginTop: 18,
    textAlign: "center",
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "600",
  },

  /* MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modalBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 22,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#2C3E50", marginBottom: 6 },
  modalText: { fontSize: 14, color: "#555", marginBottom: 18 },

  modalActions: { flexDirection: "row", gap: 12 },
  modalBtn: {
    flex: 1,
    height: 44,               // ✅ same size
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: { backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0" },
  cancelText: { fontWeight: "900", color: "#64748B" },

  logoutBtn: { backgroundColor: "#C44569" },
  logoutBtnText: { color: "#fff", fontWeight: "900" },

  /* CENTER MESSAGE MODAL */
  msgBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  msgCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    position: "relative",
  },
  msgRow: { flexDirection: "row", alignItems: "flex-start" },
  msgTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  msgBody: { marginTop: 3, fontSize: 13, fontWeight: "700", color: "#475569", lineHeight: 18 },
  msgClose: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
});
