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
import AsyncStorage from '@react-native-async-storage/async-storage';
import CultivoDataManager from "../utils/CultivoDataManager";

// Componente para chips de filtro
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

  // --- ESTADOS ORIGINALES ---
  const [loading, setLoading] = useState(true);
  const [loadingCompleto, setLoadingCompleto] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nivel, setNivel] = useState('basico');
  
  const [plagasList, setPlagasList] = useState([]);
  const [gddInfo, setGddInfo] = useState(null);
  const [filter, setFilter] = useState('todos');
  const [expandedId, setExpandedId] = useState(null);

  // --- NUEVOS ESTADOS PARA EDICIÓN ---
  const [modalVisible, setModalVisible] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editIndex, setEditIndex] = useState(-1);

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  // 1. LÓGICA DE CARGA HÍBRIDA CENTRALIZADA
  const cargarDatos = async () => {
    setLoading(true);
    try {
      // Todo pasa por el Manager: Caché -> Nube -> Local
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
      
      if (data) {
        procesarYSetearDatos(data);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } else {
        Alert.alert("Error", "No hay conexión ni datos locales disponibles.");
      }
    } catch (error) {
      console.log("Error al cargar datos, intentando fallback...", error);
      const datosLocales = await CultivoDataManager.obtenerCultivo(cultivo, 'basico');
      
      if (datosLocales) {
        procesarYSetearDatos(datosLocales);
      } else {
        Alert.alert("Error", "No se pudo cargar la información y no hay datos locales disponibles.");
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. DESCARGA MANUAL Y REFRESH
  const descargarDatosCompletos = async (fromRefresh = false) => {
    try {
      if (!fromRefresh) setLoadingCompleto(true);
      const datosCompletos = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
      
      if (datosCompletos) {
        if (datosCompletos.plagas_y_enfermedades || datosCompletos.grados_dia_desarrollo || datosCompletos.riesgos_detallados) {
            procesarYSetearDatos(datosCompletos);
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(datosCompletos));
            if (!fromRefresh) Alert.alert("Actualizado", "Base de datos técnica descargada correctamente.");
        } else {
            if (!fromRefresh) Alert.alert("Aviso", "No hay información adicional disponible.");
        }
      }
    } catch (err) {
      console.error("Error descarga:", err);
      Alert.alert("Error de Conexión", "No se pudo actualizar la información.");
    } finally {
      if (!fromRefresh) setLoadingCompleto(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await descargarDatosCompletos(true);
    setRefreshing(false);
  };

  // 3. PROCESAMIENTO
  const procesarYSetearDatos = (data) => {
    // A. Detectar GDD
    if (data.grados_dia_desarrollo) {
      setGddInfo(data.grados_dia_desarrollo);
    }

    // B. Detectar Lista de Plagas
    let rawList = [];
    if (data.riesgos_detallados) {
        rawList = Object.entries(data.riesgos_detallados).map(([key, value]) => ({ nombre: value.nombre || key, ...value }));
    } else if (data.plagas_detalladas) {
        rawList = data.plagas_detalladas;
    } else if (data.plagas_y_enfermedades) {
        rawList = data.plagas_y_enfermedades;
    } else if (data.plagas) {
        rawList = data.plagas;
    }

    // C. Normalización
    const listaNormalizada = rawList.map(item => {
        // 1. Síntomas (Corregido para evitar duplicar "descripción" como "síntomas")
        const sintomas = item.sintomas || item.sintomas_visuales || "";

        // 2. Condiciones
        let condiciones = item.condiciones_favorables || item.condiciones_desarrollo || "";
        if (typeof condiciones === 'object' && condiciones !== null) {
            const partes = [];
            if (condiciones.temperatura) {
                const t = condiciones.temperatura;
                partes.push(`Temp: ${t.minima || ''}-${t.maxima || ''}°C`);
            }
            if (condiciones.humedad_relativa) {
                const h = condiciones.humedad_relativa;
                partes.push(`HR: ${h.minima || ''}-${h.optima || ''}%`);
            }
            condiciones = partes.join(', ');
        }

        // 3. Manejo Integrado
        let manejo = item.manejo_integrado || {}; 
        
        if (typeof manejo !== 'object' || manejo === null) {
             manejo = {};
        }

        if (!manejo.cultural && item.control_cultural) {
            manejo.cultural = Array.isArray(item.control_cultural) ? item.control_cultural.join('. ') : item.control_cultural;
        }
        if (!manejo.biologico && item.control_biologico) {
            manejo.biologico = item.control_biologico;
        }
        
        if (!manejo.quimico && item.control_quimico) {
            if (Array.isArray(item.control_quimico)) {
                manejo.quimico = item.control_quimico.map(q => {
                    let texto = `• ${q.nombre_comercial || 'Producto'} (${q.ingrediente_activo || ''})`;
                    if (q.dosis) {
                        texto += `\n   ⚖️ Dosis: ${q.dosis}`;
                    }
                    return texto;
                }).join('\n');
            } else {
                manejo.quimico = item.control_quimico;
            }
        }
        
        // Procesar control general / recomendado (Corregido el parseo seguro de objetos desde la DB)
        let controlGeneral = item.control_recomendado;
        if (!controlGeneral && item.control) {
            if (typeof item.control === 'object') {
                const partesControl = [];
                if (item.control.mecanismo) partesControl.push(`Mecanismo: ${item.control.mecanismo}`);
                if (Array.isArray(item.control.productos_activos_mexico)) {
                    const prods = item.control.productos_activos_mexico.map(p => `• ${p.ingrediente} (${p.dosis_tipo || ''})`).join('\n');
                    partesControl.push(`Productos:\n${prods}`);
                }
                controlGeneral = partesControl.join('\n\n');
            } else {
                controlGeneral = item.control;
            }
        }

        if (controlGeneral) {
            manejo.general = controlGeneral;
        }

        return {
            ...item,
            sintomas, 
            condiciones_favorables: condiciones,
            manejo_integrado: manejo
        };
    });

    setPlagasList(listaNormalizada);

    // D. Nivel
    if (data.riesgos_detallados || data.plagas_detalladas || data.grados_dia_desarrollo) {
        setNivel('completo');
    } else {
        setNivel(listaNormalizada.length > 5 ? 'completo' : 'basico');
    }
  };

  // --- FUNCIONES DE EDICIÓN ---
  const abrirEditor = (item, index) => {
    setEditIndex(index);
    setEditItem({
        ...item,
        sintomasTexto: Array.isArray(item.sintomas) ? item.sintomas.join('\n') : item.sintomas,
        manejoQuimicoTexto: typeof item.manejo_integrado === 'object' ? item.manejo_integrado.quimico : item.manejo_integrado,
        manejoCulturalTexto: item.manejo_integrado?.cultural || '',
        manejoBiologicoTexto: item.manejo_integrado?.biologico || ''
    });
    setModalVisible(true);
  };

  const guardarCambios = async () => {
    if (editIndex === -1 || !editItem) return;

    const nuevaLista = [...plagasList];
    
    const itemActualizado = {
        ...nuevaLista[editIndex],
        nombre: editItem.nombre,
        descripcion: editItem.descripcion,
        sintomas: editItem.sintomasTexto, 
        condiciones_favorables: editItem.condiciones_favorables,
        manejo_integrado: {
            ...nuevaLista[editIndex].manejo_integrado,
            cultural: editItem.manejoCulturalTexto,
            biologico: editItem.manejoBiologicoTexto,
            quimico: editItem.manejoQuimicoTexto
        }
    };

    nuevaLista[editIndex] = itemActualizado;
    setPlagasList(nuevaLista);
    
    try {
        const dataToSave = {
            grados_dia_desarrollo: gddInfo,
            plagas_y_enfermedades: nuevaLista
        };
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(dataToSave));
        Alert.alert("Guardado", "Cambios guardados localmente.");
    } catch (e) {
        console.error("Error guardando:", e);
        Alert.alert("Error", "No se pudo guardar la edición.");
    }
    
    setModalVisible(false);
  };

  // Corregido el mapeo de filtros para adaptarse a cómo Firebase cataloga los tipos.
  const getFilteredList = () => {
    if (filter === 'todos') return plagasList;
    return plagasList.filter(item => {
      const tipoStr = (item.tipo || '').toLowerCase();
      if (filter === 'insecto') return tipoStr.includes('insecto') || tipoStr.includes('plaga');
      if (filter === 'hongo') return tipoStr.includes('hongo') || tipoStr.includes('enfermedad');
      return tipoStr.includes(filter.toLowerCase());
    });
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
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{flex: 1}}>
            <Text style={styles.title}>Plagas y Enfermedades</Text>
            <Text style={styles.subtitle}>{esCompleto ? "Guía Técnica (Editable)" : "Guía Básica"}</Text>
        </View>

        {esCompleto ? (
             <View style={[styles.badge, styles.badgeCompleto]}>
               <Text style={styles.badgeText}>✓ Completo</Text>
             </View>
        ) : (
             <TouchableOpacity 
                style={styles.btnDescargar} 
                onPress={() => descargarDatosCompletos()}
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

      {/* TARJETA GDD */}
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

      {/* FILTROS */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 15}}>
          <FilterChip label="Todos" selected={filter === 'todos'} onPress={() => setFilter('todos')} icon="view-grid" />
          <FilterChip label="Insectos" selected={filter === 'insecto'} onPress={() => setFilter('insecto')} icon="bug" />
          <FilterChip label="Hongos" selected={filter === 'hongo'} onPress={() => setFilter('hongo')} icon="mushroom" />
          <FilterChip label="Bacterias" selected={filter === 'bacteria'} onPress={() => setFilter('bacteria')} icon="bacteria" />
          <FilterChip label="Virus" selected={filter === 'virus'} onPress={() => setFilter('virus')} icon="virus" />
        </ScrollView>
      </View>

      {/* LISTA CON REFRESH CONTROL */}
      <ScrollView 
        style={styles.listContainer}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={["#D32F2F"]}
            tintColor="#D32F2F"
          />
        }
      >
        {filteredData.length > 0 ? (
          filteredData.map((item, index) => {
            const isExpanded = expandedId === item.nombre;
            
            let typeColor = '#757575';
            let typeIcon = 'alert-circle';
            const tipo = item.tipo ? item.tipo.toLowerCase() : '';

            if (tipo.includes('insecto') || tipo.includes('plaga')) { typeColor = '#E65100'; typeIcon = 'bug'; }
            else if (tipo.includes('hongo') || tipo.includes('enfermedad')) { typeColor = '#7B1FA2'; typeIcon = 'mushroom'; }
            else if (tipo.includes('bacteria')) { typeColor = '#0097A7'; typeIcon = 'bacteria'; }
            else if (tipo.includes('virus')) { typeColor = '#C62828'; typeIcon = 'virus'; }

            return (
              <View key={index} style={[styles.card, { borderLeftColor: typeColor }]}>
                {/* CABECERA */}
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
                    {item.nombre_cientifico && (
                      <Text style={styles.scientificName}>{item.nombre_cientifico}</Text>
                    )}
                    <Text style={[styles.plagaType, {color: typeColor}]}>{item.tipo || 'General'}</Text>
                  </View>
                  
                  {/* BOTÓN DE EDICIÓN */}
                  <TouchableOpacity style={styles.btnEditar} onPress={() => abrirEditor(item, index)}>
                    <MaterialCommunityIcons name="pencil-outline" size={22} color="#1976D2" />
                  </TouchableOpacity>

                  <MaterialCommunityIcons 
                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                    size={24} 
                    color="#999" 
                  />
                </TouchableOpacity>

                {/* CONTENIDO EXPANDIBLE */}
                {isExpanded && (
                  <View style={styles.cardBody}>
                    {item.descripcion && (
                      <Text style={styles.description}>{item.descripcion}</Text>
                    )}
                    <View style={styles.divider} />

                    {/* Síntomas */}
                    {item.sintomas !== "" && (
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionTitle}>
                          <MaterialCommunityIcons name="magnify" size={16} color="#555" /> Síntomas
                        </Text>
                        <Text style={styles.bodyText}>{Array.isArray(item.sintomas) ? item.sintomas.join('. ') : item.sintomas}</Text>
                      </View>
                    )}

                    {/* Condiciones */}
                    {item.condiciones_favorables && item.condiciones_favorables !== "" && (
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionTitle}>
                          <MaterialCommunityIcons name="weather-cloudy" size={16} color="#555" /> Condiciones
                        </Text>
                        <Text style={styles.bodyText}>{item.condiciones_favorables}</Text>
                      </View>
                    )}

                    {/* Manejo y DOSIS */}
                    {item.manejo_integrado ? (
                        <View style={styles.managementContainer}>
                          <Text style={styles.managementHeader}>🛡️ Control y Dosis</Text>
                          
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
                              <Text style={[styles.managementLabel, {color: '#D32F2F'}]}>🧪 Químico / Dosis:</Text>
                              <Text style={styles.managementText}>{item.manejo_integrado.quimico}</Text>
                            </View>
                          )}
                          
                          {item.manejo_integrado.general && (
                              <Text style={styles.managementText}>{item.manejo_integrado.general}</Text>
                          )}
                        </View>
                    ) : null}

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
        <View style={{height: 60}} />
      </ScrollView>

      {/* --- MODAL DE EDICIÓN --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Editar Información</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Ionicons name="close-circle" size={28} color="#ccc" />
                </TouchableOpacity>
            </View>
            
            <ScrollView style={{padding: 20}}>
                <Text style={styles.label}>Nombre:</Text>
                <TextInput style={styles.input} value={editItem?.nombre} onChangeText={t=>setEditItem({...editItem, nombre:t})} />
                
                <Text style={styles.label}>Descripción:</Text>
                <TextInput style={[styles.input, {height:60}]} multiline value={editItem?.descripcion} onChangeText={t=>setEditItem({...editItem, descripcion:t})} />
                
                <Text style={styles.label}>Síntomas:</Text>
                <TextInput style={[styles.input, {height:60}]} multiline value={editItem?.sintomasTexto} onChangeText={t=>setEditItem({...editItem, sintomasTexto:t})} />

                <Text style={styles.label}>Condiciones Favorables:</Text>
                <TextInput style={styles.input} value={editItem?.condiciones_favorables} onChangeText={t=>setEditItem({...editItem, condiciones_favorables:t})} />

                <View style={styles.divider}/>
                <Text style={[styles.label, {color:'#D32F2F'}]}>Control Químico y Dosis:</Text>
                <Text style={styles.helper}>Formato sugerido: Producto (Ingrediente) - Dosis: X</Text>
                <TextInput style={[styles.input, {height:80}]} multiline value={editItem?.manejoQuimicoTexto} onChangeText={t=>setEditItem({...editItem, manejoQuimicoTexto:t})} />

                <Text style={[styles.label, {color:'#2E7D32'}]}>Control Cultural:</Text>
                <TextInput style={[styles.input, {height:50}]} multiline value={editItem?.manejoCulturalTexto} onChangeText={t=>setEditItem({...editItem, manejoCulturalTexto:t})} />
                
                <View style={{height: 40}}/>
            </ScrollView>

            <TouchableOpacity style={styles.btnGuardar} onPress={guardarCambios}>
                <Text style={styles.btnGuardarText}>Guardar Cambios</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  btnEditar: { padding: 5, marginRight: 5 },

  cardBody: { paddingHorizontal: 15, paddingBottom: 15 },
  description: { fontSize: 14, color: '#444', lineHeight: 20, marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 8 },
  
  // Detalle Styles
  sectionBlock: { marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 6 },
  bodyText: { fontSize: 13, color: '#666', lineHeight: 19 },
  
  // Manejo Styles
  managementContainer: { backgroundColor: '#FAFAFA', padding: 12, borderRadius: 8, marginTop: 5 },
  managementHeader: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  managementRow: { marginBottom: 8 },
  managementLabel: { fontSize: 13, fontWeight: 'bold', color: '#444' },
  managementText: { fontSize: 13, color: '#555', marginTop: 1, lineHeight: 18 },

  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { marginTop: 10, color: '#999', fontSize: 14 },

  // Modal Styles
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '85%', paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: '#eee' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  label: { fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 10, marginBottom: 5 },
  helper: { fontSize: 12, color: '#888', fontStyle: 'italic', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#f9f9f9', fontSize: 14 },
  btnGuardar: { backgroundColor: '#1976D2', margin: 20, padding: 15, borderRadius: 10, alignItems: 'center' },
  btnGuardarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});