import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  SafeAreaView,
  Platform
} from "react-native";
import useSubscriptionType from "../../services/useSubscriptionType";
import BottomNavbar from "../components/BottomNav";

export default function Project() {
  const router = useRouter();
  const subType = useSubscriptionType();
  const [projects, setProjects] = useState([]);

  /* ================= LOAD PROJECTS ================= */
  const loadProjects = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const projectKeys = keys.filter((k) =>
        k.startsWith("aestheticai:project-image:")
      );

      const items = await AsyncStorage.multiGet(projectKeys);

      const parsed = items.map(([key, value]) => {
        const data = JSON.parse(value || "{}");
        return {
          id: key,
          title: data.title || "Untitled Project",
          image: data.image,
          date: data.date || new Date().toISOString().split("T")[0],
          tag: data.tag || "Room",
        };
      });

      if (parsed.length === 0) {
        setProjects([
          {
            id: "static-1",
            title: "Modern Living Room",
            image: require("../../assets/livingroom.jpg"),
            date: "2025-12-20",
            tag: "Living Room",
          },
        ]);
      } else {
        setProjects(parsed);
      }
    } catch (err) {
      console.log("Error loading projects:", err);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  /* ================= ACTIONS ================= */
  const openVisualization = (project) => {
    router.push(`/User/RoomVisualization?id=${project.id}`);
  };

  const handleDeleteProject = (projectId) => {
    Alert.alert(
      "Delete Project",
      "Are you sure you want to delete this project?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(projectId);
              loadProjects();
            } catch (e) {
              console.log("Delete error:", e);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* 🟦 HEADER (Kinuha sa AIDesigner) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Design Gallery</Text>
        <Text style={styles.headerSubtitle}>
          Review and manage your saved creations
        </Text>
      </View>

      {/* 🖼️ PROJECT GRID */}
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Your Projects ({projects.length})</Text>

        {projects.length > 0 ? (
          <View style={styles.grid}>
            {projects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => openVisualization(project)}
                onLongPress={() => handleDeleteProject(project.id)}
              >
                <Image
                  source={
                    typeof project.image === "string"
                      ? { uri: project.image }
                      : project.image
                  }
                  style={styles.cardImage}
                  resizeMode="cover"
                />

                <View style={styles.cardInfo}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{project.tag}</Text>
                  </View>
                  <Text style={styles.projectTitle} numberOfLines={1}>
                    {project.title}
                  </Text>
                  <View style={styles.dateRow}>
                    <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
                    <Text style={styles.projectDate}>{project.date}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="image-outline" size={50} color="#0F3E48" />
            </View>
            <Text style={styles.emptyText}>No AI projects yet</Text>
          </View>
        )}
      </ScrollView>

      <BottomNavbar subType={subType} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { 
    flex: 1, 
    backgroundColor: "#F8FAFC" // Consistent Background
  },

  /* ===== HEADER (EXACTLY FROM AIDESIGNER) ===== */
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 25,
    paddingBottom: 20,
    backgroundColor: "#FFF", // White Header
  },
  headerTitle: { 
    fontSize: 26, 
    fontWeight: "900", 
    color: "#0F3E48" 
  },
  headerSubtitle: { 
    fontSize: 14, 
    color: "#64748B", 
    marginTop: 4 
  },

  /* ===== CONTENT ===== */
  container: { flex: 1 },
  scrollContent: { 
    paddingHorizontal: 25, 
    paddingBottom: 120 
  },

  sectionLabel: { 
    fontSize: 12, 
    fontWeight: "800", 
    color: "#94A3B8", 
    textTransform: "uppercase", 
    letterSpacing: 1,
    marginTop: 25,
    marginBottom: 15
  },

  /* ===== GRID & CARDS ===== */
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    backgroundColor: "#FFF",
    borderRadius: 24,
    marginBottom: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  cardImage: {
    width: "100%",
    height: 150,
  },
  cardInfo: {
    padding: 12,
  },
  badge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0F3E48",
    textTransform: 'uppercase',
  },
  projectTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  projectDate: {
    fontSize: 11,
    color: "#94A3B8",
  },

  /* ===== EMPTY STATE ===== */
  emptyWrap: {
    alignItems: "center",
    marginTop: 80,
  },
  emptyIconCircle: {
    backgroundColor: "#F1F5F9",
    borderRadius: 60,
    padding: 25,
    marginBottom: 14,
  },
  emptyText: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 16,
    fontWeight: "600",
  },
});