import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import cultivosData from "../data/cultivos.json";

export default function LaboresScreen({ route }) {
  const { cultivo } = route.params;
  
  // ✅ CORRECCIÓN CRÍTICA: Acceder al objeto principal y luego a 'labores'
  const cultivoData = cultivosData?.cultivos?.[cultivo];

  if (!cultivoData || !cultivoData.labores) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>❌ No se encontraron labores para {cultivo}</Text>
      </View>
    );
  }

  const laboresPorEtapa = cultivoData.labores;
  const etapas = Object.keys(laboresPorEtapa);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.titulo}>🧑‍🌾 Labores culturales de {cultivo}</Text>
      
      {/* ✅ Iterar sobre las etapas (claves del objeto) */}
      {etapas.map((etapa, index) => (
        <View key={index} style={styles.card}>
          <Text style={styles.subtitulo}>🔹 {etapa}</Text>
          {/* ✅ Iterar sobre el array de labores dentro de cada etapa */}
          {laboresPorEtapa[etapa].map((labor, idx) => (
            <Text key={idx} style={styles.item}>
              • {labor}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  titulo: { fontSize: 22, fontWeight: "bold", marginBottom: 10 },
  card: {
    backgroundColor: "#E8F5E9", // Color suave para la etapa
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
  },
  subtitulo: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2E7D32",
    marginBottom: 5,
  },
  item: { fontSize: 16, marginLeft: 10, marginBottom: 2 },
  error: { color: "red", fontSize: 18, textAlign: "center", marginTop: 50 },
});