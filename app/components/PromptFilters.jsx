import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

/* =====================
   OPTIONS (UPDATED)
===================== */
const ROOM_TYPES = [
  "Living Room",
  "Bedroom",
  "Kitchen",
  "Dining Room",
  "Bathroom",
  "Home Office",
  "Studio Apartment",
  "Small Space",
  "Guest Room",
  "Kids Room",
  "Walk-in Closet",
  "Laundry Area",
  "Entryway / Foyer",
  "Balcony / Patio",
  "Home Theater",
  "Open Plan Space",
  "Apartment (Full)",
];

const STYLES = [
  "Modern",
  "Minimalist",
  "Scandinavian",
  "Japandi",
  "Industrial",
  "Boho",
  "Classic",
  "Contemporary",
  "Mid-Century Modern",
  "Coastal",
  "Rustic",
  "Transitional",
  "Luxury Modern",
  "Wabi-Sabi",
  "Tropical",
  "Korean Minimal",
];

const MOODS = [
  "Cozy",
  "Bright",
  "Calm",
  "Elegant",
  "Warm",
  "Clean",
  "Airy",
  "Moody",
  "Relaxing",
  "Fresh",
  "Soft",
  "Bold",
  "Serene",
  "Playful",
];

const COLORS = [
  "Neutral + Accent",
  "Warm neutrals",
  "Cool neutrals",
  "Earth tones",
  "Monochrome",
  "Black + White",
  "Beige + Wood",
  "Greens + Neutrals",
  "Blue tones",
  "Pastel palette",
  "Terracotta + Cream",
  "Charcoal + Walnut",
  "White + Oak",
  "Greige palette",
];

const LIGHTING = [
  "Bright natural light",
  "Warm ambient",
  "Layered lighting",
  "Soft diffused light",
  "Task lighting focused",
  "Indirect cove lighting",
  "Statement pendant lighting",
  "Spotlights + accents",
];

const DECORS = [
  "Plants",
  "Wall art",
  "Rugs",
  "Curtains",
  "Mirrors",
  "Accent pillows",
  "Wall shelves",
  "Table lamps",
  "Floor lamps",
  "Vases",
  "Books / magazines",
  "Candles",
  "Throw blankets",
  "Decor tray",
  "Picture frames",
  "Indoor lighting strips",
];

/* =====================
   COMPONENT
===================== */
export default function PromptFilters({ onSubmit }) {
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState("Living Room");
  const [style, setStyle] = useState("Modern");
  const [mood, setMood] = useState("Cozy");
  const [color, setColor] = useState("Neutral + Accent");
  const [lighting, setLighting] = useState("Bright natural light");
  const [decor, setDecor] = useState(["Plants"]);
  const [notes, setNotes] = useState("");

  const toggleDecor = (d) => {
    setDecor((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  // ✅ UPDATED: returns a BULLETED / LINE-BY-LINE prompt for clean message bubble display
  const buildPrompt = () => {
    return [
      "NEW DESIGN. DESIGN MODE. GENERATE A NEW ROOM DESIGN.",
      `Design a ${style} ${room}.`,
      `Mood: ${mood}`,
      `Color scheme: ${color}`,
      `Lighting: ${lighting}`,
      `Decorations: ${decor.length ? decor.join(", ") : "None"}`,
      notes ? `Notes: ${notes}` : null,
      "Provide a cohesive concept with layout ideas and decor tips.",
    ]
      .filter(Boolean)
      .map((line, i) => (i === 0 ? line : `• ${line}`))
      .join("\n");
  };

  const submit = () => {
    const prompt = buildPrompt();
    setOpen(false);
    onSubmit?.(prompt);
  };

  return (
    <View style={styles.wrap}>
      {/* HEADER - Clean Glass Look */}
      <TouchableOpacity
        style={[styles.header, open && styles.headerOpen]}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="auto-fix" size={16} color="#0EA5E9" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Design Assistant</Text>
            <Text style={styles.headerMeta} numberOfLines={1}>
              {room} • {style}
            </Text>
          </View>
        </View>
        <Feather name={open ? "chevron-up" : "sliders"} size={18} color="#64748B" />
      </TouchableOpacity>

      {/* PANEL */}
      {open && (
        <View style={styles.panelOuter}>
          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={styles.panelContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <Select label="Room Type" value={room} options={ROOM_TYPES} onChange={setRoom} icon="home-outline" />
            <Select label="Style" value={style} options={STYLES} onChange={setStyle} icon="palette-outline" />

            {/* ✅ Removed Budget, so Mood is full width */}
            <Select label="Mood" value={mood} options={MOODS} onChange={setMood} icon="emoticon-outline" />

            <Select label="Color Scheme" value={color} options={COLORS} onChange={setColor} icon="invert-colors" />
            <Select label="Lighting" value={lighting} options={LIGHTING} onChange={setLighting} icon="lightbulb-outline" />

            <Text style={styles.label}>Decor Elements</Text>
            <View style={styles.multiWrap}>
              {DECORS.map((d) => {
                const active = decor.includes(d);
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => toggleDecor(d)}
                    style={[styles.multiItem, active && styles.multiItemActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.multiText, active && styles.multiTextActive]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Custom Instructions</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Include a reading nook..."
              placeholderTextColor="#94A3B8"
              style={styles.textInput}
              multiline
            />

            <TouchableOpacity style={styles.submitBtn} onPress={submit} activeOpacity={0.8}>
              <Text style={styles.submitText}>Generate Design</Text>
              <Feather name="arrow-right" size={16} color="#FFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            <View style={{ height: 10 }} />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/* =====================
   SUB COMPONENT (Redesigned)
===================== */
function Select({ label, value, options, onChange, icon }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.selectBtn, open && styles.selectBtnActive]}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {icon && <MaterialCommunityIcons name={icon} size={14} color="#64748B" style={{ marginRight: 6 }} />}
          <Text style={styles.selectText}>{value}</Text>
        </View>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={14} color="#94A3B8" />
      </TouchableOpacity>

      {open && (
        <View style={styles.dropdown}>
          {options.map((o) => (
            <TouchableOpacity
              key={o}
              style={[styles.dropdownItem, value === o && styles.dropdownItemActive]}
              onPress={() => {
                onChange(o);
                setOpen(false);
              }}
            >
              <Text style={[styles.dropdownText, value === o && styles.dropdownTextActive]}>{o}</Text>
              {value === o && <Feather name="check" size={14} color="#0EA5E9" />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

/* =====================
   STYLES - Modernized (UNCHANGED)
===================== */
const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: "transparent" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  headerOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F0F9FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 13, fontWeight: "800", color: "#1E293B" },
  headerMeta: { fontSize: 11, fontWeight: "500", color: "#94A3B8" },

  panelOuter: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    maxHeight: 400,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 15 },
      android: { elevation: 4 },
    }),
  },
  panelScroll: {},
  panelContent: { padding: 16 },

  label: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  selectBtn: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  selectBtnActive: { borderColor: "#0EA5E9", backgroundColor: "#FFFFFF" },
  selectText: { fontSize: 13, fontWeight: "600", color: "#1E293B" },

  dropdown: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  dropdownItem: {
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  dropdownItemActive: { backgroundColor: "#F0F9FF" },
  dropdownText: { fontSize: 13, color: "#475569" },
  dropdownTextActive: { color: "#0EA5E9", fontWeight: "700" },

  multiWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  multiItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  multiItemActive: { backgroundColor: "#0EA5E9" },
  multiText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  multiTextActive: { color: "#FFFFFF" },

  textInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    fontSize: 13,
    marginBottom: 20,
    color: "#1E293B",
    backgroundColor: "#F8FAFC",
    textAlignVertical: "top",
  },

  submitBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
});
