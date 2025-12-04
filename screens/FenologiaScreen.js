import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import cultivosData from "../data/cultivos.json";
// ✅ Importación del componente de gráfico (ajusta la ruta si es necesario)
import GanttFenologico from '../components/GanttFenologico'; 

export default function FenologiaScreen({ route }) {
  const { cultivo } = route.params;
  
  const cultivoData = cultivosData?.cultivos?.[cultivo];
  // Usar optional chaining para evitar errores si 'ciclo_fenologico' es nulo
  const data = cultivoData?.ciclo_fenologico || null;

  if (!data) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>❌ No hay datos fenológicos para {cultivo}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.titulo}>📅 Ciclo fenológico de {cultivo}</Text>

      {/* --- VARIEDADES PRINCIPALES (NUEVO) --- */}
      <View style={styles.variedadesContainer}>
          <Text style={styles.subtitulo}>🧬 Variedades Principales:</Text>
          <Text style={styles.item}>
            {data.variedades_principales ? data.variedades_principales.join(', ') : 'Información no disponible'}
          </Text>
      </View>

      {/* --- GRÁFICA DE DESARROLLO --- */}
      <Text style={styles.subtitulo}>📈 Diagrama de Etapas</Text>
      <GanttFenologico 
        etapas={data.etapas} 
        duracionTotal={data.duracion_total_dias} 
      />
      
      {/* --- ETAPAS Y DURACIÓN (Lista) --- */}
      <Text style={styles.subtitulo}>Duración por etapa:</Text>
      <Text style={styles.item}>Duración total: **{data.duracion_total_dias ?? 'N/A'} días**</Text>
      
      {data.etapas?.map((etapa, index) => (
        <Text key={index} style={styles.etapa}>
            • **{etapa.nombre}**: {etapa.duracion_dias} días
        </Text>
      ))}

      {/* --- ESCALA BBCH --- */}
      <Text style={styles.subtitulo}>🔢 Escala BBCH (Estadios principales):</Text>
      {data.etapas?.map((etapa, index) => (
          etapa.bbch_fase && (
              <Text key={`bbch-${index}`} style={styles.etapa}>
                  • **{etapa.nombre}**: Fase BBCH {etapa.bbch_fase}
              </Text>
          )
      ))}

      {/* --- CICLO MENSUAL (Principal Estado) --- */}
      {data.ciclo_mensual_principal && Object.keys(data.ciclo_mensual_principal).length > 0 && (
          <View style={styles.fechasContainer}>
              <Text style={styles.subtitulo}>🗓️ Ciclo por Mes (Principal Estado):</Text>
              {Object.keys(data.ciclo_mensual_principal).map((mes) => (
                  <Text key={mes} style={styles.fechaItem}>
                      **{mes}**: {data.ciclo_mensual_principal[mes]}
                  </Text>
              ))}
          </View>
      )}

      {/* --- FECHAS CLAVE POR ESTADO --- */}
      {data.fechas_por_estado && data.fechas_por_estado.length > 0 && (
        <View style={styles.fechasContainer}>
          <Text style={styles.subtitulo}>🗓️ Fechas clave de siembra/cosecha:</Text>
          {data.fechas_por_estado.map((item, index) => (
            <View key={index} style={styles.fechaCard}>
              <Text style={styles.estadoNombre}>📍 {item.estado}</Text>
              <Text style={styles.fechaItem}>🌱 Siembra: {item.siembra_inicio} - {item.siembra_fin}</Text>
              <Text style={styles.fechaItem}>🌾 Cosecha: {item.cosecha_inicio} - {item.cosecha_fin}</Text>
            </View>
          ))}
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  titulo: { fontSize: 22, fontWeight: "bold", marginBottom: 15, textAlign: 'center' },
  subtitulo: { fontSize: 18, fontWeight: "bold", marginTop: 15, marginBottom: 8, color: '#2E7D32' },
  item: { fontSize: 16, marginBottom: 6 },
  etapa: { fontSize: 15, marginLeft: 10, marginBottom: 4 },
  fechasContainer: { marginTop: 10 },
  variedadesContainer: { marginBottom: 10, backgroundColor: '#F9FBE7', padding: 10, borderRadius: 8 },
  fechaCard: {
    backgroundColor: '#F3FEEF',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#A5D6A7',
  },
  estadoNombre: { fontWeight: 'bold', fontSize: 15, marginBottom: 5 },
  fechaItem: { fontSize: 14, marginLeft: 10 },
  error: { color: "red", fontSize: 18, textAlign: "center", marginTop: 50 },
});