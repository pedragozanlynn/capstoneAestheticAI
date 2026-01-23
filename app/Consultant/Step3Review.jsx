import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../config/firebase";
import Button from "../components/Button";

export default function Step3Review() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const data = params.data ? JSON.parse(params.data) : {};
  const step2 = data.step2 || {};
  const [loading, setLoading] = useState(false);

  const iconColor = "#0F3E48";

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );

      const user = userCredential.user;
      await updateProfile(user, { displayName: data.fullName });

      // ✅ UPDATED: remove consultantType + portfolioURL
      // ✅ UPDATED: save idFrontUrl, idBackUrl, selfieUrl
      await setDoc(doc(db, "consultants", user.uid), {
        fullName: data.fullName,
        email: data.email,
        address: data.address,
        gender: data.gender,

        specialization: step2.specialization || "",
        education: step2.education || "",

        // optional fields (kept if you still want them)
        experience: step2.experience || "",
        licenseNumber: step2.licenseNumber || "",

        availability: step2.availability || [],

        // ✅ NEW uploads
        idFrontUrl: step2.idFrontUrl || null,
        idBackUrl: step2.idBackUrl || null,
        selfieUrl: step2.selfieUrl || null,

        submittedAt: serverTimestamp(),
        status: "pending",
      });

      Alert.alert("Submitted ✅", "Your registration is pending admin approval.");
      router.replace("/Consultant/PendingApproval");
    } catch (error) {
      console.error("Submission error:", error);
      Alert.alert("Error", error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const openLink = async (url) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Error", "Unable to open file link.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image
          source={require("../../assets/new_background.jpg")}
          style={styles.image}
        />
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Registration</Text>
          <Text style={styles.headerSubtitle}>Step 3 – Review Information</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Personal Info */}
        <View style={styles.card}>
          <Text style={styles.section}>Personal Information</Text>

          <View style={styles.infoRow}>
            <Ionicons name="person" size={20} color={iconColor} style={styles.icon} />
            <Text style={styles.label}>Full Name</Text>
            <Text style={styles.value}>{data.fullName || "-"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="mail" size={20} color={iconColor} style={styles.icon} />
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{data.email || "-"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="home" size={20} color={iconColor} style={styles.icon} />
            <Text style={styles.label}>Address</Text>
            <Text style={styles.value}>{data.address || "-"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons
              name="male-female"
              size={20}
              color={iconColor}
              style={styles.icon}
            />
            <Text style={styles.label}>Gender</Text>
            <Text style={styles.value}>{data.gender || "-"}</Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.card}>
          <Text style={styles.section}>Details</Text>

          <View style={styles.infoRow}>
            <Ionicons
              name="construct"
              size={20}
              color={iconColor}
              style={styles.icon}
            />
            <Text style={styles.label}>Specialization</Text>
            <Text style={styles.value}>{step2.specialization || "-"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="school" size={20} color={iconColor} style={styles.icon} />
            <Text style={styles.label}>Education</Text>
            <Text style={styles.value}>{step2.education || "-"}</Text>
          </View>

          {/* Optional fields (no longer tied to consultantType) */}
          <View style={styles.infoRow}>
            <Ionicons name="time" size={20} color={iconColor} style={styles.icon} />
            <Text style={styles.label}>Experience</Text>
            <Text style={styles.value}>
              {step2.experience ? `${step2.experience} years` : "Not specified"}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="card" size={20} color={iconColor} style={styles.icon} />
            <Text style={styles.label}>License Number</Text>
            <Text style={styles.value}>
              {step2.licenseNumber ? step2.licenseNumber : "Not specified"}
            </Text>
          </View>
        </View>

        {/* Availability */}
        <View style={styles.card}>
          <Text style={styles.section}>Availability</Text>
          {step2.availability && step2.availability.length > 0 ? (
            step2.availability.map((day, i) => (
              <View key={i} style={styles.infoRow}>
                <Ionicons
                  name="calendar"
                  size={20}
                  color={iconColor}
                  style={styles.icon}
                />
                <Text style={styles.label}>Day</Text>
                <Text style={styles.value}>{day}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.value}>Not specified</Text>
          )}
        </View>

        {/* ✅ NEW: Verification Uploads */}
        <View style={styles.card}>
          <Text style={styles.section}>Verification</Text>

          {/* ID FRONT */}
          <View style={styles.infoRow}>
            <Ionicons name="card-outline" size={20} color={iconColor} style={styles.icon} />
            <Text style={styles.label}>Valid ID (Front)</Text>
            <Text style={styles.value}>{step2.idFrontUrl ? "Uploaded" : "Missing"}</Text>
          </View>
          {step2.idFrontUrl ? (
            <TouchableOpacity
              style={styles.fileButton}
              onPress={() => openLink(step2.idFrontUrl)}
            >
              <Ionicons name="open-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.fileButtonText}>Open Front ID</Text>
            </TouchableOpacity>
          ) : null}

          {/* ID BACK */}
          <View style={[styles.infoRow, { marginTop: 10 }]}>
            <Ionicons name="card-outline" size={20} color={iconColor} style={styles.icon} />
            <Text style={styles.label}>Valid ID (Back)</Text>
            <Text style={styles.value}>{step2.idBackUrl ? "Uploaded" : "Missing"}</Text>
          </View>
          {step2.idBackUrl ? (
            <TouchableOpacity
              style={styles.fileButton}
              onPress={() => openLink(step2.idBackUrl)}
            >
              <Ionicons name="open-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.fileButtonText}>Open Back ID</Text>
            </TouchableOpacity>
          ) : null}

          {/* SELFIE */}
          <View style={[styles.infoRow, { marginTop: 10 }]}>
            <Ionicons name="camera-outline" size={20} color={iconColor} style={styles.icon} />
            <Text style={styles.label}>Selfie</Text>
            <Text style={styles.value}>{step2.selfieUrl ? "Uploaded" : "Missing"}</Text>
          </View>
          {step2.selfieUrl ? (
            <TouchableOpacity
              style={styles.fileButton}
              onPress={() => openLink(step2.selfieUrl)}
            >
              <Ionicons name="open-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.fileButtonText}>Open Selfie</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Button title="Submit" type="primary" onPress={handleSubmit} loading={loading} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { width: "100%", height: 250, position: "relative" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
  },
  headerTextContainer: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    transform: [{ translateY: -20 }],
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#f5f5f5",
    textAlign: "center",
    fontWeight: "500",
    marginTop: 6,
    letterSpacing: 0.4,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 32,
    marginTop: -60,
    backgroundColor: "#faf9f6",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    marginBottom: 50,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E1E8EA",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F3E48",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  icon: { marginRight: 8 },
  label: { fontSize: 14, color: "#666", flex: 1 },
  value: {
    fontSize: 14,
    color: "#4A4A4A",
    fontWeight: "400",
    flex: 1,
    textAlign: "right",
  },

  // ✅ for file open buttons (ID/selfie)
  fileButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F3E48",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  fileButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
