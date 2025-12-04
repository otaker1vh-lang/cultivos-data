import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CicloScreen({ route }) {
  const { cultivo } = route.params;

  const ciclos = {
    'Maíz': '120 días – siembra, floración y cosecha.',
    'Trigo': '150 días – germinación, espigado y madurez.',
    'Sorgo': '110 días – brote, panoja y madurez fisiológica.',
    'Frijol': '95 días – vegetativo, floración y madurez.',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>🌱 Ciclo Fenológico del {cultivo}</Text>
      <Text style={styles.text}>{ciclos[cultivo]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  titulo: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  text: { fontSize: 16 },
});