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

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" />
      
      {/* HEADER - FIXED POSITON */}
      <View style={styles.header}>
        <SafeAreaView>
          <Text style={styles.headerTitle}>Consultant Hub</Text>
          <Text style={styles.headerSubtitle}>
            Manage consultant applications and profiles
          </Text>
        </SafeAreaView>
      </View>

      {/* FILTER TABS - FIXED POSITION */}
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

      {/* CONDITIONAL CONTENT RENDERING */}
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
                activeOpacity={0.7}
              >
                <View style={[styles.statusStripe, { backgroundColor: c.status === "accepted" ? "#2ecc71" : "#f39c12" }]} />
                
                <View style={styles.cardContent}>
                  <View style={styles.avatarContainer}>
                    <Ionicons name="person-circle-outline" size={45} color="#2c4f4f" />
                  </View>

                  <View style={styles.leftInfo}>
                    <View style={styles.nameHeader}>
                      <Text style={styles.nameText}>{c.fullName}</Text>
                      {c.status === "accepted" && (
                        <Ionicons name="checkmark-circle" size={16} color="#2ecc71" style={{ marginLeft: 5 }} />
                      )}
                    </View>
                    <Text style={styles.emailText} numberOfLines={1}>{c.email}</Text>
                    
                    <View style={[styles.badge, { backgroundColor: c.status === "accepted" ? "#E8F5E9" : "#FFF3E0" }]}>
                       <Text style={[styles.badgeText, { color: c.status === "accepted" ? "#2E7D32" : "#E65100" }]}>
                         {c.status === "accepted" ? "Verified Consultant" : "Pending Review"}
                       </Text>
                    </View>
                  </View>

                  <View style={styles.rightAction}>
                    <View style={styles.iconCircle}>
                      <Ionicons name="chevron-forward" size={18} color="#01579B" />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={60} color="#CBD5E1" />
              <Text style={styles.emptyText}>No consultants found in this category.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {selectedConsultant && (
        <ConsultantDetailsModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          data={selectedConsultant}
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
  
  header: {
    backgroundColor: "#01579B",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#FFF" },
  headerSubtitle: { 
    fontSize: 14, 
    color: "rgba(255,255,255,0.7)", 
    marginTop: 4 
  },

  filterWrapper: {
    paddingHorizontal: 20,
    marginTop: 15,
    marginBottom: 5,
  },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 15,
    padding: 5,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  activeFilterTab: {
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  filterTabText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  activeFilterTabText: {
    color: "#01579B",
  },

  scrollContent: { padding: 16, paddingBottom: 120 }, // Added space for BottomNav
  
  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  statusStripe: { width: 5, height: '100%' },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    padding: 15,
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftInfo: { flex: 1 },
  nameHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  nameText: { fontSize: 17, fontWeight: "700", color: "#1E293B" },
  emailText: { fontSize: 13, color: "#64748B", marginBottom: 8 },
  
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: { fontSize: 9, fontWeight: "800", textTransform: 'uppercase' },

  rightAction: {
    paddingLeft: 10,
    justifyContent: 'center',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
});