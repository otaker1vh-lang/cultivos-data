import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  RefreshControl 
} from "react-native";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import GanttFenologico from '../components/GanttFenologico';
import CultivoDataManager from '../utils/CultivoDataManager';

export default function FenologiaScreen({ route }) {
  const { cultivo } = route.params;
  
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modoDetallado, setModoDetallado] = useState(false); 
  
  const [regionSeleccionada, setRegionSeleccionada] = useState(null);

  useEffect(() => {
    cargarDatos(false);
  }, [cultivo]);

  // --- FUNCIÓN DE CARGA OPTIMIZADA Y SEGURA ---
  const cargarDatos = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) setLoading(true);
      
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo', forceRefresh);
      
      if (data && data._nivel === 'completo') {
        setCultivoData(data);
        setModoDetallado(true);
        
        // Selección automática y segura de la primera región (soporta Array u Objeto)
        const calendarios = data.calendarios_regionales || data.calendarios;
        if (calendarios && typeof calendarios === 'object') {
          if (Array.isArray(calendarios) && calendarios.length > 0) {
             setRegionSeleccionada(0); // Usa el índice si es Array
          } else {
             const keys = Object.keys(calendarios);
             if (keys.length > 0) setRegionSeleccionada(keys[0]); // Usa la llave si es Objeto
          }
        }
      } else if (data) {
        setCultivoData(data);
        setModoDetallado(false);
      }
    } catch (error) {
      console.error("Error cargando fenología:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // --- HELPER UNIVERSAL PARA TEXTO SEGURO ---
  const safeText = (val) => {
    if (val === null || val === undefined) return 'N/A';
    if (Array.isArray(val)) return val.join(' a ');
    if (typeof val === 'object') return Object.values(val).map(v => typeof v === 'object' ? 'Ver detalle' : String(v)).join(' a ');
    return String(val);
  };

  // --- SECCIONES DE RENDERIZADO BLINDADAS ---

  const renderCalendarios = () => {
    const calendariosRaw = cultivoData?.calendarios_regionales || cultivoData?.calendarios;
    if (!calendariosRaw || typeof calendariosRaw !== 'object') return null;

    // Normalizar regiones: Transforma a un formato estándar sin importar si Firebase envió Array u Objeto
    const esArray = Array.isArray(calendariosRaw);
    const regiones = esArray 
      ? calendariosRaw.map((item, index) => ({ id: index, nombre: item?.region || `Región ${index + 1}`, data: item }))
      : Object.entries(calendariosRaw).map(([key, value]) => ({ id: key, nombre: key, data: value }));

    if (regiones.length === 0) return null;

    const dataRegionActiva = regiones.find(r => r.id === regionSeleccionada)?.data;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Calendarios de Siembra</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorRegiones}>
          {regiones.map((reg) => (
            <TouchableOpacity 
              key={reg.id}
              style={[styles.regionChip, regionSeleccionada === reg.id && styles.regionChipActive]}
              onPress={() => setRegionSeleccionada(reg.id)}
            >
              <Text style={[styles.regionChipText, regionSeleccionada === reg.id && styles.regionChipTextActive]}>
                {reg.nombre}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        // Corrección: Validar solo que haya datos en la región
        {dataRegionActiva && (
          <View style={styles.regionCard}>
            <View style={styles.dateRow}>
              <MaterialCommunityIcons name="calendar-import" size={20} color="#2E7D32" />
              <Text style={styles.dateText}>
                Siembra: {safeText(dataRegionActiva.siembra_inicio)} - {safeText(dataRegionActiva.siembra_fin)}
              </Text>
            </View>
            <View style={styles.dateRow}>
              <MaterialCommunityIcons name="calendar-check" size={20} color="#1565C0" />
              <Text style={styles.dateText}>
                Cosecha: {safeText(dataRegionActiva.cosecha_inicio)} - {safeText(dataRegionActiva.cosecha_fin)}
              </Text>
            </View>

            {/* Validar la altitud individualmente de forma opcional */}
            {dataRegionActiva.altitud_msnm && (
                <View style={styles.dateRow}>
                <MaterialCommunityIcons name="terrain" size={20} color="#795548" />
                  <Text style={styles.dateText}>
                    Altitud: {safeText(dataRegionActiva.altitud_msnm)} msnm
                  </Text>
                </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderBBCH = () => {
    const bbch = cultivoData?.bbch_detallado;
    if (!bbch) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Escala Científica BBCH</Text>
        
        {/* Validar si es Objeto, Array, o texto simple */}
        {typeof bbch === 'object' && !Array.isArray(bbch) ? (
          Object.entries(bbch).map(([fase, info], index) => {
            if (!info) return null;
            const codigo = typeof info === 'object' ? (info.codigo_bbch || fase) : fase;
            const desc = typeof info === 'object' ? (info.descripcion_tecnica || info.descripcion) : String(info);
            return (
              <View key={index} style={styles.bbchItem}>
                <Text style={styles.bbchCode}>Etapa {codigo}</Text>
                <Text style={styles.bbchDesc}>{safeText(desc)}</Text>
              </View>
            );
          })
        ) : Array.isArray(bbch) ? (
          bbch.map((info, index) => {
             if (!info) return null;
             const codigo = typeof info === 'object' ? (info.codigo_bbch || info.etapa || index) : index;
             const desc = typeof info === 'object' ? (info.descripcion_tecnica || info.descripcion || '') : String(info);
             return (
               <View key={index} style={styles.bbchItem}>
                 <Text style={styles.bbchCode}>Etapa {codigo}</Text>
                 <Text style={styles.bbchDesc}>{safeText(desc)}</Text>
               </View>
             );
          })
        ) : (
           <Text style={styles.bbchDesc}>{String(bbch)}</Text>
        )}
      </View>
    );
  };

  const renderAlertas = () => {
    const alertasRaw = cultivoData?.alertas_riesgos || cultivoData?.riesgos_detallados;
    if (!alertasRaw) return null;

    // Normalizar a Array siempre
    const alertasList = Array.isArray(alertasRaw) 
      ? alertasRaw 
      : (typeof alertasRaw === 'object' && alertasRaw !== null ? Object.values(alertasRaw) : [alertasRaw]);

    if (alertasList.length === 0) return null;

    return (
      <View style={[styles.section, styles.alertBox]}>
        <View style={styles.alertHeader}>
          <MaterialCommunityIcons name="shield-alert" size={24} color="#E65100" />
          <Text style={styles.alertTitle}>Riesgos por Etapa</Text>
        </View>
        {alertasList.map((valor, i) => {
          const textoAlerta = typeof valor === 'string' 
            ? valor 
            : (valor?.riesgo || valor?.descripcion || valor?.nombre_plaga || 'Alerta agronómica');
          
          return (
            <Text key={i} style={styles.alertText}>• {textoAlerta}</Text>
          );
        })}
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

      {/* COMPONENTE GANTT: Se asume que este componente tiene sus propias validaciones internas */}
      {cultivoData?.ciclo_fenologico && (
        <View style={styles.card}>
          <GanttFenologico datos={cultivoData.ciclo_fenologico} />
        </View>
      )}

      <View style={styles.content}>
        {renderCalendarios()}
        {renderBBCH()}
        {renderAlertas()}
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