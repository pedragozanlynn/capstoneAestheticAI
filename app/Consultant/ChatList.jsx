import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Text,
  TouchableOpacity,
  View,
  Image,
  StyleSheet,
  StatusBar,
  SafeAreaView,
} from "react-native";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import { Ionicons } from "@expo/vector-icons";

export default function ConsultantChatList() {
  const [rooms, setRooms] = useState([]);
  const [activeTab, setActiveTab] = useState("ongoing"); // 'ongoing' or 'completed'
  const router = useRouter();

  const fetchUserInfo = async (userId) => {
    const snap = await getDoc(doc(db, "users", userId));
    if (!snap.exists()) return { name: "User", avatar: null };
    const u = snap.data();
    return {
      name: u.fullName || u.name || "User",
      avatar: u.avatarUrl || null,
    };
  };

  useEffect(() => {
    let unsub;
    const init = async () => {
      const consultantId = await AsyncStorage.getItem("consultantUid");
      if (!consultantId) return;

      const q = query(
        collection(db, "chatRooms"),
        where("consultantId", "==", consultantId),
        orderBy("lastMessageAt", "desc")
      );

      unsub = onSnapshot(q, async (snap) => {
        const enriched = await Promise.all(
          snap.docs.map(async (d) => {
            const room = { id: d.id, ...d.data() };
            if (room.userName) return room;
            const user = await fetchUserInfo(room.userId);
            return { ...room, userName: user.name, avatar: user.avatar };
          })
        );
        setRooms(enriched);
      });
    };

    init();
    return () => unsub && unsub();
  }, []);

  // Filter Logic
  const filteredRooms = rooms.filter((room) => {
    if (activeTab === "ongoing") return room.status !== "completed";
    return room.status === "completed";
  });

  const renderChatItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.chatItem, activeTab === 'completed' && { opacity: 0.8 }]}
      onPress={() => router.push({ pathname: "/Consultant/ChatRoom", params: { roomId: item.id, userId: item.userId } })}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrap}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.placeholderAvatar, activeTab === 'completed' && { backgroundColor: '#F1F5F9' }]}>
            <Text style={[styles.avatarLetter, activeTab === 'completed' && { color: '#94A3B8' }]}>
              {item.userName?.[0] || "?"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.contentWrap}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{item.userName}</Text>
          {item.lastMessageAt && (
             <Text style={styles.timeText}>
               {new Date(item.lastMessageAt?.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
             </Text>
          )}
        </View>
        
        <View style={styles.messageRow}>
          <Text style={styles.message} numberOfLines={1}>
            {item.lastMessage || "No messages yet"}
          </Text>
          {activeTab === 'ongoing' && item.unreadForConsultant && (
            <View style={styles.unreadBadge}>
               <Text style={styles.unreadCount}>!</Text>
            </View>
          )}
          {activeTab === 'completed' && (
            <Ionicons name="archive-outline" size={14} color="#94A3B8" />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#01579B" />
      
      <View style={styles.header}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <Text style={styles.headerText}>Messages</Text>
            <Text style={styles.headerSub}>Client consultations</Text>
          </View>
        </SafeAreaView>
      </View>

      {/* TABS OUTSIDE HEADER */}
      <View style={styles.filterWrapper}>
        <View style={styles.tabBar}>
          {["ongoing", "completed"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, activeTab === tab && styles.activeTabItem]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabLabel, activeTab === tab && styles.activeTabLabel]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              {activeTab === tab && <View style={styles.activeDot} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredRooms}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        renderItem={renderChatItem}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubble-ellipses-outline" size={60} color="#CBD5E1" />
            <Text style={styles.emptyText}>No {activeTab} conversations</Text>
          </View>
        }
      />

      <BottomNavbar role="consultant" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    backgroundColor: "#01579B",
    paddingBottom: 20,
    paddingTop: 10,
 
  },
  headerContent: { paddingHorizontal: 25, paddingTop: 15 },
  headerText: { color: "#fff", fontSize: 25, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 2 },

  /* FILTER TABS */
  filterWrapper: {
    paddingHorizontal: 20,
    marginTop: 10, // Naka-overlap ng konti sa blue header
    marginBottom: 10,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 4,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderRadius: 12,
  },
  activeTabItem: {
    backgroundColor: '#F1F5F9',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  activeTabLabel: {
    color: '#01579B',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#01579B',
    marginLeft: 8,
  },

  listContainer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },
  chatItem: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  avatarWrap: { width: 54, height: 54, marginRight: 15 },
  avatar: { width: 54, height: 54, borderRadius: 18 },
  placeholderAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: { color: "#01579B", fontWeight: "800", fontSize: 20 },

  contentWrap: { flex: 1, marginRight: 10 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontWeight: "800", fontSize: 16, color: "#1E293B", flex: 1 },
  timeText: { fontSize: 11, color: "#94A3B8" },

  messageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  message: { color: "#64748B", fontSize: 14, flex: 1 },
  
  unreadBadge: {
    backgroundColor: "#01579B",
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  unreadCount: { color: "#fff", fontSize: 10, fontWeight: "bold" },

  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: "#94A3B8", marginTop: 15, fontSize: 15 }
});