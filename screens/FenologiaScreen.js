import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CultivoDataManager from "../utils/CultivoDataManager";
import GanttFenologico from '../components/GanttFenologico';

export default function FenologiaScreen({ route }) {
  const { cultivo } = route.params;
  
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nivel, setNivel] = useState('basico');
  const [regionSeleccionada, setRegionSeleccionada] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  const cargarDatos = async () => {
    setLoading(true);
    const basicos = await CultivoDataManager.obtenerCultivo(cultivo, 'basico');
    setCultivoData(basicos);
    setNivel('basico');
    setLoading(false);
    
    try {
      const completos = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
      if (completos._nivel !== 'basico') {
        setCultivoData(completos);
        setNivel('completo');
      }
    } catch (err) {
      console.log('Usando datos básicos');
    }
  };

  if (loading && !cultivoData) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1B5E20" />
        <Text style={styles.loadingText}>Cargando ciclo de {cultivo}...</Text>
      </View>
    );
  }

  const data = cultivoData?.ciclo_fenologico || {};
  const calendarios = cultivoData?.calendarios_regionales || [];
  const variedades = data.variedades_principales || [];
  const esDatosCompletos = nivel === 'completo';

  if (!data.duracion_total_dias) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.error}>⚠️ No hay datos fenológicos para {cultivo}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.titulo}>📅 Ciclo Fenológico: {cultivo}</Text>
        <View style={[styles.badge, esDatosCompletos ? styles.badgeCompleto : styles.badgeBasico]}>
          <Text style={styles.badgeText}>
            {esDatosCompletos ? '✓ Completo' : '📶 Básico'}
          </Text>
        </View>
      </View>

      {/* Variedades */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
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

      {/* Duración Total */}
      <View style={styles.durationCard}>
        <MaterialCommunityIcons name="clock-outline" size={32} color="#00897B" />
        <View style={{marginLeft: 12}}>
          <Text style={styles.durationLabel}>Duración Total del Ciclo</Text>
          <Text style={styles.durationValue}>{data.duracion_total_dias} días</Text>
        </View>
      </View>

      {/* Gráfica de Etapas */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📈 Diagrama de Etapas</Text>
        <GanttFenologico 
          etapas={data.etapas} 
          duracionTotal={data.duracion_total_dias} 
        />
      </View>

      {/* Etapas Detalladas */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons name="timeline-text" size={24} color="#F57C00" />
          <Text style={styles.cardTitle}>Etapas del Desarrollo</Text>
        </View>
        {data.etapas?.map((etapa, index) => (
          <View key={index} style={styles.etapaItem}>
            <View style={styles.etapaNumber}>
              <Text style={styles.etapaNumberText}>{index + 1}</Text>
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.etapaNombre}>{etapa.nombre}</Text>
              <Text style={styles.etapaDuracion}>⏱️ {etapa.duracion_dias} días</Text>
              {etapa.bbch_fase && (
                <Text style={styles.etapaBBCH}>BBCH: {etapa.bbch_fase}</Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Calendarios Regionales (COMPLETO) */}
      {esDatosCompletos && calendarios.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="map-marker-multiple" size={24} color="#1976D2" />
            <Text style={styles.cardTitle}>Calendarios por Región</Text>
          </View>
          
          <Text style={styles.infoText}>
            Fechas recomendadas según clima y altitud de cada región
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
                  
                  {cal.rendimiento_esperado_t_ha && (
                    <View style={styles.fechaRow}>
                      <MaterialCommunityIcons name="chart-line" size={20} color="#1976D2" />
                      <View style={{marginLeft: 10, flex: 1}}>
                        <Text style={styles.fechaLabel}>Rendimiento esperado</Text>
                        <Text style={styles.fechaValue}>
                          {cal.rendimiento_esperado_t_ha} t/ha
                        </Text>
                      </View>
                    </View>
                  )}
                  
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

      {/* Fechas Clave (Básico - si no hay calendarios) */}
      {!esDatosCompletos && data.fechas_por_estado && data.fechas_por_estado.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="calendar" size={24} color="#2E7D32" />
            <Text style={styles.cardTitle}>Fechas Clave</Text>
          </View>
          {data.fechas_por_estado.map((item, index) => (
            <View key={index} style={styles.fechaCard}>
              <Text style={styles.estadoNombre}>📍 {item.estado}</Text>
              <Text style={styles.fechaItem}>
                🌱 Siembra: {item.siembra_inicio} - {item.siembra_fin}
              </Text>
              <Text style={styles.fechaItem}>
                🌾 Cosecha: {item.cosecha_inicio} - {item.cosecha_fin}
              </Text>
            </View>
          ))}
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { marginBottom: 20, alignItems: 'center' },
  titulo: { fontSize: 20, fontWeight: "bold", textAlign: 'center', color: '#2E7D32', marginBottom: 8 },
  
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeCompleto: { backgroundColor: '#4CAF50' },
  badgeBasico: { backgroundColor: '#FFA726' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 2,
  },
  
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginLeft: 8 },
  
  variedadesList: { flexDirection: 'row', flexWrap: 'wrap' },
  variedadChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3E5F5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  variedadText: { fontSize: 13, color: '#7B1FA2', marginLeft: 4, fontWeight: '600' },
  
  durationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0F2F1', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#4DB6AC' },
  durationLabel: { fontSize: 13, color: '#666' },
  durationValue: { fontSize: 24, fontWeight: 'bold', color: '#00897B' },
  
  etapaItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  etapaNumber: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFA726', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  etapaNumberText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  etapaNombre: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  etapaDuracion: { fontSize: 13, color: '#666', marginBottom: 2 },
  etapaBBCH: { fontSize: 12, color: '#999' },
  
  infoText: { fontSize: 12, color: '#666', marginBottom: 12, fontStyle: 'italic' },
  
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
  
  fechaCard: { backgroundColor: '#F3FEEF', padding: 12, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#A5D6A7' },
  estadoNombre: { fontWeight: 'bold', fontSize: 15, marginBottom: 6, color: '#2E7D32' },
  fechaItem: { fontSize: 14, marginLeft: 10, marginBottom: 4 },
  
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  error: { fontSize: 16, color: 'red', textAlign: 'center' },
  noData: { fontSize: 13, color: '#999', fontStyle: 'italic' },
}); 