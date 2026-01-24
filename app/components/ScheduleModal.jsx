// ScheduleModal.jsx
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

/* ---------------- CONSTANTS ---------------- */
const THEME = {
  primary: "#01579B",
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  error: "#EF4444",
  textDark: "#0F172A",
  textGray: "#64748B",
  inputBg: "#F1F5F9",
};

/* ---------------- HELPERS ---------------- */
const safeLower = (v) => (typeof v === "string" ? v.toLowerCase() : "");

const parseTimeRange = (range) => {
  if (!range || typeof range !== "string") return null;
  const [start, end] = range.split(" - ");
  if (!start || !end) return null;
  return { start, end };
};

const toDateTime = (timeStr) => {
  if (!timeStr) return null;
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":").map(Number);
  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;
  const d = new Date();
  d.setHours(hours, minutes || 0, 0, 0);
  return d;
};

const combineDateAndTime = (date, time) => {
  const d = new Date(date);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
};

const isSameDay = (a, b) => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

/* ---------------- COMPONENT ---------------- */
export default function ScheduleModal({
  visible,
  onClose,
  consultantId,
  availability = [],
  sessionFee = 0, // In-update mula 999 para dynamic na galing sa consultant rate
}) {
  const router = useRouter();
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startTime, setStartTime] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const formatTime = (t) =>
    t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const getDayName = (d) =>
    d.toLocaleDateString("en-US", { weekday: "long" });

  /* ---------------- VALIDATION ---------------- */
  useEffect(() => {
    // ✅ NEW: If date is today, time must not be earlier than current time
    // Example: now = 5:50 PM, selected = 4:30 PM => error
    const now = new Date();
    const selectedDateTime = combineDateAndTime(date, startTime);
    if (isSameDay(date, now) && selectedDateTime < now) {
      setErrorMsg("Selected time must be later than the current time.");
      return;
    }

    if (!availability.length) {
      setErrorMsg("Consultant has no available schedule.");
      return;
    }
    const dayName = getDayName(date);
    const match = availability.find((a) =>
      typeof a === "string"
        ? safeLower(a) === safeLower(dayName)
        : safeLower(a?.day) === safeLower(dayName)
    );

    if (!match) {
      setErrorMsg(`Not available on ${dayName}.`);
      return;
    }

    if (!match.am && !match.pm) {
      setErrorMsg("");
      return;
    }

    const start = startTime;
    let valid = false;
    const am = parseTimeRange(match.am);
    const pm = parseTimeRange(match.pm);

    if (am) {
      const s = toDateTime(am.start);
      const e = toDateTime(am.end);
      if (s && e && start >= s && start <= e) valid = true;
    }
    if (pm) {
      const s = toDateTime(pm.start);
      const e = toDateTime(pm.end);
      if (s && e && start >= s && start <= e) valid = true;
    }
    setErrorMsg(valid ? "" : "Choose a time within consultant availability.");
  }, [date, startTime, availability]);

  const handleContinue = () => {
    if (errorMsg) return;
    const appointmentAt = combineDateAndTime(date, startTime);
    onClose();
    router.push(
      `/User/BookConsultation?consultantId=${consultantId}&appointmentAt=${appointmentAt.toISOString()}&notes=${encodeURIComponent(
        notes
      )}&fee=${sessionFee}`
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          {/* DRAG INDICATOR */}
          <View style={styles.dragIndicator} />

          <View style={styles.header}>
            <Text style={styles.title}>Schedule Consultation</Text>
            <Text style={styles.subtitle}>Set your preferred date and time</Text>
          </View>

          {/* DATE PICKER */}
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDatePicker(true)}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="calendar" size={18} color={THEME.primary} />
            </View>
            <View>
              <Text style={styles.label}>Select Date</Text>
              <Text style={styles.inputText}>{date.toDateString()}</Text>
            </View>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              minimumDate={new Date()}
              onChange={(e, selected) => {
                setShowDatePicker(false);
                if (selected) setDate(selected);
              }}
            />
          )}

          {/* TIME PICKER */}
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowStartPicker(true)}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="time" size={18} color={THEME.primary} />
            </View>
            <View>
              <Text style={styles.label}>Select Time</Text>
              <Text style={styles.inputText}>{formatTime(startTime)}</Text>
            </View>
          </TouchableOpacity>

          {showStartPicker && (
            <DateTimePicker
              value={startTime}
              mode="time"
              onChange={(e, selected) => {
                setShowStartPicker(false);
                if (selected) setStartTime(selected);
              }}
            />
          )}

          {/* NOTES */}
          <TextInput
            style={styles.textArea}
            placeholder="Notes for consultant (optional)..."
            placeholderTextColor={THEME.textGray}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          {/* INFO BOX - NGAYON AY GUMAGAMIT NA NG DYNAMIC RATE */}
          <View style={styles.feeReminder}>
            <Ionicons
              name="information-circle"
              size={20}
              color={THEME.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.feeDesc}>
                A session fee of{" "}
                <Text style={styles.bold}>₱{sessionFee}.00</Text> applies.
              </Text>
              <Text style={styles.feeDesc}>
                The chat remains open for <Text style={styles.bold}>12 hours</Text>{" "}
                after payment.
              </Text>
            </View>
          </View>

          {/* ERROR DISPLAY */}
          {!!errorMsg && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={THEME.error} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* BUTTONS */}
          <View style={styles.row}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.continueBtn, errorMsg && styles.disabledBtn]}
              disabled={!!errorMsg}
              onPress={handleContinue}
            >
              <Text style={styles.continueText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
  },
  modalBox: {
    backgroundColor: THEME.surface,
    padding: 24,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  dragIndicator: {
    width: 40,
    height: 5,
    backgroundColor: "#E2E8F0",
    borderRadius: 10,
    alignSelf: "center",
    marginBottom: 20,
  },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "900", color: THEME.textDark },
  subtitle: { fontSize: 14, color: THEME.textGray, marginTop: 2 },

  input: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: THEME.inputBg,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  label: {
    fontSize: 11,
    color: THEME.textGray,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  inputText: { fontSize: 15, fontWeight: "600", color: THEME.textDark },

  textArea: {
    backgroundColor: THEME.inputBg,
    padding: 16,
    minHeight: 100,
    borderRadius: 16,
    marginBottom: 15,
    fontSize: 15,
    color: THEME.textDark,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  feeReminder: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#F0F9FF",
    padding: 16,
    borderRadius: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  feeDesc: { fontSize: 13, color: "#0369A1", lineHeight: 18 },
  bold: { fontWeight: "800", color: THEME.primary },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 15,
    backgroundColor: "#FEF2F2",
    padding: 10,
    borderRadius: 10,
  },
  errorText: { color: THEME.error, fontWeight: "700", fontSize: 13 },

  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  continueBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#2c4f4f",
    alignItems: "center",
    elevation: 4,
  },
  disabledBtn: { backgroundColor: "#94A3B8", elevation: 0 },

  cancelText: { fontSize: 15, fontWeight: "700", color: THEME.textGray },
  continueText: { fontSize: 15, color: "#FFF", fontWeight: "800" },
});
