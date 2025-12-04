import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, Dimensions } from "react-native";
import cultivosData from "../data/cultivos.json";
import TrendChart from '../components/TrendChart'; 

export default function EstadisticasScreen({ route }) {
  const { cultivo } = route.params; 
  
  // Acceso seguro a los datos del cultivo
  const cultivoData = cultivosData?.cultivos?.[cultivo];

  if (!cultivoData || !cultivoData.estadisticas) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>❌ No se encontraron datos para: "{cultivo}"</Text>
      </View>
    );
  }

  const stats = cultivoData.estadisticas;
  
  // INTENTO DE RECUPERACIÓN DE DATOS (Busca en dos lugares posibles del JSON)
  // A veces el panorama está dentro de estadisticas, a veces está fuera.
  const panorama = stats.panorama_2023_summary;

  // Lógica de visualización para el rendimiento
  const rendimientoTexto = stats.rendimiento_promedio_t_por_ha 
    ? `${stats.rendimiento_promedio_t_por_ha.toFixed(2)} t/ha`
    : stats.rendimiento_alternativo || 'N/A';
  
  // Formato seguro para superficies
  const superficieSembrada = stats.superficie_sembrada_ha 
    ? `${stats.superficie_sembrada_ha.toLocaleString()} ha` 
    : 'N/A';
    
  const superficieCosechada = stats.superficie_cosechada_ha 
    ? `${stats.superficie_cosechada_ha.toLocaleString()} ha` 
    : 'N/A';
  
  const historialRendimiento = useMemo(() => stats.historial_produccion || [], [stats]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.titulo}>📈 Producción de {cultivo}</Text>
      
      {/* --- TARJETA 1: Estadísticas Base --- */}
      <View style={styles.card}>
        <Text style={styles.subtituloCard}>📊 Estadísticas Base</Text>
        <Text style={styles.item}>
            🌍 Estados: <Text style={styles.bold}>{stats.principales_estados ? stats.principales_estados.join(', ') : 'N/A'}</Text>
        </Text>
        <Text style={styles.item}>🌾 Rendimiento: <Text style={styles.bold}>{rendimientoTexto}</Text></Text>
        <Text style={styles.item}>🌱 Sembrada: {superficieSembrada}</Text>
        <Text style={styles.item}>🧑‍🌾 Cosechada: {superficieCosechada}</Text>
        <Text style={styles.item}>
            💰 Precio medio: <Text style={styles.bold}>{stats.precio_medio_mxn_ton 
                ? `$${stats.precio_medio_mxn_ton.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} /ton` 
                : 'N/A'}</Text>
        </Text>
      </View>
      
      {/* --- TARJETA 2: Panorama Agroalimentario --- */}
      <View style={[styles.card, styles.panoramaCard]}>
        <Text style={styles.subtituloCard}>📰 Panorama Agroalimentario</Text>
        
        <Text style={styles.item}>
          Producción total: <Text style={styles.bold}>{panorama.produccion_miles_ton 
            ? `${panorama.produccion_miles_ton.toLocaleString()} (miles ton)` 
            : 'N/A'}</Text>
        </Text>

        <Text style={styles.item}>
          Variación anual: <Text style={styles.bold}>{panorama.variacion_anual_pct 
            ? `${panorama.variacion_anual_pct.toFixed(1)}%` 
            : 'N/A'}</Text>
        </Text>

        <Text style={styles.item}>
          TMAC (10 años): <Text style={styles.bold}>{panorama.tmac_10_anos_pct 
            ? `${panorama.tmac_10_anos_pct}%` 
            : 'N/A'}</Text>
        </Text>

        <Text style={styles.item}>
            Ranking Mundial: <Text style={styles.bold}>{panorama.ranking_mundial || 'N/A'}</Text>
        </Text>
        <Text style={styles.item}>
            Consumo Per Cápita: <Text style={styles.bold}>{panorama.consumo_per_capita || 'N/A'}</Text>
        </Text>
      </View>
      
      {/* --- Gráfica de Tendencia (CON CONTENEDOR FIJO PARA EVITAR OVERLAP) --- */}
      <View style={styles.chartContainer}>
        <Text style={styles.subtituloCard}>Tendencia de Rendimiento</Text>
        {historialRendimiento.length > 0 ? (
            <TrendChart 
              data={historialRendimiento} 
              metric="rendimiento_t_ha" 
              unit="t/ha"
            />
        ) : (
          <Text style={styles.noChartText}>
            No hay datos históricos para graficar.
          </Text>
        )}
      </View>
      
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { padding: 20, paddingBottom: 50 }, // Padding extra abajo
  titulo: { fontSize: 22, fontWeight: "bold", marginBottom: 15, textAlign: 'center', color: '#1B5E20' },
  subtituloCard: { fontSize: 16, fontWeight: "bold", marginTop: 5, marginBottom: 8, color: '#2E7D32' },
  
  // Estilos de texto
  item: { fontSize: 14, marginBottom: 6, color: '#333' },
  bold: { fontWeight: 'bold', color: '#000' },
  error: { fontSize: 18, color: 'red', textAlign: 'center', marginTop: 50 },
  
  // Tarjetas
  card: {
    backgroundColor: '#F1F8E9', 
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    elevation: 2, // Sombra Android
    shadowColor: "#000", // Sombra iOS
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.20,
    shadowRadius: 1.41,
  },
  panoramaCard: {
    backgroundColor: '#FFF8E1', 
    borderColor: '#FFE082',
  },

  // Contenedor de Gráfica (LA SOLUCIÓN AL OVERLAP)
  chartContainer: {
    marginBottom: 30,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    height: 350, // Altura fija forzada para reservar espacio
    justifyContent: 'center'
  },
  noChartText: { textAlign:'center', fontStyle:'italic', color:'#777' }
});