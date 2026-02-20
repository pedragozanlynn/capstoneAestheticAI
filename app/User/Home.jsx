import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../config/firebase";
import useSubscriptionType from "../../services/useSubscriptionType";
import BottomNavbar from "../components/BottomNav";

// ✅ ADD: safe area insets to keep end-of-scroll above navbar / home indicator
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width * 0.75;
const PROFILE_KEY_PREFIX = "aestheticai:user-profile:";

const DESIGN_INSPIRATIONS = [
  {
    title: "Warm Minimalism",
    tip: "Use neutral colors with natural wood to create a calm, cozy space.",
  },
  {
    title: "Small Space Trick",
    tip: "Mirrors help small rooms feel bigger and brighter.",
  },
  {
    title: "Color Balance",
    tip: "Stick to one main color and two supporting tones for harmony.",
  },
  {
    title: "Lighting Matters",
    tip: "Layer lighting (ambient, task, accent) for a more premium feel.",
  },
  {
    title: "Texture Upgrade",
    tip: "Mix textures like wood, fabric, and metal to add depth.",
  },
];

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);

  // ✅ Keep your existing state name "rooms" to minimize changes
  const [rooms, setRooms] = useState([]);

  const [tipOfTheDay, setTipOfTheDay] = useState(null);
  const subType = useSubscriptionType();

  const scrollRef = useRef(null);
  const carouselIndex = useRef(0);

  // ✅ NEW: unread notifications badge count
  const [unreadNotif, setUnreadNotif] = useState(0);

  // ✅ validation/info guards (no UI changes)
  const didWarnNoAuth = useRef(false);
  const didWarnNotifRoute = useRef(false);
  const didWarnOpenProject = useRef(false);

  // ✅ ADD: safe area insets
  const insets = useSafeAreaInsets();

  // ✅ NEW: status bar height (Android) so header starts below it
  const statusBarHeight = StatusBar.currentHeight || 0;

  const carouselImages = [
    require("../../assets/carousel1.jpg"),
    require("../../assets/carousel2.jpg"),
    require("../../assets/carousel3.png"),
  ];

  const loadProfile = async () => {
    try {
      // ✅ validation: require signed-in user
      if (!auth.currentUser?.uid) {
        if (!didWarnNoAuth.current) {
          didWarnNoAuth.current = true;
          Alert.alert("Session Required", "Please sign in to load your profile.");
        }
        setProfile(null);
        return;
      }

      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);

        await AsyncStorage.setItem(
          `${PROFILE_KEY_PREFIX}${uid}`,
          JSON.stringify(data)
        );
      } else {
        Alert.alert("Profile Not Found", "Your user profile was not found.");
        setProfile(null);
      }
    } catch (err) {
      console.log("Profile Load Error:", err);
      Alert.alert("Error", "Failed to load profile. Please try again.");
      setProfile(null);
    }
  };

  // ✅ Helpers: normalize project fields safely without forcing schema changes
  const pickTitle = (data = {}) =>
    data?.prompt ||
    data?.title ||
    data?.projectTitle ||
    data?.roomTitle ||
    data?.name ||
    data?.roomName ||
    data?.chatTitle ||
    "Untitled Project";

  const pickImageUrl = (data = {}) =>
    data?.image || // ✅ IMPORTANT: your Projects screen uses `image`
    data?.imageUrl ||
    data?.thumbnailUrl ||
    data?.previewUrl ||
    data?.resultImageUrl ||
    data?.outputUrl ||
    data?.renderUrl ||
    data?.finalImageUrl ||
    data?.designImageUrl ||
    data?.finalUrl ||
    data?.resultUrl ||
    null;

  const toMillisSafe = (ts) => {
    try {
      if (!ts) return 0;
      if (typeof ts?.toMillis === "function") return ts.toMillis();
      const d = new Date(ts);
      const ms = d.getTime();
      return Number.isNaN(ms) ? 0 : ms;
    } catch {
      return 0;
    }
  };

  // ✅ UPDATED: Fetch real recent projects from Firestore (projects collection)
  const subscribeRecentProjects = () => {
    try {
      const user = auth.currentUser;
      if (!user?.uid) return () => {};
      const uid = user.uid;

      const q = query(
        collection(db, "projects"),
        where("uid", "==", uid),
        limit(20)
      );

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const list = snapshot.docs
            .map((d) => {
              const data = d.data() || {};
              return {
                id: d.id,

                // ✅ normalized fields for Home UI
                name: pickTitle(data),
                imageUrl: pickImageUrl(data),

                // ✅ keep original project fields for RoomVisualization use
                ...data,
              };
            })
            .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt))
            .slice(0, 10);

          setRooms(list);
        },
        (err) => {
          console.log("Recent projects listener error:", err);
          setRooms([]);
          Alert.alert("Error", "Failed to load recent projects.");
        }
      );

      return unsub;
    } catch (err) {
      console.log("subscribeRecentProjects error:", err);
      Alert.alert("Error", "Failed to subscribe to projects.");
      return () => {};
    }
  };

  // ✅ NEW: subscribe unread notifications count for badge (GLOBAL notifications collection)
  const subscribeUnreadNotifications = () => {
    try {
      const user = auth.currentUser;
      if (!user?.uid) return () => {};
      const uid = user.uid;

      // ✅ Unread only (GLOBAL collection)
      const qNotifs = query(
        collection(db, "notifications"),
        where("userId", "==", uid),
        where("read", "==", false),
        limit(99)
      );

      const unsub = onSnapshot(
        qNotifs,
        (snapshot) => {
          setUnreadNotif(snapshot.size || 0);
        },
        (err) => {
          console.log("Notifications badge listener error:", err);
          setUnreadNotif(0);
        }
      );

      return unsub;
    } catch (err) {
      console.log("subscribeUnreadNotifications error:", err);
      setUnreadNotif(0);
      return () => {};
    }
  };

  const loadTipOfTheDay = async () => {
    try {
      const todayKey = `tip-${new Date().toDateString()}`;
      const saved = await AsyncStorage.getItem(todayKey);
      if (saved) {
        setTipOfTheDay(JSON.parse(saved));
      } else {
        const index = new Date().getDate() % DESIGN_INSPIRATIONS.length;
        const tip = DESIGN_INSPIRATIONS[index];
        setTipOfTheDay(tip);
        await AsyncStorage.setItem(todayKey, JSON.stringify(tip));
      }
    } catch (e) {
      console.log("loadTipOfTheDay error:", e);
      setTipOfTheDay(null);
    }
  };

  // ✅ KEEP ONLY FOR BADGE (UI) — NO BLOCKING ANYMORE
  const isPremium = subType === "Premium";

  useEffect(() => {
    const interval = setInterval(() => {
      carouselIndex.current =
        (carouselIndex.current + 1) % carouselImages.length;
      scrollRef.current?.scrollTo({
        x: carouselIndex.current * width,
        animated: true,
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadProfile();
    loadTipOfTheDay();

    // ✅ Subscribe to Firestore recent projects
    let unsubProjects = () => {};

    // ✅ Subscribe to unread notifications (badge)
    let unsubNotifs = () => {};

    // ✅ validation: auth required for listeners
    const trySubscribe = () => {
      try {
        const u = auth.currentUser;
        if (u?.uid) {
          unsubProjects = subscribeRecentProjects();
          unsubNotifs = subscribeUnreadNotifications();
        } else {
          setRooms([]);
          setUnreadNotif(0);
        }
      } catch {}
    };

    trySubscribe();

    // If your auth can be late, listen once:
    const authUnsub =
      typeof auth?.onAuthStateChanged === "function"
        ? auth.onAuthStateChanged(() => {
            // cleanup old listeners then resubscribe
            try {
              unsubProjects?.();
            } catch {}
            try {
              unsubNotifs?.();
            } catch {}

            const u = auth.currentUser;
            if (u?.uid) {
              unsubProjects = subscribeRecentProjects();
              unsubNotifs = subscribeUnreadNotifications();
            } else {
              setRooms([]);
              setUnreadNotif(0);
            }
          })
        : null;

    return () => {
      try {
        unsubProjects?.();
      } catch {}
      try {
        unsubNotifs?.();
      } catch {}
      try {
        authUnsub?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ open project visualization
  const openProject = (project) => {
    try {
      // ✅ validation: must have id
      if (!project?.id) {
        if (!didWarnOpenProject.current) {
          didWarnOpenProject.current = true;
          Alert.alert("Unable to Open", "This project is missing required data.");
        }
        return;
      }

      router.push({
        pathname: "/User/RoomVisualization",
        params: {
          id: String(project?.id || ""), // ✅ consistent with your Projects screen
          project: JSON.stringify(project || {}),
        },
      });
    } catch (e) {
      console.log("openProject error:", e);
      Alert.alert("Error", "Failed to open project. Please try again.");
    }
  };

  // ✅ NEW: go to Notifications screen (connect to Notification.jsx / Notifications.jsx)
  const goToNotifications = () => {
    try {
      // ✅ validation: require signed-in user
      if (!auth.currentUser?.uid) {
        Alert.alert("Session Required", "Please sign in to view notifications.");
        return;
      }

      // Make sure your screen file is: app/User/Notifications.jsx (route: /User/Notifications)
      router.push("/User/Notifications");
    } catch (e) {
      console.log("goToNotifications error:", e);
      if (!didWarnNotifRoute.current) {
        didWarnNotifRoute.current = true;
        Alert.alert("Error", "Notifications page is not available.");
      }
    }
  };

  // ✅ FIX: extra bottom space so last content is ABOVE BottomNavbar when scrolling
  const bottomScrollSpace = Math.max(insets.bottom, 0) + 130;

  return (
    <View style={styles.page}>
      {/* ✅ CHANGE ONLY: StatusBar is tied to header color */}
      <StatusBar
        translucent
        backgroundColor="#01579B"
        barStyle="light-content"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        // ✅ ADD: guaranteed space at end of scroll (prevents BottomNavbar overlap)
        contentContainerStyle={{ paddingBottom: bottomScrollSpace }}
      >
        {/* ===== HEADER ===== */}
        <View
          style={[
            styles.header,
            {
              // ✅ CHANGE ONLY: push header content below StatusBar/safe area
              paddingTop: (insets.top || statusBarHeight) + 16,
            },
          ]}
        >
          <View style={styles.headerTop}>
            {/* LEFT: avatar + greeting/name */}
            <View style={styles.headerLeft}>
              <TouchableOpacity
                onPress={() => {
                  // ✅ validation: profile access requires signed-in user
                  if (!auth.currentUser?.uid) {
                    Alert.alert(
                      "Session Required",
                      "Please sign in to view your profile."
                    );
                    return;
                  }
                  router.push("/User/Profile");
                }}
                activeOpacity={0.8}
              >
                <Image
                  source={
                    profile?.gender === "Female"
                      ? require("../../assets/office-woman.png")
                      : require("../../assets/office-man.png")
                  }
                  style={styles.profileAvatar}
                />
              </TouchableOpacity>

              <View style={styles.headerTextBlock}>
                <Text style={styles.greetText}>Hello,</Text>

                <View style={styles.nameRow}>
                  <Text style={styles.userName}>{profile?.name || "Guest"}</Text>

                  {isPremium && (
                    <View style={styles.premiumBadge}>
                      <Ionicons name="diamond" size={12} color="#FFF" />
                      <Text style={styles.premiumText}>PRO</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* RIGHT: notification bell + badge */}
            <TouchableOpacity
              onPress={goToNotifications}
              activeOpacity={0.85}
              style={styles.notifBtn}
            >
              <Ionicons name="notifications" size={22} color="#FFF" />
              {unreadNotif > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadNotif > 99 ? "99+" : String(unreadNotif)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== HERO CAROUSEL ===== */}
        <View style={styles.carouselContainer}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
          >
            {carouselImages.map((img, i) => (
              <View key={i} style={styles.slide}>
                <Image source={img} style={styles.slideImage} />
                <View style={styles.slideOverlay} />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ===== QUICK ACTIONS ===== */}
        <View style={styles.actionContainer}>
          <Text style={styles.sectionLabel}>Design Tools</Text>

          <View style={styles.actionGridTwo}>
            <Action
              icon="color-wand"
              label="AI Interior Assistant"
              desc="Chat-Based Design"
              color="#0D9488"
              onPress={() => {
                // ✅ validation: require signed-in user (if your chat needs auth)
                if (!auth.currentUser?.uid) {
                  Alert.alert(
                    "Session Required",
                    "Please sign in to use AI Assistant."
                  );
                  return;
                }
                router.push("/User/AIDesignerChat");
              }}
            />
            <Action
              icon="chatbubbles"
              label="Consult"
              desc="Pro Advice"
              color="#7C3AED"
              onPress={() => {
                // ✅ validation: require signed-in user (consult flow typically needs uid)
                if (!auth.currentUser?.uid) {
                  Alert.alert(
                    "Session Required",
                    "Please sign in to consult an expert."
                  );
                  return;
                }
                router.push("/User/Consultants");
              }}
            />
          </View>
        </View>

        {/* ===== TIP CARD ===== */}
        {tipOfTheDay && (
          <View style={styles.tipWrapper}>
            <View style={styles.tipCard}>
              <View style={styles.tipBadge}>
                <Ionicons name="bulb" size={16} color="#FFF" />
                <Text style={styles.tipBadgeText}>TIP OF THE DAY</Text>
              </View>
              <Text style={styles.tipTitle}>{tipOfTheDay.title}</Text>
              <Text style={styles.tipContent}>{tipOfTheDay.tip}</Text>
            </View>
          </View>
        )}

        {/* ===== RECENT PROJECTS ===== */}
        <View style={styles.projectsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Projects</Text>
            <TouchableOpacity
              onPress={() => {
                // ✅ validation
                if (!auth.currentUser?.uid) {
                  Alert.alert(
                    "Session Required",
                    "Please sign in to view your projects."
                  );
                  return;
                }
                router.push("/User/Projects");
              }}
            >
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.projectList}
          >
            {rooms.length > 0 ? (
              rooms.map((room) => (
                <TouchableOpacity
                  key={room.id}
                  style={styles.projectCard}
                  activeOpacity={0.85}
                  onPress={() => openProject(room)}
                >
                  <Image
                    source={
                      room.imageUrl
                        ? { uri: room.imageUrl }
                        : require("../../assets/livingroom.jpg")
                    }
                    style={styles.projectImg}
                  />
                  <View style={styles.projectInfo}>
                    <Text style={styles.projectName} numberOfLines={1}>
                      {room.name}
                    </Text>
                    <Ionicons
                      name="chevron-forward-circle"
                      size={20}
                      color="#01579B"
                    />
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={{ paddingLeft: 25, paddingVertical: 10 }}>
                <Text style={{ color: "#94A3B8", fontWeight: "700" }}>
                  No recent projects yet.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </ScrollView>

      <BottomNavbar subType={subType} />
    </View>
  );
}

const Action = ({ icon, label, desc, color, onPress }) => (
  <TouchableOpacity
    style={styles.actionItem}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[styles.iconCircle, { backgroundColor: color + "15" }]}>
      <Ionicons name={icon} size={26} color={color} />
    </View>
    <Text style={styles.actionLabel}>{label}</Text>
    <Text style={styles.actionDesc}>{desc}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({

  header: {
    backgroundColor: "#01579B",
    paddingBottom: 80,
    paddingHorizontal: 25,
  },

  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between", // ✅ to place bell on the right
    paddingTop: 25,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },

  headerTextBlock: {
    flexDirection: "column",
  },

  greetText: { color: "#E0F2FE", fontSize: 14, fontWeight: "500" },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },

  userName: { color: "#FFF", fontSize: 24, fontWeight: "900" },

  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#CA8A04",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  premiumText: { color: "#FFF", fontSize: 10, fontWeight: "900" },

  profileAvatar: {
    width: 45,
    height: 45,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#FFF",
  },

  // ✅ NEW: notification bell styles (badge)
  notifBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: "#01579B",
  },
  notifBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "900",
  },

  carouselContainer: { marginTop: -60, marginBottom: 25 },
  slide: { width: width },
  slideImage: {
    width: width - 40,
    height: 180,
    borderRadius: 24,
    alignSelf: "center",
  },
  slideOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 24,
    width: width - 40,
    alignSelf: "center",
  },

  actionContainer: { paddingHorizontal: 25, marginBottom: 30 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    marginBottom: 15,
    letterSpacing: 1,
  },

  actionGridTwo: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
  },

  actionItem: {
    backgroundColor: "#FFF",
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 22,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },

  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },

  actionLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1E293B",
    textAlign: "center",
  },
  actionDesc: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 3,
    textAlign: "center",
  },

  tipWrapper: { paddingHorizontal: 25, marginBottom: 30 },
  tipCard: {
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 24,
    borderLeftWidth: 6,
    borderLeftColor: "#01579B",
    elevation: 3,
    shadowColor: "#01579B",
    shadowOpacity: 0.1,
    shadowRadius: 15,
  },
  tipBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#01579B",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
    marginBottom: 12,
  },
  tipBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "900" },
  tipTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F3E48",
    marginBottom: 6,
  },
  tipContent: { fontSize: 13, color: "#64748B", lineHeight: 20 },

  // (kept)
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 25,
    marginBottom: 15,
  },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#0F3E48" },
  seeAll: { color: "#01579B", fontWeight: "700", fontSize: 13 },
  projectList: { paddingLeft: 25 , padding:10,},

  projectCard: {
    width: CARD_WIDTH,
    backgroundColor: "#FFF",
    borderRadius: 24,
    marginRight: 15,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  projectImg: { width: "100%", height: 140 },
  projectInfo: {
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  projectName: {
    fontWeight: "800",
    color: "#1E293B",
    flex: 1,
    marginRight: 10,
  },
});
