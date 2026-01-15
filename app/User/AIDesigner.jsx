import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  StatusBar,
  SafeAreaView, // Idinagdag ang SafeAreaView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import useSubscriptionType from "../../services/useSubscriptionType";
import BottomNavbar from "../components/BottomNav";

export default function AIDesigner() {
  const router = useRouter();
  const subType = useSubscriptionType();

  const [chatSummaries] = useState({
    design: [
      { id: "1", title: "Living Room Design", lastMessage: "Great! I suggest neutral colors...", date: "Nov 17" },
      { id: "2", title: "Workspace Redesign", lastMessage: "Consider adding a small desk...", date: "Nov 15" },
    ],
    customize: [
      { id: "1", title: "Bedroom Layout", lastMessage: "Try moving the bed to the corner...", date: "Nov 16" },
    ],
  });

  const openChatScreen = (mode) => {
    router.push(`/User/AIDesignerChat?tab=${mode}&chatId=new`);
  };

  const openChatHistory = (tab, chatId) => {
    router.push(`/User/AIDesignerChat?tab=${tab}&chatId=${chatId}`);
  };

  const historyList = [
    ...chatSummaries.design.map((c) => ({ ...c, tab: "design" })),
    ...chatSummaries.customize.map((c) => ({ ...c, tab: "customize" })),
  ];

  return (
    <View style={styles.page}>
      {/* Ginawang dark-content para itim ang icons at translucent=false para hindi mag-overlap */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent={false} />
      
      {/* SafeAreaView para sa iOS (Notch area) */}
      <SafeAreaView style={{ backgroundColor: "#FFF" }} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Interior Hub</Text>
        <Text style={styles.headerSubtitle}>Personalized design at your fingertips</Text>
      </View>

      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ===== AI TOOLS SECTION ===== */}
        <Text style={styles.sectionLabel}>Start a New Project</Text>
        <View style={styles.cardsContainer}>
          <TouchableOpacity
            onPress={() => openChatScreen("design")}
            style={[styles.mainCard, { backgroundColor: "#0F3E48" }]}
            activeOpacity={0.9}
          >
            <View style={styles.cardIconCircle}>
              <Image source={require("../../assets/design.png")} style={styles.cardIcon} />
            </View>
            <Text style={styles.cardTitle}>Full Room Design</Text>
            <Text style={styles.cardDesc}>Create a new room concept from scratch.</Text>
            <Ionicons name="arrow-forward-circle" size={24} color="#3FA796" style={styles.cardArrow} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => openChatScreen("customize")}
            style={[styles.mainCard, { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E2E8F0" }]}
            activeOpacity={0.9}
          >
            <View style={[styles.cardIconCircle, { backgroundColor: "#FDF2F8" }]}>
              <Image source={require("../../assets/customize.png")} style={styles.cardIcon} />
            </View>
            <Text style={[styles.cardTitle, { color: "#1E293B" }]}>Customize Space</Text>
            <Text style={styles.cardDescLight}>Adjust layouts, colors, and furniture.</Text>
            <Ionicons name="arrow-forward-circle" size={24} color="#DB2777" style={styles.cardArrow} />
          </TouchableOpacity>
        </View>

        {/* ===== HISTORY SECTION ===== */}
        <View style={styles.historyHeaderRow}>
          <Text style={styles.historyTitle}>Recent Chats</Text>
          <TouchableOpacity>
            <Text style={styles.seeAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.historyList}>
          {historyList.map((chat) => (
            <TouchableOpacity
              key={`${chat.tab}-${chat.id}`}
              style={styles.historyItem}
              onPress={() => openChatHistory(chat.tab, chat.id)}
            >
              <View style={[styles.historyIconBox, { backgroundColor: chat.tab === 'design' ? '#E0F2FE' : '#FCE7F3' }]}>
                <Ionicons 
                  name={chat.tab === 'design' ? "color-wand" : "brush"} 
                  size={20} 
                  color={chat.tab === 'design' ? "#0284C7" : "#DB2777"} 
                />
              </View>
              
              <View style={styles.historyTextContent}>
                <View style={styles.historyTopLine}>
                  <Text style={styles.historyItemTitle} numberOfLines={1}>{chat.title}</Text>
                  <Text style={styles.historyItemDate}>{chat.date}</Text>
                </View>
                <Text style={styles.historyItemSnippet} numberOfLines={1}>
                  {chat.lastMessage}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <BottomNavbar subType={subType} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },
  
  header: {
    // Binawasan ang paddingTop dahil sa SafeAreaView/StatusBar adjustment
    paddingTop: Platform.OS === 'android' ? 15 : 10,
    paddingHorizontal: 25,
    paddingBottom: 20,
    backgroundColor: "#FFF",
  },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#0F3E48" },
  headerSubtitle: { fontSize: 14, color: "#64748B", marginTop: 4 },

  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 25, paddingBottom: 100 },

  sectionLabel: { 
    fontSize: 12, 
    fontWeight: "800", 
    color: "#94A3B8", 
    textTransform: "uppercase", 
    letterSpacing: 1,
    marginTop: 25,
    marginBottom: 15
  },

  cardsContainer: { flexDirection: "row", gap: 15 },
  mainCard: {
    flex: 1,
    padding: 20,
    borderRadius: 24,
    height: 200,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    justifyContent: 'space-between'
  },
  cardIconCircle: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: 'center',
    alignItems: 'center'
  },
  cardIcon: { width: 28, height: 28, resizeMode: 'contain' },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#FFF", marginTop: 10 },
  cardDesc: { fontSize: 11, color: "#94A3B8", lineHeight: 16 },
  cardDescLight: { fontSize: 11, color: "#64748B", lineHeight: 16 },
  cardArrow: { alignSelf: 'flex-end' },

  historyHeaderRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginTop: 35,
    marginBottom: 15
  },
  historyTitle: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  seeAllText: { fontSize: 13, color: "#3FA796", fontWeight: "700" },

  historyList: { gap: 12 },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: "#F1F5F9"
  },
  historyIconBox: {
    width: 45,
    height: 45,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  historyTextContent: { flex: 1 },
  historyTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  historyItemTitle: { fontSize: 15, fontWeight: "700", color: "#0F3E48", flex: 1 },
  historyItemDate: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  historyItemSnippet: { fontSize: 13, color: "#64748B" },
});