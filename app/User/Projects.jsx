// app/User/Project.jsx
// ✅ UPDATE (YOUR REQUEST):
// ✅ NO OTHER LOGIC CHANGES (load, delete, navigation unchanged)
// ✅ When project is CUSTOMIZE -> ALWAYS show ORIGINAL (inputImage) + RESULT (image) in modal
// ✅ If mode is missing, AUTO-DETECT mode:
//    - if inputImage && image => CUSTOMIZE
//    - else => DESIGN
// ✅ Improve modal UI (cleaner, better spacing, better hierarchy)
// ✅ NEW (YOUR REQUEST NOW):
//    - Bigger modal (more visible)
//    - Prioritize: PIC first, then DETAILS, then EXPLANATION (then tips/layout)
// ✅ REMOVE: View Full button
// ✅ MODAL: add padding around (not dikit sa edges)

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Modal,
} from "react-native";
import useSubscriptionType from "../../services/useSubscriptionType";
import BottomNavbar from "../components/BottomNav";
import CenterMessageModal from "../components/CenterMessageModal";

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

// ✅ MODE DETECTION (NEW)
const detectModeFromData = (data) => {
  const explicit = safeStr(data?.mode).toLowerCase();
  if (explicit) return explicit;

  const hasInput = !!safeStr(data?.inputImage);
  const hasResult = !!safeStr(data?.image);

  if (hasInput && hasResult) return "customize";
  return "design";
};

const modeLabel = (m) => {
  const s = safeStr(m).toLowerCase();
  if (s === "customize") return "Customize";
  return "Design";
};

export default function Projects() {
  const router = useRouter();
  const subType = useSubscriptionType();
  const [projects, setProjects] = useState([]);
  const auth = getAuth();
  const cleanupRef = useRef(null);

  // ✅ toast/modal message (your existing CenterMessageModal)
  const [msg, setMsg] = useState({
    visible: false,
    type: "info",
    title: "",
    body: "",
    autoHideMs: 1800,
  });

  const showMsg = useCallback(
    (body, type = "info", title = "", autoHideMs = 1800) => {
      setMsg({ visible: true, type, title, body: String(body || ""), autoHideMs });
    },
    []
  );

  const closeMsg = useCallback(() => setMsg((m) => ({ ...m, visible: false })), []);

  // ✅ Project details modal state
  const [selected, setSelected] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  const openDetails = (project) => {
    setSelected(project || null);
    setDetailsVisible(true);
  };

  const closeDetails = () => {
    setDetailsVisible(false);
    setSelected(null);
  };

  const goToCustomize = () => {
    if (!selected?.id) return;
    if (!selected?.image) return;

    closeDetails();
    router.push({
      pathname: "/User/AIDesignerChat",
      params: {
        tab: "customize",
        source: "project",
        prompt: selected?.prompt || "",
        refImage: selected?.image || "",
        inputImage: selected?.inputImage || "",
        chatId: "new",
        title: selected?.title || "",
      },
    });
  };

  // ✅ Derived modal flags (do not mutate other logic)
  const modalMode = useMemo(() => detectModeFromData(selected || {}), [selected]);
  const isCustomizeProject = modalMode === "customize";
  const hasOriginal = !!safeStr(selected?.inputImage);
  const hasResult = !!safeStr(selected?.image);

  /* ================= LOAD PROJECTS ================= */
  const loadProjects = useCallback(() => {
    const uid = auth?.currentUser?.uid;

    try {
      cleanupRef.current?.();
    } catch {}
    cleanupRef.current = null;

    if (!uid) return;

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

          // ✅ Prefer prompt as title (user prompt), then fall back to title field, then fallback
          const prompt = safeStr(data?.prompt);
          const titleFallback = safeStr(data?.title);

          return {
            id: d.id,
            title: prompt || titleFallback || "Untitled Project",
            prompt,
            image: safeStr(data?.image) || null,
            inputImage: safeStr(data?.inputImage) || null,
            date: toISODate(data?.createdAt),
            tag: safeStr(data?.tag) || "Room",

            // ✅ fields to show in modal
            explanation:
              safeStr(data?.explanation) ||
              safeStr(data?.details) ||
              safeStr(data?.aiExplanation) ||
              "",
            // ✅ mode: keep raw stored but also allow auto detect in modal
            mode: safeStr(data?.mode) || "",

            // ✅ Optional extras
            palette: data?.palette || null,
            tips: Array.isArray(data?.tips) ? data.tips : [],
            layoutSuggestions: Array.isArray(data?.layoutSuggestions)
              ? data.layoutSuggestions
              : [],
            furnitureMatches: Array.isArray(data?.furnitureMatches)
              ? data.furnitureMatches
              : [],
          };
        });

        setProjects(parsed);
      },
      (err) => {
        console.warn("Projects load error:", err?.message || err);
        showMsg("Unable to load projects.", "error", "Error");
      }
    );

    cleanupRef.current = () => unsub();
  }, [auth, showMsg]);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(() => loadProjects());
    loadProjects();

    return () => {
      try {
        unsubAuth?.();
      } catch {}
      try {
        cleanupRef.current?.();
      } catch {}
    };
  }, [loadProjects, auth]);

  /* ================= DELETE ================= */
  const handleDeleteProject = (projectId) => {
    Alert.alert("Delete Project", "Are you sure you want to delete this project?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "projects", projectId));
            showMsg("Project deleted.", "success", "Deleted");
            if (selected?.id === projectId) closeDetails();
          } catch (e) {
            showMsg("Delete failed.", "error", "Error");
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* ✅ Small message modal (existing) */}
      <CenterMessageModal
        visible={msg.visible}
        type={msg.type}
        title={msg.title}
        body={msg.body}
        autoHideMs={msg.autoHideMs}
        onClose={closeMsg}
      />

      {/* ✅ Project details modal (BIGGER + BETTER HIERARCHY) */}
      <Modal
        visible={detailsVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDetails}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selected?.title || "Project"}
                </Text>

                <View style={styles.modalMetaInline}>
                  {!!safeStr(selected?.tag) && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>
                        {safeStr(selected?.tag) || "Room"}
                      </Text>
                    </View>
                  )}

                  <View
                    style={[styles.pill, isCustomizeProject ? styles.pillCyan : styles.pillSlate]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        isCustomizeProject ? styles.pillTextCyan : styles.pillTextSlate,
                      ]}
                    >
                      {modeLabel(modalMode)}
                    </Text>
                  </View>

                  {!!safeStr(selected?.date) && (
                    <View style={styles.pillSoft}>
                      <Ionicons name="calendar-outline" size={14} color="#334155" />
                      <Text style={styles.pillSoftText}>{selected.date}</Text>
                    </View>
                  )}
                </View>
              </View>

              <TouchableOpacity
                onPress={closeDetails}
                style={styles.modalCloseBtn}
                activeOpacity={0.9}
              >
                <Ionicons name="close" size={18} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Images (PIC FIRST) */}
            <View style={styles.modalImageArea}>
              {isCustomizeProject ? (
                <View style={styles.compareGrid}>
                  <View style={styles.compareCard}>
                    <Text style={styles.compareLabel}>Original</Text>
                    {hasOriginal ? (
                      <Image
                        source={{ uri: selected.inputImage }}
                        style={styles.compareImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.comparePlaceholder}>
                        <Ionicons name="image-outline" size={26} color="#94A3B8" />
                        <Text style={styles.comparePlaceholderText}>No original</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.compareCard}>
                    <Text style={styles.compareLabel}>Result</Text>
                    {hasResult ? (
                      <Image
                        source={{ uri: selected.image }}
                        style={styles.compareImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.comparePlaceholder}>
                        <Ionicons name="image-outline" size={26} color="#94A3B8" />
                        <Text style={styles.comparePlaceholderText}>No result</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <>
                  {hasResult ? (
                    <Image
                      source={{ uri: selected.image }}
                      style={styles.modalHeroImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.modalHeroPlaceholder}>
                      <Ionicons name="image-outline" size={28} color="#94A3B8" />
                      <Text style={styles.modalHeroPlaceholderText}>No image</Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Body (DETAILS then EXPLANATION) */}
            <ScrollView
              style={styles.modalBodyScroll}
              contentContainerStyle={{ paddingBottom: 16, paddingTop: 10 }}
              showsVerticalScrollIndicator={false}
            >
              {/* ✅ DETAILS FIRST */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color="#0F172A"
                  />
                  <Text style={styles.sectionTitleCard}>Details</Text>
                </View>

                {!!safeStr(selected?.prompt) ? (
                  <Text style={styles.detailsPrompt} numberOfLines={3}>
                    {safeStr(selected.prompt)}
                  </Text>
                ) : (
                  <Text style={styles.sectionBodyMuted}>—</Text>
                )}

                <View style={styles.detailsPillsRow}>
                  {!!safeStr(selected?.tag) && (
                    <View style={styles.detailPill}>
                      <Ionicons name="pricetag-outline" size={14} color="#0F172A" />
                      <Text style={styles.detailPillText}>{safeStr(selected.tag)}</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.detailPill,
                      isCustomizeProject ? styles.detailPillCyan : styles.detailPillSlate,
                    ]}
                  >
                    <Ionicons
                      name="sparkles-outline"
                      size={14}
                      color={isCustomizeProject ? "#0F3E48" : "#0F172A"}
                    />
                    <Text
                      style={[
                        styles.detailPillText,
                        isCustomizeProject ? styles.detailPillTextCyan : styles.detailPillTextSlate,
                      ]}
                    >
                      {modeLabel(modalMode)}
                    </Text>
                  </View>

                  {!!safeStr(selected?.date) && (
                    <View style={styles.detailPill}>
                      <Ionicons name="calendar-outline" size={14} color="#0F172A" />
                      <Text style={styles.detailPillText}>{safeStr(selected.date)}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* ✅ EXPLANATION NEXT */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={18}
                    color="#0F172A"
                  />
                  <Text style={styles.sectionTitleCard}>Explanation</Text>
                </View>

                <Text style={styles.sectionBody}>
                  {selected?.explanation?.trim() ? selected.explanation : "—"}
                </Text>
              </View>

              {Array.isArray(selected?.tips) && selected.tips.length > 0 && (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Ionicons name="color-palette-outline" size={18} color="#0F172A" />
                    <Text style={styles.sectionTitleCard}>Decoration Tips</Text>
                  </View>

                  {selected.tips.slice(0, 6).map((t, i) => (
                    <View key={`tip-${i}`} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{String(t)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {Array.isArray(selected?.layoutSuggestions) &&
                selected.layoutSuggestions.length > 0 && (
                  <View style={styles.sectionCard}>
                    <View style={styles.sectionHeaderRow}>
                      <Ionicons name="grid-outline" size={18} color="#0F172A" />
                      <Text style={styles.sectionTitleCard}>Layout Suggestions</Text>
                    </View>

                    {selected.layoutSuggestions.slice(0, 6).map((t, i) => (
                      <View key={`lay-${i}`} style={styles.bulletRow}>
                        <View style={styles.bulletDot} />
                        <Text style={styles.bulletText}>{String(t)}</Text>
                      </View>
                    ))}
                  </View>
                )}
            </ScrollView>

            {/* Actions (ONLY Customize) */}
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                onPress={goToCustomize}
                style={[styles.modalBtnPrimary, !hasResult && { opacity: 0.6 }]}
                disabled={!hasResult}
                activeOpacity={0.9}
              >
                <Ionicons name="brush-outline" size={18} color="#FFF" />
                <Text style={styles.modalBtnPrimaryText}>Customize</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Design Gallery</Text>
        <Text style={styles.headerSubtitle}>Review and manage your saved creations</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.grid}>
          {projects.map((project) => (
            <TouchableOpacity
              key={project.id}
              style={styles.card}
              onPress={() => openDetails(project)}
              activeOpacity={0.9}
            >
              {project.image ? (
                <Image
                  source={{ uri: project.image }}
                  style={styles.cardImage}
                  onError={(e) =>
                    console.log("❌ Project image load failed:", project.image, e?.nativeEvent)
                  }
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="image-outline" size={26} color="#94A3B8" />
                  <Text style={styles.imagePlaceholderText}>No image</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteProject(project.id);
                }}
                activeOpacity={0.9}
              >
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </TouchableOpacity>

              <View style={styles.cardInfo}>
                <Text style={styles.projectTitle} numberOfLines={1}>
                  {project.title}
                </Text>
                <Text style={styles.projectDate}>{project.date}</Text>
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
    paddingTop: 60,
    paddingHorizontal: 25,
    paddingBottom: 20,
    backgroundColor: "#FFF",
  },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#0F3E48" },
  headerSubtitle: { fontSize: 14, color: "#64748B", marginTop: 4 },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 25, paddingBottom: 120 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  card: {
    width: "48%",
    backgroundColor: "#FFF",
    borderRadius: 24,
    marginBottom: 20,
    overflow: "hidden",
  },
  cardImage: { width: "100%", height: 150 },

  imagePlaceholder: {
    width: "100%",
    height: 150,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  imagePlaceholderText: { fontSize: 12, fontWeight: "800", color: "#64748B" },

  deleteBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
  },
  cardInfo: { padding: 12 },
  projectTitle: { fontSize: 15, fontWeight: "800", color: "#1E293B" },
  projectDate: { fontSize: 11, color: "#94A3B8", fontWeight: "700" },

  // ✅ MODAL (BIGGER + NOT DIKIT SA EDGES)
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",

    // ✅ padding sa paligid (hindi pakatabi)
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "92%",

    backgroundColor: "#FFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },

  modalHeaderRow: {
    paddingHorizontal: 16,
    padding:10,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  modalMetaInline: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },

  pill: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pillText: { fontSize: 11, fontWeight: "900", color: "#0F172A", textTransform: "uppercase" },
  pillSlate: { backgroundColor: "#F1F5F9" },
  pillTextSlate: { color: "#0F172A" },
  pillCyan: { backgroundColor: "#ECFEFF", borderColor: "#A5F3FC" },
  pillTextCyan: { color: "#0F3E48" },

  pillSoft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pillSoftText: { fontSize: 11, fontWeight: "500", color: "#334155" },

  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginLeft: 8,
  },

  modalImageArea: { backgroundColor: "#FFFFFF", padding:8, },

  // Design hero (bigger)
  modalHeroImage: { width: "100%", height: 300, backgroundColor: "#E2E8F0", },
  modalHeroPlaceholder: {
    width: "100%",
    height: 320,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  modalHeroPlaceholderText: { fontSize: 12, fontWeight: "500", color: "#64748B" },

  // Customize compare (bigger)
  compareGrid: {
    padding: 12,
    paddingBottom: 12,
    flexDirection: "row",
    gap: 10,
  },
  compareCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  compareLabel: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 11,
    fontWeight: "500",
    color: "#64748B",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    textTransform: "uppercase",
  },
  compareImage: { width: "100%", height: 240, backgroundColor: "#E2E8F0" },
  comparePlaceholder: {
    width: "100%",
    height: 240,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  comparePlaceholderText: { fontSize: 12, fontWeight: "500", color: "#64748B" },

  // Body
  modalBodyScroll: { paddingHorizontal: 14 },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 2,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  sectionTitleCard: { fontSize: 12, fontWeight: "500", color: "#0F172A" },

  detailsPrompt: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: "#0F172A",
    fontWeight: "500",
  },
  sectionBody: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: "#334155",
    fontWeight: "500",
  },
  sectionBodyMuted: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: "#94A3B8",
    fontWeight: "500",
  },

  detailsPillsRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  detailPillText: { fontSize: 11, fontWeight: "500", color: "#0F172A" },
  detailPillSlate: { backgroundColor: "#F8FAFC" },
  detailPillTextSlate: { color: "#0F172A" },
  detailPillCyan: { backgroundColor: "#ECFEFF", borderColor: "#A5F3FC" },
  detailPillTextCyan: { color: "#0F3E48" },

  bulletRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    paddingRight: 6,
    alignItems: "flex-start",
  },
  bulletDot: { width: 8, height: 8, borderRadius: 99, marginTop: 6, backgroundColor: "#0EA5E9" },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 19, color: "#0F172A", fontWeight: "500" },

  // Actions (ONLY Customize)
  modalActionsRow: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFFFF",
  },
  modalBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#0EA5E9",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnPrimaryText: { fontSize: 13, fontWeight: "500", color: "#FFF" },
});
