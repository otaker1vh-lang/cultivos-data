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

  const cargarDatos = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) setLoading(true);
      
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo', forceRefresh);
      
      // CORRECCIÓN: Manejo explícito para limpiar datos si Firebase devuelve null
      if (data && data._nivel === 'completo') {
        setCultivoData(data);
        setModoDetallado(true);

        const regionesDisponibles = data.calendarios_regionales 
          ? Object.keys(data.calendarios_regionales) 
          : [];

        if (regionesDisponibles.length > 0) {
          setRegionSeleccionada(regionesDisponibles[0]);
        }
        
        const calendarios = data.calendarios_regionales || data.calendarios;
        if (calendarios && typeof calendarios === 'object') {
          if (Array.isArray(calendarios) && calendarios.length > 0) {
             const primerCalendarioValido = calendarios.find(c => c !== null && c !== undefined);
             setRegionSeleccionada(primerCalendarioValido?.id || 0); 
          } else {
             const keys = Object.keys(calendarios);
             if (keys.length > 0) setRegionSeleccionada(keys[0]); 
          }
        }
      } else if (data) {
        setCultivoData(data);
        setModoDetallado(false);
      } else {
        // Si no hay data (falló Firebase y no hay datos locales)
        setCultivoData(null);
      }
    } catch (error) {
      console.error("Error cargando fenología:", error);
      setCultivoData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const safeText = (val) => {
    if (val === null || val === undefined || val === '') return 'N/A';
    if (Array.isArray(val)) return val.filter(Boolean).map(v => typeof v === 'object' ? 'Ver detalle' : String(v)).join(' a ');
    if (typeof val === 'object') return Object.values(val).filter(Boolean).map(v => typeof v === 'object' ? 'Ver detalle' : String(v)).join(' a ');
    return String(val);
  };

  const renderCalendarios = () => {
    const calendariosRaw = cultivoData?.calendarios_regionales || cultivoData?.calendarios;
    if (!calendariosRaw || typeof calendariosRaw !== 'object') return null;

    const esArray = Array.isArray(calendariosRaw);
    const regiones = esArray 
      ? calendariosRaw.map((item, index) => ({ id: item?.id || index, nombre: item?.region || `Región ${index + 1}`, data: item }))
      : Object.entries(calendariosRaw).map(([key, value]) => ({ id: key, nombre: key, data: value }));

    if (regiones.length === 0) return null;

    const dataRegionActiva = regiones.find(r => String(r.id) === String(regionSeleccionada))?.data;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Calendarios de Siembra</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorRegiones}>
          {regiones.map((reg) => (
            <TouchableOpacity 
              key={reg.id}
              style={[styles.regionChip, String(regionSeleccionada) === String(reg.id) && styles.regionChipActive]}
              onPress={() => setRegionSeleccionada(reg.id)}
            >
              <Text style={[styles.regionChipText, String(regionSeleccionada) === String(reg.id) && styles.regionChipTextActive]}>
                {reg.nombre}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {!!dataRegionActiva && (
          <View style={styles.regionCard}>
            <View style={styles.dateRow}>
              <MaterialCommunityIcons name="calendar-import" size={20} color="#2E7D32" />
              <Text style={styles.dateText}>
                Siembra: {safeText(dataRegionActiva?.siembra_inicio)} - {safeText(dataRegionActiva?.siembra_fin)}
              </Text>
            </View>
            <View style={styles.dateRow}>
              <MaterialCommunityIcons name="calendar-check" size={20} color="#1565C0" />
              <Text style={styles.dateText}>
                Cosecha: {safeText(dataRegionActiva?.cosecha_inicio)} - {safeText(dataRegionActiva?.cosecha_fin)}
              </Text>
            </View>

            {!!dataRegionActiva?.altitud_msnm && (
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
        
        {typeof bbch === 'object' && !Array.isArray(bbch) ? (
          Object.entries(bbch).map(([fase, info], index) => {
            if (!info) return null;
            const codigo = typeof info === 'object' ? (info.codigo_bbch || fase) : fase;
            const desc = typeof info === 'object' ? (info.descripcion_tecnica || info.descripcion) : String(info);
            const duracion = typeof info === 'object' ? (info.dias_desde_siembra || info.duracion_dias) : null;
            return (
              <View key={`bbch-obj-${index}`} style={styles.bbchItem}>
                <Text style={styles.bbchCode}>Etapa {codigo}</Text>
                {!!desc && <Text style={styles.bbchDesc}>{safeText(desc)}</Text>}
                {!!duracion && (
                  <View style={styles.duracionContainer}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color="#666" />
                    <Text style={styles.duracionText}>
                      Días desde siembra: {safeText(duracion)}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        ) : Array.isArray(bbch) ? (
          bbch.map((info, index) => {
             if (!info) return null;
             const codigo = typeof info === 'object' ? (info.codigo_bbch || info.etapa || index) : index;
             const desc = typeof info === 'object' ? (info.descripcion_tecnica || info.descripcion || '') : String(info);
             const duracion = typeof info === 'object' ? (info.dias_desde_siembra || info.duracion_dias) : null;
             return (
               <View key={`bbch-arr-${index}`} style={styles.bbchItem}>
                 <Text style={styles.bbchCode}>Etapa {codigo}</Text>
                 {!!desc && <Text style={styles.bbchDesc}>{safeText(desc)}</Text>}
                 {!!duracion && (
                  <View style={styles.duracionContainer}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color="#666" />
                    <Text style={styles.duracionText}>
                      Días desde siembra: {safeText(duracion)}
                    </Text>
                  </View>
                 )}
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
          
          const textoSeguro = Array.isArray(textoAlerta) ? textoAlerta.join(', ') : String(textoAlerta);

          return (
            <Text key={`alerta-${i}`} style={styles.alertText}>• {textoSeguro}</Text>
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

  // CORRECCIÓN: Evitar renderizar pantallas a medias si no hay datos.
  if (!cultivoData) {
    return (
      <ScrollView 
        contentContainerStyle={styles.center}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => cargarDatos(true)} />}
      >
        <MaterialCommunityIcons name="leaf-off" size={48} color="#9E9E9E" />
        <Text style={{ marginTop: 10, color: '#666', textAlign: 'center' }}>
          No se encontró información fenológica para este cultivo.
        </Text>
      </ScrollView>
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

      {/* CORRECCIÓN: Verificación estricta (.length > 0) para no renderizar Gantt con arreglos vacíos [] */}
      {cultivoData?.ciclo_fenologico?.etapas?.length > 0 ? (
        <GanttFenologico 
          etapas={cultivoData.ciclo_fenologico.etapas} 
          duracionTotal={cultivoData.ciclo_fenologico.duracion_total_dias || 0}
        />
      ) : (
        <View style={styles.card}>
          <Text style={{ color: '#666', textAlign: 'center' }}>Información del ciclo no disponible para este cultivo.</Text>
        </View>
      )}

      {/* ELIMINADO: Se quitó una segunda llamada a <GanttFenologico /> que pasaba parámetros erróneos ("datos=") y podía causar un crash */}

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
  duracionContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  duracionText: { fontSize: 12, color: '#666', marginLeft: 4 },
  alertBox: { backgroundColor: '#FFF3E0', padding: 15, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: '#EF6C00' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  alertTitle: { fontSize: 16, fontWeight: 'bold', color: '#E65100', marginLeft: 10 },
  alertText: { fontSize: 13, color: '#5D4037', marginBottom: 5 }
});