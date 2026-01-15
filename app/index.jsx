import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  ImageBackground,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

const HERO_IMAGE = require("../assets/new_background.jpg");
const BOTTOM_IMAGE = require("../assets/new_background.jpg"); 
const { width } = Dimensions.get("window");

export default function Index() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 900,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Header background only */}
      <View style={styles.header}>
        <ImageBackground
          source={HERO_IMAGE}
          style={styles.headerImage}
          resizeMode="cover"
        />
      </View>

      {/* Bottom Panel with wave top */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Top Wave Shape */}
        <View style={styles.waveTop}>
          <Svg height={100} width={width} viewBox={`0 0 ${width} 100`}>
            <Path
              d={`M0 40 Q ${width / 4} 0, ${width / 2} 40 T ${width} 40 V100 H0 Z`}
              fill="#faf9f6" // soft off-white
            />
          </Svg>
        </View>

        {/* All text inside content */}
        <Text style={styles.title}>Welcome to</Text>
        <Text style={styles.brand}>AestheticAI</Text>
        <Text
          style={styles.tagline}
          onLongPress={() => router.push("/Admin/Login")}
        >
          Your dream space starts here
        </Text>

        <Text style={styles.sectionLabel}>Continue as</Text>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.button, styles.userButton]}
          onPress={() =>
            router.push({ pathname: "/Login", params: { role: "user" } })
          }
        >
          <Text style={styles.userText}>User</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.button, styles.consultantButton]}
          onPress={() =>
            router.push({ pathname: "/Login", params: { role: "consultant" } })
          }
        >
          <Text style={styles.consultantText}>Consultant</Text>
        </TouchableOpacity>

        <View style={styles.footerContainer}>
          <Text style={styles.footer}>© 2025 AestheticAI</Text>
        </View>
      </Animated.View>

      {/* Bottom Image only */}
      <View style={styles.bottomImageContainer}>
        <Image
          source={BOTTOM_IMAGE}
          style={styles.bottomImage}
          resizeMode="cover"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 260,
    width: "100%",
    overflow: "hidden",
  },
  headerImage: {
    flex: 1,
    justifyContent: "center",
  },

  content: {
    backgroundColor: "#faf9f6", // soft off-white
    paddingHorizontal: 30,
    paddingTop: 20,
    paddingBottom: 36,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  waveTop: {
    position: "absolute",
    top: -60,
    left: 0,
  },

  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333333", // charcoal gray for clarity
    letterSpacing: 3,
    opacity: 0.9,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 4,
  },
  brand: {
    fontSize: 44,
    fontWeight: "900",
    color: "#8f2f52",
   marginVertical: 6,
    letterSpacing: 2,
    fontFamily: "serif",
  },
  tagline: {
    fontSize: 15,
    fontStyle: "italic",
    color: "#4f4f4f", // neutral gray for readability
    textAlign: "center",
    opacity: 0.85,
    lineHeight: 22,
    marginBottom: 16,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2c4f4f", // dark teal for emphasis
    marginBottom: 20,
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  button: {
    width: "88%",
    paddingVertical: 16,
    borderRadius: 22,
    marginVertical: 10,
    alignItems: "center",
  },
  userButton: {
    backgroundColor: "#2c4f4f", // dark teal
    shadowColor: "#2c4f4f",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  consultantButton: {
    backgroundColor: "#3fa796", // bright teal-green
    shadowColor: "#3fa796",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  userText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 1,
  },
  consultantText: {
    color: "#ffffff", // white text for contrast
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 1,
  },

  footerContainer: {
    marginTop: "auto",
    paddingTop: 20,
  },
  footer: {
    color: "#333333",   
     fontSize: 12,
    letterSpacing: 0.5,
    opacity: 0.8,
    textAlign: "center",
  },
  bottomImageContainer: {
    height: 600,
    width: "100%",
    overflow: "hidden",
    position: "relative",
  },
  bottomImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
    bottom: 0,
    transform: [{ translateY: -510 }],
  },
});
