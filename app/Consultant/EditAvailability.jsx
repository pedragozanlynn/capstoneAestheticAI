import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { Calendar } from "react-native-calendars";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import { db } from "../../config/firebase";
import CenterMessageModal from "../components/CenterMessageModal";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const safeStr = (v) => (v == null ? "" : String(v));
const trimStr = (v) => safeStr(v).trim();

export default function EditAvailability() {
  const router = useRouter();
  const uid = getAuth().currentUser?.uid;

  const [availability, setAvailability] = useState([]);
  const [initialAvailability, setInitialAvailability] = useState(null);
  const [selectedDay, setSelectedDay] = useState("");

  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  /* ================= CENTER MESSAGE MODAL ================= */
  const [centerModal, setCenterModal] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  const msgTimerRef = useRef(null);

  const showMessage = (type = "info", title = "", message = "", autoHideMs = 1600) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}

    setCenterModal({
      visible: true,
      type,
      title: String(title || ""),
      message: String(message || ""),
    });

    // ✅ NOTE: success should NOT auto-hide
    if (type !== "success" && autoHideMs && autoHideMs > 0) {
      msgTimerRef.current = setTimeout(() => {
        setCenterModal((m) => ({ ...m, visible: false }));
      }, autoHideMs);
    }
  };

  const closeMessage = () => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setCenterModal((m) => ({ ...m, visible: false }));
  };

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoadingData(true);

      try {
        if (!uid) {
          if (!mounted) return;
          showMessage("error", "Not signed in", "Please login again to continue.", 1800);
          setLoadingData(false);
          return;
        }

        const snap = await getDoc(doc(db, "consultants", uid));
        if (!mounted) return;

        if (snap.exists()) {
          const data = snap.data() || {};
          const list = Array.isArray(data.availability) ? data.availability : [];
          setAvailability(list);
          setInitialAvailability(list);
        } else {
          showMessage("error", "Profile missing", "Consultant profile not found.", 1800);
        }
      } catch (err) {
        console.log("Load availability error:", err?.message || err);
        if (mounted) showMessage("error", "Load failed", "Unable to load schedule. Please try again.", 1800);
      } finally {
        if (mounted) setLoadingData(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
      try {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      } catch {}
    };
  }, [uid]);

  /* ================= HELPERS ================= */
  const hasChanges = () => {
    if (!initialAvailability) return true;
    const a = [...initialAvailability].sort().join("|");
    const b = [...availability].sort().join("|");
    return a !== b;
  };

  const addDay = () => {
    if (saving) return;

    const day = trimStr(selectedDay);

    if (!day) {
      showMessage("error", "Select a day", "Please choose a day to add.", 1600);
      return;
    }

    if (availability.includes(day)) {
      showMessage("info", "Already added", "That day is already selected.", 1400);
      return;
    }

    setAvailability((prev) => [...prev, day]);
    setSelectedDay("");
  };

  const removeDay = (day) => {
    if (saving) return;
    setAvailability((prev) => prev.filter((d) => d !== day));
  };

  const saveChanges = async () => {
    if (saving) return;

    if (!uid) {
      showMessage("error", "Not signed in", "Please login again to continue.", 1800);
      return;
    }

    if (availability.length === 0) {
      showMessage("error", "Required", "Please select at least one available day.", 1800);
      return;
    }

    if (!hasChanges()) {
      showMessage("info", "No changes", "Nothing to update.", 1400);
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "consultants", uid), { availability });

      setInitialAvailability(availability);

      // ✅ success modal ONLY, stay on screen (no navigation)
      showMessage("success", "Saved", "Availability updated successfully.", 0);
    } catch (err) {
      console.log("Save availability error:", err?.message || err);
      showMessage("error", "Save failed", "Failed to update schedule. Please try again.", 1800);
    } finally {
      setSaving(false);
    }
  };

  /* ================= CALENDAR MARKS ================= */
  const markedDates = useMemo(() => {
    const marks = {};
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const dayName = date.toLocaleDateString("en-US", { weekday: "long" });

      if (availability.includes(dayName)) {
        const key = date.toISOString().split("T")[0];
        marks[key] = {
          customStyles: {
            container: { backgroundColor: "#01579B", borderRadius: 8 },
            text: { color: "#fff", fontWeight: "700" },
          },
        };
      }
    }

    return marks;
  }, [availability]);

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent={false} />

      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
            disabled={saving || loadingData}
          >
            <Ionicons name="arrow-back" size={22} color="#0F3E48" />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Edit Availability</Text>
            <Text style={styles.headerSubtitle}>Set your available schedule</Text>
          </View>

          {saving || loadingData ? <ActivityIndicator color="#01579B" /> : <View style={{ width: 22 }} />}
        </View>

        <View style={styles.headerDivider} />
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* CALENDAR */}
        <View style={styles.calendarContainer}>
          <Calendar
            markingType="custom"
            markedDates={markedDates}
            style={styles.calendarStyle}
            theme={{
              todayTextColor: "#8f2f52",
              arrowColor: "#01579B",
              calendarBackground: "#ffffff",
              textMonthFontWeight: "800",
              "stylesheet.calendar.header": {
                header: {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingLeft: 10,
                  paddingRight: 10,
                  marginTop: 0,
                  paddingTop: 0,
                  paddingBottom: 6,
                  alignItems: "center",
                },
                week: {
                  marginTop: 0,
                  flexDirection: "row",
                  justifyContent: "space-around",
                  paddingBottom: 6,
                },
              },
              "stylesheet.calendar.main": {
                container: {
                  paddingLeft: 6,
                  paddingRight: 6,
                  paddingTop: 0,
                  paddingBottom: 6,
                  backgroundColor: "#ffffff",
                },
              },
            }}
          />
        </View>

        {/* PICKER */}
        <View style={styles.section}>
          <Text style={styles.label}>Add Available Day</Text>

          <View style={styles.inputRow}>
            <View style={styles.pickerBox}>
              <Picker selectedValue={selectedDay} onValueChange={setSelectedDay} enabled={!saving}>
                <Picker.Item label="Select day" value="" color="#999" />
                {DAYS.map((d) => (
                  <Picker.Item key={d} label={d} value={d} />
                ))}
              </Picker>
            </View>

            {selectedDay !== "" && (
              <TouchableOpacity
                style={[styles.addBtn, saving && { opacity: 0.7 }]}
                onPress={addDay}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* SELECTED DAYS */}
        <View style={styles.section}>
          <Text style={styles.label}>Active Schedule</Text>

          {availability.length === 0 ? (
            <Text style={styles.emptyText}>No days selected yet.</Text>
          ) : (
            availability.map((day) => (
              <View key={day} style={styles.dayStrip}>
                <Text style={styles.dayText}>{day}</Text>

                <TouchableOpacity
                  onPress={() => removeDay(day)}
                  disabled={saving}
                  activeOpacity={0.85}
                  style={saving && { opacity: 0.6 }}
                >
                  <Ionicons name="close-circle" size={22} color="#C44569" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ✅ SAVE BUTTON (raised) */}
        <TouchableOpacity
          style={[styles.saveBtn, (saving || loadingData) && { opacity: 0.7 }]}
          onPress={saveChanges}
          disabled={saving || loadingData}
          activeOpacity={0.85}
        >
          <Ionicons name="save-outline" size={20} color="#fff" />
          <Text style={styles.saveText}>{saving ? "Saving..." : "Save Changes"}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* CENTER MODAL */}
      <CenterMessageModal
        visible={centerModal.visible}
        type={centerModal.type}
        title={centerModal.title}
        message={centerModal.message}
        onClose={closeMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F3F9FA" },
  safeArea: { backgroundColor: "#FFF" },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "android" ? 12 : 10,
    backgroundColor: "#FFF",
    gap: 12,
  },
  headerDivider: { height: 1, backgroundColor: "#EEF2F7" },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E3F2FD",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0F3E48" },
  headerSubtitle: { fontSize: 12, color: "#777", marginTop: 2 },

  // ✅ IMPORTANT: bigger bottom space so button sits ABOVE the nav (no nav edits)
  scrollContent: { padding: 16, paddingBottom: 200 },

  calendarContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E1E8EA",
    marginBottom: 18,
    marginTop: 6,
    overflow: "hidden",
  },
  calendarStyle: { borderRadius: 16, paddingTop: 0, marginTop: 0 },

  section: { marginBottom: 20 },
  label: { fontWeight: "700", marginBottom: 8, color: "#2c4f4f", fontSize: 14 },

  inputRow: { flexDirection: "row", gap: 10 },

  pickerBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dce3ea",
    borderRadius: 14,
    backgroundColor: "#fff",
    justifyContent: "center",
  },

  addBtn: {
    width: 55,
    backgroundColor: "#01579B",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  dayStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E1E8EA",
  },

  dayText: { fontWeight: "700", color: "#01579B" },
  emptyText: { color: "#999", fontStyle: "italic", marginLeft: 5 },

  // ✅ THIS raises the button visually (space under it)
  saveBtn: {
    backgroundColor: "#01579B",
    padding: 16,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
