import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { pickFile, uploadToSupabase } from "../../services/fileUploadService";
import Button from "../components/Button";
import Input from "../components/Input"; // ✅ INPUT COMPONENT

// session cache
let sessionFormData = null;

export default function Step2Details() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialized = useRef(false);

  const [formData, setFormData] = useState({
    specialization: "",
    education: "",
    experience: "",
    licenseNumber: "",
    portfolioLink: "",
    availability: [],
    day: "",
  });

  /* ===================== LOGIC (UNCHANGED) ===================== */

  const uploadPortfolio = async () => {
    try {
      const picked = await pickFile();
      if (!picked) return;

      const uploaded = await uploadToSupabase(picked, "portfolio-files");
      if (!uploaded)
        return Alert.alert("Upload Failed", "Could not upload portfolio file.");

      handleInputChange("portfolioLink", uploaded.fileUrl);
      Alert.alert("Success", "Portfolio uploaded successfully!");
    } catch (e) {
      Alert.alert("Error", "Something went wrong while uploading.");
    }
  };

  useEffect(() => {
    if (sessionFormData) {
      setFormData(sessionFormData);
      initialized.current = true;
      return;
    }

    const init = async () => {
      if (initialized.current) return;
      initialized.current = true;

      const saved = await AsyncStorage.getItem("step2Data");
      if (saved) {
        const parsed = JSON.parse(saved);
        setFormData(parsed);
        sessionFormData = parsed;
        return;
      }

      if (params?.data) {
        const step1 = JSON.parse(params.data);
        if (step1.step2) {
          const merged = { ...formData, ...step1.step2 };
          setFormData(merged);
          sessionFormData = merged;
        }
      }
    };

    init();
  }, [params?.data]);

  const handleInputChange = (field, value) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    sessionFormData = next;
    AsyncStorage.setItem("step2Data", JSON.stringify(next));
  };

  const addAvailability = () => {
    if (!formData.day)
      return Alert.alert("Missing Field", "Please select a day.");

    const next = {
      ...formData,
      availability: [...formData.availability, formData.day],
      day: "",
    };

    setFormData(next);
    sessionFormData = next;
    AsyncStorage.setItem("step2Data", JSON.stringify(next));
  };

  const removeAvailability = (index) => {
    const next = {
      ...formData,
      availability: formData.availability.filter((_, i) => i !== index),
    };

    setFormData(next);
    sessionFormData = next;
    AsyncStorage.setItem("step2Data", JSON.stringify(next));
  };

  const handleBack = async () => {
    await AsyncStorage.setItem("step2Data", JSON.stringify(formData));
    router.back();
  };

  const handleNext = async () => {
    if (!formData.specialization || !formData.education) {
      return Alert.alert("Missing Field", "Please fill required fields.");
    }

    const step1Data = params?.data ? JSON.parse(params.data) : {};
    router.push({
      pathname: "/Consultant/Step3Review",
      params: { data: JSON.stringify({ ...step1Data, step2: formData }) },
    });
  };

  const consultantType = params?.data
    ? JSON.parse(params.data).consultantType || ""
    : "";

  /* ===================== UI ===================== */

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* HEADER */}
      <View style={styles.header}>
        <Image
          source={require("../../assets/new_background.jpg")}
          style={styles.headerImage}
        />

        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Consultant Registration</Text>
          <Text style={styles.headerSubtitle}>Step 2 • Consultant Details</Text>
        </View>
      </View>

      {/* CARD */}
      <View style={styles.card}>
        <Text style={styles.sub}>
          Consultant Type:{" "}
          {consultantType === "Professional"
            ? "Professional"
            : "Fresh Graduate"}
        </Text>

        {/* EDUCATION */}
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={formData.education}
            onValueChange={(v) => handleInputChange("education", v)}
          >
            <Picker.Item label="Select degree" value="" />
     <Picker.Item label="Bachelor of Science in Architecture" value="BS Architecture" />
    <Picker.Item label="Bachelor of Science in Civil Engineering" value="BSCE" />
<    Picker.Item label="Bachelor of Interior Design" value="Interior Design" />
          </Picker>
        </View>
               {/* SPECIALIZATION */}
<View style={styles.pickerBox}>
  <Picker
    selectedValue={formData.specialization}
    onValueChange={(v) => handleInputChange("specialization", v)}
  >
    <Picker.Item label="Select specialization" value="" />

    {/* Architecture */}
    <Picker.Item label="Architectural Design" value="Architectural Design" />
    <Picker.Item label="Residential Planning" value="Residential Planning" />
    <Picker.Item label="Sustainable Architecture" value="Sustainable Architecture" />

    {/* Civil Engineering */}
    <Picker.Item label="Structural Engineering" value="Structural Engineering" />
    <Picker.Item label="Construction Engineering" value="Construction Engineering" />
    <Picker.Item label="Geotechnical Engineering" value="Geotechnical Engineering" />

    {/* Interior Design */}
    <Picker.Item label="Residential Interior Design" value="Residential Interior Design" />
    <Picker.Item label="Lighting Design" value="Lighting Design" />
    <Picker.Item label="Furniture Design" value="Furniture Design" />
  </Picker>
</View>


        {/* PROFESSIONAL ONLY */}
        {consultantType === "Professional" && (
          <>
            <Input
              label="Experience (Years)"
              keyboardType="numeric"
              value={formData.experience}
              onChangeText={(v) => handleInputChange("experience", v)}
              placeholder="e.g. 3"
            />

            <Input
              label="License Number"
              value={formData.licenseNumber}
              onChangeText={(v) => handleInputChange("licenseNumber", v)}
              placeholder="Enter license number"
            />
          </>
        )}

        {/* AVAILABILITY */}
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={formData.day}
            onValueChange={(v) => handleInputChange("day", v)}
          >
            <Picker.Item label="Select availability" value="" />
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday","Sunday"].map(
              (d) => (
                <Picker.Item key={d} label={d} value={d} />
              )
            )}
          </Picker>
        </View>

        {formData.day && (
          <TouchableOpacity style={styles.addBtn} onPress={addAvailability}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addText}>Add Day</Text>
          </TouchableOpacity>
        )}

        {formData.availability.map((d, i) => (
          <View key={i} style={styles.availabilityItem}>
            <Text style={styles.avail}>{d}</Text>
            <TouchableOpacity onPress={() => removeAvailability(i)}>
              <Ionicons name="close" size={20} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        ))}

        {/* PORTFOLIO CARD */}
        <TouchableOpacity style={styles.uploadCard} onPress={uploadPortfolio}>
          <Ionicons
            name={
              formData.portfolioLink
                ? "checkmark-circle"
                : "cloud-upload"
            }
            size={30}
            color={formData.portfolioLink ? "#2ECC71" : "#0F3E48"}
          />
          <Text style={styles.uploadTitle}>
            {formData.portfolioLink
              ? "Portfolio Uploaded"
              : "Upload Portfolio"}
          </Text>
          <Text style={styles.uploadHint}>PDF, DOC, JPG supported</Text>
        </TouchableOpacity>

        {formData.portfolioLink && (
          <View style={styles.uploadSuccess}>
            <Ionicons name="link-outline" size={16} color="#2ECC71" />
            <Text style={styles.successText}>
              File attached successfully
            </Text>
          </View>
        )}

        {/* NEXT BUTTON */}
        <Button title="Next" onPress={handleNext} style={styles.nextBtn} />
      </View>
    </ScrollView>
  );
}

/* ===================== STYLES ===================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  header: { height: 260 },
  headerImage: { width: "100%", height: "100%" },

  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
  },

  headerText: {
    position: "absolute",
    bottom: 100,
    alignItems: "center",
    width: "100%",
  },

  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
  },

  headerSubtitle: {
    fontSize: 14,
    color: "#f5f5f5",
    marginTop: 6,
  },

  card: {
    marginTop: -85,
    padding: 28,
    backgroundColor: "#FAF9F6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },

  sub: { color: "#666", marginBottom: 20 },

  pickerBox: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    backgroundColor: "#fff",
    marginBottom: 14,
  },

  addBtn: {
    flexDirection: "row",
    backgroundColor: "#0F3E48",
    borderRadius: 12,
    padding: 12,
    justifyContent: "center",
    marginBottom: 10,
  },

  addText: { color: "#fff", marginLeft: 6, fontWeight: "600" },

  availabilityItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E1E8EA",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  
    // Subtle iOS-like shadow
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  
  avail: {
    fontSize: 15,
    color: "#912f56",
   fontWeight: "500",
  },
  

  uploadCard: {
    borderWidth: 1.2,
    borderColor: "#2c4f4f",
    borderRadius: 16,
    paddingVertical: 26,
    alignItems: "center",
    backgroundColor: "#FAF9F6",
    marginBottom: 10,
  },

  uploadTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F3E48",
  },

  uploadHint: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B8C8C",
  },

  uploadSuccess: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  successText: {
    marginLeft: 6,
    fontSize: 13,
    color: "#2ECC71",
    fontWeight: "600",
  },

  nextBtn: {
    marginTop: 10,
  },
});
