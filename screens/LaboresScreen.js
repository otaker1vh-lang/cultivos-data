import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CultivoDataManager from "../utils/CultivoDataManager";

export default function LaboresScreen({ route }) {
  const { cultivo } = route.params;
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [etapaExpandida, setEtapaExpandida] = useState(null);

  useEffect(() => {
    const cargarDatos = async () => {
      setLoading(true);
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
      setCultivoData(data);
      setLoading(false);
    };
    cargarDatos();
  }, [cultivo]);

  if (loading) return <ActivityIndicator size="large" style={{flex:1}} />;

  const agro = cultivoData?.requerimientos_agroclimaticos || {};
  const laboresMap = cultivoData?.labores_culturales || {};
  // Filtrar solo las llaves que son etapas de labores
  const etapasLabores = Object.keys(laboresMap).filter(key => key !== 'resumen_costos_anuales');

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.titulo}>Guía Técnica: {cultivo}</Text>

      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>🌤️ Requerimientos Agroclimáticos</Text>
        <Text style={styles.infoText}>• Temperatura: {agro.temperatura?.optima_crecimiento || "N/D"}</Text>
        <Text style={styles.infoText}>• Suelo: {agro.suelo?.textura || "N/D"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋 Labores Culturales</Text>
        {etapasLabores.length > 0 ? etapasLabores.map((etapa, index) => (
          <TouchableOpacity 
            key={index} 
            style={styles.etapaCard}
            onPress={() => setEtapaExpandida(etapaExpandida === index ? null : index)}
          >
            <Text style={styles.etapaTitulo}>🔹 {etapa}</Text>
            {etapaExpandida === index && (
              <View style={styles.detalleLabores}>
                {laboresMap[etapa]?.actividades?.map((act, i) => (
                  <View key={i} style={styles.laborItem}>
                    <Text style={styles.laborTexto}>✅ {act.labor}</Text>
                    <Text style={styles.laborSubtexto}>{act.objetivo}</Text>
                  </View>
                ))}
              </View>
            )}
          </TouchableOpacity>
        )) : <Text>No hay labores registradas</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5", padding: 20 },
  titulo: { fontSize: 20, fontWeight: "bold", color: '#2E7D32', marginBottom: 15, textAlign: 'center' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15 },
  cardInfo: { backgroundColor: '#FFF3E0', padding: 15, borderRadius: 12, marginBottom: 15 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  infoText: { fontSize: 14, color: '#555', marginBottom: 5 },
  etapaCard: { backgroundColor: '#E8F5E9', padding: 12, borderRadius: 8, marginBottom: 8 },
  etapaTitulo: { fontWeight: 'bold', color: '#2E7D32' },
  detalleLabores: { marginTop: 10 },
  laborItem: { marginBottom: 8 },
  laborTexto: { fontSize: 14, fontWeight: '600' },
  laborSubtexto: { fontSize: 12, color: '#666' }
});