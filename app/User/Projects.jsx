import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Platform,
} from "react-native";
import useSubscriptionType from "../../services/useSubscriptionType";
import BottomNavbar from "../components/BottomNav";

// ✅ Firebase
import { getAuth } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../config/firebase";

const safeStr = (v) => (v == null ? "" : String(v).trim());

const toISODate = (ts) => {
  try {
    if (!ts) return "";
    const d = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
  } catch {
    return "";
  }
};

export default function Project() {
  const router = useRouter();
  const subType = useSubscriptionType();
  const [projects, setProjects] = useState([]);

  const auth = getAuth();

  // Keep latest cleanup for Firestore listener
  const cleanupRef = useRef(null);

  // ✅ minimal UX guards (no UI changes)
  const didWarnNoUserRef = useRef(false);
  const didShowEmptyInfoRef = useRef(false);

  /* ===========================
     ✅ TOAST (TOP POSITION)
     ✅ NO OK BUTTON
     =========================== */
  const [toast, setToast] = useState({ visible: false, text: "", type: "info" });
  const toastTimerRef = useRef(null);

  const showToast = (text, type = "info", ms = 2200) => {
    try {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ visible: true, text: String(text || ""), type });
      toastTimerRef.current = setTimeout(() => {
        setToast((t) => ({ ...t, visible: false }));
      }, ms);
    } catch {}
  };

  useEffect(() => {
    return () => {
      try {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      } catch {}
    };
  }, []);

  const setFallbackProjects = () => {
    setProjects([
      {
        id: "static-1",
        title: "Modern Living Room",
        image: require("../../assets/livingroom.jpg"),
        date: "2025-12-20",
        tag: "Living Room",

        // extra fields (safe defaults)
        prompt: "",
        inputImage: "",
        mode: "design",
        conversationId: "",
      },
    ]);
  };

  /* ================= LOAD PROJECTS ================= */
  const loadProjects = () => {
    const uid = auth?.currentUser?.uid;

    // cleanup previous listener if any
    try {
      cleanupRef.current?.();
    } catch {}
    cleanupRef.current = null;

    // ✅ Validation + info message (only once): not logged in
    if (!uid) {
      setFallbackProjects();
      cleanupRef.current = () => {};

      if (!didWarnNoUserRef.current) {
        didWarnNoUserRef.current = true;
        showToast("Please sign in to view your saved projects.", "info");
      }

      return;
    }

    // ✅ Firestore listener (projects per user)
    const qy = query(
      collection(db, "projects"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const parsed = snap.docs.map((d) => {
          const data = d.data() || {};

          const createdAtDate = toISODate(data?.createdAt);
          const date =
            createdAtDate ||
            safeStr(data?.date) ||
            new Date().toISOString().split("T")[0];

          const image = data?.image ?? null; // can be string url
          const inputImage = data?.inputImage ?? null; // optional original url
          const conversationId = data?.conversationId ?? data?.chatId ?? null; // support both keys
          const mode = safeStr(data?.mode) || "design";

          // Prefer a clean title:
          const prompt = safeStr(data?.prompt);
          const title = prompt || safeStr(data?.title) || "Untitled Project";

          return {
            id: d.id,
            title,
            prompt, // ✅ keep prompt for passing / display
            image, // ✅ AI result image url
            inputImage, // ✅ original uploaded ref (if saved)
            conversationId: safeStr(conversationId),
            mode,
            date,
            tag: safeStr(data?.tag) || "Room",
          };
        });

        if (parsed.length === 0) {
          // ✅ keep existing fallback
          setFallbackProjects();

          // ✅ Optional: gentle info (only once) when user has no projects yet
          if (!didShowEmptyInfoRef.current) {
            didShowEmptyInfoRef.current = true;
            showToast("No projects yet. Create a design first to see it here.", "info");
          }
        } else {
          setProjects(parsed);
        }
      },
      (err) => {
        console.log("Error loading projects:", err?.message || err);
        showToast("Failed to load projects. Please try again.", "error");
        setFallbackProjects();
      }
    );

    cleanupRef.current = () => unsub();
  };

  useEffect(() => {
    // ✅ reload when auth becomes available (prevents “stuck on fallback”)
    const unsubAuth = auth.onAuthStateChanged(() => {
      loadProjects();
    });

    // initial load attempt
    loadProjects();

    return () => {
      try {
        unsubAuth?.();
      } catch {}
      try {
        cleanupRef.current?.();
      } catch {}
      cleanupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= ACTIONS ================= */
  const openVisualization = (project) => {
    if (!project?.id) {
      showToast("Invalid project.", "error");
      return;
    }

    router.push({
      pathname: "/User/RoomVisualization",
      params: { id: project.id },
    });
  };

  const handleDeleteProject = (projectId) => {
    if (!projectId) {
      showToast("Invalid project.", "error");
      return;
    }
    if (projectId === "static-1") {
      showToast("This sample project cannot be deleted.", "info");
      return;
    }

    // ✅ Keep confirmation dialog (destructive action)
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
              // ✅ Legacy AsyncStorage fallback delete
              if (String(projectId).startsWith("aestheticai:project-image:")) {
                await AsyncStorage.removeItem(projectId);
                showToast("Project removed successfully.", "success");
                loadProjects();
                return;
              }

              // ✅ Firestore delete
              if (projectId) {
                await deleteDoc(doc(db, "projects", projectId));
                showToast("Project removed successfully.", "success");
              }
            } catch (e) {
              console.log("Delete error:", e?.message || e);
              showToast("Failed to delete project. Please try again.", "error");
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* ✅ TOAST OVERLAY (TOP, NO OK BUTTON) */}
      {toast.visible && (
        <View
          pointerEvents="none"
          style={[
            styles.toast,
            toast.type === "success" && styles.toastSuccess,
            toast.type === "error" && styles.toastError,
            toast.type === "info" && styles.toastInfo,
          ]}
        >
          <Text style={styles.toastText}>{toast.text}</Text>
        </View>
      )}

      {/* 🟦 HEADER */}
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
        <Text style={styles.sectionLabel}>
          Your Projects ({projects.length})
        </Text>

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
                    typeof project.image === "string" && project.image
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
    backgroundColor: "#F8FAFC",
  },

  /* ===== TOAST (TOP) ===== */
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    top: Platform.OS === "ios" ? 68 : 90, // ✅ top always
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    opacity: 0.96,
    elevation: 10,
    zIndex: 9999,
  },
  toastText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },
  toastInfo: { backgroundColor: "#0F172A" },
  toastSuccess: { backgroundColor: "#16A34A" },
  toastError: { backgroundColor: "#DC2626" },

  /* ===== HEADER ===== */
  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingHorizontal: 25,
    paddingBottom: 20,
    backgroundColor: "#FFF",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0F3E48",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
  },

  /* ===== CONTENT ===== */
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 25,
    paddingBottom: 120,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 25,
    marginBottom: 15,
  },

  /* ===== GRID ===== */
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
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0F3E48",
    textTransform: "uppercase",
  },
  projectTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  projectDate: {
    fontSize: 11,
    color: "#94A3B8",
  },

  /* ===== EMPTY ===== */
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
