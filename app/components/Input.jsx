import React, { useState } from "react";
import { TextInput, StyleSheet, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function Input({ style, secureTextEntry, ...props }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={styles.container}>
      <TextInput
        {...props}
        style={[styles.input, style]}
        placeholderTextColor="#8A9A9C"
        secureTextEntry={secureTextEntry && !showPassword}
      />

      {secureTextEntry && (
        <TouchableOpacity
          style={styles.eyeIcon}
          onPress={() => setShowPassword(!showPassword)}
        >
          <Ionicons
            name={showPassword ? "eye-off-outline" : "eye-outline"}
            size={22}
            color="#6A7A7C"
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E1E8EA",
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 16,
    paddingRight: 48,
    fontSize: 15,
    color: "#0F3E48",

    // Subtle iOS-like shadow
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,

    // ✅ spacing between inputs
    marginBottom: 12,
  },

  eyeIcon: {
    position: "absolute",
    right: 16,
    top: "45%",
    transform: [{ translateY: -15 }],
  },
});
