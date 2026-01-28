// Consultation.jsx
// ✅ UPDATED ONLY (Unread badge on chat icon):
// - Listen to unread using chatRooms.unreadForUser (sum across rooms for this user)
// - Show badge count on the chat icon in header
// ❗ No other UI/layout/logic changes

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
} from "react-native";
import { db } from "../../config/firebase";
import useSubscriptionType from "../../services/useSubscriptionType";
import BottomNavbar from "../components/BottomNav";

const safeLower = (val) => (typeof val === "string" ? val.toLowerCase() : "");

export default function Consultation() {
  const router = useRouter();
  const [authUid, setAuthUid] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [consultants, setConsultants] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const subType = useSubscriptionType();
  const [user, setUser] = useState(null);

  // ✅ validation/info message state
  const [pageError, setPageError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  // ✅ unread badge count (NEW)
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadUnsubRef = useRef(null);

  const didShowUserWarn = useRef(false);
  const didShowFetchErr = useRef(false);
  const ratingsUnsubRef = useRef(null);

  const noMatchToastTimerRef = useRef(null);
  const lastNoMatchKeyRef = useRef("");

  const safeStr = (v) => String(v ?? "").trim();
  const isNonEmpty = (v) => safeStr(v).length > 0;

  const categories = [
    "All",
    "Architectural Design",
    "Residential Planning",
    "Sustainable Architecture",
    "Structural Engineering",
    "Construction Engineering",
    "Geotechnical Engineering",
    "Residential Interior Design",
    "Lighting Design",
    "Furniture Design",
  ];

  /* ================= VALIDATION HELPERS ================= */
  const validateUserLoaded = (u) => {
    if (!u) return "User profile not loaded.";
    const uid = u?.uid || u?.id;
    if (!isNonEmpty(uid)) return "Missing user id in profile.";
    return "";
  };

  const validateConsultantForOpen = (c) => {
    if (!c?.id) return "Invalid consultant selected.";
    if (!isNonEmpty(c?.fullName)) return "Selected consultant is missing a name.";
    return "";
  };

  const showInfoOnce = (msg) => {
    setInfoMsg(msg);
    setTimeout(() => setInfoMsg(""), 2200);
  };

  const showNoMatchInfo = (msg, key) => {
    if (lastNoMatchKeyRef.current === key) return;
    lastNoMatchKeyRef.current = key;

    if (noMatchToastTimerRef.current) clearTimeout(noMatchToastTimerRef.current);
    setInfoMsg(msg);
    noMatchToastTimerRef.current = setTimeout(() => {
      setInfoMsg("");
    }, 1500);
  };

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUid(String(u?.uid || "").trim());
    });
    return () => unsub();
  }, []);
  

  /* ================= LOAD USER ================= */
  useEffect(() => {
    const loadUser = async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const profileKey = keys.find((k) => k.startsWith("aestheticai:user-profile:"));

        if (!profileKey) {
          setUser(null);
          setPageError("No user profile found. Please sign in again.");

          if (!didShowUserWarn.current) {
            didShowUserWarn.current = true;
            Alert.alert("Session Required", "Please sign in to continue.");
          }
          return;
        }

        const data = await AsyncStorage.getItem(profileKey);
        const parsed = data ? JSON.parse(data) : null;
        setUser(parsed);

        const err = validateUserLoaded(parsed);
        if (err) {
          setPageError("Your session is incomplete. Please sign in again.");

          if (!didShowUserWarn.current) {
            didShowUserWarn.current = true;
            Alert.alert("Session Error", "Please sign in again to continue.");
          }
        } else {
          setPageError("");
        }
      } catch (e) {
        console.log("❌ loadUser error:", e?.message || e);
        setUser(null);
        setPageError("Failed to load your session. Please try again.");

        if (!didShowUserWarn.current) {
          didShowUserWarn.current = true;
          Alert.alert("Error", "Failed to load your session. Please sign in again.");
        }
      }
    };

    loadUser();

    return () => {
      try {
        if (noMatchToastTimerRef.current) clearTimeout(noMatchToastTimerRef.current);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // cleanup old listener
    try {
      unreadUnsubRef.current && unreadUnsubRef.current();
    } catch {}
    unreadUnsubRef.current = null;
  
    const uid = safeStr(authUid);
    if (!uid) {
      setUnreadCount(0);
      return;
    }
  
    // chatRooms fields (based on your doc):
    // - userId
    // - unreadForUser (boolean)
    const qRooms = query(collection(db, "chatRooms"), where("userId", "==", uid));
  
    unreadUnsubRef.current = onSnapshot(
      qRooms,
      (snap) => {
        let total = 0;
  
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          // unreadForUser is boolean → count 1 per room if true
          if (data.unreadForUser === true) total += 1;
        });
  
        setUnreadCount(total);
      },
      (err) => {
        console.log("❌ unread rooms listener error:", err?.message || err);
        setUnreadCount(0);
      }
    );
  
    return () => {
      try {
        unreadUnsubRef.current && unreadUnsubRef.current();
      } catch {}
      unreadUnsubRef.current = null;
    };
  }, [authUid]);
  
  /* ================= LOAD CONSULTANTS + RATINGS ================= */
  useEffect(() => {
    const fetchConsultantsAndRatings = async () => {
      try {
        setPageError("");
        didShowFetchErr.current = false;

        const consultantsQuery = query(
          collection(db, "consultants"),
          where("status", "==", "accepted")
        );

        const consultantsSnap = await getDocs(consultantsQuery);
        const tempConsultants = consultantsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          averageRating: 0,
          reviewCount: 0,
        }));

        if (tempConsultants.length === 0) {
          showInfoOnce("No accepted consultants available yet.");
          setConsultants([]);

          try {
            ratingsUnsubRef.current && ratingsUnsubRef.current();
          } catch {}
          ratingsUnsubRef.current = null;
          return;
        }

        let ratingsByConsultant = {};
        try {
          const ratingsSnap = await getDocs(collection(db, "ratings"));
          ratingsSnap.docs.forEach((d) => {
            const r = d.data();
            const cid = String(r.consultantId || "").trim();
            if (!cid) return;
            if (!ratingsByConsultant[cid]) ratingsByConsultant[cid] = [];
            ratingsByConsultant[cid].push(Number(r.rating || 0));
          });
        } catch (e) {
          console.log("⚠️ ratings initial fetch failed:", e?.message || e);
          ratingsByConsultant = {};
        }

        setConsultants(
          tempConsultants.map((c) => {
            const list = ratingsByConsultant[c.id] || [];
            const count = list.length;
            const avg = count ? list.reduce((a, b) => a + b, 0) / count : 0;
            return { ...c, reviewCount: count, averageRating: avg };
          })
        );

        if (ratingsUnsubRef.current) {
          try {
            ratingsUnsubRef.current();
          } catch {}
        }

        ratingsUnsubRef.current = onSnapshot(
          collection(db, "ratings"),
          (snapshot) => {
            const updated = {};
            snapshot.docs.forEach((d) => {
              const r = d.data();
              const cid = String(r.consultantId || "").trim();
              if (!cid) return;
              if (!updated[cid]) updated[cid] = [];
              updated[cid].push(Number(r.rating || 0));
            });

            setConsultants((prev) =>
              (prev || []).map((c) => {
                const list = updated[c.id] || [];
                const count = list.length;
                const avg = count ? list.reduce((a, b) => a + b, 0) / count : 0;
                return { ...c, reviewCount: count, averageRating: avg };
              })
            );
          },
          (err) => {
            console.log("❌ ratings snapshot error:", err?.message || err);
          }
        );
      } catch (e) {
        console.log("❌ fetchConsultantsAndRatings error:", e?.message || e);
        setPageError("Failed to load consultants. Please try again.");

        if (!didShowFetchErr.current) {
          didShowFetchErr.current = true;
          Alert.alert(
            "Error",
            "Failed to load consultants. Please check your internet connection."
          );
        }
      }
    };

    fetchConsultantsAndRatings();

    return () => {
      try {
        ratingsUnsubRef.current && ratingsUnsubRef.current();
      } catch {}
      ratingsUnsubRef.current = null;
    };
  }, []);

  /* ================= FILTERING ================= */
  const filteredConsultants = useMemo(() => {
    const list = (consultants || [])
      .filter((c) => {
        if (selectedCategory === "All") return true;
        return (
          safeLower(c.consultantType) === safeLower(selectedCategory) ||
          safeLower(c.specialization) === safeLower(selectedCategory)
        );
      })
      .filter((c) => safeLower(c.fullName).includes(safeLower(searchQuery)));

    if (isNonEmpty(searchQuery) && list.length === 0) {
      showNoMatchInfo("No matches found for your search.", `${selectedCategory}|${searchQuery}`);
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultants, selectedCategory, searchQuery]);

  const handleSelectCategory = (cat) => {
    const next = categories.includes(cat) ? cat : "All";
    setSelectedCategory(next);

    if (next !== "All") showInfoOnce(`Filtered by: ${next}`);
    else showInfoOnce("Showing all categories");
  };

  const handleOpenConsultant = (c) => {
    const uErr = validateUserLoaded(user);
    if (uErr) {
      setPageError("Your session is incomplete. Please sign in again.");
      Alert.alert("Session Required", "Please sign in again to continue.");
      return;
    }

    const err = validateConsultantForOpen(c);
    if (err) {
      Alert.alert("Cannot open profile", err);
      return;
    }

    showInfoOnce("Opening consultant profile...");
    router.push(`/User/ConsultantProfile?consultantId=${c.id}`);
  };

  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" />

      {/* ===== PREMIUM HEADER ===== */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.headerActions}>
            {/* ✅ Chat icon with unread badge (CONNECTED to chatRooms unreadForUser sum) */}
            <TouchableOpacity
              onPress={() => router.push("/User/ChatList")}
              style={styles.iconBtn}
              activeOpacity={0.9}
            >
              <Ionicons name="chatbubbles" size={22} color="#FFF" />

              {unreadCount > 0 && (
                <View style={styles.badgeWrap} pointerEvents="none">
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? "99+" : String(unreadCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/User/Consultations")}
              style={styles.iconBtn}
              activeOpacity={0.9}
            >
              <Ionicons name="calendar" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.headerTitle}>Find Your Expert</Text>
        <Text style={styles.headerSubtitle}>
          Consult with professional architects and designers
        </Text>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#94A3B8" />
          <TextInput
            placeholder="Search name or expertise..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={(t) => {
              setSearchQuery(t);
              if (pageError) setPageError("");
            }}
          />
        </View>

        {!!pageError ? <Text style={styles.bannerError}>{pageError}</Text> : null}
        {!!infoMsg ? <Text style={styles.bannerInfo}>{infoMsg}</Text> : null}
      </View>

      {/* ===== CATEGORY FILTER ===== */}
      <View style={styles.categoryBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => handleSelectCategory(cat)}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
              >
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ===== CONSULTANT CARDS ===== */}
      <ScrollView
        style={styles.consultantList}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredConsultants.length > 0 ? (
          filteredConsultants.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.consultantCard}
              onPress={() => handleOpenConsultant(c)}
              activeOpacity={0.9}
            >
              <View style={styles.cardHeader}>
                <Image
                  source={
                    c.avatar
                      ? { uri: c.avatar }
                      : c.gender === "Female"
                      ? require("../../assets/office-woman.png")
                      : require("../../assets/office-man.png")
                  }
                  style={styles.avatar}
                />
                <View style={styles.mainInfo}>
                  <Text style={styles.consultantName} numberOfLines={1}>
                    {c.fullName}
                  </Text>
                  <Text style={styles.consultantTitle}>{c.consultantType}</Text>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.ratingText}>
                      {Number(c.averageRating || 0).toFixed(1)}
                    </Text>
                    <Text style={styles.reviewText}>
                      ({Number(c.reviewCount || 0)} reviews)
                    </Text>
                  </View>
                </View>
                <View style={styles.goBtn}>
                  <Ionicons name="chevron-forward" size={20} color="#01579B" />
                </View>
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.specTag}>
                  <Ionicons name="ribbon-outline" size={14} color="#01579B" />
                  <Text style={styles.specText} numberOfLines={1}>
                    {c.specialization}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={50} color="#CBD5E1" />
            <Text style={styles.emptyText}>No consultants found</Text>
          </View>
        )}
      </ScrollView>

      <BottomNavbar subType={subType} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },

  header: {
    backgroundColor: "#01579B",
    paddingTop: 50,
    paddingBottom: 25,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerActions: { flexDirection: "row", gap: 10 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  backBtn: { marginLeft: -5 },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#FFF" },
  headerSubtitle: {
    fontSize: 14,
    color: "#B3E5FC",
    marginTop: 4,
    marginBottom: 20,
  },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 15,
    paddingHorizontal: 15,
    height: 50,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: "#1E293B" },

  bannerError: {
    marginTop: 10,
    color: "#FEE2E2",
    fontWeight: "900",
    fontSize: 12,
  },
  bannerInfo: {
    marginTop: 10,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "800",
    fontSize: 12,
  },

  badgeWrap: {
    position: "absolute",
    right: -4,
    top: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#01579B",
  },
  badgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },

  categoryBar: { paddingVertical: 15, backgroundColor: "#F8FAFC" },
  categoryScroll: { paddingHorizontal: 20, gap: 8 },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  categoryChipActive: { backgroundColor: "#01579B", borderColor: "#01579B" },
  categoryText: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  categoryTextActive: { color: "#FFF" },

  consultantList: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },

  consultantCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 15,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 65,
    height: 65,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
  },
  mainInfo: { flex: 1, marginLeft: 15 },
  consultantName: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  consultantTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#01579B",
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    gap: 4,
  },
  ratingText: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
  reviewText: { fontSize: 12, color: "#94A3B8" },
  goBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F0F9FF",
    justifyContent: "center",
    alignItems: "center",
  },

  cardFooter: {
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  specTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0F9FF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  specText: { fontSize: 11, fontWeight: "700", color: "#01579B", maxWidth: 200 },

  emptyState: { alignItems: "center", marginTop: 50 },
  emptyText: { marginTop: 10, color: "#94A3B8", fontWeight: "600" },
});
