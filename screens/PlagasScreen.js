import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator, 
  TouchableOpacity, 
  Alert 
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CultivoDataManager from "../utils/CultivoDataManager";

// Componente para chips de filtro (Optimizado)
const FilterChip = ({ label, selected, onPress, icon }) => (
  <TouchableOpacity 
    style={[styles.filterChip, selected && styles.filterChipSelected]} 
    onPress={onPress}
  >
    {icon && <MaterialCommunityIcons name={icon} size={16} color={selected ? "#fff" : "#555"} style={{marginRight: 4}} />}
    <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
  </TouchableOpacity>
);

export default function PlagasScreen({ route }) {
  const { cultivo } = route.params;
  const CACHE_KEY = `@plagas_data_${cultivo}`;

  // --- ESTADOS ---
  const [loading, setLoading] = useState(true);
  const [loadingCompleto, setLoadingCompleto] = useState(false); // Estado para el botón de descarga
  const [nivel, setNivel] = useState('basico'); // basico | completo
  
  const [plagasList, setPlagasList] = useState([]);
  const [gddInfo, setGddInfo] = useState(null); // Datos de Grados Día
  const [filter, setFilter] = useState('todos');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  // 1. LÓGICA DE CARGA HÍBRIDA (Caché + API)
  const cargarDatos = async () => {
    setLoading(true);
    try {
      // A. Carga rápida desde caché
      const datosGuardados = await AsyncStorage.getItem(CACHE_KEY);

      if (datosGuardados) {
        const parsedData = JSON.parse(datosGuardados);
        procesarYSetearDatos(parsedData);
        setLoading(false);
      }

      // B. Carga desde DataManager (Fallback o actualización básica)
      const datosBasicos = await CultivoDataManager.obtenerCultivo(cultivo, 'basico');
      
      if (datosBasicos) {
        // Solo sobrescribimos si no hay caché o si el caché es básico y queremos asegurar datos mínimos
        if (!datosGuardados || nivel === 'basico') {
            procesarYSetearDatos(datosBasicos);
            if (!datosGuardados) {
                await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(datosBasicos));
            }
        }
      }
    } catch (error) {
      console.error("Error cargando plagas:", error);
      Alert.alert("Error", "No se pudo cargar la información inicial.");
    } finally {
      setLoading(false);
    }
  };

  // 2. DESCARGA MANUAL DE DATOS COMPLETOS
  const descargarDatosCompletos = async () => {
    try {
      setLoadingCompleto(true);
      // Solicita explicitamente el paquete 'completo' al manager
      const datosCompletos = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
      
      if (datosCompletos) {
        // Validamos si realmente llegó información nueva (GDD o lista de plagas enriquecida)
        if (datosCompletos.plagas_y_enfermedades || datosCompletos.grados_dia_desarrollo) {
            procesarYSetearDatos(datosCompletos);
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(datosCompletos));
            Alert.alert("Actualizado", "Base de datos técnica descargada correctamente.");
        } else {
            Alert.alert("Aviso", "No hay información adicional disponible por el momento.");
        }
      }
    } catch (err) {
      console.error("Error descarga:", err);
      Alert.alert("Error de Conexión", "No se pudo descargar la información completa.");
    } finally {
      setLoadingCompleto(false);
    }
  };

  // 3. PROCESAMIENTO CENTRALIZADO DE DATOS
  const procesarYSetearDatos = (data) => {
    // A. Detectar GDD (Nueva estructura)
    if (data.grados_dia_desarrollo) {
      setGddInfo(data.grados_dia_desarrollo);
    }

    // B. Detectar Lista de Plagas (Prioridad: plagas_y_enfermedades > plagas)
    const lista = data.plagas_y_enfermedades || data.plagas || [];
    setPlagasList(lista);

    // C. Determinar si es Nivel Completo
    // Consideramos "Completo" si tiene la nueva estructura GDD o la lista enriquecida
    if (data.grados_dia_desarrollo || data.plagas_y_enfermedades) {
        setNivel('completo');
    } else {
        // Fallback: Si la lista es muy larga, asumimos que ya era completa en la versión anterior
        setNivel(lista.length > 5 ? 'completo' : 'basico');
    }
  };

  const getFilteredList = () => {
    if (filter === 'todos') return plagasList;
    return plagasList.filter(item => 
      item.tipo && item.tipo.toLowerCase().includes(filter.toLowerCase())
    );
  };

  const toggleExpand = (nombre) => {
    setExpandedId(expandedId === nombre ? null : nombre);
  };

  if (loading && plagasList.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#D32F2F" />
        <Text style={styles.loadingText}>Cargando guía sanitaria...</Text>
      </View>
    );
  }

  const filteredData = getFilteredList();
  const esCompleto = nivel === 'completo';

  return (
    <View style={styles.container}>
      {/* HEADER: Título y Botón de Descarga/Estado */}
      <View style={styles.header}>
        <View style={{flex: 1}}>
            <Text style={styles.title}>Plagas y Enfermedades</Text>
            <Text style={styles.subtitle}>{esCompleto ? "Guía Técnica Completa" : "Guía Básica"}</Text>
        </View>

        {esCompleto ? (
             <View style={[styles.badge, styles.badgeCompleto]}>
               <Text style={styles.badgeText}>✓ Completo</Text>
             </View>
        ) : (
             <TouchableOpacity 
                style={styles.btnDescargar} 
                onPress={descargarDatosCompletos}
                disabled={loadingCompleto}
             >
                {loadingCompleto ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <>
                        <Ionicons name="cloud-download-outline" size={16} color="#fff" style={{marginRight:4}} />
                        <Text style={styles.btnDescargarText}>Completar</Text>
                    </>
                )}
             </TouchableOpacity>
        )}
      </View>

      {/* TARJETA GDD: Solo se muestra si hay datos térmicos (Optimización) */}
      {gddInfo && (
        <View style={styles.gddCard}>
          <View style={styles.gddHeader}>
            <MaterialCommunityIcons name="thermometer-lines" size={24} color="#E65100" />
            <Text style={styles.gddTitle}>Parámetros Térmicos</Text>
          </View>
          <View style={styles.gddContent}>
            <View style={styles.gddItem}>
              <Text style={styles.gddLabel}>Base Térmica</Text>
              <Text style={styles.gddValue}>{gddInfo.base_termica}°C</Text>
            </View>
            <View style={styles.separatorVertical} />
            <View style={styles.gddItem}>
              <Text style={styles.gddLabel}>GDD Ciclo</Text>
              <Text style={styles.gddValue}>{gddInfo.gdd_ciclo_completo}</Text>
            </View>
          </View>
          {gddInfo.nota && (
             <Text style={styles.gddNote}>{gddInfo.nota}</Text>
          )}
        </View>
      )}

      {/* FILTROS DE CATEGORÍA */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 15}}>
          <FilterChip label="Todos" selected={filter === 'todos'} onPress={() => setFilter('todos')} icon="view-grid" />
          <FilterChip label="Insectos" selected={filter === 'insecto'} onPress={() => setFilter('insecto')} icon="bug" />
          <FilterChip label="Hongos" selected={filter === 'hongo'} onPress={() => setFilter('hongo')} icon="mushroom" />
          <FilterChip label="Bacterias" selected={filter === 'bacteria'} onPress={() => setFilter('bacteria')} icon="bacteria" />
          <FilterChip label="Virus" selected={filter === 'virus'} onPress={() => setFilter('virus')} icon="virus" />
        </ScrollView>
      </View>

      {/* LISTA DINÁMICA DE PLAGAS */}
      <ScrollView style={styles.listContainer}>
        {filteredData.length > 0 ? (
          filteredData.map((item, index) => {
            const isExpanded = expandedId === item.nombre;
            
            // Lógica automática de colores e iconos
            let typeColor = '#757575';
            let typeIcon = 'alert-circle';
            const tipo = item.tipo ? item.tipo.toLowerCase() : '';

            if (tipo.includes('insecto')) { typeColor = '#E65100'; typeIcon = 'bug'; }
            else if (tipo.includes('hongo')) { typeColor = '#7B1FA2'; typeIcon = 'mushroom'; }
            else if (tipo.includes('bacteria')) { typeColor = '#0097A7'; typeIcon = 'bacteria'; }
            else if (tipo.includes('virus')) { typeColor = '#C62828'; typeIcon = 'virus'; }

            return (
              <View key={index} style={[styles.card, { borderLeftColor: typeColor }]}>
                {/* CABECERA DE LA TARJETA */}
                <TouchableOpacity 
                  style={styles.cardHeader} 
                  onPress={() => toggleExpand(item.nombre)}
                  activeOpacity={0.7}
                >
                  <View style={styles.headerIconContainer}>
                    <MaterialCommunityIcons name={typeIcon} size={28} color={typeColor} />
                  </View>
                  <View style={{flex: 1, paddingRight: 10}}>
                    <Text style={styles.plagaName}>{item.nombre}</Text>
                    
                    {/* Renderizado condicional: Nombre Científico */}
                    {item.nombre_cientifico && (
                      <Text style={styles.scientificName}>{item.nombre_cientifico}</Text>
                    )}
                    
                    <Text style={[styles.plagaType, {color: typeColor}]}>{item.tipo || 'General'}</Text>
                  </View>
                  <MaterialCommunityIcons 
                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                    size={24} 
                    color="#999" 
                  />
                </TouchableOpacity>

                {/* CONTENIDO EXPANDIBLE */}
                {isExpanded && (
                  <View style={styles.cardBody}>
                    
                    {/* Descripción */}
                    {item.descripcion && (
                      <Text style={styles.description}>{item.descripcion}</Text>
                    )}

                    <View style={styles.divider} />

                    {/* Renderizado de Array: Síntomas */}
                    {item.sintomas && Array.isArray(item.sintomas) && item.sintomas.length > 0 ? (
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionTitle}>
                          <MaterialCommunityIcons name="magnify" size={16} color="#555" /> Síntomas
                        </Text>
                        {item.sintomas.map((sintoma, idx) => (
                          <View key={idx} style={styles.bulletRow}>
                            <Text style={styles.bulletPoint}>•</Text>
                            <Text style={styles.bulletText}>{sintoma}</Text>
                          </View>
                        ))}
                      </View>
                    ) : item.sintomas && typeof item.sintomas === 'string' && (
                        // Compatibilidad con datos antiguos (String)
                        <Text style={styles.description}>Síntomas: {item.sintomas}</Text>
                    )}

                    {/* Condiciones Favorables */}
                    {item.condiciones_favorables && (
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionTitle}>
                          <MaterialCommunityIcons name="weather-cloudy" size={16} color="#555" /> Condiciones Favorables
                        </Text>
                        <Text style={styles.bodyText}>{item.condiciones_favorables}</Text>
                      </View>
                    )}

                    {/* Manejo Integrado Desglosado */}
                    {item.manejo_integrado && typeof item.manejo_integrado === 'object' ? (
                      <View style={styles.managementContainer}>
                        <Text style={styles.managementHeader}>🛡️ Manejo Integrado</Text>
                        
                        {item.manejo_integrado.cultural && (
                          <View style={styles.managementRow}>
                            <Text style={styles.managementLabel}>🌱 Cultural:</Text>
                            <Text style={styles.managementText}>{item.manejo_integrado.cultural}</Text>
                          </View>
                        )}
                        
                        {item.manejo_integrado.biologico && (
                          <View style={styles.managementRow}>
                            <Text style={styles.managementLabel}>🐞 Biológico:</Text>
                            <Text style={styles.managementText}>{item.manejo_integrado.biologico}</Text>
                          </View>
                        )}
                        
                        {item.manejo_integrado.quimico && (
                          <View style={styles.managementRow}>
                            <Text style={styles.managementLabel}>🧪 Químico:</Text>
                            <Text style={styles.managementText}>{item.manejo_integrado.quimico}</Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      // Compatibilidad con datos antiguos (Texto plano)
                      item.manejo_integrado && (
                        <View style={styles.sectionBlock}>
                           <Text style={styles.sectionTitle}>🛡️ Manejo</Text>
                           <Text style={styles.bodyText}>{item.manejo_integrado}</Text>
                        </View>
                      )
                    )}

                  </View>
                )}
              </View>
            );
          })
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="check-circle-outline" size={60} color="#C8E6C9" />
            <Text style={styles.emptyText}>No se encontraron registros para este filtro.</Text>
          </View>
        )}
        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#666' },

  // Header y Badges
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#D32F2F' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeCompleto: { backgroundColor: '#4CAF50' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  btnDescargar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1976D2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginLeft: 10 },
  btnDescargarText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  // GDD Styles
  gddCard: { marginHorizontal: 15, marginTop: 15, marginBottom: 5, backgroundColor: '#FFF3E0', borderRadius: 10, padding: 15, borderWidth: 1, borderColor: '#FFE0B2' },
  gddHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  gddTitle: { fontSize: 16, fontWeight: 'bold', color: '#E65100', marginLeft: 8 },
  gddContent: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 8 },
  gddItem: { alignItems: 'center' },
  gddLabel: { fontSize: 12, color: '#E65100', marginBottom: 2 },
  gddValue: { fontSize: 18, fontWeight: 'bold', color: '#BF360C' },
  separatorVertical: { width: 1, height: 30, backgroundColor: '#FFCC80' },
  gddNote: { fontSize: 11, color: '#8D6E63', fontStyle: 'italic', textAlign: 'center', marginTop: 4 },

  // Filters
  filtersContainer: { marginTop: 10, marginBottom: 5, height: 40 },
  filterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  filterChipSelected: { backgroundColor: '#D32F2F', borderColor: '#D32F2F' },
  filterText: { fontSize: 13, color: '#555' },
  filterTextSelected: { color: '#fff', fontWeight: 'bold' },

  // List Cards
  listContainer: { paddingHorizontal: 15, paddingTop: 10 },
  card: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, borderLeftWidth: 5, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 15 },
  headerIconContainer: { marginRight: 15, width: 30, alignItems: 'center' },
  plagaName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  scientificName: { fontSize: 13, color: '#666', fontStyle: 'italic', marginBottom: 2 },
  plagaType: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },

  cardBody: { paddingHorizontal: 15, paddingBottom: 15 },
  description: { fontSize: 14, color: '#444', lineHeight: 20, marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 8 },
  
  // Detalle Styles
  sectionBlock: { marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 6 },
  bodyText: { fontSize: 13, color: '#666', lineHeight: 19 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  bulletPoint: { fontSize: 16, color: '#D32F2F', marginRight: 6, marginTop: -2 },
  bulletText: { fontSize: 13, color: '#666', flex: 1, lineHeight: 19 },

  // Manejo Styles
  managementContainer: { backgroundColor: '#FAFAFA', padding: 12, borderRadius: 8, marginTop: 5 },
  managementHeader: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  managementRow: { marginBottom: 8 },
  managementLabel: { fontSize: 13, fontWeight: 'bold', color: '#444' },
  managementText: { fontSize: 13, color: '#555', marginTop: 1, lineHeight: 18 },

  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { marginTop: 10, color: '#999', fontSize: 14 },
});