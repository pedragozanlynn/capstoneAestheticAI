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

// ✅ more human readable (local time)
const formatDateTimeLocal = (ts) => {
  try {
    if (!ts) return "";
    const d = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const normalizePaletteColors = (palette) => {
  try {
    const arr = palette?.colors;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c) => ({
        hex: safeStr(c?.hex),
        name: safeStr(c?.name),
      }))
      .filter((x) => x.hex || x.name);
  } catch {
    return [];
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

  // ✅ title priority: name > title > prompt > fallback
  const title =
    safeStr(project?.name) ||
    safeStr(project?.title) ||
    safeStr(project?.prompt)?.slice(0, 40) ||
    "Project";

  const imageUrl = safeStr(project?.image);
  const inputImageUrl = safeStr(project?.inputImage);

  const prompt = safeStr(project?.prompt);
  const tag = safeStr(project?.tag) || "Room";
  const mode = safeStr(project?.mode);
  const source = safeStr(project?.source);

  const createdAtISO = formatDate(project?.createdAt) || safeStr(project?.date);
  const createdAtPretty = formatDateTimeLocal(project?.createdAt);

  const conversationId = safeStr(project?.conversationId);
  const explanation = safeStr(project?.explanation);

  const paletteColors = useMemo(
    () => normalizePaletteColors(project?.palette),
    [project?.palette]
  );

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* ✅ Header (UPDATED): remove delete icon */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
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

        {/* ❌ removed trash icon */}
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

          {!!source && (
            <View style={[styles.badge, { backgroundColor: "#F1F5F9" }]}>
              <Text style={[styles.badgeText, { color: "#0F3E48" }]}>
                {source.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* ✅ Details (UPDATED): lower font-weight for Created/Mode/Source/UID values */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>

          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Created</Text>
            <Text style={styles.kvValSoft}>
              {createdAtPretty || createdAtISO || "—"}
            </Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Mode</Text>
            <Text style={styles.kvValSoft}>{mode || "—"}</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Source</Text>
            <Text style={styles.kvValSoft}>{source || "—"}</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>UID</Text>
            <Text style={styles.kvValSoft} numberOfLines={1}>
              {safeStr(project?.uid) || "—"}
            </Text>
          </View>
        </View>

        {/* Prompt */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Prompt</Text>
          <Text style={styles.cardBody}>
            {prompt || "No prompt saved for this project."}
          </Text>
        </View>

        {/* Explanation */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Explanation</Text>
          <Text style={styles.cardBody}>
            {explanation || "No explanation saved for this project."}
          </Text>
        </View>

        {/* Palette */}
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

        {/* Optional: open related AI chat */}
        {conversationId ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
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

        {/* Customize This Result */}
        <TouchableOpacity
          style={styles.customizeBtn}
          onPress={() => {
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
  headerTitle: { fontSize: 18, fontWeight: "600", color: "#0F3E48" },
  headerSubtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },

  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 },

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

  kvRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  kvKey: { color: "#64748B", fontWeight: "800", fontSize: 12 },

  // ✅ UPDATED: softer value weight
  kvValSoft: {
    color: "#0F172A",
    fontWeight: "350",
    fontSize: 12,
    flex: 1,
    textAlign: "right",
  },

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
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  paletteName: { fontWeight: "900", color: "#0F3E48", fontSize: 12 },
  paletteHex: { marginTop: 2, fontWeight: "800", color: "#64748B", fontSize: 12 },

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
  customizeBtnText: {
    color: "#FFF",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.4,
  },

  loadingText: {
    marginTop: 14,
    textAlign: "center",
    color: "#64748B",
    fontWeight: "700",
  },
});
