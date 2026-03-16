import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  Alert,
  RefreshControl 
} from "react-native";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GanttFenologico from '../components/GanttFenologico';
import CultivoDataManager from '../utils/CultivoDataManager';

// --- SE ELIMINARON LAS IMPORTACIONES DIRECTAS DE FIREBASE PARA USAR EL MANAGER ---

export default function FenologiaScreen({ route }) {
  const { cultivo } = route.params;
  const CACHE_KEY = `@fenologia_data_${cultivo}`;
  
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingCompleto, setLoadingCompleto] = useState(false);
  const [modoDetallado, setModoDetallado] = useState(false); 
  
  const [regionSeleccionada, setRegionSeleccionada] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  // --- FUNCIÓN DE CARGA PRESERVADA Y OPTIMIZADA ---
  const cargarDatos = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) setLoading(true);
      
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
      
      if (data && data._nivel === 'completo') {
        setCultivoData(data);
        setModoDetallado(true);
        // Selección automática de la primera región del Master
        const regiones = data.calendarios_regionales || data.calendarios;
        if (regiones && Object.keys(regiones).length > 0) {
          setRegionSeleccionada(Object.keys(regiones)[0]);
        }
      } else {
        const basico = await CultivoDataManager.obtenerCultivo(cultivo, 'basico');
        setCultivoData(basico);
        setModoDetallado(false);
      }
    } catch (error) {
      console.error("Error cargando fenología:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // --- SECCIONES DE RENDERIZADO CON RUTAS CORREGIDAS PARA MASTER V4 ---

  const renderCalendarios = () => {
    // CORRECCIÓN DE RUTA: calendarios_regionales
    const calendarios = cultivoData?.calendarios_regionales || cultivoData?.calendarios;
    if (!calendarios) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Calendarios de Siembra</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorRegiones}>
          {Object.keys(calendarios).map((reg) => (
            <TouchableOpacity 
              key={reg}
              style={[styles.regionChip, regionSeleccionada === reg && styles.regionChipActive]}
              onPress={() => setRegionSeleccionada(reg)}
            >
              <Text style={[styles.regionChipText, regionSeleccionada === reg && styles.regionChipTextActive]}>
                {reg}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {regionSeleccionada && calendarios[regionSeleccionada] && (
          <View style={styles.regionCard}>
            <View style={styles.dateRow}>
              <MaterialCommunityIcons name="calendar-import" size={20} color="#2E7D32" />
              <Text style={styles.dateText}>Siembra: {calendarios[regionSeleccionada].siembra}</Text>
            </View>
            <View style={styles.dateRow}>
              <MaterialCommunityIcons name="calendar-check" size={20} color="#1565C0" />
              <Text style={styles.dateText}>Cosecha: {calendarios[regionSeleccionada].cosecha}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderBBCH = () => {
    // NUEVA SECCIÓN: bbch_detallado (Dato científico del Master)
    const bbch = cultivoData?.bbch_detallado;
    if (!bbch) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Escala Científica BBCH</Text>
        {Object.entries(bbch).map(([fase, info], index) => (
          <View key={index} style={styles.bbchItem}>
            <Text style={styles.bbchCode}>Etapa {info.codigo_bbch || fase}</Text>
            <Text style={styles.bbchDesc}>{info.descripcion_tecnica || info.descripcion}</Text>
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text>Cargando ciclo fenológico...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => cargarDatos(true)} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Ciclo de Vida</Text>
        <Text style={styles.subtitle}>{cultivo}</Text>
      </View>

      {/* COMPONENTE GANTT (Corregido para leer ciclo_fenologico) */}
      {cultivoData?.ciclo_fenologico && (
        <View style={styles.card}>
          <GanttFenologico datos={cultivoData.ciclo_fenologico} />
        </View>
      )}

      <View style={styles.content}>
        {renderCalendarios()}
        {renderBBCH()}
        
        {/* ALERTAS CORREGIDAS */}
        {cultivoData?.alertas_riesgos && (
          <View style={[styles.section, styles.alertBox]}>
            <View style={styles.alertHeader}>
              <MaterialCommunityIcons name="shield-alert" size={24} color="#E65100" />
              <Text style={styles.alertTitle}>Riesgos por Etapa</Text>
            </View>
            {Object.entries(cultivoData.alertas_riesgos).map(([key, valor], i) => (
              <Text key={i} style={styles.alertText}>• {valor.descripcion || valor}</Text>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { padding: 20, backgroundColor: '#2E7D32' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 16, color: '#E8F5E9' },
  card: { margin: 15, padding: 10, backgroundColor: '#fff', borderRadius: 15, elevation: 4 },
  content: { padding: 15 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  selectorRegiones: { flexDirection: 'row', marginBottom: 10 },
  regionChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5F5F5', marginRight: 10, borderWidth: 1, borderColor: '#DDD' },
  regionChipActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  regionChipText: { color: '#666' },
  regionChipTextActive: { color: '#fff', fontWeight: 'bold' },
  regionCard: { backgroundColor: '#F9F9F9', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0' },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dateText: { marginLeft: 10, fontSize: 15, color: '#444' },
  bbchItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  bbchCode: { fontWeight: 'bold', color: '#2E7D32', fontSize: 14 },
  bbchDesc: { fontSize: 13, color: '#666', marginTop: 2 },
  alertBox: { backgroundColor: '#FFF3E0', padding: 15, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: '#EF6C00' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  alertTitle: { fontSize: 16, fontWeight: 'bold', color: '#E65100', marginLeft: 10 },
  alertText: { fontSize: 13, color: '#5D4037', marginBottom: 5 }
});