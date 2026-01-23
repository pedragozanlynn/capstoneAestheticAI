import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  SafeAreaView
} from "react-native";
import { db } from "../../config/firebase";
import BottomNavbar from "../components/BottomNav";
import ConsultantDetailsModal from "../components/ConsultantDetailsModal";

export default function Consultantst() {
  const [consultants, setConsultants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedConsultant, setSelectedConsultant] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    const fetchConsultants = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "consultants"));
        const list = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setConsultants(list);
      } catch (error) {
        Alert.alert("Error", "Failed to load consultant data.");
      } finally {
        setLoading(false);
      }
    };
    fetchConsultants();
  }, []);

  const filteredConsultants = consultants.filter((c) => {
    if (activeFilter === "all") return true;
    return c.status === activeFilter;
  });

  const openModal = (consultant) => {
    setSelectedConsultant(consultant);
    setModalVisible(true);
  };

  const handleStatusUpdated = (id, status) => {
    setConsultants((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c))
    );
    setSelectedConsultant((prev) =>
      prev?.id === id ? { ...prev, status } : prev
    );
    if (status === "accepted") {
      setActiveFilter("accepted");
    }
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <SafeAreaView>
          <Text style={styles.headerTitle}>Consultant Hub</Text>
          <Text style={styles.headerSubtitle}>
            Manage consultant applications and profiles
          </Text>
        </SafeAreaView>
      </View>

      <View style={styles.filterWrapper}>
        <View style={styles.filterContainer}>
          {[
            { id: "all", label: "All" },
            { id: "pending", label: "Pending" },
            { id: "accepted", label: "Verified" }
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveFilter(tab.id)}
              style={[
                styles.filterTab,
                activeFilter === tab.id && styles.activeFilterTab,
              ]}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeFilter === tab.id && styles.activeFilterTabText,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color="#01579B" />
          <Text style={styles.loadingText}>Loading consultants...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {filteredConsultants.length > 0 ? (
            filteredConsultants.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.card}
                onPress={() => openModal(c)}
                activeOpacity={0.8}
              >
                <View style={styles.cardInner}>
                  {/* Top Section */}
                  <View style={styles.topSection}>
                    <View style={styles.avatarContainer}>
                      <Ionicons name="person" size={24} color="#64748B" />
                    </View>
                    <View style={styles.infoContainer}>
                      <View style={styles.nameHeader}>
                        <Text style={styles.nameText}>{c.fullName}</Text>
                        {c.status === "accepted" && (
                          <Ionicons 
                            name="checkmark-circle" 
                            size={18} 
                            color="#2ecc71" 
                            style={{ marginLeft: 6 }} 
                          />
                        )}
                      </View>
                      <Text style={styles.emailText} numberOfLines={1}>{c.email}</Text>
                    </View>
                  </View>

                  {/* Divider Line */}
                  <View style={styles.divider} />

                  {/* Bottom Section */}
                  <View style={styles.bottomSection}>
                    <View style={[
                      styles.badge, 
                      { backgroundColor: c.status === "accepted" ? "#E8F5E9" : "#FFF3E0" }
                    ]}>
                      <View style={[
                        styles.statusDot, 
                        { backgroundColor: c.status === "accepted" ? "#2ecc71" : "#f39c12" }
                      ]} />
                      <Text style={[
                        styles.badgeText, 
                        { color: c.status === "accepted" ? "#1B5E20" : "#E65100" }
                      ]}>
                        {c.status === "accepted" ? "Verified Consultant" : "Pending Review"}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={60} color="#CBD5E1" />
              <Text style={styles.emptyText}>No consultants found.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {selectedConsultant && (
        <ConsultantDetailsModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          data={selectedConsultant}
          onStatusUpdated={handleStatusUpdated}
        />
      )}

      <BottomNavbar role="admin" />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#F8FAFC" },
  centerLoader: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#64748B", fontSize: 14, fontWeight: "500" },
  header: { backgroundColor: "#01579B", paddingTop: 50, paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 4 },
  filterWrapper: { paddingHorizontal: 20, marginTop: 15, marginBottom: 5 },
  filterContainer: { flexDirection: "row", backgroundColor: "#E2E8F0", borderRadius: 15, padding: 5 },
  filterTab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 12 },
  activeFilterTab: { backgroundColor: "#FFF", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  filterTabText: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  activeFilterTabText: { color: "#01579B" },
  scrollContent: { padding: 16, paddingBottom: 120 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  cardInner: { padding: 16 },
  topSection: { flexDirection: 'row', alignItems: 'center' },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  infoContainer: { flex: 1, marginLeft: 14 },
  nameHeader: { flexDirection: 'row', alignItems: 'center' },
  nameText: { fontSize: 17, fontWeight: "700", color: "#1E293B", letterSpacing: -0.3 },
  emailText: { fontSize: 13, color: "#64748B", marginTop: 2 },
  
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 14,
  },

  bottomSection: { flexDirection: 'row' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  badgeText: { fontSize: 10, fontWeight: "700", textTransform: 'uppercase', letterSpacing: 0.5 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText: { color: "#94A3B8", fontSize: 14, marginTop: 10, textAlign: 'center' },
});