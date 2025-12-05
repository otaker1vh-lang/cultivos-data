import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Importamos el JSON directamente
import treatmentsData from '../assets/model/treatments.json';

export const TreatmentCard = ({ predictionClass }) => {
  // predictionClass es el string que sale del modelo (ej: "Tomato___Early_blight")
  
  // Buscamos los datos. Si no existe, mostramos un genérico.
  const info = treatmentsData[predictionClass] || {
    name: "Enfermedad Desconocida",
    description: "No tenemos información específica para este resultado.",
    severity: "low"
  };

  // Definir color según severidad
  const getColor = (severity) => {
    switch(severity) {
      case 'critical': return '#D32F2F'; // Rojo
      case 'high': return '#F57C00';     // Naranja
      case 'none': return '#388E3C';     // Verde
      default: return '#757575';         // Gris
    }
  };

  const color = getColor(info.severity);

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      
      {/* Título de la Enfermedad */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: color }]}>{info.name}</Text>
        {info.severity !== 'none' && (
            <Ionicons name="alert-circle" size={24} color={color} />
        )}
      </View>

      <Text style={styles.description}>{info.description}</Text>

      {/* Solo mostrar tratamientos si hay enfermedad */}
      {info.severity !== 'none' && (
        <>
          <View style={styles.section}>
            <Text style={styles.subTitle}>🌱 Tratamiento Orgánico</Text>
            <Text style={styles.body}>{info.organic}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.subTitle}>🧪 Tratamiento Químico</Text>
            <Text style={styles.body}>{info.chemical}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.subTitle}>🛡️ Prevención</Text>
            <Text style={styles.body}>{info.prevention}</Text>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    margin: 15,
    elevation: 4, // Sombra Android
    shadowColor: '#000', // Sombra iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    borderLeftWidth: 6, // Línea de color a la izquierda
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    flex: 1,
  },
  description: {
    fontSize: 16,
    color: '#555',
    marginBottom: 15,
    fontStyle: 'italic',
  },
  section: {
    marginTop: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  subTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  body: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
  },
});