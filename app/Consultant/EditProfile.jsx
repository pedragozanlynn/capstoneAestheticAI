import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import { db } from "../../config/firebase";
import Input from "../components/Input";
import Button from "../components/Button";

export default function EditProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    fullName: "",
    address: "",
    gender: "",
    consultantType: "",
    education: "",
    specialization: "",
    experience: "",
    licenseNumber: "",
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const uid = await AsyncStorage.getItem("aestheticai:current-user-id");
        if (!uid) return;

        const snap = await getDoc(doc(db, "consultants", uid));
        if (snap.exists()) {
          setFormData((prev) => ({
            ...prev,
            ...snap.data(),
          }));
        }
      } catch (err) {
        console.log("Load profile error:", err);
      }
    };
    loadProfile();
  }, []);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (
      !formData.fullName ||
      !formData.address ||
      !formData.gender ||
      !formData.education ||
      !formData.specialization
    ) {
      return Alert.alert("Missing Field", "Please complete all required fields.");
    }

    try {
      setLoading(true);
      const uid = await AsyncStorage.getItem("aestheticai:current-user-id");

      await updateDoc(doc(db, "consultants", uid), {
        fullName: formData.fullName,
        address: formData.address,
        gender: formData.gender,
        education: formData.education,
        specialization: formData.specialization,
        experience: formData.consultantType === "Professional" ? formData.experience || "" : "",
        licenseNumber: formData.consultantType === "Professional" ? formData.licenseNumber || "" : "",
      });

      Alert.alert("Success", "Profile updated successfully.");
      router.back();
    } catch (err) {
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* StatusBar configuration para laging kita ang icons sa taas */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" translucent={false} />
      
      {/* SafeAreaView para sa iOS notch at top system spacing */}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={router.back}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Edit Profile</Text>
            <Text style={styles.headerSubtitle}>Professional Information</Text>
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Basic Details</Text>
          </View>

          <View style={styles.card}>
            <Input
              label="Full Name"
              value={formData.fullName}
              onChangeText={(t) => handleChange("fullName", t)}
              placeholder="Enter your full name"
            />

            <Input
              label="Office/Clinic Address"
              value={formData.address}
              onChangeText={(t) => handleChange("address", t)}
              placeholder="City, Province"
            />

            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderRow}>
              {["Male", "Female"].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderBtn,
                    formData.gender === g && (g === "Male" ? styles.genderMaleActive : styles.genderFemaleActive),
                  ]}
                  onPress={() => handleChange("gender", g)}
                >
                  <Ionicons
                    name={g === "Male" ? "male" : "female"}
                    size={18}
                    color={formData.gender === g ? "#fff" : "#64748B"}
                  />
                  <Text style={[styles.genderText, formData.gender === g && { color: "#fff" }]}>
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Credentials</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Highest Education</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={formData.education}
                onValueChange={(v) => handleChange("education", v)}
                style={styles.picker}
              >
                <Picker.Item label="Select degree" value="" color="#94A3B8" />
                <Picker.Item label="BS in Architecture" value="BS Architecture" />
                <Picker.Item label="BS in Civil Engineering" value="BSCE" />
                <Picker.Item label="Bachelor of Interior Design" value="Interior Design" />
              </Picker>
            </View>

            <Text style={styles.label}>Primary Specialization</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={formData.specialization}
                onValueChange={(v) => handleChange("specialization", v)}
                style={styles.picker}
              >
                <Picker.Item label="Select specialization" value="" color="#94A3B8" />
                <Picker.Item label="Architectural Design" value="Architectural Design" />
                <Picker.Item label="Structural Engineering" value="Structural Engineering" />
                <Picker.Item label="Residential Interior Design" value="Residential Interior Design" />
                <Picker.Item label="Lighting Design" value="Lighting Design" />
              </Picker>
            </View>

            {formData.consultantType === "Professional" && (
              <View style={styles.proSection}>
                <View style={styles.proDivider} />
                <Input
                  label="Years of Experience"
                  keyboardType="numeric"
                  value={formData.experience}
                  onChangeText={(v) => handleChange("experience", v)}
                  placeholder="e.g. 5"
                />
                <Input
                  label="PRC License Number"
                  value={formData.licenseNumber}
                  onChangeText={(v) => handleChange("licenseNumber", v)}
                  placeholder="0000000"
                />
              </View>
            )}
          </View>

          <View style={styles.buttonContainer}>
            <Button
              title={loading ? "Updating Profile..." : "Save Profile Changes"}
              onPress={handleSave}
              disabled={loading}
              backgroundColor="#01579B"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  safeArea: { backgroundColor: "#FFF" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15, // Binawasan mula 30 para sakto lang ang laki
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#1E293B" },
  headerSubtitle: { fontSize: 13, color: "#64748B", marginTop: 1 },

  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionHeader: { marginBottom: 10, marginTop: 10, paddingLeft: 5 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#01579B", textTransform: 'uppercase', letterSpacing: 0.5 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },

  label: { fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 8, marginTop: 10, marginLeft: 2 },
  genderRow: { flexDirection: "row", gap: 12, marginTop: 5 },
  genderBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 15,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  genderMaleActive: { backgroundColor: "#01579B", borderColor: "#01579B" },
  genderFemaleActive: { backgroundColor: "#C44569", borderColor: "#C44569" },
  genderText: { marginLeft: 8, fontWeight: "800", color: "#64748B", fontSize: 14 },

  pickerBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
    overflow: "hidden",
  },
  picker: { height: 55, width: "100%" },
  
  proSection: { marginTop: 10 },
  proDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 15 },
  buttonContainer: { marginTop: 10, marginBottom: 30 },
});