import React, { useState, useEffect, useMemo } from "react";
import { 
  View, Text, ScrollView, StyleSheet, ActivityIndicator, 
  TouchableOpacity, Alert 
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import CultivoDataManager from "../utils/CultivoDataManager";
import TrendChart from '../components/TrendChart';

export default function EstadisticasScreen({ route }) {
  const { cultivo } = route.params;
  
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingCompleto, setLoadingCompleto] = useState(false);
  const [nivel, setNivel] = useState('basico');

  useEffect(() => { 
    cargarDatosBasicos(); 
  }, [cultivo]);

  const cargarDatosBasicos = async (forzarReset = false) => {
    try {
      setLoading(true);
      console.log("🔍 Cargando estadísticas...", forzarReset ? "(Forzando Básico)" : "");
      
      const datos = await CultivoDataManager.obtenerCultivo(cultivo, 'basico');
      
      if (datos) {
        if (!forzarReset && datos.estadisticas && datos.estadisticas.historial_produccion && datos.estadisticas.historial_produccion.length > 0) {
          setNivel('completo');
          setCultivoData(datos);
          console.log("✅ Datos completos detectados en caché.");
        } else {
          setNivel('basico');
          
          if (datos.estadisticas) {
             const datosVisuales = { ...datos };
             datosVisuales.estadisticas = { 
                ...datos.estadisticas, 
                historial_produccion: []
             };
             setCultivoData(datosVisuales);
          } else {
             setCultivoData(datos);
          }
        }
      }
    } catch (error) {
      console.log("❌ Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const descargarDatosCompletos = async () => {
    try {
      setLoadingCompleto(true);
      console.log("☁️ Solicitando estadísticas completas...");

      const completos = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
      
      if (completos) {
         if (completos.estadisticas?.historial_produccion) {
             setCultivoData(completos);
             setNivel('completo');
             Alert.alert("Actualizado", "Estadísticas detalladas descargadas correctamente.");
         } else {
             Alert.alert("Aviso", "No hay historial detallado adicional para este cultivo.");
         }
      }
    } catch (error) {
       console.error("❌ Error descarga:", error);
       Alert.alert("Error", "No se pudo conectar con el servidor.");
    } finally {
      setLoadingCompleto(false);
    }
  };

  const stats = cultivoData?.estadisticas || {};
  const economia = cultivoData?.economia_expandida || {};
  const rentabilidad = cultivoData?.analisis_rentabilidad || {};
  const mercado = cultivoData?.mercado_comercializacion || {};
  
  const esDatosCompletos = nivel === 'completo';

  const datosGrafico = useMemo(() => {
    if (stats.historial_produccion && Array.isArray(stats.historial_produccion) && stats.historial_produccion.length > 0) {
      const datosValidos = stats.historial_produccion
        .filter(h => h.year && (h.produccion_ton || h.rendimiento_t_ha))
        .map(h => ({
          label: h.year.toString(),
          value: parseFloat(h.produccion_ton || h.rendimiento_t_ha || 0)
        }))
        .filter(d => !isNaN(d.value) && d.value > 0);
      
      return datosValidos.length > 0 ? datosValidos : null;
    }
    return null;
  }, [stats.historial_produccion]);

  if (loading && !cultivoData) return <ActivityIndicator size="large" style={{flex:1, marginTop: 50}} color="#2E7D32" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }}>
      
      {/* HEADER CON BOTÓN DE DESCARGA */}
      <View style={styles.headerContainer}>
        <View style={{flex: 1}}>
            <Text style={styles.titulo}>{cultivo}</Text>
            <Text style={styles.subTitulo}>{cultivoData?.categoria?.toUpperCase() || 'CULTIVO'}</Text>
        </View>

        {esDatosCompletos ? (
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
                        <Text style={styles.btnDescargarText}>Actualizar</Text>
                    </>
                )}
             </TouchableOpacity>
        )}
      </View>

      {/* 1. SECCIÓN: ANÁLISIS FINANCIERO */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💰 Análisis Financiero</Text>
        <View style={styles.grid}>
          <StatBox 
            label="ROI" 
            value={`${rentabilidad.roi_pct || cultivoData?.roi || 0}%`} 
            icon="chart-pie" 
            color="#6A1B9A" 
          />
          <StatBox 
            label="Riesgo" 
            value={typeof rentabilidad.riesgo === 'string' ? rentabilidad.riesgo : (cultivoData?.riesgo || 'N/D')} 
            icon="alert-decagram" 
            color="#E64A19" 
          />
          <StatBox 
            label="Utilidad/Ha" 
            value={`$${(rentabilidad.utilidad_neta_anual_ha || 0).toLocaleString()}`} 
            icon="cash-check" 
            color="#2E7D32" 
          />
          <StatBox 
            label="Recuperación" 
            value={`${rentabilidad.años_recuperacion || '---'} años`} 
            icon="calendar-sync" 
            color="#1565C0" 
          />
        </View>
      </View>

      {/* 2. SECCIÓN: GRÁFICO DE EVOLUCIÓN */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>📈 Evolución de Producción (Tons)</Text>
        
        {datosGrafico ? (
             <TrendChart data={datosGrafico} isPlaceholder={false} />
        ) : (
             <View style={styles.placeholderGraph}>
                 <MaterialCommunityIcons name="chart-line-variant" size={40} color="#ccc" />
                 <Text style={{color:'#999', marginTop:10, textAlign:'center'}}>
                    {esDatosCompletos ? "Sin historial disponible" : "Descarga los datos completos para ver la gráfica"}
                 </Text>
             </View>
        )}
        
        {stats.panorama_2023_summary && typeof stats.panorama_2023_summary === 'object' && (
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryItem}>• Ranking Mundial: {stats.panorama_2023_summary.ranking_mundial}</Text>
            <Text style={styles.summaryItem}>• Consumo per cápita: {stats.panorama_2023_summary.consumo_per_capita}</Text>
            <Text style={styles.summaryItem}>• Variación: {stats.panorama_2023_summary.variacion_anual_pct}%</Text>
          </View>
        )}
      </View>

      {/* 3. SECCIÓN: MERCADO */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🪙 Mercado y Precios</Text>
        <View style={styles.infoBox}>
          <InfoItem label="Precio Mínimo/Ton" value={`$${(economia.precio_min_mxn_ton || 0).toLocaleString()}`} />
          <InfoItem label="Precio Máximo/Ton" value={`$${(economia.precio_max_mxn_ton || 0).toLocaleString()}`} />
          <InfoItem label="Mejor época" value={economia.epoca_mejor_precio || 'N/D'} highlight />
          <InfoItem label="Margen Promedio" value={`${economia.margen_utilidad_promedio_pct || 0}%`} />
        </View>
      </View>

      {/* 4. SECCIÓN: PANORAMA NACIONAL */}
      <View style={[styles.infoBox, { backgroundColor: '#F1F8E9' }]}>
        <Text style={styles.sectionTitle}>🇲🇽 Panorama Nacional</Text>
        <InfoItem label="Superficie Sembrada" value={stats.superficie_sembrada_ha ? `${stats.superficie_sembrada_ha.toLocaleString()} ha` : 'N/D'} />
        <InfoItem label="Rendimiento" value={stats.rendimiento_promedio_t_por_ha ? `${stats.rendimiento_promedio_t_por_ha} t/ha` : 'N/D'} />
        <InfoItem label="Variación Anual" value={stats.variacion_anual_pct !== undefined ? `${stats.variacion_anual_pct}%` : '0%'} />
        <Text style={styles.labelSub}>Estados líderes:</Text>
        <Text style={styles.estadosText}>
          {Array.isArray(stats.principales_estados) ? stats.principales_estados.join(" • ") : 'N/D'}
        </Text>
      </View>

      {/* 5. SECCIÓN NUEVA: CANALES DE COMERCIALIZACIÓN */}
      {mercado.canales_venta && mercado.canales_venta.length > 0 && (
         <View style={[styles.infoBox, {marginTop: 20, backgroundColor: '#E3F2FD'}]}>
             <View style={{flexDirection:'row', alignItems:'center', marginBottom:15}}>
                 <MaterialCommunityIcons name="store" size={24} color="#1565C0" />
                 <Text style={[styles.sectionTitle, {marginBottom:0, marginLeft:8}]}>Canales de Comercialización</Text>
             </View>
             
             {/* Gráfico de Barras de Participación */}
             {mercado.canales_venta.map((canal, index) => (
               <View key={index} style={styles.canalItem}>
                 <View style={styles.canalHeader}>
                   <Text style={styles.canalNombre}>{canal.canal}</Text>
                   <Text style={styles.canalPorcentaje}>{canal.participacion_pct}%</Text>
                 </View>
                 <View style={styles.barraContenedor}>
                   <View 
                     style={[
                       styles.barraProgreso, 
                       {width: `${canal.participacion_pct}%`, backgroundColor: getColorByIndex(index)}
                     ]} 
                   />
                 </View>
                 <View style={styles.canalDetalles}>
                   <Text style={styles.canalDetalle}>💵 ${canal.precio_promedio_kg}/kg</Text>
                   <Text style={styles.canalDetalle}>📅 {canal.condiciones_pago}</Text>
                 </View>
               </View>
             ))}

             <View style={styles.divider} />

             {/* Destinos Principales */}
             {mercado.destinos_principales && mercado.destinos_principales.length > 0 && (
               <>
                 <Text style={[styles.labelSub, {marginTop: 10, marginBottom: 8}]}>Destinos Principales:</Text>
                 <View style={styles.destinosContainer}>
                   {mercado.destinos_principales.map((destino, idx) => (
                     <View key={idx} style={styles.destinoChip}>
                       <Text style={styles.destinoTexto}>{destino.ciudad}</Text>
                       <Text style={styles.destinoPct}>{destino.porcentaje}%</Text>
                     </View>
                   ))}
                 </View>
               </>
             )}

             {/* Temporadas de Precio */}
             {mercado.temporadas_precio && mercado.temporadas_precio.length > 0 && (
               <>
                 <View style={styles.divider} />
                 <Text style={[styles.labelSub, {marginTop: 10, marginBottom: 8}]}>Variación de Precios:</Text>
                 {mercado.temporadas_precio.map((temp, idx) => (
                   <View key={idx} style={styles.temporadaItem}>
                     <View style={{flex: 1}}>
                       <Text style={styles.temporadaMeses}>{temp.meses}</Text>
                       <Text style={styles.temporadaOferta}>Oferta: {temp.oferta}</Text>
                     </View>
                     <Text style={[
                       styles.temporadaPrecio,
                       {color: temp.oferta === 'Baja' ? '#2E7D32' : temp.oferta === 'Alta' ? '#D32F2F' : '#F57C00'}
                     ]}>
                       ${temp.precio_mxn_kg}/kg
                     </Text>
                   </View>
                 ))}
               </>
             )}
         </View>
      )}

    </ScrollView>
  );
}

// Función auxiliar para colores
const getColorByIndex = (index) => {
  const colors = ['#2E7D32', '#1565C0', '#F57C00', '#7B1FA2', '#C62828'];
  return colors[index % colors.length];
};

// Sub-componentes
const StatBox = ({ label, value, icon, color }) => (
  <View style={styles.statBox}>
    <MaterialCommunityIcons name={icon} size={24} color={color} />
    <Text style={[styles.statValue, { color }]}>{String(value)}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const InfoItem = ({ label, value, highlight }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, highlight && { color: '#2E7D32', fontWeight: 'bold' }]}>{String(value)}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FBFBFB", padding: 15 },
  
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  titulo: { fontSize: 28, fontWeight: "bold", color: "#1B5E20" },
  subTitulo: { fontSize: 12, color: "#666", letterSpacing: 1 },
  
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeCompleto: { backgroundColor: '#4CAF50' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  btnDescargar: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1976D2', 
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginLeft: 10 
  },
  btnDescargarText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  section: { marginBottom: 20 },
  sectionCard: { backgroundColor: '#fff', padding: 15, borderRadius: 15, elevation: 2, marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: "bold", color: "#333", marginBottom: 12 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statBox: { backgroundColor: '#fff', width: '48%', padding: 15, borderRadius: 15, marginBottom: 12, elevation: 2, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: 'bold', marginVertical: 4 },
  statLabel: { fontSize: 11, color: '#888', textTransform: 'uppercase' },
  
  infoBox: { backgroundColor: '#fff', padding: 15, borderRadius: 15, elevation: 1 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  infoLabel: { color: '#666', fontSize: 14 },
  infoValue: { fontWeight: '600', color: '#333', fontSize: 14 },
  
  summaryContainer: { marginTop: 10, padding: 10, backgroundColor: '#F5F5F5', borderRadius: 8 },
  summaryItem: { fontSize: 13, color: '#555', marginBottom: 4 },
  estadosText: { fontSize: 14, color: '#2E7D32', fontWeight: '500', marginTop: 5 },
  labelSub: { fontSize: 12, color: '#888', marginTop: 10, fontWeight: '600' },
  
  placeholderGraph: { height: 200, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 10 },

  // Estilos para Canales de Comercialización
  canalItem: { marginBottom: 15 },
  canalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  canalNombre: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  canalPorcentaje: { fontSize: 14, fontWeight: 'bold', color: '#1565C0' },
  barraContenedor: { height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden', marginBottom: 5 },
  barraProgreso: { height: '100%', borderRadius: 4 },
  canalDetalles: { flexDirection: 'row', justifyContent: 'space-between' },
  canalDetalle: { fontSize: 12, color: '#666' },

  destinosContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  destinoChip: { backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, flexDirection: 'row', alignItems: 'center' },
  destinoTexto: { fontSize: 12, color: '#2E7D32', marginRight: 4 },
  destinoPct: { fontSize: 11, fontWeight: 'bold', color: '#1B5E20' },

  temporadaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E3F2FD' },
  temporadaMeses: { fontSize: 13, fontWeight: '600', color: '#333' },
  temporadaOferta: { fontSize: 11, color: '#666', marginTop: 2 },
  temporadaPrecio: { fontSize: 16, fontWeight: 'bold' },

  divider: { height: 1, backgroundColor: '#BBDEFB', marginVertical: 10 },

  btn: { padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnDownload: { backgroundColor: '#1565C0' },
  btnRefresh: { backgroundColor: '#9E9E9E' },
  btnText: { color: '#fff', fontWeight: 'bold' }
});