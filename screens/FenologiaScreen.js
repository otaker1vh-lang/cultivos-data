import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  Alert 
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CultivoDataManager from "../utils/CultivoDataManager";
import GanttFenologico from '../components/GanttFenologico';

export default function FenologiaScreen({ route }) {
  const { cultivo } = route.params;
  const CACHE_KEY = `@fenologia_data_${cultivo}`;
  
  // --- ESTADOS ---
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modoDetallado, setModoDetallado] = useState(false); // Detecta si hay BBCH/Temp
  
  // Estados de UI recuperados del archivo anterior
  const [regionSeleccionada, setRegionSeleccionada] = useState(null);
  const [sistemaExpanded, setSistemaExpanded] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  // 1. CARGA DE DATOS
  const cargarDatos = async () => {
    setLoading(true);
    try {
      // Intentar cargar de caché primero
      const datosGuardados = await AsyncStorage.getItem(CACHE_KEY);
      if (datosGuardados) {
        const parsedData = JSON.parse(datosGuardados);
        procesarYSetearDatos(parsedData);
        // Actualización silenciosa
        fetchNuevosDatos(); 
      } else {
        await fetchNuevosDatos();
      }
    } catch (error) {
      console.error("Error al cargar fenología:", error);
      Alert.alert("Error", "No se pudo cargar la información fenológica.");
    } finally {
      setLoading(false);
    }
  };

  const fetchNuevosDatos = async () => {
    try {
      const datosNuevos = await CultivoDataManager.getCultivo(cultivo);
      if (datosNuevos) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(datosNuevos));
        procesarYSetearDatos(datosNuevos);
      }
    } catch (e) {
      console.log("No se pudo actualizar datos remotos en segundo plano");
    }
  };

  const procesarYSetearDatos = (data) => {
    // Verificamos si existe la nueva estructura detallada
    if (data.bbch_detallado && Array.isArray(data.bbch_detallado) && data.bbch_detallado.length > 0) {
      setModoDetallado(true);
      const bbchOrdenado = [...data.bbch_detallado].sort((a, b) => (parseInt(a.codigo_bbch) || 0) - (parseInt(b.codigo_bbch) || 0));
      setCultivoData({ ...data, etapas_visualizacion: bbchOrdenado });
    } else {
      setModoDetallado(false);
      setCultivoData({ ...data, etapas_visualizacion: data.ciclo_fenologico?.etapas || [] });
    }
  };

  if (loading && !cultivoData) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={styles.loadingText}>Cargando ciclo de {cultivo}...</Text>
      </View>
    );
  }

  if (!cultivoData) return null;

  // --- EXTRACCIÓN DE DATOS PARA SECCIONES RECUPERADAS ---
  const dataCiclo = cultivoData?.ciclo_fenologico || {};
  const variedades = dataCiclo.variedades_principales || [];
  const densidades = dataCiclo.densidad_plantacion?.sistemas || [];
  const calendarios = cultivoData?.calendarios_regionales || [];
  const alertas = cultivoData?.alertas_riesgos || {};
  const tieneAlertas = Array.isArray(alertas) ? alertas.length > 0 : Object.keys(alertas).length > 0;

  // Cálculo de duración para mostrar en tarjeta
  const duracionTotal = dataCiclo.duracion_total_dias || 
    (dataCiclo.etapas ? dataCiclo.etapas.reduce((acc, curr) => acc + (curr.duracion_dias || 0), 0) : 0);

  return (
    <ScrollView style={styles.container}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <View>
            <Text style={styles.titulo}>Fenología: {cultivo}</Text>
            <Text style={styles.subtitle}>{modoDetallado ? "Datos Avanzados (BBCH)" : "Datos Generales"}</Text>
        </View>
        {/* Badge indicador */}
        <View style={[styles.badge, modoDetallado ? styles.badgeCompleto : null]}>
            <Text style={styles.badgeText}>{modoDetallado ? "✓ Completo" : "Básico"}</Text>
        </View>
      </View>

      {/* 1. SECCIÓN: VARIEDADES (RECUPERADA) */}
      <View style={styles.card}>
        <View style={styles.cardHeaderSimple}>
          <MaterialCommunityIcons name="dna" size={24} color="#7B1FA2" />
          <Text style={styles.cardTitle}>Variedades Principales</Text>
        </View>
        <View style={styles.variedadesList}>
          {variedades.length > 0 ? (
            variedades.map((variedad, index) => (
              <View key={index} style={styles.variedadChip}>
                <MaterialCommunityIcons name="sprout" size={16} color="#7B1FA2" />
                <Text style={styles.variedadText}>{variedad}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noData}>No disponible</Text>
          )}
        </View>
      </View>

      {/* 2. SECCIÓN: SISTEMAS DE PLANTACIÓN (RECUPERADA) */}
      {densidades.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderSimple}>
            <MaterialCommunityIcons name="grid" size={24} color="#00897B" />
            <Text style={styles.cardTitle}>Sistemas de Plantación</Text>
          </View>
          {dataCiclo.densidad_plantacion?.nota && (
            <Text style={styles.infoText}>💡 {dataCiclo.densidad_plantacion.nota}</Text>
          )}
          {densidades.map((sistema, index) => (
            <TouchableOpacity 
              key={index}
              style={[styles.sistemaCard, sistemaExpanded === index && styles.sistemaCardExpanded]}
              onPress={() => setSistemaExpanded(sistemaExpanded === index ? null : index)}
            >
              <View style={styles.sistemaHeader}>
                <View style={{flex: 1}}>
                  <Text style={styles.sistemaNombre}>{sistema.nombre}</Text>
                  <Text style={styles.sistemaArboles}>{sistema.arboles_ha} plantas/ha</Text>
                </View>
                <MaterialCommunityIcons 
                  name={sistemaExpanded === index ? "chevron-up" : "chevron-down"} 
                  size={22} 
                  color="#666" 
                />
              </View>
              {sistemaExpanded === index && (
                <View style={styles.sistemaDetalle}>
                  <View style={styles.detailRow}>
                    <MaterialCommunityIcons name="ruler" size={18} color="#00897B" />
                    <Text style={styles.detailText}>Distancia: {sistema.distancia_m}</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 3. SECCIÓN: GANTT Y ETAPAS (MEJORADA) */}
      <View style={styles.ganttContainer}>
        <Text style={styles.sectionTitle}>Calendario Visual ({duracionTotal} días)</Text>
        <GanttFenologico data={dataCiclo} />
      </View>

      {/* LISTA DE ETAPAS (USANDO EL DISEÑO NUEVO MEJORADO) */}
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>
          {modoDetallado ? "Desglose Técnico (BBCH)" : "Etapas de Desarrollo"}
        </Text>

        {cultivoData.etapas_visualizacion && cultivoData.etapas_visualizacion.map((etapa, index) => (
          <View key={index} style={styles.cardEtapa}>
            {/* Cabecera Etapa */}
            <View style={styles.cardHeader}>
              <View style={{flex: 1}}>
                {modoDetallado && etapa.codigo_bbch && (
                  <View style={styles.bbchBadgeContainer}>
                    <Text style={styles.bbchBadgeText}>BBCH {etapa.codigo_bbch}</Text>
                  </View>
                )}
                <Text style={styles.etapaNombre}>
                   {modoDetallado ? (etapa.fase_original || etapa.descripcion_tecnica) : etapa.nombre}
                </Text>
              </View>
              <View style={styles.diasContainer}>
                <MaterialCommunityIcons name="clock-outline" size={16} color="#F57C00" />
                <Text style={styles.diasText}>
                  {modoDetallado ? (etapa.dias_desde_siembra || etapa.duracion_dias) : etapa.duracion_dias || etapa.dias} días
                </Text>
              </View>
            </View>

            {/* Información Técnica Nueva */}
            {modoDetallado && (
              <View style={styles.techInfoContainer}>
                <View style={styles.rowInfo}>
                  {etapa.temperatura_optima && (
                    <View style={styles.infoTag}>
                      <MaterialCommunityIcons name="thermometer" size={16} color="#D32F2F" />
                      <Text style={styles.infoText}>Óptima: {etapa.temperatura_optima}°C</Text>
                    </View>
                  )}
                  {etapa.grados_dia_acumulados && (
                    <View style={styles.infoTag}>
                      <MaterialCommunityIcons name="fire" size={16} color="#E65100" />
                      <Text style={styles.infoText}>GDD: {etapa.grados_dia_acumulados}</Text>
                    </View>
                  )}
                </View>
                {etapa.actividades_criticas && etapa.actividades_criticas.length > 0 && (
                  <View style={styles.activitiesContainer}>
                    <Text style={styles.activitiesTitle}>⚠️ Actividades Críticas:</Text>
                    {etapa.actividades_criticas.map((actividad, i) => (
                      <View key={i} style={styles.activityRow}>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#2E7D32" />
                        <Text style={styles.activityText}>{actividad}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            
            {/* Descripción Fallback */}
            {!modoDetallado && etapa.descripcion && (
               <Text style={styles.descripcionSimple}>{etapa.descripcion}</Text>
            )}
          </View>
        ))}
      </View>

      {/* 4. SECCIÓN: ALERTAS (RECUPERADA) */}
      {tieneAlertas && (
        <View style={[styles.card, styles.alertCard]}>
          <View style={styles.cardHeaderSimple}>
            <MaterialCommunityIcons name="alert-decagram" size={24} color="#D32F2F" />
            <Text style={[styles.cardTitle, { color: '#D32F2F' }]}>Alertas Climáticas</Text>
          </View>
          
          <Text style={styles.alertSubtitle}>
            ⚠️ Riesgos críticos por etapa fenológica:
          </Text>

          {Array.isArray(alertas) 
            ? alertas.map((item, index) => (
                <View key={index} style={styles.alertItem}>
                  <Text style={styles.alertEtapa}>🚨 {item.etapa || "Etapa Crítica"}</Text>
                  <Text style={styles.alertDesc}>{item.riesgo || item.descripcion}</Text>
                  {item.umbral && <Text style={styles.alertUmbral}>Umbral: {item.umbral}</Text>}
                </View>
              ))
            : Object.keys(alertas).map((key, index) => {
                const valor = alertas[key];
                return (
                  <View key={index} style={styles.alertItem}>
                    <Text style={styles.alertEtapa}>🚨 {key}</Text>
                    <Text style={styles.alertDesc}>
                      {typeof valor === 'object' ? (valor.riesgo || valor.descripcion) : valor}
                    </Text>
                  </View>
                );
              })
          }
        </View>
      )}

      {/* 5. SECCIÓN: CALENDARIOS REGIONALES (RECUPERADA) */}
      {calendarios.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderSimple}>
            <MaterialCommunityIcons name="map-marker-multiple" size={24} color="#1976D2" />
            <Text style={styles.cardTitle}>Calendarios por Región</Text>
          </View>
          
          <Text style={styles.infoText}>
            📍 Fechas recomendadas según clima y altitud
          </Text>
          
          {calendarios.map((cal, index) => (
            <TouchableOpacity 
              key={index}
              style={[styles.regionCard, regionSeleccionada === index && styles.regionCardSelected]}
              onPress={() => setRegionSeleccionada(regionSeleccionada === index ? null : index)}
            >
              <View style={styles.regionHeader}>
                <View style={{flex: 1}}>
                  <Text style={styles.regionNombre}>📍 {cal.region}</Text>
                  {cal.altitud_msnm && (
                    <Text style={styles.regionAltitud}>Altitud: {cal.altitud_msnm} msnm</Text>
                  )}
                </View>
                <MaterialCommunityIcons 
                  name={regionSeleccionada === index ? "chevron-up" : "chevron-down"} 
                  size={24} 
                  color="#666" 
                />
              </View>
              
              {regionSeleccionada === index && (
                <View style={styles.regionDetalle}>
                  <View style={styles.fechaRow}>
                    <MaterialCommunityIcons name="seed" size={20} color="#4CAF50" />
                    <View style={{marginLeft: 10, flex: 1}}>
                      <Text style={styles.fechaLabel}>Siembra</Text>
                      <Text style={styles.fechaValue}>
                        {cal.siembra_inicio} - {cal.siembra_fin}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.fechaRow}>
                    <MaterialCommunityIcons name="grain" size={20} color="#FF9800" />
                    <View style={{marginLeft: 10, flex: 1}}>
                      <Text style={styles.fechaLabel}>Cosecha</Text>
                      <Text style={styles.fechaValue}>
                        {cal.cosecha_inicio} - {cal.cosecha_fin}
                      </Text>
                    </View>
                  </View>
                  
                  {cal.ventana_comercial && (
                    <View style={[styles.ventanaBox]}>
                      <Text style={styles.ventanaLabel}>💡 Ventana Comercial</Text>
                      <Text style={styles.ventanaTexto}>{cal.ventana_comercial}</Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

    </ScrollView>
  );
}

// --- ESTILOS UNIFICADOS (MEZCLA DE AMBOS ARCHIVOS) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#666' },

  // HEADER
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontSize: 22, fontWeight: "bold", color: '#1B5E20' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#E0E0E0' },
  badgeCompleto: { backgroundColor: '#4CAF50' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // CARDS GENERALES (Variedades, Sistemas, Alertas, Calendarios)
  card: { backgroundColor: '#fff', marginHorizontal: 15, padding: 16, borderRadius: 12, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
  cardHeaderSimple: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginLeft: 8 },

  // VARIEDADES
  variedadesList: { flexDirection: 'row', flexWrap: 'wrap' },
  variedadChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3E5F5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  variedadText: { fontSize: 13, color: '#7B1FA2', marginLeft: 4, fontWeight: '600' },
  noData: { fontSize: 13, color: '#999', fontStyle: 'italic' },

  // SISTEMAS
  sistemaCard: { backgroundColor: '#F5F5F5', padding: 12, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  sistemaCardExpanded: { backgroundColor: '#E0F7FA', borderColor: '#00897B' },
  sistemaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sistemaNombre: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  sistemaArboles: { fontSize: 13, color: '#00897B', fontWeight: '600' },
  sistemaDetalle: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#B2DFDB' },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detailText: { fontSize: 13, color: '#555', marginLeft: 8 },
  infoText: { fontSize: 12, color: '#666', marginBottom: 12, fontStyle: 'italic' },

  // GANTT
  ganttContainer: { marginHorizontal: 15, padding: 15, backgroundColor: '#fff', borderRadius: 12, elevation: 2, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 15 },

  // LISTA DE ETAPAS (ESTILOS NUEVOS)
  listContainer: { paddingHorizontal: 15, paddingBottom: 20 },
  cardEtapa: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, borderLeftWidth: 5, borderLeftColor: '#43A047', elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  bbchBadgeContainer: { backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 4, borderWidth: 1, borderColor: '#C8E6C9' },
  bbchBadgeText: { color: '#2E7D32', fontSize: 12, fontWeight: 'bold' },
  etapaNombre: { fontSize: 17, fontWeight: 'bold', color: '#333' },
  diasContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  diasText: { fontSize: 13, fontWeight: '600', color: '#E65100', marginLeft: 4 },
  techInfoContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  rowInfo: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  infoTag: { flexDirection: 'row', alignItems: 'center', marginRight: 15, marginTop: 4 },
  activitiesContainer: { marginTop: 5, backgroundColor: '#FAFAFA', padding: 10, borderRadius: 8 },
  activitiesTitle: { fontSize: 13, fontWeight: 'bold', color: '#455A64', marginBottom: 5 },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  activityText: { fontSize: 13, color: '#455A64', marginLeft: 6, flex: 1 },
  descripcionSimple: { color: '#666', fontSize: 14, fontStyle: 'italic' },

  // ALERTAS
  alertCard: { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2', borderWidth: 1 },
  alertSubtitle: { fontSize: 12, color: '#D32F2F', marginBottom: 10, fontWeight: '600' },
  alertItem: { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#FFCDD2' },
  alertEtapa: { fontSize: 14, fontWeight: 'bold', color: '#C62828' },
  alertDesc: { fontSize: 13, color: '#B71C1C', marginTop: 2 },
  alertUmbral: { fontSize: 11, color: '#D32F2F', fontStyle: 'italic', marginTop: 2 },

  // CALENDARIOS
  regionCard: { backgroundColor: '#F5F5F5', padding: 14, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  regionCardSelected: { backgroundColor: '#E3F2FD', borderColor: '#1976D2' },
  regionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  regionNombre: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  regionAltitud: { fontSize: 12, color: '#666' },
  regionDetalle: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  fechaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  fechaLabel: { fontSize: 12, color: '#666', marginBottom: 2 },
  fechaValue: { fontSize: 14, fontWeight: '600', color: '#333' },
  ventanaBox: { backgroundColor: '#FFF8E1', padding: 10, borderRadius: 8, marginTop: 8 },
  ventanaLabel: { fontSize: 12, fontWeight: 'bold', color: '#F57C00', marginBottom: 4 },
  ventanaTexto: { fontSize: 13, color: '#666' },
});