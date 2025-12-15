import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import cultivosData from "../data/cultivos.json";

export default function LaboresScreen({ route }) {
  const { cultivo } = route.params;
  
  const cultivoData = cultivosData?.cultivos?.[cultivo];

  if (!cultivoData) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>❌ No se encontraron datos para {cultivo}</Text>
      </View>
    );
  }

  // Extraemos las nuevas secciones con seguridad (optional chaining)
  const laboresPorEtapa = cultivoData.labores || {};
  const agroclima = cultivoData.requerimientos_agroclimaticos; 
  const etapas = Object.keys(laboresPorEtapa);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.titulo}>🧑‍🌾 Guía Técnica: {cultivo}</Text>

      {/* --- SECCIÓN NUEVA: REQUERIMIENTOS AGROCLIMÁTICOS --- */}
      {agroclima ? (
        <View style={styles.cardInfo}>
          <Text style={styles.subtituloInfo}>🌤️ Requerimientos Agroclimáticos</Text>
          
          <View style={styles.row}>
            <Text style={styles.label}>🌡️ Temp:</Text>
            <Text style={styles.value}>{agroclima.temperatura || "N/D"}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>🏔️ Altitud:</Text>
            <Text style={styles.value}>{agroclima.altitud || "N/D"}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>💧 Lluvia:</Text>
            <Text style={styles.value}>{agroclima.precipitacion || "N/D"}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>🌱 Suelo:</Text>
            <Text style={styles.value}>{agroclima.suelo || "N/D"}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>🧪 pH:</Text>
            <Text style={styles.value}>{agroclima.ph || "N/D"}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.warning}>⚠️ Información agroclimática no disponible.</Text>
      )}

      {/* --- SECCIÓN EXISTENTE: LABORES --- */}
      <Text style={styles.sectionHeader}>🚜 Labores Culturales</Text>
      
      {etapas.length > 0 ? (
        etapas.map((etapa, index) => (
          <View key={index} style={styles.card}>
            <Text style={styles.subtitulo}>🔹 {etapa}</Text>
            {laboresPorEtapa[etapa].map((labor, idx) => (
              <Text key={idx} style={styles.item}>
                • {labor}
              </Text>
            ))}
          </View>
        ))
      ) : (
        <Text style={styles.error}>No hay labores registradas.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#F5F5F5" },
  titulo: { fontSize: 24, fontWeight: "bold", marginBottom: 15, color: "#333", textAlign: 'center' },
  sectionHeader: { fontSize: 20, fontWeight: "bold", marginVertical: 10, color: "#444" },
  
  // Estilos para la tarjeta de Clima
  cardInfo: {
    backgroundColor: "#FFF3E0", // Naranja suave para diferenciar del verde de labores
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    elevation: 3, // Sombra en Android
    shadowColor: "#000", // Sombra en iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  subtituloInfo: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#E65100",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#FFCC80",
    paddingBottom: 5,
  },
  row: {
    flexDirection: "row",
    marginBottom: 6,
    alignItems: "flex-start", // Alinea arriba si el texto es largo
  },
  label: {
    fontWeight: "bold",
    width: 90, // Ancho fijo para alinear
    color: "#5D4037",
  },
  value: {
    flex: 1, // Toma el resto del espacio
    color: "#3E2723",
  },

  // Estilos existentes (mejorados ligeramente)
  card: {
    backgroundColor: "#E8F5E9", 
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
  },
  subtitulo: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2E7D32",
    marginBottom: 8,
  },
  item: { fontSize: 16, marginLeft: 10, marginBottom: 4, color: "#333" },
  error: { color: "red", fontSize: 16, textAlign: "center", marginTop: 20 },
  warning: { color: "#757575", fontStyle: "italic", textAlign: "center", marginBottom: 15 },
});