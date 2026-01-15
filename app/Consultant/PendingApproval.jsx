import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function PendingApproval() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Card container */}
      <View style={styles.card}>
        <Ionicons name="stopwatch-outline" size={48} color="#0F3E48" style={styles.icon} />
        <Text style={styles.title}>Pending Approval</Text>
        <Text style={styles.message}>
          Your consultant registration has been submitted and is awaiting admin approval.
        </Text>
        <Text style={styles.note}>
          You’ll receive access once your account is approved by the admin.
        </Text>

        <TouchableOpacity style={styles.button} onPress={() =>  router.replace("/")}>
  <View style={{ flexDirection: "row", alignItems: "center" }}>
    <Ionicons name="arrow-back" size={20} color="#fff" style={{ marginRight: 6 }} />
    <Text style={styles.buttonText}>Go Back</Text>
  </View>
</TouchableOpacity>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
    backgroundColor: "#faf9f6", // soft background
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    width: "100%",
  },
  icon: {
    marginBottom: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#0F3E48",
    marginBottom: 15,
    textAlign: "center",
  },
  message: {
    textAlign: "center",
    fontSize: 16,
    color: "#333",
    marginBottom: 10,
    lineHeight: 22,
  },
  note: {
    fontSize: 14,
    color: "#777",
    textAlign: "center",
    marginBottom: 25,
    lineHeight: 20,
  },
  button: {
    backgroundColor: "#0F3E48",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
