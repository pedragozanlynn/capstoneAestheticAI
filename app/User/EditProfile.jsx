import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../config/firebase";
import Button from "../components/Button";

const USER_ID_KEY = "aestheticai:current-user-id";

export default function EditProfile() {
  const router = useRouter();

  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    gender: "",
    subscription_type: "Free", // default
    createdAt: null,
  });

  /* ================= LOAD USER ================= */
  useEffect(() => {
    const loadUser = async () => {
      try {
        const uid = await AsyncStorage.getItem(USER_ID_KEY);
        if (!uid) return;

        setUserId(uid);

        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          const data = snap.data();
          
          // Format date if createdAt exists
          let formattedDate = "N/A";
          if (data.createdAt) {
            const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            formattedDate = date.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            });
          }

          setForm({
            name: data.name || "",
            email: data.email || "",
            gender: data.gender || "",
            subscription_type: data.subscription_type || "Free",
            createdAt: formattedDate,
          });
        }
      } catch (e) {
        console.log("Load profile error:", e);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  /* ================= SAVE ================= */
  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert("Validation", "Name is required");
      return;
    }

    if (!form.gender) {
      Alert.alert("Validation", "Please select your gender");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "users", userId), {
        name: form.name.trim(),
        gender: form.gender,
      });

      Alert.alert("Success", "Profile updated successfully");
      router.replace("/User/Profile");
    } catch (e) {
      console.log("Update profile error:", e);
      Alert.alert("Error", "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#01579B" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ===== HEADER (UNCHANGED) ===== */}
      <View style={styles.profileHeaderRow}>
        <View style={styles.profileHeaderLeft}>
          <TouchableOpacity
            style={styles.profileHeaderAvatar}
            onPress={router.back}
          >
            <Ionicons name="arrow-back" size={20} color="#0F3E48" />
          </TouchableOpacity>

          <View>
            <Text style={styles.profileHeaderTitle}>Edit Profile</Text>
            <Text style={styles.profileHeaderSubtitle}>
              Update your personal information
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.profileHeaderDivider} />

      {/* ===== ACCOUNT SUMMARY (NEW READ-ONLY SECTION) ===== */}
      <View style={styles.infoRow}>
         <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Subscription</Text>
            <Text style={styles.infoValue}>{form.subscription_type}</Text>
         </View>
         <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Member Since</Text>
            <Text style={styles.infoValue}>{form.createdAt}</Text>
         </View>
      </View>

      {/* ===== FORM CARD ===== */}
      <View style={styles.card}>
        <Label text="Full Name" />
        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={form.name}
            onChangeText={(v) => setForm({ ...form, name: v })}
            placeholder="Enter your full name"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <Label text="Email Address" />
        <View style={[styles.inputWrapper, styles.readonlyWrap]}>
          <Ionicons name="mail-outline" size={18} color="#CBD5E1" style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: "#94A3B8" }]}
            value={form.email}
            editable={false}
          />
        </View>

        <Label text="Gender" />
        <View style={styles.genderRow}>
          <TouchableOpacity
            style={[styles.genderCard, form.gender === "Male" && styles.genderActiveMale]}
            onPress={() => setForm({ ...form, gender: "Male" })}
          >
            <Ionicons name="male" size={20} color={form.gender === "Male" ? "#fff" : "#0284C7"} />
            <Text style={[styles.genderText, form.gender === "Male" && styles.genderTextActive]}>Male</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.genderCard, form.gender === "Female" && styles.genderActiveFemale]}
            onPress={() => setForm({ ...form, gender: "Female" })}
          >
            <Ionicons name="female" size={20} color={form.gender === "Female" ? "#fff" : "#DB2777"} />
            <Text style={[styles.genderText, form.gender === "Female" && styles.genderTextActive]}>Female</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.buttonWrapper}>
        <Button
          title={saving ? "Saving..." : "Save Changes"}
          onPress={handleSave}
          disabled={saving}
          backgroundColor="#0F3E48"
          textColor="#fff"
          icon={<Ionicons name="checkmark-circle-outline" size={20} color="#fff" />}
        />
      </View>
    </ScrollView>
  );
}

const Label = ({ text }) => <Text style={styles.label}>{text}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContent: { paddingHorizontal: 25, paddingBottom: 40 },

  profileHeaderRow: { flexDirection: "row", alignItems: "center", paddingTop: 30, paddingBottom: 20 },
  profileHeaderLeft: { flexDirection: "row", alignItems: "center" },
  profileHeaderAvatar: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center", marginRight: 16,
  },
  profileHeaderTitle: { fontSize: 19, fontWeight: "900", color: "#0F3E48" },
  profileHeaderSubtitle: { fontSize: 12, color: "#64748B" },
  profileHeaderDivider: { height: 1, backgroundColor: "#F1F5F9", marginBottom: 20 },

  /* NEW INFO ROW STYLE */
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
  infoBox: { 
    flex: 1, backgroundColor: '#FFF', padding: 15, borderRadius: 16, 
    borderWidth: 1, borderColor: '#F1F5F9', elevation: 1 
  },
  infoLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#0F3E48' },

  card: {
    backgroundColor: "#fff", borderRadius: 24, padding: 24, marginBottom: 20,
    borderWidth: 1, borderColor: "#F1F5F9", elevation: 2, shadowColor: "#000",
    shadowOpacity: 0.03, shadowRadius: 10,
  },
  label: { fontSize: 11, fontWeight: "800", color: "#475569", marginTop: 15, marginBottom: 8, textTransform: 'uppercase' },
  inputWrapper: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC",
    borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 16, paddingHorizontal: 15,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, fontWeight: "600", color: "#1E293B" },
  readonlyWrap: { backgroundColor: "#F1F5F9", borderColor: "#E2E8F0" },
  genderRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  genderCard: {
    flex: 1, flexDirection: 'row', borderRadius: 14, borderWidth: 1,
    borderColor: "#E2E8F0", paddingVertical: 12, alignItems: "center",
    justifyContent: 'center', backgroundColor: "#FAFCFD", gap: 6,
  },
  genderActiveMale: { backgroundColor: "#0284C7", borderColor: "#0284C7" },
  genderActiveFemale: { backgroundColor: "#DB2777", borderColor: "#DB2777" },
  genderText: { fontWeight: "800", fontSize: 13, color: "#64748B" },
  genderTextActive: { color: "#fff" },
  buttonWrapper: { marginTop: 5 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});