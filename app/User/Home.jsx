import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from "react-native";
import { auth, db } from "../../config/firebase";
import useSubscriptionType from "../../services/useSubscriptionType";
import BottomNavbar from "../components/BottomNav";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width * 0.75;
const PROFILE_KEY_PREFIX = "aestheticai:user-profile:";

const DESIGN_INSPIRATIONS = [
  { title: "Warm Minimalism", tip: "Use neutral colors with natural wood to create a calm, cozy space." },
  { title: "Small Space Trick", tip: "Mirrors help small rooms feel bigger and brighter." },
  { title: "Color Balance", tip: "Stick to one main color and two supporting tones for harmony." },
  { title: "Lighting Matters", tip: "Layer lighting (ambient, task, accent) for a more premium feel." },
  { title: "Texture Upgrade", tip: "Mix textures like wood, fabric, and metal to add depth." },
];

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [tipOfTheDay, setTipOfTheDay] = useState(null);
  const subType = useSubscriptionType();

  const scrollRef = useRef(null);
  const carouselIndex = useRef(0);

  const carouselImages = [
    require("../../assets/carousel1.jpg"),
    require("../../assets/carousel2.jpg"),
    require("../../assets/carousel3.png"),
  ];

  const loadProfile = async () => {
    try {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);
        await AsyncStorage.setItem(`${PROFILE_KEY_PREFIX}${uid}`, JSON.stringify(data));
      }
    } catch (err) {
      console.log("Profile Load Error:", err);
    }
  };

  const fetchRooms = () => {
    setRooms([
      { id: "1", name: "Modern Living", image: require("../../assets/livingroom.jpg") },
      { id: "2", name: "Cozy Bedroom", image: require("../../assets/carousel2.jpg") },
      { id: "3", name: "Sleek Office", image: require("../../assets/carousel3.png") },
    ]);
  };

  const loadTipOfTheDay = async () => {
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
  };

  const isPremium = subType === "Premium";

  useEffect(() => {
    const interval = setInterval(() => {
      carouselIndex.current = (carouselIndex.current + 1) % carouselImages.length;
      scrollRef.current?.scrollTo({
        x: carouselIndex.current * width,
        animated: true,
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadProfile();
    fetchRooms();
    loadTipOfTheDay();
  }, []);

  const goToConsultations = () => {
    if (!isPremium) {
      Alert.alert("Premium Feature", "Consultation is only available for Premium users.", [
        { text: "Cancel" },
        { text: "Upgrade Now", onPress: () => router.push("/User/UpgradeInfo") },
      ]);
      return;
    }
    router.push("/User/Consultations");
  };

  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        
        {/* ===== PREMIUM HEADER ===== */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
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
            <TouchableOpacity style={styles.notifBtn} onPress={() => router.push("/User/Profile")}>
               <Image 
                 source={profile?.gender === "Female" ? require("../../assets/office-woman.png") : require("../../assets/office-man.png")} 
                 style={styles.profileAvatar} 
               />
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

        {/* ===== QUICK ACTIONS (MODERN FLOATING) ===== */}
        <View style={styles.actionContainer}>
          <Text style={styles.sectionLabel}>Design Tools</Text>
          <View style={styles.actionGrid}>
             <Action 
               icon="color-wand" 
               label="AI Design" 
               desc="From Scratch" 
               color="#0D9488" 
               onPress={() => router.push("/User/Design")} 
             />
             <Action 
               icon="brush" 
               label="Customize" 
               desc="Edit Room" 
               color="#DB2777" 
               onPress={() => router.push("/User/Customize")} 
             />
             <Action 
               icon="chatbubbles" 
               label="Consult" 
               desc="Pro Advice" 
               color="#7C3AED" 
               onPress={goToConsultations} 
             />
          </View>
        </View>

        {/* ===== TIP CARD (ELEVATED) ===== */}
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
            <TouchableOpacity onPress={() => router.push("/User/Projects")}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.projectList}>
            {rooms.map((room) => (
              <TouchableOpacity key={room.id} style={styles.projectCard}>
                <Image source={room.image} style={styles.projectImg} />
                <View style={styles.projectInfo}>
                  <Text style={styles.projectName}>{room.name}</Text>
                  <Ionicons name="chevron-forward-circle" size={20} color="#01579B" />
                </View>
              </TouchableOpacity>
            ))}
          
          </ScrollView>
        </View>

      </ScrollView>
      <BottomNavbar subType={subType} />
    </View>
  );
}

const Action = ({ icon, label, desc, color, onPress }) => (
  <TouchableOpacity style={styles.actionItem} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.iconCircle, { backgroundColor: color + "15" }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.actionLabel}>{label}</Text>
    <Text style={styles.actionDesc}>{desc}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },
  
  header: {
    backgroundColor: "#01579B",
    paddingTop: 60,
    paddingBottom: 80,
    paddingHorizontal: 25,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greetText: { color: "#E0F2FE", fontSize: 14, fontWeight: "500" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  userName: { color: "#FFF", fontSize: 24, fontWeight: "900" },
  premiumBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#CA8A04', 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: 8,
    gap: 4
  },
  premiumText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  profileAvatar: { width: 45, height: 45, borderRadius: 22, borderWidth: 2, borderColor: '#FFF' },

  carouselContainer: { marginTop: -60, marginBottom: 25 },
  slide: { width: width },
  slideImage: { width: width - 40, height: 180, borderRadius: 24, alignSelf: 'center' },
  slideOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 24, width: width - 40, alignSelf: 'center' },

  actionContainer: { paddingHorizontal: 25, marginBottom: 30 },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: "#94A3B8", textTransform: 'uppercase', marginBottom: 15, letterSpacing: 1 },
  actionGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  actionItem: { 
    backgroundColor: '#FFF', 
    width: (width - 70) / 3, 
    padding: 15, 
    borderRadius: 20, 
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10
  },
  iconCircle: { width: 45, height: 45, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  actionLabel: { fontSize: 11, fontWeight: "800", color: "#1E293B" },
  actionDesc: { fontSize: 9, color: "#64748B", marginTop: 2 },

  tipWrapper: { paddingHorizontal: 25, marginBottom: 30 },
  tipCard: { 
    backgroundColor: "#FFF", 
    padding: 20, 
    borderRadius: 24, 
    borderLeftWidth: 6, 
    borderLeftColor: "#01579B",
    elevation: 3,
    shadowColor: '#01579B',
    shadowOpacity: 0.1,
    shadowRadius: 15
  },
  tipBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#01579B', 
    alignSelf: 'flex-start', 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 8, 
    gap: 6, 
    marginBottom: 12 
  },
  tipBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  tipTitle: { fontSize: 16, fontWeight: "800", color: "#0F3E48", marginBottom: 6 },
  tipContent: { fontSize: 13, color: "#64748B", lineHeight: 20 },

  projectsSection: { marginBottom: 100 },
  sectionHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 25, 
    marginBottom: 15 
  },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#0F3E48" },
  seeAll: { color: "#01579B", fontWeight: "700", fontSize: 13 },
  projectList: { paddingLeft: 25 },
  projectCard: { 
    width: CARD_WIDTH, 
    backgroundColor: '#FFF', 
    borderRadius: 24, 
    marginRight: 15, 
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10
  },
  projectImg: { width: '100%', height: 140 },
  projectInfo: { 
    padding: 15, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  projectName: { fontWeight: '800', color: '#1E293B' },
  addProjectCard: {
    width: 80,
    height: 140,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginRight: 25
  },
  addText: { fontSize: 10, fontWeight: '700', color: '#64748B', marginTop: 5 }
});