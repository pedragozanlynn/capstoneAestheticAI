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

// ✅ NEW: camera selfie
import * as ImagePicker from "expo-image-picker";

// ✅ UPDATED: connect to fileUploadService (portfolio removed)
import {
  pickFile,
  uploadValidIdFront,
  uploadValidIdBack,
  uploadSelfie as uploadSelfieToSupabase,
} from "../../services/fileUploadService";

import Button from "../components/Button";
import Input from "../components/Input";

// session cache
let sessionFormData = null;

export default function Step2Details() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialized = useRef(false);

  const [formData, setFormData] = useState({
    specialization: "",
    education: "",
    experience: "", // (kept optional)
    licenseNumber: "", // (kept optional)

    // ✅ Valid ID + Selfie uploads
    idFrontUrl: "",
    idBackUrl: "",
    selfieUrl: "",

    availability: [],
    day: "",
  });

  /* ===================== UPLOAD HELPERS ===================== */

  const normalizePickedFile = (picked) => {
    try {
      if (!picked) return null;

      if (picked?.assets && Array.isArray(picked.assets) && picked.assets[0]) {
        const a = picked.assets[0];
        return {
          uri: a.uri,
          name: a.fileName || a.filename || `upload_${Date.now()}.jpg`,
          mimeType: a.mimeType || a.type || "image/jpeg",
          size: a.fileSize || a.size,
        };
      }

      if (Array.isArray(picked) && picked[0]) {
        const a = picked[0];
        return {
          uri: a.uri,
          name: a.name || a.fileName || `upload_${Date.now()}`,
          mimeType: a.mimeType || a.type || "application/octet-stream",
          size: a.size,
        };
      }

      return {
        uri: picked.uri,
        name: picked.name || picked.fileName || `upload_${Date.now()}`,
        mimeType: picked.mimeType || picked.type || "application/octet-stream",
        size: picked.size,
      };
    } catch (e) {
      console.log("❌ normalizePickedFile error:", e?.message || e);
      return null;
    }
  };

  /* ===================== LOGIC ===================== */

  const handleInputChange = (field, value) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    sessionFormData = next;
    AsyncStorage.setItem("step2Data", JSON.stringify(next));
  };

  // ✅ upload ID uses dedicated upload functions (unchanged behavior)
  const uploadId = async (side) => {
    try {
      const pickedRaw = await pickFile();
      const picked = normalizePickedFile(pickedRaw);
      if (!picked?.uri) return;

      const uploaded =
        side === "front"
          ? await uploadValidIdFront(picked)
          : await uploadValidIdBack(picked);

      if (!uploaded || !uploaded.fileUrl) {
        return Alert.alert("Upload Failed", "Could not upload your ID file.");
      }

      if (side === "front") {
        handleInputChange("idFrontUrl", uploaded.fileUrl);
      } else {
        handleInputChange("idBackUrl", uploaded.fileUrl);
      }

      Alert.alert("Success", `Valid ID (${side}) uploaded successfully!`);
    } catch (e) {
      console.log("❌ uploadId error:", e?.message || e);
      Alert.alert("Error", "Something went wrong while uploading.");
    }
  };

  // ✅ UPDATED: selfie must be captured on-the-spot using camera (NOT gallery)
  const handleUploadSelfie = async () => {
    try {
      // 1) Ask camera permission
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        return Alert.alert(
          "Camera Permission Needed",
          "Please allow camera access to take a selfie."
        );
      }

      // 2) Open camera
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.9,
        cameraType: ImagePicker.CameraType.front,
      });

      // user cancelled
      if (result.canceled) return;

      // 3) Normalize into your uploader input
      const picked = normalizePickedFile(result);
      if (!picked?.uri) {
        return Alert.alert("Error", "Could not read captured selfie.");
      }

      // 4) Upload to Supabase using your existing service
      const uploaded = await uploadSelfieToSupabase(picked);
      if (!uploaded || !uploaded.fileUrl) {
        return Alert.alert("Upload Failed", "Could not upload selfie photo.");
      }

      handleInputChange("selfieUrl", uploaded.fileUrl);
      Alert.alert("Success", "Selfie captured and uploaded successfully!");
    } catch (e) {
      console.log("❌ handleUploadSelfie error:", e?.message || e);
      Alert.alert("Error", e?.message || "Something went wrong while uploading.");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.data]);

  const addAvailability = () => {
    if (!formData.day) {
      return Alert.alert("Missing Field", "Please select a day.");
    }

    if (formData.availability.includes(formData.day)) {
      return Alert.alert("Already Added", "That day is already in your list.");
    }

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
    if (!formData.education || !formData.specialization) {
      return Alert.alert("Missing Field", "Please fill required fields.");
    }

    if (!formData.idFrontUrl || !formData.idBackUrl) {
      return Alert.alert(
        "Missing Valid ID",
        "Please upload both Front and Back of your Valid ID."
      );
    }

    if (!formData.selfieUrl) {
      return Alert.alert(
        "Missing Selfie",
        "Please take your selfie photo for verification."
      );
    }

    const step1Data = params?.data ? JSON.parse(params.data) : {};
    router.push({
      pathname: "/Consultant/Step3Review",
      params: { data: JSON.stringify({ ...step1Data, step2: formData }) },
    });
  };

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
          <Text style={styles.headerTitle}>Registration</Text>
          <Text style={styles.headerSubtitle}>Step 2 • Details</Text>
        </View>
      </View>

      {/* CARD */}
      <View style={styles.card}>
        {/* EDUCATION */}
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={formData.education}
            onValueChange={(v) => handleInputChange("education", v)}
          >
            <Picker.Item label="Select degree" value="" />
            <Picker.Item
              label="Bachelor of Science in Architecture"
              value="BS Architecture"
            />
            <Picker.Item
              label="Bachelor of Science in Civil Engineering"
              value="BSCE"
            />
            <Picker.Item
              label="Bachelor of Interior Design"
              value="Interior Design"
            />
          </Picker>
        </View>

        {/* SPECIALIZATION */}
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={formData.specialization}
            onValueChange={(v) => handleInputChange("specialization", v)}
          >
            <Picker.Item label="Select specialization" value="" />
            <Picker.Item label="Architectural Design" value="Architectural Design" />
            <Picker.Item label="Residential Planning" value="Residential Planning" />
            <Picker.Item label="Sustainable Architecture" value="Sustainable Architecture" />
            <Picker.Item label="Structural Engineering" value="Structural Engineering" />
            <Picker.Item label="Construction Engineering" value="Construction Engineering" />
            <Picker.Item label="Geotechnical Engineering" value="Geotechnical Engineering" />
            <Picker.Item label="Residential Interior Design" value="Residential Interior Design" />
            <Picker.Item label="Lighting Design" value="Lighting Design" />
            <Picker.Item label="Furniture Design" value="Furniture Design" />
          </Picker>
        </View>

        {/* OPTIONAL */}
        <Input
          label="Experience (Years) (Optional)"
          keyboardType="numeric"
          value={formData.experience}
          onChangeText={(v) => handleInputChange("experience", v)}
          placeholder="e.g. 3"
        />
        <Input
          label="License Number (Optional)"
          value={formData.licenseNumber}
          onChangeText={(v) => handleInputChange("licenseNumber", v)}
          placeholder="Enter license number"
        />

        {/* AVAILABILITY */}
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={formData.day}
            onValueChange={(v) => handleInputChange("day", v)}
          >
            <Picker.Item label="Select availability" value="" />
            {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((d) => (
              <Picker.Item key={d} label={d} value={d} />
            ))}
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

        {/* VALID ID FRONT */}
        <TouchableOpacity style={styles.uploadCard} onPress={() => uploadId("front")}>
          <Ionicons
            name={formData.idFrontUrl ? "checkmark-circle" : "card-outline"}
            size={30}
            color={formData.idFrontUrl ? "#2ECC71" : "#0F3E48"}
          />
          <Text style={styles.uploadTitle}>
            {formData.idFrontUrl ? "Valid ID (Front) Uploaded" : "Upload Valid ID (Front)"}
          </Text>
          <Text style={styles.uploadHint}>JPG/PNG/PDF supported</Text>
        </TouchableOpacity>

        {formData.idFrontUrl && (
          <View style={styles.uploadSuccess}>
            <Ionicons name="link-outline" size={16} color="#2ECC71" />
            <Text style={styles.successText}>Front ID attached</Text>
          </View>
        )}

        {/* VALID ID BACK */}
        <TouchableOpacity style={styles.uploadCard} onPress={() => uploadId("back")}>
          <Ionicons
            name={formData.idBackUrl ? "checkmark-circle" : "card-outline"}
            size={30}
            color={formData.idBackUrl ? "#2ECC71" : "#0F3E48"}
          />
          <Text style={styles.uploadTitle}>
            {formData.idBackUrl ? "Valid ID (Back) Uploaded" : "Upload Valid ID (Back)"}
          </Text>
          <Text style={styles.uploadHint}>JPG/PNG/PDF supported</Text>
        </TouchableOpacity>

        {formData.idBackUrl && (
          <View style={styles.uploadSuccess}>
            <Ionicons name="link-outline" size={16} color="#2ECC71" />
            <Text style={styles.successText}>Back ID attached</Text>
          </View>
        )}

        {/* SELFIE (CAMERA ONLY) */}
        <TouchableOpacity style={styles.uploadCard} onPress={handleUploadSelfie}>
          <Ionicons
            name={formData.selfieUrl ? "checkmark-circle" : "camera-outline"}
            size={30}
            color={formData.selfieUrl ? "#2ECC71" : "#0F3E48"}
          />
          <Text style={styles.uploadTitle}>
            {formData.selfieUrl ? "Selfie Uploaded" : "Take Selfie Photo"}
          </Text>
          <Text style={styles.uploadHint}>Camera will open (no gallery)</Text>
        </TouchableOpacity>

        {formData.selfieUrl && (
          <View style={styles.uploadSuccess}>
            <Ionicons name="link-outline" size={16} color="#2ECC71" />
            <Text style={styles.successText}>Selfie attached</Text>
          </View>
        )}

        {/* NEXT */}
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

  headerTitle: { fontSize: 26, fontWeight: "800", color: "#fff" },
  headerSubtitle: { fontSize: 14, color: "#f5f5f5", marginTop: 6 },

  card: {
    marginTop: -85,
    padding: 28,
    backgroundColor: "#FAF9F6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },

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
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },

  avail: { fontSize: 15, color: "#912f56", fontWeight: "500" },

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
    textAlign: "center",
    paddingHorizontal: 10,
  },

  uploadHint: { marginTop: 4, fontSize: 12, color: "#6B8C8C" },

  uploadSuccess: { flexDirection: "row", alignItems: "center", marginBottom: 16 },

  successText: {
    marginLeft: 6,
    fontSize: 13,
    color: "#2ECC71",
    fontWeight: "600",
  },

  nextBtn: { marginTop: 10 },
});
