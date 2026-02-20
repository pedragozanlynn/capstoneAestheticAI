import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  ImageBackground,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as NavigationBar from "expo-navigation-bar";
import Svg, { Path } from "react-native-svg";

const HERO_IMAGE = require("../assets/new_background.jpg");

const COLORS = {
  contentBg: "#F7F5F0",
  headerBg: "#FFFFFF",
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [role, setRole] = useState("user");

  // ✅ NEW: real Android navbar height (fix white strip)
  const [navBarH, setNavBarH] = useState(0);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 900,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // ✅ Edge-to-edge: don't call setBackgroundColorAsync (warns)
  useEffect(() => {
    if (Platform.OS !== "android") return;

    (async () => {
      try {
        await NavigationBar.setButtonStyleAsync("dark");

        // ✅ NEW: get nav bar height so we can paint behind it
        const h = await NavigationBar.getHeightAsync();
        setNavBarH(typeof h === "number" ? h : 0);
      } catch {
        setNavBarH(0);
      }
    })();
  }, []);

  const HEADER_H = clamp(Math.round(H * 0.34), 240, 320);
  const HERO_EXTRA = Math.round(H * 0.22);
  const HERO_SHIFT_Y = -Math.round(HEADER_H * 0.22);

  const BRAND_FS = clamp(Math.round(W * 0.12), 38, 52);
  const TITLE_FS = clamp(Math.round(W * 0.038), 13, 16);
  const TAGLINE_FS = clamp(Math.round(W * 0.042), 14, 17);

  const goToLogin = () => router.push({ pathname: "/Login", params: { role } });
  const goToAdminLogin = () => router.push("/Admin/Login");

  // ✅ NEW: ensure we fill at least nav bar height
  const bottomFillH = Math.max(insets.bottom || 0, navBarH || 0);

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={[styles.header, { height: HEADER_H }]}>
        <ImageBackground
          source={HERO_IMAGE}
          resizeMode="cover"
          style={styles.heroBg}
          imageStyle={{
            height: HEADER_H + HERO_EXTRA,
            transform: [{ translateY: HERO_SHIFT_Y }],
          }}
        />
      </View>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={[styles.waveTop, { width: W }]}>
          <Svg height={100} width={W} viewBox={`0 0 ${W} 100`}>
            <Path
              d={`M0 40 Q ${W / 4} 0, ${W / 2} 40 T ${W} 40 V100 H0 Z`}
              fill={COLORS.contentBg}
            />
          </Svg>
        </View>

        <View style={styles.contentInner}>
          <Text style={[styles.title, { fontSize: TITLE_FS }]} allowFontScaling={false}>
            Welcome to
          </Text>

          <Text
            style={[styles.brand, { fontSize: BRAND_FS }]}
            allowFontScaling={false}
            numberOfLines={1}
          >
            AestheticAI
          </Text>

          <Text
            style={[styles.tagline, { fontSize: TAGLINE_FS }]}
            allowFontScaling={false}
            onLongPress={goToAdminLogin}
          >
            Your dream space starts here
          </Text>

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            Continue as
          </Text>

          <View style={styles.tabWrap}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setRole("user")}
              style={[styles.tab, role === "user" && styles.tabActive]}
            >
              <Text
                style={[styles.tabText, role === "user" && styles.tabTextActive]}
                allowFontScaling={false}
              >
                User
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setRole("consultant")}
              style={[styles.tab, role === "consultant" && styles.tabActive]}
            >
              <Text
                style={[styles.tabText, role === "consultant" && styles.tabTextActive]}
                allowFontScaling={false}
              >
                Consultant
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.button, styles.primaryButton]}
            onPress={goToLogin}
          >
            <Text style={styles.primaryText} allowFontScaling={false}>
              Continue
            </Text>
          </TouchableOpacity>

          <View style={styles.footerContainer}>
            <Text style={styles.footer} allowFontScaling={false}>
              © 2025 AestheticAI
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* ✅ paints behind Android navbar / iOS home indicator */}
      <View style={[styles.bottomFiller, { height: bottomFillH }]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.contentBg },

  header: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: COLORS.headerBg,
  },
  heroBg: { flex: 1 },

  content: {
    flex: 1,
    backgroundColor: COLORS.contentBg,
    paddingHorizontal: 25,
    paddingTop: 25,
    paddingBottom: 16,
    alignItems: "center",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 12,
  },

  waveTop: { position: "absolute", top: -64, left: 0 },

  contentInner: {
    paddingTop: 15,
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },

  title: {
    fontWeight: "700",
    color: "#2B2B2B",
    letterSpacing: 3.2,
    opacity: 0.9,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 6,
  },
  brand: {
    fontWeight: "900",
    color: "#8F2F52",
    marginVertical: 6,
    letterSpacing: 1.2,
    fontFamily: "serif",
    maxWidth: "94%",
    textAlign: "center",
  },
  tagline: {
    fontStyle: "italic",
    color: "#6B6B6B",
    textAlign: "center",
    opacity: 0.95,
    lineHeight: 23,
    marginBottom: 18,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#2C4F4F",
    marginBottom: 12,
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },

  tabWrap: {
    width: "92%",
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    padding: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: "#2C4F4F",
    shadowColor: "#2C4F4F",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  tabText: { fontSize: 16, fontWeight: "800", color: "#2C4F4F", letterSpacing: 0.6 },
  tabTextActive: { color: "#FFFFFF" },

  button: {
    width: "92%",
    paddingVertical: 18,
    borderRadius: 30,
    marginVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: "#3FA796",
    shadowColor: "#3FA796",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  primaryText: { color: "#FFFFFF", fontWeight: "900", fontSize: 18, letterSpacing: 1 },

  footerContainer: { marginTop: 14, paddingTop: 6 },
  footer: {
    color: "#6B6B6B",
    fontSize: 12.5,
    letterSpacing: 0.4,
    opacity: 0.85,
    textAlign: "center",
  },

  bottomFiller: { backgroundColor: COLORS.contentBg },
});
