import React from "react";
import { SafeAreaView, View, StatusBar, StyleSheet } from "react-native";

export default function Screen({ children, style }) {
  return (
    <SafeAreaView style={[styles.safeArea]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={[styles.container, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
});
