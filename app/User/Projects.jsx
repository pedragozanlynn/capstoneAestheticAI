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

  const cleanupRef = useRef(null);

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

    try {
      cleanupRef.current?.();
    } catch {}
    cleanupRef.current = null;

    if (!uid) {
      setFallbackProjects();
      cleanupRef.current = () => {};

      if (!didWarnNoUserRef.current) {
        didWarnNoUserRef.current = true;
        showToast("Please sign in to view your saved projects.", "info");
      }
      return;
    }

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

          const image = data?.image ?? null;
          const inputImage = data?.inputImage ?? null;
          const conversationId = data?.conversationId ?? data?.chatId ?? null;
          const mode = safeStr(data?.mode) || "design";

          const prompt = safeStr(data?.prompt);
          const title = prompt || safeStr(data?.title) || "Untitled Project";

          return {
            id: d.id,
            title,
            prompt,
            image,
            inputImage,
            conversationId: safeStr(conversationId),
            mode,
            date,
            tag: safeStr(data?.tag) || "Room",
          };
        });

        if (parsed.length === 0) {
          setFallbackProjects();

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
    const unsubAuth = auth.onAuthStateChanged(() => {
      loadProjects();
    });

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
              if (String(projectId).startsWith("aestheticai:project-image:")) {
                await AsyncStorage.removeItem(projectId);
                showToast("Project removed successfully.", "success");
                loadProjects();
                return;
              }

              await deleteDoc(doc(db, "projects", projectId));
              showToast("Project removed successfully.", "success");
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
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

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
          <Ionicons
            name={
              toast.type === "success"
                ? "checkmark-circle-outline"
                : toast.type === "error"
                ? "alert-circle-outline"
                : "information-circle-outline"
            }
            size={16}
            color="#fff"
          />
          <Text style={styles.toastText} numberOfLines={2}>
            {toast.text}
          </Text>
        </View>
      )}

      {/* ✅ SIMPLE HEADER (NO CHIP / NO CARD) */}
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
        {/* ✅ CHIP MOVED BESIDE "Your projects" */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionLeft}>
            <Text style={styles.sectionLabel}>Your projects</Text>
            <View style={styles.countChip}>
              <Ionicons name="sparkles-outline" size={13} color="#0F3E48" />
              <Text style={styles.countChipText}>{projects.length}</Text>
            </View>
          </View>

          <Text style={styles.sectionMeta}>Tap to view • Long-press to delete</Text>
        </View>

        {projects.length > 0 ? (
          <View style={styles.grid}>
            {projects.map((project) => {
              const hasRemote = typeof project.image === "string" && project.image;
              const imgSource = hasRemote ? { uri: project.image } : project.image;

              return (
                <TouchableOpacity
                  key={project.id}
                  style={styles.card}
                  activeOpacity={0.92}
                  onPress={() => openVisualization(project)}
                  onLongPress={() => handleDeleteProject(project.id)}
                >
                  <View style={styles.cardMediaWrap}>
                    <Image
                      source={imgSource}
                      style={styles.cardImage}
                      resizeMode="cover"
                    />

                    <View style={styles.badgePill}>
                      <Ionicons name="home-outline" size={12} color="#0F3E48" />
                      <Text style={styles.badgePillText} numberOfLines={1}>
                        {project.tag || "Room"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardInfo}>
                    <Text style={styles.projectTitle} numberOfLines={2}>
                      {project.title}
                    </Text>

                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <Ionicons
                          name="calendar-outline"
                          size={13}
                          color="#64748B"
                        />
                        <Text style={styles.projectDate}>{project.date}</Text>
                      </View>

                      <View style={styles.metaDot} />

                      <View style={styles.metaItem}>
                        <Ionicons
                          name={
                            project.mode === "customize"
                              ? "color-wand-outline"
                              : "brush-outline"
                          }
                          size={13}
                          color="#64748B"
                        />
                        <Text style={styles.projectMode}>
                          {safeStr(project.mode || "design").toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="images-outline" size={44} color="#0F3E48" />
              </View>
              <Text style={styles.emptyTitle}>No AI projects yet</Text>
              <Text style={styles.emptyText}>
                Generate a design in the AI chat, then save it to appear here.
              </Text>

              <View style={styles.emptyHintRow}>
                <View style={styles.emptyHintPill}>
                  <Ionicons name="tap-outline" size={14} color="#0F3E48" />
                  <Text style={styles.emptyHintText}>Tap a card to view</Text>
                </View>
                <View style={styles.emptyHintPill}>
                  <Ionicons name="trash-outline" size={14} color="#0F3E48" />
                  <Text style={styles.emptyHintText}>Long-press to delete</Text>
                </View>
              </View>
            </View>
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
    left: 16,
    right: 16,
    top: Platform.OS === "ios" ? 62 : 86,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    opacity: 0.98,
    elevation: 12,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toastText: {
    flex: 1,
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "left",
    lineHeight: 18,
  },
  toastInfo: { backgroundColor: "#0F172A" },
  toastSuccess: { backgroundColor: "#16A34A" },
  toastError: { backgroundColor: "#DC2626" },

  /* ===== SIMPLE HEADER ===== */
  header: {
    paddingTop: Platform.OS === "ios" ? 58 : 60,
    paddingHorizontal: 18,
    paddingBottom: 8,
    backgroundColor: "#F8FAFC",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F3E48",
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    fontWeight: "600",
  },

  /* ===== CONTENT ===== */
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 120,
    paddingTop: 10,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 14,
  },
  sectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#334155",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  sectionMeta: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "700",
  },

  /* ✅ COUNT CHIP BESIDE "Your projects" */
  countChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  countChipText: {
    fontWeight: "900",
    color: "#0F3E48",
    fontSize: 12,
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
    borderRadius: 22,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  cardMediaWrap: {
    position: "relative",
    backgroundColor: "#F1F5F9",
  },
  cardImage: {
    width: "100%",
    height: 160,
  },

  badgePill: {
    position: "absolute",
    left: 10,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(241,245,249,0.92)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#0F3E48",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    maxWidth: 90,
  },

  cardInfo: {
    padding: 12,
    paddingTop: 10,
  },
  projectTitle: {
    fontSize: 13.5,
    fontWeight: "900",
    color: "#0F172A",
    lineHeight: 18,
    minHeight: 36,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 10,
  },
  projectDate: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "800",
  },
  projectMode: {
    fontSize: 10.5,
    color: "#64748B",
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  /* ===== EMPTY ===== */
  emptyWrap: {
    alignItems: "center",
    marginTop: 40,
  },
  emptyCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
    alignItems: "center",
  },
  emptyIconCircle: {
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F3E48",
    marginBottom: 6,
  },
  emptyText: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  emptyHintRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  emptyHintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F1F5F9",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyHintText: {
    fontSize: 11.5,
    fontWeight: "900",
    color: "#0F3E48",
  },
});
