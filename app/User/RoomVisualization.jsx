import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getAuth } from "firebase/auth";
import { db } from "../../config/firebase";
import { deleteDoc, doc, onSnapshot } from "firebase/firestore";

const safeStr = (v) => (v == null ? "" : String(v).trim());

const formatDate = (ts) => {
  try {
    if (!ts) return "";
    const d = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
};

export default function RoomVisualization() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const projectId = useMemo(() => safeStr(params?.id), [params]);

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  const auth = getAuth();
  const uid = auth?.currentUser?.uid || null;

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, "projects", projectId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setProject(null);
          setLoading(false);
          return;
        }

        const data = snap.data() || {};
        setProject({ id: snap.id, ...data });
        setLoading(false);
      },
      (err) => {
        console.log("RoomVisualization load error:", err?.message || err);
        setLoading(false);
      }
    );

    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, [projectId]);

  const canDelete = useMemo(() => {
    return !!uid && !!project?.uid && String(project.uid) === String(uid);
  }, [uid, project]);

  const handleDelete = async () => {
    if (!project?.id) return;

    Alert.alert("Delete Project", "Are you sure you want to delete this project?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "projects", project.id));
            router.back();
          } catch (e) {
            Alert.alert("Delete failed", e?.message || "Missing permissions or network error.");
          }
        },
      },
    ]);
  };

  const title =
    safeStr(project?.title) ||
    safeStr(project?.prompt)?.slice(0, 40) ||
    "Project";

  // ✅ RESULT image
  const imageUrl = safeStr(project?.image);

  // ✅ ORIGINAL / INPUT image (user uploaded reference)
  const inputImageUrl = safeStr(project?.inputImage);

  const prompt = safeStr(project?.prompt);
  const tag = safeStr(project?.tag) || "Room";
  const mode = safeStr(project?.mode);
  const date = formatDate(project?.createdAt) || safeStr(project?.date);

  const conversationId = safeStr(project?.conversationId);

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#0F3E48" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {date ? `Saved on ${date}` : "Saved project"}
          </Text>
        </View>

        {canDelete && (
          <TouchableOpacity onPress={handleDelete} style={styles.trashBtn}>
            <Ionicons name="trash-outline" size={18} color="#9A3412" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ✅ ORIGINAL + RESULT (compare view) */}
        {(inputImageUrl || imageUrl) ? (
          <View style={styles.compareWrap}>
            {!!inputImageUrl && (
              <View style={styles.imageBlock}>
                <Text style={styles.imageLabel}>Original</Text>
                <View style={styles.imageCard}>
                  <Image source={{ uri: inputImageUrl }} style={styles.image} resizeMode="cover" />
                </View>
              </View>
            )}

            {!!imageUrl && (
              <View style={styles.imageBlock}>
                <Text style={styles.imageLabel}>Result</Text>
                <View style={styles.imageCard}>
                  <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
                </View>
              </View>
            )}

            {!inputImageUrl && !imageUrl && (
              <View style={[styles.imageCard, styles.imageEmpty]}>
                <Ionicons name="image-outline" size={44} color="#0F3E48" />
                <Text style={styles.imageEmptyText}>No image found</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.imageCard, styles.imageEmpty]}>
            <Ionicons name="image-outline" size={44} color="#0F3E48" />
            <Text style={styles.imageEmptyText}>No image found</Text>
          </View>
        )}

        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{tag}</Text>
          </View>

          {!!mode && (
            <View style={[styles.badge, { backgroundColor: "#ECFEFF" }]}>
              <Text style={[styles.badgeText, { color: "#0F3E48" }]}>
                {mode === "customize" ? "Customize" : mode === "design" ? "Design" : mode}
              </Text>
            </View>
          )}
        </View>

        {/* Prompt / details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Prompt / Description</Text>
          <Text style={styles.cardBody}>
            {prompt || "No prompt saved for this project."}
          </Text>
        </View>

        {/* Optional: open related AI chat (CUSTOMIZE MODE) */}
        {conversationId ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              // diretso sa chat + customize mode
              router.push(
                `/User/ProfessionalAIAssistant?chatId=${conversationId}&source=root&tab=customize&refImage=${encodeURIComponent(
                  imageUrl || ""
                )}`
              );
            }}
          >
            <Ionicons name="color-wand-outline" size={16} color="#FFF" />
            <Text style={styles.primaryBtnText}>Customize in AI Chat</Text>
          </TouchableOpacity>
        ) : null}

        {/* ✅ Customize This Result (send PROMPT + RESULT IMAGE + ORIGINAL IMAGE) */}
<TouchableOpacity
  style={styles.customizeBtn}
  onPress={() => {
    if (!imageUrl) return;

    router.push({
      pathname: "/User/AIDesignerChat", // ✅ siguraduhin ito ang totoong file name
      params: {
        // mode control
        tab: "customize",
        source: "project",

        // ✅ IMPORTANT DATA
        prompt: prompt || "",                 // text prompt
        refImage: imageUrl,                   // AI RESULT IMAGE
        inputImage: inputImageUrl || "",      // ORIGINAL uploaded image

        // optional: continue same conversation
        chatId: conversationId || undefined,
      },
    });
  }}
  disabled={!imageUrl}
>
  <Ionicons name="color-wand-outline" size={16} color="#FFF" />
  <Text style={styles.customizeBtnText}>Customize This Result</Text>
</TouchableOpacity>


        {loading && <Text style={styles.loadingText}>Loading…</Text>}
        {!loading && !project && <Text style={styles.loadingText}>Project not found.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },

  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: "#FFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  trashBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#0F3E48" },
  headerSubtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },

  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 },

  /* ✅ compare view */
  compareWrap: { gap: 12 },
  imageBlock: { gap: 8 },
  imageLabel: { fontSize: 12, fontWeight: "900", color: "#0F3E48" },

  imageCard: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  image: { width: "100%", height: 260 },
  imageEmpty: {
    height: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  imageEmptyText: { color: "#64748B", fontWeight: "700" },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },

  badge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0F3E48",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  card: {
    marginTop: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardTitle: { fontSize: 13, fontWeight: "900", color: "#0F3E48" },
  cardBody: { marginTop: 8, fontSize: 14, lineHeight: 20, color: "#334155" },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: "#0F3E48",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: { color: "#FFF", fontWeight: "900", fontSize: 13 },

  /* ✅ Requested: bright teal-green */
  customizeBtn: {
    marginTop: 10,
    backgroundColor: "#3fa796", // ✅ bright teal-green
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  customizeBtnText: { color: "#FFF", fontWeight: "900", fontSize: 14, letterSpacing: 0.4 },

  loadingText: { marginTop: 14, textAlign: "center", color: "#64748B", fontWeight: "700" },
});
