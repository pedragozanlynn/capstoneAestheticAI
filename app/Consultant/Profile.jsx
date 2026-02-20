import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import Button from "../components/Button";

/* =========================
   CONSTANTS
========================= */
const ROUTES = {
  login: "/Login",
  editProfile: "/Consultant/EditProfile",
  availability: "/Consultant/EditAvailability",
  security: "/Consultant/ChangePassword",
};

const STORAGE_KEYS = {
  uid: "aestheticai:current-user-id",
  role: "aestheticai:current-user-role",
  profile: "aestheticai:consultant-profile",
};

const ROLE = "consultant";
const APP_VERSION = "AestheticAI Consultant v1.0.2";

const AVATAR = require("../../assets/office-woman.png");

const MSG_COLORS = {
  info: { bg: "#EFF6FF", border: "#BFDBFE", icon: "information-circle", iconColor: "#01579B" },
  success: { bg: "#ECFDF5", border: "#BBF7D0", icon: "checkmark-circle", iconColor: "#16A34A" },
  error: { bg: "#FEF2F2", border: "#FECACA", icon: "close-circle", iconColor: "#DC2626" },
};

/* =========================
   SMALL UI COMPONENTS
========================= */
function ProfileOption({ icon, title, subtitle, onPress, color }) {
  return (
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
}

function CenterMessageModal({ visible, type, title, body, onClose }) {
  const cfg = MSG_COLORS[type] || MSG_COLORS.info;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.msgBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.msgCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
          onPress={() => {}}
        >
          <View style={styles.msgRow}>
            <Ionicons name={cfg.icon} size={22} color={cfg.iconColor} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              {!!title && <Text style={styles.msgTitle}>{title}</Text>}
              {!!body && <Text style={styles.msgBody}>{body}</Text>}
            </View>
          </View>

          <TouchableOpacity style={styles.msgClose} onPress={onClose} activeOpacity={0.85}>
            <Ionicons name="close" size={18} color="#475569" />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* =========================
   SCREEN
========================= */
export default function ConsultantProfile() {
  const router = useRouter();

  const [consultantName, setConsultantName] = useState("Consultant");
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [logoutVisible, setLogoutVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // ✅ prevents auth-guard from redirecting while we are actively logging out
  const isLoggingOutRef = useRef(false);

  // Center message modal state
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  const clearMsgTimer = () => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    msgTimerRef.current = null;
  };

  const showMessage = (type = "info", title = "", body = "", autoHideMs = 1600) => {
    clearMsgTimer();
    setMsgType(type);
    setMsgTitle(String(title || ""));
    setMsgBody(String(body || ""));
    setMsgVisible(true);

    if (autoHideMs && autoHideMs > 0) {
      msgTimerRef.current = setTimeout(() => setMsgVisible(false), autoHideMs);
    }
  };

  const closeMessage = () => {
    clearMsgTimer();
    setMsgVisible(false);
  };

  const goToLoginHard = useCallback(() => {
    // ✅ expo-router safe reset (no POP_TO_TOP)
    try {
      router.dismissAll?.();
    } catch {}

    router.replace({ pathname: ROUTES.login, params: { role: ROLE } });

    // ✅ Android safety
    setTimeout(() => {
      try {
        router.dismissAll?.();
      } catch {}
      router.replace({ pathname: ROUTES.login, params: { role: ROLE } });
    }, 50);
  }, [router]);

  /* =========================
     AUTH GUARD (ON FOCUS)
  ========================= */
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const checkAuth = async () => {
        // ✅ during logout, don't fight navigation
        if (isLoggingOutRef.current) return;

        try {
          const uid = await AsyncStorage.getItem(STORAGE_KEYS.uid);
          const role = await AsyncStorage.getItem(STORAGE_KEYS.role);

          if (active && (!uid || role !== ROLE)) {
            router.replace({ pathname: ROUTES.login, params: { role: ROLE } });
          }
        } catch {
          if (active) router.replace({ pathname: ROUTES.login, params: { role: ROLE } });
        }
      };

      checkAuth();

      return () => {
        active = false;
      };
    }, [router])
  );

  /* =========================
     LOAD PROFILE (ON MOUNT)
  ========================= */
  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      setLoadingProfile(true);

      try {
        const uid = await AsyncStorage.getItem(STORAGE_KEYS.uid);

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
        await AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(data));

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
      clearMsgTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     LOGOUT (FIXED)
  ========================= */
  const confirmLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    isLoggingOutRef.current = true;

    try {
      const uid = await AsyncStorage.getItem(STORAGE_KEYS.uid);

      // best-effort mark offline
      if (uid) {
        updateDoc(doc(db, "consultants", uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
        }).catch(() => {});
      }

      await AsyncStorage.multiRemove([STORAGE_KEYS.uid, STORAGE_KEYS.role, STORAGE_KEYS.profile]);

      setLogoutVisible(false);
      showMessage("success", "Logged out", "You have been signed out.", 900);

      setTimeout(goToLoginHard, 250);
    } catch (err) {
      console.log("Logout error:", err?.message || err);
      showMessage("error", "Logout failed", "Unable to logout. Please try again.", 1800);

      // if logout failed, allow guard again
      isLoggingOutRef.current = false;
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" backgroundColor="#01579B" translucent={false} />

      {/* ===== HEADER ===== */}
      <View style={styles.headerArea}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <View style={styles.profileRow}>
              <View style={styles.avatarContainer}>
                <Image source={AVATAR} style={styles.avatarImage} />
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

              {loadingProfile ? <ActivityIndicator color="#fff" style={{ marginLeft: 10 }} /> : null}
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* ===== BODY ===== */}
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Account Settings</Text>

        <ProfileOption
          icon="person-outline"
          title="Edit Profile"
          subtitle="Update your professional details"
          color="#0288D1"
          onPress={() => router.push(ROUTES.editProfile)}
        />

        <ProfileOption
          icon="calendar-outline"
          title="Manage Availability"
          subtitle="View and update your schedule"
          color="#00897B"
          onPress={() => router.push(ROUTES.availability)}
        />

        <ProfileOption
          icon="shield-checkmark-outline"
          title="Security"
          subtitle="Change password and secure account"
          color="#7E57C2"
          onPress={() => router.push(ROUTES.security)}
        />

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

        <Text style={styles.versionText}>{APP_VERSION}</Text>
      </ScrollView>

      <BottomNavbar role={ROLE} />

      {/* ===== LOGOUT MODAL ===== */}
      <Modal
        transparent
        animationType="fade"
        visible={logoutVisible}
        onRequestClose={() => !loggingOut && setLogoutVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => !loggingOut && setLogoutVisible(false)}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalText}>Do you want to logout?</Text>

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
                {loggingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.logoutBtnText}>Logout</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== CENTER MESSAGE MODAL ===== */}
      <CenterMessageModal visible={msgVisible} type={msgType} title={msgTitle} body={msgBody} onClose={closeMessage} />
    </View>
  );
}

/* =========================
   STYLES
========================= */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },

  headerArea: {
    backgroundColor: "#01579B",
    paddingTop: 58,
    paddingBottom: 12,
  },
  headerContent: { paddingHorizontal: 20, paddingTop: 6 },
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
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: { backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0" },
  cancelText: { fontWeight: "900", color: "#64748B" },

  logoutBtn: { backgroundColor: "#C44569" },
  logoutBtnText: { color: "#fff", fontWeight: "900" },

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