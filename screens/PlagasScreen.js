import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator, 
  TouchableOpacity, 
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import CultivoDataManager from "../utils/CultivoDataManager";

// Componente para chips de filtro (Preservado)
const FilterChip = ({ label, selected, onPress, icon }) => (
  <TouchableOpacity 
    style={[styles.filterChip, selected && styles.filterChipSelected]} 
    onPress={onPress}
  >
    {icon && <MaterialCommunityIcons name={icon} size={16} color={selected ? "#fff" : "#555"} style={{marginRight: 4}} />}\
    <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
  </TouchableOpacity>
);

export default function PlagasScreen({ route }) {
  const { cultivo } = route.params;

  // --- ESTADOS ---
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [plagasFull, setPlagasFull] = useState([]); // Lista normalizada
  const [filteredPlagas, setFilteredPlagas] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('Todos');
  const [selectedPlaga, setSelectedPlaga] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  // --- LÓGICA DE CARGA CORREGIDA ---
  const cargarDatos = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) setLoading(true);
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
      
      // CORRECCIÓN DE RUTA: riesgos_detallados
      const riesgosRaw = data?.riesgos_detallados || data?.plagas_detalladas || {};
      
      // NORMALIZACIÓN: Convertir Objeto de Firebase a Array para .filter() y .map()
      const listaNormalizada = Object.keys(riesgosRaw).map(key => ({
        id: key,
        ...riesgosRaw[key]
      }));

      setPlagasFull(listaNormalizada);
      setFilteredPlagas(listaNormalizada);
    } catch (error) {
      console.error("Error en PlagasScreen:", error);
      Alert.alert("Error", "No se pudieron sincronizar los riesgos detallados.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // --- FUNCIONES DE FILTRADO (Preservadas y Optimizadas) ---
  useEffect(() => {
    let result = plagasFull;
    if (filterType !== 'Todos') {
      result = result.filter(p => p.tipo === filterType);
    }
    if (searchQuery) {
      result = result.filter(p => 
        p.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.nombre_cientifico?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredPlagas(result);
  }, [searchQuery, filterType, plagasFull]);

  const handleOpenDetail = (plaga) => {
    setSelectedPlaga(plaga);
    setModalVisible(true);
  };

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color="#2E7D32" /></View>
  );

  return (
    <View style={styles.container}>
      {/* BUSCADOR Y FILTROS */}
      <View style={styles.headerContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            placeholder="Buscar plaga o enfermedad..."
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <FilterChip label="Todos" selected={filterType === 'Todos'} onPress={() => setFilterType('Todos')} />
          <FilterChip label="Plagas" icon="bug" selected={filterType === 'Plaga'} onPress={() => setFilterType('Plaga')} />
          <FilterChip label="Enfermedades" icon="virus" selected={filterType === 'Enfermedad'} onPress={() => setFilterType('Enfermedad')} />
        </ScrollView>
      </View>

      <ScrollView 
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => cargarDatos(true)} />}
      >
        {filteredPlagas.map((item, index) => (
          <TouchableOpacity key={index} style={styles.plagaCard} onPress={() => handleOpenDetail(item)}>
            <View style={styles.plagaInfo}>
              <Text style={styles.plagaNombre}>{item.nombre}</Text>
              <Text style={styles.plagaCientifico}>{item.nombre_cientifico}</Text>
              <View style={[styles.badge, { backgroundColor: item.tipo === 'Plaga' ? '#E8F5E9' : '#FFF3E0' }]}>
                <Text style={{ color: item.tipo === 'Plaga' ? '#2E7D32' : '#E65100', fontSize: 11 }}>{item.tipo}</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#CCC" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* MODAL DE DETALLES - RUTAS ACTUALIZADAS PARA MASTER V4 */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalle del Riesgo</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={30} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ padding: 20 }}>
              <Text style={styles.detailNombre}>{selectedPlaga?.nombre}</Text>
              <Text style={styles.detailCientifico}>{selectedPlaga?.nombre_cientifico}</Text>
              
              <Text style={styles.label}>Descripción y Daños:</Text>
              <Text style={styles.detailText}>{selectedPlaga?.descripcion || selectedPlaga?.sintomas_danos}</Text>

              {/* CONTROLES CORREGIDOS (Ruta plana del Master V4) */}
              <View style={styles.controlSection}>
                <Text style={styles.label}>Control Orgánico / Biológico:</Text>
                <Text style={styles.detailText}>{selectedPlaga?.control_biologico || "No especificado"}</Text>
                
                <Text style={styles.label}>Control Químico Sugerido:</Text>
                <Text style={styles.detailText}>{selectedPlaga?.control_quimico || "Consulte a un especialista"}</Text>
              </View>

              <View style={styles.impactCard}>
                <Text style={styles.impactText}>Pérdidas potenciales: {selectedPlaga?.perdidas_potenciales_pct}%</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: { backgroundColor: '#fff', padding: 15, elevation: 2 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F0F0', borderRadius: 10, paddingHorizontal: 10, marginBottom: 12 },
  searchInput: { flex: 1, paddingVertical: 10, marginLeft: 10, fontSize: 15 },
  filterRow: { flexDirection: 'row' },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0', marginRight: 10 },
  filterChipSelected: { backgroundColor: '#2E7D32' },
  filterText: { color: '#555', fontSize: 13 },
  filterTextSelected: { color: '#fff', fontWeight: 'bold' },
  listContent: { padding: 15 },
  plagaCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, elevation: 1 },
  plagaInfo: { flex: 1 },
  plagaNombre: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  plagaCientifico: { fontSize: 13, fontStyle: 'italic', color: '#666', marginBottom: 5 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, height: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  detailNombre: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  detailCientifico: { fontSize: 16, fontStyle: 'italic', color: '#666', marginBottom: 15 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#333', marginTop: 15 },
  detailText: { fontSize: 14, color: '#555', lineHeight: 20, marginTop: 5 },
  controlSection: { backgroundColor: '#F9F9F9', padding: 15, borderRadius: 10, marginTop: 15 },
  impactCard: { marginTop: 20, padding: 15, backgroundColor: '#FFEBEE', borderRadius: 10, alignItems: 'center' },
  impactText: { color: '#C62828', fontWeight: 'bold' }
});