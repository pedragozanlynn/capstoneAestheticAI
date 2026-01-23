import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  StatusBar,
  SafeAreaView,
  Platform,
  TextInput, // Idinagdag para sa rate input
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Calendar } from "react-native-calendars";
import { useRouter } from "expo-router";
import { db } from "../../config/firebase";

const DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

export default function EditAvailability() {
  const router = useRouter();
  const uid = getAuth().currentUser?.uid;

  const [availability, setAvailability] = useState([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [rate, setRate] = useState(""); // State para sa Consultation Fee
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!uid) return;
        const snap = await getDoc(doc(db, "consultants", uid));
        if (snap.exists()) {
          const data = snap.data();
          setAvailability(data.availability || []);
          // I-convert ang number sa string para sa TextInput
          setRate(data.rate ? data.rate.toString() : "");
        }
      } catch (err) {
        console.log("Load data error:", err);
      }
    };
    loadData();
  }, []);

  const addDay = () => {
    if (!selectedDay) return;
    if (availability.includes(selectedDay)) {
      Alert.alert("Already Added", "This day is already selected.");
      return;
    }
    setAvailability((prev) => [...prev, selectedDay]);
    setSelectedDay("");
  };

  const removeDay = (day) => {
    setAvailability((prev) => prev.filter((d) => d !== day));
  };

  const saveChanges = async () => {
    if (availability.length === 0) {
      Alert.alert("Required", "Please select at least one day.");
      return;
    }
    if (!rate || isNaN(rate)) {
      Alert.alert("Invalid Rate", "Please enter a valid consultation fee.");
      return;
    }

    try {
      setSaving(true);
      await updateDoc(doc(db, "consultants", uid), { 
        availability,
        rate: parseFloat(rate) // I-save bilang number sa Firestore
      });
      Alert.alert("Success ✅", "Profile updated successfully.");
      router.back();
    } catch (err) {
      Alert.alert("Error", "Failed to update profile.");
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
          <TouchableOpacity style={styles.backButton} onPress={router.back}>
            <Ionicons name="arrow-back" size={22} color="#0F3E48" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Edit Consultation Details</Text>
            <Text style={styles.headerSubtitle}>Set your rate and availability</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.divider} />

        {/* ===== RATE SECTION ===== */}
        <View style={styles.section}>
          <Text style={styles.label}>Consultation Fee (PHP)</Text>
          <View style={styles.rateInputBox}>
            <Text style={styles.currencySymbol}>₱</Text>
            <TextInput
              style={styles.rateInput}
              placeholder="e.g. 500"
              keyboardType="numeric"
              value={rate}
              onChangeText={setRate}
            />
          </View>
          <Text style={styles.helperText}>This is the amount users will pay per session.</Text>
        </View>

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
              <Picker
                selectedValue={selectedDay}
                onValueChange={setSelectedDay}
              >
                <Picker.Item label="Select day" value="" color="#999" />
                {DAYS.map((d) => (
                  <Picker.Item key={d} label={d} value={d} />
                ))}
              </Picker>
            </View>
            
            {selectedDay !== "" && (
              <TouchableOpacity style={styles.addBtn} onPress={addDay}>
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
                <TouchableOpacity onPress={() => removeDay(day)}>
                  <Ionicons name="close-circle" size={22} color="#C44569" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ===== SAVE BUTTON ===== */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={saveChanges}
          disabled={saving}
        >
          <Ionicons name="save-outline" size={20} color="#fff" />
          <Text style={styles.saveText}>
            {saving ? "Saving..." : "Save Changes"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'android' ? 15 : 10,
    backgroundColor: "#FFF",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E3F2FD",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0F3E48" },
  headerSubtitle: { fontSize: 12, color: "#777", marginTop: 2 },
  divider: { height: 1, backgroundColor: "#E4E6EB", marginBottom: 20 },

  // New Rate Styles
  rateInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce3ea',
    borderRadius: 14,
    paddingHorizontal: 15,
    height: 55,
  },
  currencySymbol: { fontSize: 18, fontWeight: '700', color: '#01579B', marginRight: 10 },
  rateInput: { flex: 1, fontSize: 16, fontWeight: '600', color: '#0F3E48' },
  helperText: { fontSize: 11, color: '#888', marginTop: 5, fontStyle: 'italic' },

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
  inputRow: { flexDirection: 'row', gap: 10 },
  pickerBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dce3ea",
    borderRadius: 14,
    backgroundColor: "#fff",
    justifyContent: 'center',
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
  emptyText: { color: "#999", fontStyle: 'italic', marginLeft: 5 },

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