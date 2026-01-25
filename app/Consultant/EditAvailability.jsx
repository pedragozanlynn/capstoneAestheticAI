import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Calendar } from "react-native-calendars";
import { useRouter } from "expo-router";
import { db } from "../../config/firebase";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* ---------------- CENTER MESSAGE MODAL ---------------- */
const MSG_COLORS = {
  info: { bg: "#EFF6FF", border: "#BFDBFE", icon: "information-circle", iconColor: "#01579B" },
  success: { bg: "#ECFDF5", border: "#BBF7D0", icon: "checkmark-circle", iconColor: "#16A34A" },
  error: { bg: "#FEF2F2", border: "#FECACA", icon: "close-circle", iconColor: "#DC2626" },
};

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

  // ✅ Top message modal
  const [msgVisible, setMsgVisible] = useState(false);
  const [msgType, setMsgType] = useState("info");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const msgTimerRef = useRef(null);

  const showMessage = (type = "info", title = "", body = "", autoHideMs = 1600) => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setMsgType(type);
    setMsgTitle(String(title || ""));
    setMsgBody(String(body || ""));
    setMsgVisible(true);

    if (autoHideMs && autoHideMs > 0) {
      msgTimerRef.current = setTimeout(() => setMsgVisible(false), autoHideMs);
    }
  };

  const closeMessage = () => {
    try {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    } catch {}
    setMsgVisible(false);
  };

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoadingData(true);
      try {
        if (!uid) {
          if (!mounted) return;
          setLoadingData(false);
          showMessage("error", "Not signed in", "Please login again to continue.", 1800);
          return;
        }

        const snap = await getDoc(doc(db, "consultants", uid));
        if (snap.exists()) {
          const data = snap.data() || {};
          const list = Array.isArray(data.availability) ? data.availability : [];
          if (!mounted) return;

          setAvailability(list);
          setInitialAvailability(list);
        } else {
          if (!mounted) return;
          showMessage("error", "Profile missing", "Consultant profile not found.", 1800);
        }
      } catch (err) {
        console.log("Load availability error:", err?.message || err);
        if (!mounted) return;
        showMessage("error", "Load failed", "Unable to load schedule. Please try again.", 1800);
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

      await updateDoc(doc(db, "consultants", uid), {
        availability,
      });

      setInitialAvailability(availability);
      showMessage("success", "Saved", "Availability updated successfully.", 1000);

      setTimeout(() => router.back(), 280);
    } catch (err) {
      console.log("Save availability error:", err?.message || err);
      showMessage("error", "Save failed", "Failed to update schedule. Please try again.", 1800);
    } finally {
      setSaving(false);
    }
  };

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

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color="#0F3E48" />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Edit Availability</Text>
            <Text style={styles.headerSubtitle}>Set your available schedule</Text>
          </View>

          {saving || loadingData ? <ActivityIndicator color="#01579B" /> : <View style={{ width: 22 }} />}
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.divider} />

        {/* ===== CALENDAR AREA ===== */}
        <View style={styles.calendarContainer}>
          <Calendar
            markingType="custom"
            markedDates={markedDates}
            theme={{
              todayTextColor: "#8f2f52",
              arrowColor: "#01579B",
              calendarBackground: "#ffffff",
              textMonthFontWeight: "800",
            }}
          />
        </View>

        {/* ===== PICKER SECTION ===== */}
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

        {/* ===== SELECTED DAYS LIST ===== */}
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

        {/* ===== SAVE BUTTON ===== */}
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

      {/* ===== TOP MESSAGE MODAL ===== */}
      <Modal visible={msgVisible} transparent animationType="fade" onRequestClose={closeMessage}>
        <Pressable style={styles.msgBackdrop} onPress={closeMessage}>
          <Pressable
            style={[
              styles.msgCard,
              {
                backgroundColor: (MSG_COLORS[msgType] || MSG_COLORS.info).bg,
                borderColor: (MSG_COLORS[msgType] || MSG_COLORS.info).border,
              },
            ]}
            onPress={() => {}}
          >
            <View style={styles.msgRow}>
              <Ionicons
                name={(MSG_COLORS[msgType] || MSG_COLORS.info).icon}
                size={22}
                color={(MSG_COLORS[msgType] || MSG_COLORS.info).iconColor}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                {!!msgTitle && <Text style={styles.msgTitle}>{msgTitle}</Text>}
                {!!msgBody && <Text style={styles.msgBody}>{msgBody}</Text>}
              </View>
            </View>

            <TouchableOpacity style={styles.msgClose} onPress={closeMessage} activeOpacity={0.85}>
              <Ionicons name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F3F9FA" },
  safeArea: { backgroundColor: "#FFF" },
  scrollContent: { padding: 16, paddingBottom: 40 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "android" ? 15 : 10,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    gap: 12,
  },
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
  divider: { height: 1, backgroundColor: "#E4E6EB", marginBottom: 20 },

  calendarContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E1E8EA",
    marginBottom: 20,
    marginTop: 10,
  },

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

  /* TOP MESSAGE MODAL */
  msgBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: Platform.OS === "ios" ? 90 : 70,
    paddingHorizontal: 18,
  },
  msgCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    position: "relative",
  },
  msgRow: { flexDirection: "row", alignItems: "flex-start" },
  msgTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  msgBody: { marginTop: 3, fontSize: 13, fontWeight: "700", color: "#475569", lineHeight: 18 },
  msgClose: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
});
