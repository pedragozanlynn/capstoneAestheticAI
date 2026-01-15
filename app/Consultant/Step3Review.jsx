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
  View
} from "react-native";
import { auth, db } from "../../config/firebase";
import Button from "../components/Button";

export default function Step3Review() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const data = params.data ? JSON.parse(params.data) : {};
  const step2 = data.step2 || {};
  const [loading, setLoading] = useState(false);

  // Variable para sa Dark Teal color
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

      await setDoc(doc(db, "consultants", user.uid), {
        fullName: data.fullName,
        email: data.email,
        address: data.address,
        gender: data.gender,
        consultantType: data.consultantType,
        specialization: step2.specialization,
        education: step2.education,
        experience: step2.experience || "",
        licenseNumber: step2.licenseNumber || "",
        availability: step2.availability,
        portfolioURL: step2.portfolioLink || null,
        submittedAt: serverTimestamp(),
        status: "pending"
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
          <Text style={styles.headerTitle}>Consultant Registration</Text>
          <Text style={styles.headerSubtitle}>Step 3 – Review Information</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Personal Info */}
        <View style={styles.card}>
          <Text style={styles.section}>Personal Information</Text>
          <View style={styles.infoRow}>
            <Ionicons name="person" size={20} color={iconColor} style={styles.icon}/>
            <Text style={styles.label}>Full Name</Text>
            <Text style={styles.value}>{data.fullName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="mail" size={20} color={iconColor} style={styles.icon}/>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{data.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="home" size={20} color={iconColor} style={styles.icon}/>
            <Text style={styles.label}>Address</Text>
            <Text style={styles.value}>{data.address}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="male-female" size={20} color={iconColor} style={styles.icon}/>
            <Text style={styles.label}>Gender</Text>
            <Text style={styles.value}>{data.gender}</Text>
          </View>
        </View>

        {/* Consultant Details */}
        <View style={styles.card}>
          <Text style={styles.section}>Consultant Details</Text>
          <View style={styles.infoRow}>
            <Ionicons name="briefcase" size={20} color={iconColor} style={styles.icon}/>
            <Text style={styles.label}>Type</Text>
            <Text style={styles.value}>{data.consultantType}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="construct" size={20} color={iconColor} style={styles.icon}/>
            <Text style={styles.label}>Specialization</Text>
            <Text style={styles.value}>{step2.specialization}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="school" size={20} color={iconColor} style={styles.icon}/>
            <Text style={styles.label}>Education</Text>
            <Text style={styles.value}>{step2.education}</Text>
          </View>
          {data.consultantType === "Professional" && (
            <>
              <View style={styles.infoRow}>
                <Ionicons name="time" size={20} color={iconColor} style={styles.icon}/>
                <Text style={styles.label}>Experience</Text>
                <Text style={styles.value}>{step2.experience} years</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="card" size={20} color={iconColor} style={styles.icon}/>
                <Text style={styles.label}>License Number</Text>
                <Text style={styles.value}>{step2.licenseNumber}</Text>
              </View>
            </>
          )}
        </View>

        {/* Availability */}
        <View style={styles.card}>
          <Text style={styles.section}>Availability</Text>
          {step2.availability && step2.availability.length > 0 ? (
            step2.availability.map((day, i) => (
              <View key={i} style={styles.infoRow}>
                <Ionicons name="calendar" size={20} color={iconColor} style={styles.icon}/>
                <Text style={styles.label}>Day</Text>
                <Text style={styles.value}>{day}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.value}>Not specified</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Portfolio</Text>
          {step2.portfolioLink ? (
            <TouchableOpacity style={styles.portfolioButton} onPress={() => Linking.openURL(step2.portfolioLink)}>
              <Ionicons name="document-text" size={22} color="#fff" style={{ marginRight: 8 }}/>
              <Text style={styles.portfolioButtonText}>Open Portfolio File</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.value}>No portfolio file uploaded</Text>
          )}
        </View>

        <Button
          title="Submit"
          type="primary"
          onPress={handleSubmit}
          loading={loading}
        />
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
    textAlign: "right" 
  },
  portfolioButton: {
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
  portfolioButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});