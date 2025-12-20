import React, { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CultivoDataManager from "../utils/CultivoDataManager";
import TrendChart from '../components/TrendChart';

export default function EstadisticasScreen({ route }) {
  const { cultivo } = route.params;
  
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nivel, setNivel] = useState('basico');

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  const cargarDatos = async () => {
    setLoading(true);
    
    // Cargar básicos inmediatamente
    const basicos = await CultivoDataManager.obtenerCultivo(cultivo, 'basico');
    setCultivoData(basicos);
    setNivel('basico');
    setLoading(false);
    
    // Cargar completos en background
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
        <Text style={styles.loadingText}>Cargando datos de {cultivo}...</Text>
      </View>
    );
  }

  if (!cultivoData) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.error}>⚠️ No se encontraron datos para {cultivo}</Text>
      </View>
    );
  }

  const stats = cultivoData.estadisticas || {};
  const panorama = stats.panorama_2023_summary || {};
  const rentabilidad = cultivoData.analisis_rentabilidad || {};
  const economia = cultivoData.economia_expandida || {};
  const mercado = cultivoData.mercado_comercializacion || {};
  const costos = cultivoData.costos_produccion_detallados || {};

  const esDatosCompletos = nivel === 'completo';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      
      {/* Header con badge */}
      <View style={styles.header}>
        <Text style={styles.titulo}>📈 Análisis Económico: {cultivo}</Text>
        <View style={[styles.badge, esDatosCompletos ? styles.badgeCompleto : styles.badgeBasico]}>
          <Text style={styles.badgeText}>
            {esDatosCompletos ? '✓ Datos Completos' : '📶 Datos Básicos'}
          </Text>
        </View>
      </View>

      {/* 1. Estadísticas Base */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons name="chart-line" size={24} color="#2E7D32" />
          <Text style={styles.cardTitle}>Estadísticas de Producción</Text>
        </View>
        
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>🌍 Estados principales</Text>
          <Text style={styles.statValue}>
            {stats.principales_estados ? stats.principales_estados.slice(0,3).join(', ') : 'N/A'}
          </Text>
        </View>
        
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>🌾 Rendimiento promedio</Text>
          <Text style={styles.statValue}>
            {stats.rendimiento_promedio_t_por_ha?.toFixed(2) || 'N/A'} t/ha
          </Text>
        </View>
        
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>📊 Producción nacional</Text>
          <Text style={styles.statValue}>
            {panorama.produccion_miles_ton?.toLocaleString() || 'N/A'} mil ton
          </Text>
        </View>
      </View>

      {/* 2. Precios (Completo) */}
      {esDatosCompletos && economia.precio_min_mxn_ton && (
        <View style={[styles.card, styles.preciosCard]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="currency-usd" size={24} color="#F57C00" />
            <Text style={styles.cardTitle}>Análisis de Precios</Text>
          </View>
          
          <View style={styles.priceGrid}>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Precio Promedio</Text>
              <Text style={styles.priceValue}>
                ${(stats.precio_medio_mxn_ton / 1000).toFixed(1)}k
              </Text>
              <Text style={styles.priceUnit}>por tonelada</Text>
            </View>
            
            <View style={[styles.priceBox, {backgroundColor: '#FFEBEE'}]}>
              <Text style={styles.priceLabel}>Mínimo</Text>
              <Text style={[styles.priceValue, {color: '#D32F2F'}]}>
                ${(economia.precio_min_mxn_ton / 1000).toFixed(1)}k
              </Text>
              <Text style={styles.priceUnit}>{economia.epoca_peor_precio || 'N/A'}</Text>
            </View>
            
            <View style={[styles.priceBox, {backgroundColor: '#E8F5E9'}]}>
              <Text style={styles.priceLabel}>Máximo</Text>
              <Text style={[styles.priceValue, {color: '#2E7D32'}]}>
                ${(economia.precio_max_mxn_ton / 1000).toFixed(1)}k
              </Text>
              <Text style={styles.priceUnit}>{economia.epoca_mejor_precio || 'N/A'}</Text>
            </View>
          </View>
        </View>
      )}

      {/* 3. Rentabilidad (Completo) */}
      {esDatosCompletos && rentabilidad.roi_pct && (
        <View style={[styles.card, styles.rentabilidadCard]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="chart-arc" size={24} color="#1976D2" />
            <Text style={styles.cardTitle}>Análisis de Rentabilidad</Text>
          </View>
          
          <View style={styles.roiContainer}>
            <View style={styles.roiMain}>
              <Text style={styles.roiLabel}>Retorno de Inversión (ROI)</Text>
              <Text style={styles.roiValue}>{rentabilidad.roi_pct}%</Text>
            </View>
            
            <View style={styles.riesgoBox}>
              <MaterialCommunityIcons 
                name={rentabilidad.riesgo === 'Bajo' ? 'shield-check' : rentabilidad.riesgo === 'Alto' ? 'alert' : 'shield-half-full'} 
                size={20} 
                color={rentabilidad.riesgo === 'Bajo' ? '#4CAF50' : rentabilidad.riesgo === 'Alto' ? '#F44336' : '#FF9800'} 
              />
              <Text style={styles.riesgoText}>Riesgo: {rentabilidad.riesgo || 'Medio'}</Text>
            </View>
          </View>
          
          {rentabilidad.utilidad_neta_anual_ha && (
            <View style={styles.utilidadRow}>
              <Text style={styles.utilidadLabel}>Utilidad neta estimada/ha:</Text>
              <Text style={styles.utilidadValue}>
                ${rentabilidad.utilidad_neta_anual_ha.toLocaleString('es-MX')}
              </Text>
            </View>
          )}
          
          {rentabilidad.años_recuperacion && (
            <Text style={styles.infoText}>
              💡 Recuperación de inversión en {rentabilidad.años_recuperacion} años
            </Text>
          )}
        </View>
      )}

      {/* 4. Costos de Producción (Completo) */}
      {esDatosCompletos && costos.operacion_anual && (
        <View style={[styles.card, styles.costosCard]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="calculator" size={24} color="#6A1B9A" />
            <Text style={styles.cardTitle}>Costos de Producción Anual</Text>
          </View>
          
          <View style={styles.costosDesglose}>
            {Object.entries(costos.operacion_anual).map(([key, value], index) => {
              if (key === 'total' || typeof value !== 'number') return null;
              return (
                <View key={index} style={styles.costoItem}>
                  <Text style={styles.costoLabel}>{formatearLabel(key)}</Text>
                  <Text style={styles.costoValue}>${value.toLocaleString()}</Text>
                </View>
              );
            })}
          </View>
          
          <View style={styles.costoTotal}>
            <Text style={styles.costoTotalLabel}>Total Operación/ha:</Text>
            <Text style={styles.costoTotalValue}>
              ${costos.operacion_anual.total?.toLocaleString() || '0'}
            </Text>
          </View>
          
          {costos.costo_por_kg_produccion && (
            <Text style={styles.infoText}>
              📌 Costo por kg: ${costos.costo_por_kg_produccion.toFixed(2)}
            </Text>
          )}
        </View>
      )}

      {/* 5. Canales de Comercialización (Completo) */}
      {esDatosCompletos && mercado.canales_venta && (
        <View style={[styles.card, styles.mercadoCard]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="store" size={24} color="#00897B" />
            <Text style={styles.cardTitle}>Canales de Venta</Text>
          </View>
          
          {mercado.canales_venta.map((canal, index) => (
            <View key={index} style={styles.canalItem}>
              <View style={styles.canalHeader}>
                <Text style={styles.canalNombre}>{canal.canal}</Text>
                <Text style={styles.canalPorcentaje}>{canal.participacion_pct}%</Text>
              </View>
              {canal.precio_promedio_kg && (
                <Text style={styles.canalPrecio}>
                  Precio: ${canal.precio_promedio_kg}/kg
                </Text>
              )}
              {canal.condiciones_pago && (
                <Text style={styles.canalCondicion}>
                  Pago: {canal.condiciones_pago}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* 6. Gráfica Histórica */}
      {stats.historial_produccion && stats.historial_produccion.length > 0 && (
        <View style={styles.chartContainer}>
          <Text style={styles.cardTitle}>📈 Tendencia de Rendimiento</Text>
          <TrendChart 
            data={stats.historial_produccion} 
            metric="rendimiento_t_ha" 
            unit="t/ha"
          />
        </View>
      )}

      {/* Botón Recargar (solo si hay datos básicos) */}
      {!esDatosCompletos && (
        <TouchableOpacity 
          style={styles.reloadButton} 
          onPress={async () => {
            await CultivoDataManager.limpiarCache();
            await cargarDatos();
          }}
        >
          <MaterialCommunityIcons name="refresh" size={20} color="#fff" style={{marginRight: 8}} />
          <Text style={styles.reloadButtonText}>Descargar Análisis Completo</Text>
        </TouchableOpacity>
      )}

    </ScrollView>
  );
}

// Helper para formatear labels de costos
function formatearLabel(key) {
  const labels = {
    fertilizantes: 'Fertilizantes',
    control_plagas: 'Control de plagas',
    riego_energia: 'Riego y energía',
    mano_obra: 'Mano de obra',
    cosecha: 'Cosecha',
    transporte: 'Transporte',
    otros: 'Otros'
  };
  return labels[key] || key;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  scrollContent: { padding: 20, paddingBottom: 50 },
  
  header: { marginBottom: 20, alignItems: 'center' },
  titulo: { fontSize: 20, fontWeight: "bold", textAlign: 'center', color: '#1B5E20', marginBottom: 8 },
  
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginLeft: 8 },
  
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  statLabel: { fontSize: 14, color: '#666', flex: 1 },
  statValue: { fontSize: 14, fontWeight: 'bold', color: '#333', textAlign: 'right', flex: 1 },
  
  // Precios
  preciosCard: { backgroundColor: '#FFF3E0', borderColor: '#FFB74D' },
  priceGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  priceBox: { flex: 1, backgroundColor: '#FFF8E1', padding: 12, borderRadius: 8, marginHorizontal: 4, alignItems: 'center' },
  priceLabel: { fontSize: 11, color: '#666', marginBottom: 4 },
  priceValue: { fontSize: 18, fontWeight: 'bold', color: '#F57C00' },
  priceUnit: { fontSize: 10, color: '#999', marginTop: 2, textAlign: 'center' },
  
  // Rentabilidad
  rentabilidadCard: { backgroundColor: '#E3F2FD', borderColor: '#64B5F6' },
  roiContainer: { marginBottom: 12 },
  roiMain: { alignItems: 'center', marginBottom: 12 },
  roiLabel: { fontSize: 13, color: '#666', marginBottom: 4 },
  roiValue: { fontSize: 32, fontWeight: 'bold', color: '#1976D2' },
  riesgoBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 8, borderRadius: 8 },
  riesgoText: { fontSize: 14, fontWeight: 'bold', marginLeft: 8, color: '#333' },
  utilidadRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 10, borderRadius: 8, marginTop: 8 },
  utilidadLabel: { fontSize: 13, color: '#666' },
  utilidadValue: { fontSize: 15, fontWeight: 'bold', color: '#2E7D32' },
  infoText: { fontSize: 12, color: '#666', marginTop: 8, fontStyle: 'italic' },
  
  // Costos
  costosCard: { backgroundColor: '#F3E5F5', borderColor: '#BA68C8' },
  costosDesglose: { marginBottom: 12 },
  costoItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  costoLabel: { fontSize: 13, color: '#666' },
  costoValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  costoTotal: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 12, borderRadius: 8, marginTop: 8 },
  costoTotalLabel: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  costoTotalValue: { fontSize: 16, fontWeight: 'bold', color: '#6A1B9A' },
  
  // Mercado
  mercadoCard: { backgroundColor: '#E0F2F1', borderColor: '#4DB6AC' },
  canalItem: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8 },
  canalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  canalNombre: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  canalPorcentaje: { fontSize: 14, fontWeight: 'bold', color: '#00897B' },
  canalPrecio: { fontSize: 12, color: '#666', marginTop: 2 },
  canalCondicion: { fontSize: 11, color: '#999', marginTop: 2 },
  
  chartContainer: { marginBottom: 20, padding: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#eee', minHeight: 300 },
  
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  error: { fontSize: 16, color: 'red', textAlign: 'center' },
  
  reloadButton: { flexDirection: 'row', backgroundColor: '#2196F3', padding: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  reloadButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});