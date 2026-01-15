import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";

export default function Button({ title, onPress, style, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        disabled && { opacity: 0.6 },
        style,
      ]}
    >
      <Text style={styles.text}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#3fa796",   // ✅ bright teal-green
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },
  text: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
