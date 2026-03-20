import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Dimensions, 
  ActivityIndicator, 
  RefreshControl
} from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CultivoDataManager from '../utils/CultivoDataManager';

const screenWidth = Dimensions.get("window").width;

export default function EstadisticasScreen({ route }) {
  const { cultivo } = route.params; 
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [infoCultivo, setInfoCultivo] = useState(null);
  
  const [historicoPrecios, setHistoricoPrecios] = useState(null);
  const [costosData, setCostosData] = useState(null);
  const [rentabilidadData, setRentabilidadData] = useState(null);
  const [estadosData, setEstadosData] = useState(null);

  useEffect(() => {
    cargarDatos(false);
  }, [cultivo]);

  const cargarDatos = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo', isRefreshing);
      
      if (data) {
        setInfoCultivo(data);
        procesarDatosGraficas(data);
      }
    } catch (error) {
      console.error("Error en Estadisticas:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const procesarDatosGraficas = (data) => {
    // SUPER HELPER V2: Extrae solo el primer número para evitar que "15 a 20" se vuelva "1520"
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'number') return val;
      if (Array.isArray(val)) return safeNumber(val[0]);
      
      const textoLimpio = String(val).replace(/,/g, '');
      const match = textoLimpio.match(/\d+(\.\d+)?/);
      return match ? parseFloat(match[0]) : 0;
    };

    // 1. Procesar Historial (Blindado contra arrays de 1 solo elemento)
    const historial = data.historial_produccion || data.estadisticas?.historial_produccion;
    if (historial && Array.isArray(historial) && historial.length > 0) {
      const valoresLimpios = historial.map(h => safeNumber(h.rendimiento_t_ha || h.rendimiento));
      const labelsLimpios = historial.map(h => String(h.year || h.año || 'N/A').slice(-2));
      
      if (valoresLimpios.some(v => v > 0)) {
        
        // SALVAVIDAS CHARTKIT: Si solo hay 1 dato, lo duplicamos para evitar el crasheo del 'bezier'
        if (valoresLimpios.length === 1) {
          valoresLimpios.push(valoresLimpios[0]);
          labelsLimpios.push(labelsLimpios[0] + '*');
        }

        setHistoricoPrecios({
          labels: labelsLimpios,
          datasets: [{ data: valoresLimpios }]
        });
      } else {
        setHistoricoPrecios(null);
      }
    } else {
      setHistoricoPrecios(null);
    }

    // 2. Procesar Costos
    const costosRaw = data.costos_produccion_detallados || data.estadisticas?.costos;
    if (costosRaw && typeof costosRaw === 'object' && !Array.isArray(costosRaw)) {
      const pieData = Object.entries(costosRaw).map(([key, val], index) => {
        const valorNumerico = typeof val === 'object' && val !== null ? safeNumber(val.total || val.costo_ha) : safeNumber(val);
        return {
          name: String(key).split('_').join(' '),
          population: valorNumerico,
          color: ['#2E7D32', '#689F38', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107'][index % 6],
          legendFontColor: "#7F7F7F",
          legendFontSize: 12
        };
      }).filter(item => item.population > 0); 

      setCostosData(pieData.length > 0 ? pieData : null);
    } else {
      setCostosData(null);
    }

    // 3. Producción Nacional (Blindado contra arrays de texto simple)
    const estadosRaw = data.detalle_produccion_nacional?.principales_estados || data.detalle_produccion_nacional?.principales_estados_productores || data.estadisticas?.principales_estados;
    
    if (estadosRaw && typeof estadosRaw === 'object') {
      const topEstados = Array.isArray(estadosRaw) 
        ? estadosRaw.slice(0, 5).map(e => [typeof e === 'string' ? e : (e.estado || e.nombre || 'Indefinido'), e])
        : Object.entries(estadosRaw).slice(0, 5);
      
      if (topEstados.length > 0) {
        const valoresEstados = topEstados.map(([, val]) => {
          if (typeof val === 'number') return val;
          if (typeof val === 'object' && val !== null) {
             return safeNumber(val.participacion_pct || val.porcentaje_participacion || val.participacion || val.produccion_ton);
          }
          return safeNumber(val);
        });

        if (valoresEstados.some(v => v > 0)) {
          setEstadosData({
            labels: topEstados.map(([name]) => String(name).substring(0, 6)),
            datasets: [{ data: valoresEstados }]
          });
        } else {
          setEstadosData(null);
        }
      } else {
        setEstadosData(null);
      }
    } else {
      setEstadosData(null);
    }

    setRentabilidadData(data.analisis_rentabilidad || null);
  };

  const renderChartConfig = (baseColor) => ({
    backgroundColor: "#fff",
    backgroundGradientFrom: "#fff",
    backgroundGradientTo: "#fff",
    decimalPlaces: 1,
    color: (opacity = 1) => baseColor(opacity),
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: "5", strokeWidth: "2", stroke: "#fff" }
  });

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color="#2E7D32" /></View>
  );

  const formatTemporada = (temp) => {
    if (!temp) return 'N/A';
    if (Array.isArray(temp)) return temp.join(', ');
    if (typeof temp === 'object') return Object.values(temp).join(', ');
    return String(temp);
  };

  const renderRentabilidadValue = (val, prefix = '', suffix = '') => {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'object') return 'Ver detalle';
    return `${prefix}${val}${suffix}`;
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => cargarDatos(true)} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Análisis de Mercado</Text>
        <Text style={styles.subtitle}>{cultivo}</Text>
      </View>

      {/* Tarjeta de Superficie Sembrada Nacional */}
      {infoCultivo?.superficie_sembrada_ha && (
        <View style={styles.highlightCard}>
          <MaterialCommunityIcons name="tractor" size={32} color="#2E7D32" />
          <View style={styles.highlightTextContainer}>
            <Text style={styles.highlightLabel}>Superficie Sembrada Nacional</Text>
            <Text style={styles.highlightValue}>
              {renderRentabilidadValue(infoCultivo.superficie_sembrada_ha, '', ' ha')}
            </Text>
          </View>
        </View>
      )}

      {/* Gráfica de Rendimiento Histórico */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Evolución de Rendimiento (t/ha)</Text>
        {historicoPrecios && historicoPrecios.datasets?.[0]?.data?.length > 0 ? (
          <LineChart
            data={historicoPrecios}
            width={screenWidth - 40}
            height={220}
            chartConfig={renderChartConfig((op) => `rgba(46, 125, 50, ${op})`)}
            bezier
            style={styles.chart}
          />
        ) : <Text style={styles.noData}>Datos históricos no disponibles o incompletos</Text>}
      </View>

      {/* Distribución de Costos */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Estructura de Costos de Producción</Text>
        {costosData && costosData.length > 0 ? (
          <PieChart
            data={costosData}
            width={screenWidth - 40}
            height={200}
            chartConfig={renderChartConfig((op) => `rgba(0,0,0,${op})`)}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"15"}
            absolute 
          />
        ) : <Text style={styles.noData}>Detalle de costos no disponible</Text>}
      </View>

      {/* Ranking Nacional */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Principales Estados (% Prod. Nacional)</Text>
        {estadosData && estadosData.datasets?.[0]?.data?.length > 0 ? (
          <BarChart
            data={estadosData}
            width={screenWidth - 40}
            height={220}
            yAxisLabel=""
            yAxisSuffix="%"
            chartConfig={renderChartConfig((op) => `rgba(21, 101, 192, ${op})`)}
            verticalLabelRotation={30}
            style={styles.chart}
            fromZero={true}
          />
        ) : <Text style={styles.noData}>Datos regionales no disponibles</Text>}
      </View>

      {/* Temporadas de Precio */}
      {infoCultivo?.temporadas_precio && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Temporadas de Precio</Text>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
            <View style={{alignItems: 'center', flex: 1}}>
              <Text style={{color: '#388E3C', fontWeight: 'bold'}}>Alta</Text>
              <Text style={{fontSize: 12, textAlign: 'center', marginTop: 5}}>{formatTemporada(infoCultivo.temporadas_precio.alto)}</Text>
            </View>
            <View style={{alignItems: 'center', flex: 1}}>
              <Text style={{color: '#F57C00', fontWeight: 'bold'}}>Media</Text>
              <Text style={{fontSize: 12, textAlign: 'center', marginTop: 5}}>{formatTemporada(infoCultivo.temporadas_precio.medio)}</Text>
            </View>
            <View style={{alignItems: 'center', flex: 1}}>
              <Text style={{color: '#D32F2F', fontWeight: 'bold'}}>Baja</Text>
              <Text style={{fontSize: 12, textAlign: 'center', marginTop: 5}}>{formatTemporada(infoCultivo.temporadas_precio.bajo)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Indicadores de Rentabilidad Master V4 */}
      {rentabilidadData && (
        <View style={styles.rentCard}>
          <Text style={styles.rentTitle}>Indicadores Financieros (Master)</Text>
          <View style={styles.rentGrid}>
            <View style={styles.rentItem}>
              <Text style={styles.rentLabel}>ROI</Text>
              <Text style={styles.rentValue}>
                {renderRentabilidadValue(rentabilidadData.roi_estimado_pct || rentabilidadData.roi, '', '%')}
              </Text>
            </View>
            <View style={styles.rentItem}>
              <Text style={styles.rentLabel}>Pto. Equilibrio</Text>
              <Text style={styles.rentValue}>
                {renderRentabilidadValue(rentabilidadData.punto_equilibrio_ton, '', ' t')}
              </Text>
            </View>
            <View style={styles.rentItem}>
              <Text style={styles.rentLabel}>VAN (Miles)</Text>
              <Text style={styles.rentValue}>
                {renderRentabilidadValue(rentabilidadData.van_miles_mxn, '$', '')}
              </Text>
            </View>
          </View>
        </View>
      )}
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EEE' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1B5E20' },
  subtitle: { fontSize: 16, color: '#666' },
  
  highlightCard: { flexDirection: 'row', backgroundColor: '#E8F5E9', marginHorizontal: 15, marginTop: 15, padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#C8E6C9' },
  highlightTextContainer: { marginLeft: 15, flex: 1 },
  highlightLabel: { fontSize: 11, color: '#2E7D32', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 2 },
  highlightValue: { fontSize: 18, fontWeight: 'bold', color: '#1B5E20' },

  card: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 15, elevation: 3 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15 },
  chart: { marginVertical: 8, borderRadius: 16 },
  noData: { textAlign: 'center', color: '#999', padding: 20, fontStyle: 'italic' },
  rentCard: { backgroundColor: '#1B5E20', margin: 15, padding: 20, borderRadius: 15 },
  rentTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  rentGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  rentItem: { alignItems: 'center', flex: 1, paddingHorizontal: 5 },
  rentLabel: { color: '#A5D6A7', fontSize: 11, marginBottom: 5, textAlign: 'center' },
  rentValue: { color: '#fff', fontSize: 15, fontWeight: 'bold', textAlign: 'center' }
});