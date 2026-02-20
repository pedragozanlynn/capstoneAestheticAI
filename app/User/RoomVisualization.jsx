// app/User/RoomVisualization.jsx
// ✅ CLEAN + ORGANIZED:
// - grouped helpers
// - stable memoized values
// - consistent naming
// - header delete icon removed (kept delete logic available if you want to re-add a button later)
// - removed unused imports (update if you later re-add delete UI)

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
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { getAuth } from "firebase/auth";
import { db } from "../../config/firebase";
import { deleteDoc, doc, onSnapshot } from "firebase/firestore";

/* =========================
   HELPERS
========================= */
const safeStr = (v) => (v == null ? "" : String(v).trim());

const toDate = (ts) => {
  try {
    if (!ts) return null;
    const d = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
};

const formatISODate = (ts) => {
  const d = toDate(ts);
  return d ? d.toISOString().slice(0, 10) : "";
};

const formatDateTimeLocal = (ts) => {
  const d = toDate(ts);
  return d
    ? d.toLocaleString(undefined, {
        year: "numeric",
        month: "long",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
};

const normalizePaletteColors = (palette) => {
  const arr = palette?.colors;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c) => ({ hex: safeStr(c?.hex), name: safeStr(c?.name) }))
    .filter((x) => x.hex || x.name);
};

/* =========================
   SCREEN
========================= */
export default function RoomVisualization() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const projectId = useMemo(() => safeStr(params?.id), [params?.id]);

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  const auth = getAuth();
  const uid = auth?.currentUser?.uid || null;

  /* =========================
     FIRESTORE SUBSCRIBE
  ========================= */
  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }

    setLoading(true);

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
        setProject(null);
        setLoading(false);
      }
    );

    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, [projectId]);

  /* =========================
     DERIVED VALUES
  ========================= */
  const canDelete = useMemo(() => {
    return !!uid && !!project?.uid && String(project.uid) === String(uid);
  }, [uid, project?.uid]);

  const title = useMemo(() => {
    const name = safeStr(project?.name);
    const t = safeStr(project?.title);
    const p = safeStr(project?.prompt);
    return name || t || (p ? p.slice(0, 40) : "") || "Project";
  }, [project?.name, project?.title, project?.prompt]);

  const imageUrl = useMemo(() => safeStr(project?.image), [project?.image]);
  const inputImageUrl = useMemo(() => safeStr(project?.inputImage), [project?.inputImage]);

  const prompt = useMemo(() => safeStr(project?.prompt), [project?.prompt]);
  const explanation = useMemo(() => safeStr(project?.explanation), [project?.explanation]);

  const tag = useMemo(() => safeStr(project?.tag) || "Room", [project?.tag]);
  const mode = useMemo(() => safeStr(project?.mode), [project?.mode]);
  const source = useMemo(() => safeStr(project?.source), [project?.source]);

  const createdAtISO = useMemo(() => {
    return formatISODate(project?.createdAt) || safeStr(project?.date);
  }, [project?.createdAt, project?.date]);

  const createdAtPretty = useMemo(() => {
    return formatDateTimeLocal(project?.createdAt);
  }, [project?.createdAt]);

  const conversationId = useMemo(() => safeStr(project?.conversationId), [project?.conversationId]);

  const paletteColors = useMemo(() => normalizePaletteColors(project?.palette), [project?.palette]);

  /* =========================
     ACTIONS
  ========================= */
  const handleDelete = () => {
    if (!project?.id) return;
    if (!canDelete) {
      Alert.alert("Not allowed", "You can only delete your own project.");
      return;
    }

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

  const openAIChatCustomize = () => {
    router.push(
      `/User/ProfessionalAIAssistant?chatId=${conversationId}&source=root&tab=customize&refImage=${encodeURIComponent(
        imageUrl || ""
      )}`
    );
  };

  const customizeThisResult = () => {
    if (!imageUrl) return;

    router.push({
      pathname: "/User/AIDesignerChat",
      params: {
        tab: "customize",
        source: "project",
        prompt: prompt || "",
        refImage: imageUrl,
        inputImage: inputImageUrl || "",
        chatId: conversationId || undefined,
      },
    });
  };

  /* =========================
     RENDER
  ========================= */
  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={router.back} style={styles.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color="#0F3E48" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {createdAtISO ? `Saved on ${createdAtISO}` : "Saved project"}
          </Text>
        </View>

        {/* (optional) If you want delete button again:
            {canDelete && (
              <TouchableOpacity style={styles.iconBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color="#DC2626" />
              </TouchableOpacity>
            )}
        */}
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== IMAGES ===== */}
        {inputImageUrl || imageUrl ? (
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
          </View>
        ) : (
          <View style={[styles.imageCard, styles.imageEmpty]}>
            <Ionicons name="image-outline" size={44} color="#0F3E48" />
            <Text style={styles.imageEmptyText}>No image found</Text>
          </View>
        )}

        {/* ===== META BADGES ===== */}
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

          {!!source && (
            <View style={[styles.badge, { backgroundColor: "#F1F5F9" }]}>
              <Text style={[styles.badgeText, { color: "#0F3E48" }]}>{source.toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* ===== DETAILS ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>

          <KVRow label="Created" value={createdAtPretty || createdAtISO || "—"} />
          <KVRow label="Mode" value={mode || "—"} />
          <KVRow label="Source" value={source || "—"} />
          <KVRow label="UID" value={safeStr(project?.uid) || "—"} isMono numberOfLines={1} />
        </View>

        {/* ===== PROMPT ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Prompt</Text>
          <Text style={styles.cardBody}>{prompt || "No prompt saved for this project."}</Text>
        </View>

        {/* ===== EXPLANATION ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Explanation</Text>
          <Text style={styles.cardBody}>
            {explanation || "No explanation saved for this project."}
          </Text>
        </View>

        {/* ===== PALETTE ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Color Palette</Text>

          {paletteColors.length > 0 ? (
            <View style={styles.paletteWrap}>
              {paletteColors.map((c, idx) => (
                <View key={`${c.hex}-${idx}`} style={styles.paletteItem}>
                  <View style={[styles.swatch, { backgroundColor: c.hex || "#E2E8F0" }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paletteName} numberOfLines={1}>
                      {c.name || "Unnamed"}
                    </Text>
                    <Text style={styles.paletteHex}>{c.hex || "—"}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.cardBody}>No palette saved for this project.</Text>
          )}
        </View>

        {/* ===== ACTIONS ===== */}
        {!!conversationId && (
          <TouchableOpacity style={styles.primaryBtn} onPress={openAIChatCustomize} activeOpacity={0.9}>
            <Ionicons name="color-wand-outline" size={16} color="#FFF" />
            <Text style={styles.primaryBtnText}>Customize in AI Chat</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.customizeBtn, !imageUrl && { opacity: 0.5 }]}
          onPress={customizeThisResult}
          activeOpacity={0.9}
          disabled={!imageUrl}
        >
          <Ionicons name="color-wand-outline" size={16} color="#FFF" />
          <Text style={styles.customizeBtnText}>Customize This Result</Text>
        </TouchableOpacity>

        {/* Optional delete action (no UI in header right now) */}
        {canDelete && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.9}>
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
            <Text style={styles.deleteBtnText}>Delete Project</Text>
          </TouchableOpacity>
        )}

        {loading && <Text style={styles.loadingText}>Loading…</Text>}
        {!loading && !project && <Text style={styles.loadingText}>Project not found.</Text>}
      </ScrollView>
    </View>
  );
}

/* =========================
   SMALL UI
========================= */
function KVRow({ label, value, isMono, numberOfLines }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvKey}>{label}</Text>
      <Text
        style={[styles.kvValSoft, isMono && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}
        numberOfLines={numberOfLines}
      >
        {value}
      </Text>
    </View>
  );
}

/* =========================
   STYLES
========================= */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },

  /* Header */
  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 55,
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
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#0F3E48" },
  headerSubtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },

  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 },

  /* Images */
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
  imageEmpty: { height: 260, alignItems: "center", justifyContent: "center", gap: 8 },
  imageEmptyText: { color: "#64748B", fontWeight: "700" },

  /* Badges */
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

  /* Cards */
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

  /* KV rows */
  kvRow: { marginTop: 10, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  kvKey: { color: "#64748B", fontWeight: "800", fontSize: 12 },
  kvValSoft: { color: "#0F172A", fontWeight: "400", fontSize: 12, flex: 1, textAlign: "right" },

  /* Palette */
  paletteWrap: { marginTop: 10, gap: 10 },
  paletteItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  swatch: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  paletteName: { fontWeight: "900", color: "#0F3E48", fontSize: 12 },
  paletteHex: { marginTop: 2, fontWeight: "800", color: "#64748B", fontSize: 12 },

  /* Buttons */
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

  customizeBtn: {
    marginTop: 10,
    backgroundColor: "#3fa796",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  customizeBtnText: { color: "#FFF", fontWeight: "900", fontSize: 14, letterSpacing: 0.4 },

  deleteBtn: {
    marginTop: 10,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  deleteBtnText: { color: "#DC2626", fontWeight: "900", fontSize: 13 },

  loadingText: { marginTop: 14, textAlign: "center", color: "#64748B", fontWeight: "700" },
});
