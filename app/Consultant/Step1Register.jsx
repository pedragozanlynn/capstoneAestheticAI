import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Input from "../components/Input";
import Button from "../components/Button";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";

export default function Step1Register() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    address: "",
    password: "",
    confirmPassword: "",
    consultantType: "",
    gender: "",
  });

  useEffect(() => {
    const init = async () => {
      try {
        if (!global.__APP_SESSION__) {
          await AsyncStorage.multiRemove(["step1Data", "step2Data"]);
          global.__APP_SESSION__ = true;
        } else {
          const saved = await AsyncStorage.getItem("step1Data");
          if (saved) setFormData(JSON.parse(saved));
        }
      } catch (err) {
        console.error("Step1 init error:", err);
      }
    };
    init();
  }, []);

  const handleInputChange = async (field, value) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    await AsyncStorage.setItem("step1Data", JSON.stringify(updated));
  };

  const validateForm = () => {
    if (
      !formData.fullName ||
      !formData.email ||
      !formData.address ||
      !formData.password ||
      !formData.confirmPassword ||
      !formData.consultantType ||
      !formData.gender
    ) {
      Alert.alert(
        "Missing Field",
        "Please fill in all fields, including gender."
      );
      return false;
    }
    if (!formData.email.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return false;
    }
    if (formData.password.length < 8) {
      Alert.alert(
        "Invalid Password",
        "Password must be at least 8 characters long."
      );
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      Alert.alert("Password Mismatch", "Passwords do not match.");
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (!validateForm()) return;
    try {
      await AsyncStorage.setItem("step1Data", JSON.stringify(formData));
      router.push({
        pathname: "/Consultant/Step2Details",
        params: { data: JSON.stringify(formData) },
      });
    } catch {
      Alert.alert("Error", "Failed to save data. Please try again.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Image
          source={require("../../assets/new_background.jpg")}
          style={styles.image}
        />
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Consultant Registration</Text>
          <Text style={styles.headerSubtitle}>
            Step 1 – Personal Information
          </Text>
        </View>
      </View>

      {/* CONTENT */}
      <View style={styles.content}>
        <Input
          value={formData.fullName}
          onChangeText={(t) => handleInputChange("fullName", t)}
          placeholder="Enter full name"
        />
        <Input
          value={formData.email}
          onChangeText={(t) => handleInputChange("email", t)}
          placeholder="Enter email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          value={formData.password}
          onChangeText={(t) => handleInputChange("password", t)}
          placeholder="Enter password"
          secureTextEntry
        />
        <Input
          value={formData.confirmPassword}
          onChangeText={(t) => handleInputChange("confirmPassword", t)}
          placeholder="Confirm password"
          secureTextEntry
        />
        <Input
          value={formData.address}
          onChangeText={(t) => handleInputChange("address", t)}
          placeholder="Enter address"
        />

        {/* GENDER */}
        <Text style={styles.label}>Gender</Text>
        <View style={styles.genderRow}>
          <TouchableOpacity
            style={[
              styles.genderBtn,
              formData.gender === "Male" && styles.genderMaleActive,
            ]}
            onPress={() => handleInputChange("gender", "Male")}
          >
            <Ionicons
              name="male"
              size={18}
              color={formData.gender === "Male" ? "#fff" : "#555"}
            />
            <Text
              style={[
                styles.genderText,
                formData.gender === "Male" && { color: "#fff" },
              ]}
            >
              Male
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.genderBtn,
              formData.gender === "Female" && styles.genderFemaleActive,
            ]}
            onPress={() => handleInputChange("gender", "Female")}
          >
            <Ionicons
              name="female"
              size={18}
              color={formData.gender === "Female" ? "#fff" : "#555"}
            />
            <Text
              style={[
                styles.genderText,
                formData.gender === "Female" && { color: "#fff" },
              ]}
            >
              Female
            </Text>
          </TouchableOpacity>
        </View>

        {/* ✅ CONSULTANT TYPE DROPDOWN (ONLY CHANGE) */}
        <Text style={styles.label}>Consultant Type</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={formData.consultantType}
            onValueChange={(v) =>
              handleInputChange("consultantType", v)
            }
          >
            <Picker.Item label="Professional" value="Professional" />
            <Picker.Item label="Fresh Graduate" value="Fresh Graduate" />
          </Picker>
        </View>

        <Button title="Next" onPress={handleNext} style={styles.next} />
      </View>
    </ScrollView>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  header: { width: "100%", height: 250, position: "relative" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  backButton: {
    position: "absolute",
    top: 30,
    left: 20,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
  },
  headerTextContainer: {
    position: "absolute",
    top: "35%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#fff" },
  headerSubtitle: { fontSize: 14, color: "#f5f5f5", marginTop: 6 },

  content: {
    paddingHorizontal: 32,
    paddingTop: 32,
    marginTop: -90,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },

  label: {
    fontWeight: "600",
    marginTop: 5,
    marginBottom: 6,
    color: "#2c4f4f",
  },

  /* GENDER */
  genderRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  genderBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dce3ea",
    backgroundColor: "#fff",
  },
  genderMaleActive: {
    backgroundColor: "#2c4f4f",
    borderColor: "#2c4f4f",
  },
  genderFemaleActive: {
    backgroundColor: "#8f2f52",
    borderColor: "#8f2f52",
  },
  genderText: {
    marginLeft: 8,
    fontWeight: "700",
    color: "#555",
  },

  /* DROPDOWN */
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#dce3ea",
    borderRadius: 14,
    backgroundColor: "#fff",
    marginBottom: 14,
  },

  next: { marginTop: 20, marginBottom: 20 },
});
