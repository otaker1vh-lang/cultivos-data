import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Dimensions, 
  ActivityIndicator, 
  TouchableOpacity, 
  Alert,
  RefreshControl
} from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
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
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
      
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
    // 1. Procesar Historial (Producción y Rendimiento)
    const historial = data.historial_produccion || data.estadisticas?.historial_produccion;
    if (historial && Array.isArray(historial)) {
      setHistoricoPrecios({
        labels: historial.map(h => h.year.toString().slice(-2)),
        datasets: [{ data: historial.map(h => h.rendimiento_t_ha || h.rendimiento) }]
      });
    }

    // 2. Procesar Costos (Agregando categorías del Master V4)
    const costosRaw = data.costos_produccion_detallados || data.estadisticas?.costos;
    if (costosRaw) {
      const pieData = Object.entries(costosRaw).map(([key, val], index) => ({
        name: key.split('_').join(' '),
        population: typeof val === 'object' ? (val.total || val.costo_ha || 0) : val,
        color: ['#2E7D32', '#689F38', '#8BC34A', '#CDDC39', '#FFEB3B'][index % 5],
        legendFontColor: "#7F7F7F",
        legendFontSize: 12
      })).filter(item => item.population > 0);
      setCostosData(pieData);
    }

    // 3. Producción Nacional (Ranking de Estados)
    const estadosRaw = data.detalle_produccion_nacional?.principales_estados_productores || data.estadisticas?.principales_estados;
    if (estadosRaw) {
      const topEstados = Object.entries(estadosRaw).slice(0, 5);
      setEstadosData({
        labels: topEstados.map(([name]) => name.substring(0, 6)),
        datasets: [{ data: topEstados.map(([, val]) => val.porcentaje_participacion || val.participacion || 0) }]
      });
    }

    // 4. Rentabilidad
    const rent = data.analisis_rentabilidad;
    if (rent) {
      setRentabilidadData(rent);
    }
  };

  const renderChartConfig = (baseColor) => ({
    backgroundColor: "#fff",
    backgroundGradientFrom: "#fff",
    backgroundGradientTo: "#fff",
    decimalPlaces: 1,
    color: (opacity = 1) => baseColor(opacity),
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: "6", strokeWidth: "2", stroke: "#fff" }
  });

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color="#2E7D32" /></View>
  );

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => cargarDatos(true)} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Análisis de Mercado</Text>
        <Text style={styles.subtitle}>{cultivo}</Text>
      </View>

      {/* Gráfica de Rendimiento Histórico */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Evolución de Rendimiento (t/ha)</Text>
        {historicoPrecios ? (
          <LineChart
            data={historicoPrecios}
            width={screenWidth - 40}
            height={220}
            chartConfig={renderChartConfig((op) => `rgba(46, 125, 50, ${op})`)}
            bezier
            style={styles.chart}
          />
        ) : <Text style={styles.noData}>Datos históricos no disponibles</Text>}
      </View>

      {/* Distribución de Costos */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Estructura de Costos de Producción</Text>
        {costosData ? (
          <PieChart
            data={costosData}
            width={screenWidth - 40}
            height={200}
            chartConfig={renderChartConfig((op) => `rgba(0,0,0,${op})`)}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"15"}
          />
        ) : <Text style={styles.noData}>Detalle de costos no disponible</Text>}
      </View>

      {/* Ranking Nacional */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Principales Estados (% Prod. Nacional)</Text>
        {estadosData ? (
          <BarChart
            data={estadosData}
            width={screenWidth - 40}
            height={220}
            yAxisLabel=""
            yAxisSuffix="%"
            chartConfig={renderChartConfig((op) => `rgba(21, 101, 192, ${op})`)}
            verticalLabelRotation={30}
            style={styles.chart}
          />
        ) : <Text style={styles.noData}>Datos regionales no disponibles</Text>}
      </View>

      {/* Indicadores de Rentabilidad Master V4 */}
      {rentabilidadData && (
        <View style={styles.rentCard}>
          <Text style={styles.rentTitle}>Indicadores Financieros (Master)</Text>
          <View style={styles.rentGrid}>
            <View style={styles.rentItem}>
              <Text style={styles.rentLabel}>ROI</Text>
              <Text style={styles.rentValue}>{rentabilidadData.roi_estimado_pct || rentabilidadData.roi}%</Text>
            </View>
            <View style={styles.rentItem}>
              <Text style={styles.rentLabel}>Punto Equilibrio</Text>
              <Text style={styles.rentValue}>{rentabilidadData.punto_equilibrio_ton || 'N/A'} t</Text>
            </View>
            <View style={styles.rentItem}>
              <Text style={styles.rentLabel}>VAN (Miles)</Text>
              <Text style={styles.rentValue}>${rentabilidadData.van_miles_mxn || 'N/A'}</Text>
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
  card: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 15, elevation: 3 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15 },
  chart: { marginVertical: 8, borderRadius: 16 },
  noData: { textAlign: 'center', color: '#999', padding: 20, fontStyle: 'italic' },
  rentCard: { backgroundColor: '#1B5E20', margin: 15, padding: 20, borderRadius: 15 },
  rentTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  rentGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  rentItem: { alignItems: 'center' },
  rentLabel: { color: '#A5D6A7', fontSize: 12, marginBottom: 5 },
  rentValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});