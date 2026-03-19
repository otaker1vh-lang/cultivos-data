import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
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

// Componente para chips de filtro (Preservado intacto)
const FilterChip = ({ label, selected, onPress, icon }) => (
  <TouchableOpacity 
    style={[styles.filterChip, selected && styles.filterChipSelected]} 
    onPress={onPress}
  >
    {icon && <MaterialCommunityIcons name={icon} size={16} color={selected ? "#fff" : "#555"} style={{marginRight: 4}} />}
    <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
  </TouchableOpacity>
);

// --- HELPER UNIVERSAL PARA TEXTO SEGURO ---
// Extraído para limpiar el Modal y prevenir el error [object Object]
const safeText = (val) => {
  if (val === null || val === undefined) return 'No especificado.';
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  
  if (Array.isArray(val)) {
    return val.map(v => typeof v === 'object' && v !== null ? 'Detalle estructurado (ver anexo)' : String(v)).join(', ');
  }
  
  if (typeof val === 'object' && val !== null) {
    return Object.values(val).map(v => typeof v === 'object' && v !== null ? 'Dato complejo' : String(v)).join(' / ');
  }
  
  return String(val);
};

export default function PlagasScreen({ route }) {
  const { cultivo } = route.params;

  // --- ESTADOS ---
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [plagasFull, setPlagasFull] = useState([]); 
  const [filteredPlagas, setFilteredPlagas] = useState([]);
  
  // Estados para Búsqueda y Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('Todos'); 
  
  // Estado para el Modal de Detalle
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPlaga, setSelectedPlaga] = useState(null);

  useEffect(() => {
    cargarPlagas();
  }, [cultivo]);

  useEffect(() => {
    aplicarFiltros();
  }, [searchQuery, activeFilter, plagasFull]);

  // --- FUNCIONES DE CARGA Y MANEJO DE DATOS BLINDADAS ---
  const cargarPlagas = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo', isRefreshing);
      
      // Búsqueda profunda: A veces los JSON varían su estructura. Buscamos en las 3 llaves más comunes.
      const riesgosBrutos = data?.riesgos_detallados || data?.plagas_enfermedades || data?.sanidad?.principales_plagas_enfermedades;

      if (riesgosBrutos && typeof riesgosBrutos === 'object') {
        const plagasArray = Array.isArray(riesgosBrutos) 
          ? riesgosBrutos 
          : Object.keys(riesgosBrutos).map(key => ({
              nombre: key,
              // Si el valor es un objeto, lo esparcimos. Si es un string, lo asignamos a descripción.
              ...(typeof riesgosBrutos[key] === 'object' && riesgosBrutos[key] !== null ? riesgosBrutos[key] : { descripcion: riesgosBrutos[key] })
            }));
        
        setPlagasFull(plagasArray);
      } else {
        setPlagasFull([]);
      }
    } catch (error) {
      Alert.alert("Error", "No se pudieron cargar los riesgos biológicos.");
    } finally {
      setLoading(false);
      if (isRefreshing) setRefreshing(false);
    }
  };

  const aplicarFiltros = () => {
    let result = plagasFull;

    // 1. Filtro por Tipo (Plaga vs Enfermedad) asegurando que 'tipo' sea un string
    if (activeFilter !== 'Todos') {
      result = result.filter(item => 
        item.tipo && typeof item.tipo === 'string' && item.tipo.toLowerCase().includes(activeFilter.toLowerCase())
      );
    }

    // 2. Filtro por Búsqueda de Texto asegurando lectura segura
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => {
        const nom = item.nombre && typeof item.nombre === 'string' ? item.nombre.toLowerCase() : '';
        const cien = item.nombre_cientifico && typeof item.nombre_cientifico === 'string' ? item.nombre_cientifico.toLowerCase() : '';
        return nom.includes(query) || cien.includes(query);
      });
    }

    setFilteredPlagas(result);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    cargarPlagas(true);
  }, []);

  const abrirDetalle = (plaga) => {
    setSelectedPlaga(plaga);
    setModalVisible(true);
  };

  // --- RENDERIZADO DEL ITEM PARA EL FLATLIST OPTIMIZADO ---
  const renderPlagaItem = useCallback(({ item }) => {
    const isEnfermedad = item.tipo && typeof item.tipo === 'string' && item.tipo.toLowerCase().includes('enfermedad');
    const badgeColor = isEnfermedad ? '#FFEBEE' : '#FFF3E0';
    const badgeTextColor = isEnfermedad ? '#C62828' : '#EF6C00';

    return (
      <TouchableOpacity style={styles.plagaCard} onPress={() => abrirDetalle(item)}>
        <View style={styles.plagaInfo}>
          <Text style={styles.plagaNombre}>{safeText(item.nombre || 'Riesgo biológico')}</Text>
          {item.nombre_cientifico && typeof item.nombre_cientifico === 'string' && (
            <Text style={styles.plagaCientifico}>{item.nombre_cientifico}</Text>
          )}
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <Text style={{ color: badgeTextColor, fontSize: 12, fontWeight: 'bold' }}>
              {safeText(item.tipo || 'Riesgo General')}
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color="#CCC" />
      </TouchableOpacity>
    );
  }, []);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={{marginTop: 10, color: '#666'}}>Cargando riesgos biológicos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* --- BARRA DE BÚSQUEDA --- */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" />
        <TextInput 
          style={styles.searchInput}
          placeholder="Buscar plaga o enfermedad..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* --- CHIPS DE FILTRO --- */}
      <View style={styles.filterContainer}>
        <FilterChip 
          label="Todos" 
          selected={activeFilter === 'Todos'} 
          onPress={() => setActiveFilter('Todos')} 
        />
        <FilterChip 
          label="Plagas" 
          selected={activeFilter === 'Plaga'} 
          onPress={() => setActiveFilter('Plaga')} 
          icon="bug"
        />
        <FilterChip 
          label="Enfermedades" 
          selected={activeFilter === 'Enfermedad'} 
          onPress={() => setActiveFilter('Enfermedad')} 
          icon="bacteria"
        />
      </View>

      {/* --- LISTA DE PLAGAS CON FLATLIST --- */}
      <FlatList
        data={filteredPlagas}
        keyExtractor={(item, index) => String(item.nombre_cientifico || item.nombre || index)}
        renderItem={renderPlagaItem}
        contentContainerStyle={styles.listContent}
        initialNumToRender={10} 
        windowSize={5} 
        removeClippedSubviews={true} 
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2E7D32"]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="leaf-off" size={60} color="#CCC" />
            <Text style={styles.emptyText}>No se encontraron resultados para los filtros actuales.</Text>
          </View>
        }
      />

      {/* --- MODAL DE DETALLE BLINDADO --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalles del Riesgo</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>
            
            {selectedPlaga && (
              <FlatList
                data={[{key: 'content'}]}
                renderItem={() => (
                  <View style={{ padding: 20 }}>
                    <Text style={styles.detailNombre}>{safeText(selectedPlaga.nombre)}</Text>
                    {selectedPlaga.nombre_cientifico && (
                      <Text style={styles.detailCientifico}>{safeText(selectedPlaga.nombre_cientifico)}</Text>
                    )}
                    
                    {/* Renderizado Seguro usando el Helper */}
                    <Text style={styles.label}>Síntomas Visuales:</Text>
                    <Text style={styles.description}>
                      {safeText(selectedPlaga.sintomas_visuales || selectedPlaga.descripcion || selectedPlaga.daños)}
                    </Text>
                    
                    {selectedPlaga.medidas_control && (
                      <>
                        <Text style={styles.label}>Medidas de Control:</Text>
                        <Text style={styles.description}>
                          {safeText(selectedPlaga.medidas_control || selectedPlaga.control)}
                        </Text>
                      </>
                    )}

                    {selectedPlaga.umbral_economico && (
                      <>
                        <Text style={styles.label}>Umbral Económico:</Text>
                        <Text style={styles.description}>
                          {safeText(selectedPlaga.umbral_economico)}
                        </Text>
                      </>
                    )}

                    {selectedPlaga.perdida_potencial && (
                      <>
                        <Text style={styles.label}>Pérdida Potencial:</Text>
                        <Text style={styles.description}>
                          {safeText(selectedPlaga.perdida_potencial)}
                        </Text>
                      </>
                    )}
                  </View>
                )}
                keyExtractor={item => item.key}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 15, paddingHorizontal: 15, borderRadius: 12, elevation: 2, height: 50 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
  filterContainer: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 10 },
  filterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
  filterChipSelected: { backgroundColor: '#2E7D32' },
  filterText: { color: '#555', fontWeight: '600' },
  filterTextSelected: { color: '#fff' },
  listContent: { padding: 15, paddingBottom: 30 },
  plagaCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, elevation: 1 },
  plagaInfo: { flex: 1 },
  plagaNombre: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  plagaCientifico: { fontSize: 13, fontStyle: 'italic', color: '#666', marginBottom: 5 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 50 },
  emptyText: { color: '#999', fontSize: 16, textAlign: 'center', marginTop: 15 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, height: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  detailNombre: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  detailCientifico: { fontSize: 16, fontStyle: 'italic', color: '#666', marginBottom: 15 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 15, marginBottom: 5 },
  description: { fontSize: 15, color: '#555', lineHeight: 22 },
});