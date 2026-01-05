// GanttFenologico.js

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Mapeo de colores para las etapas fenológicas clave
const COLOR_MAP = {
  'Siembra/Plántula': '#A5D6A7', // Verde claro
  'Siembra': '#A5D6A7', 
  'Germinación/Emergencia': '#A5D6A7',
  'Emergencia/Plántula': '#A5D6A7',
  'Vegetativo': '#4CAF50', // Verde medio
  'Vegetativo Rápido': '#4CAF50',
  'Crecimiento Vegetativo': '#4CAF50',
  'Macollamiento': '#66BB6A',
  'Embuche/Espiga': '#81C784',
  'Encañado/Espigado': '#81C784',
  'Floración': '#FFEB3B', // Amarillo
  'Brotación/Floración': '#FFF176',
  'Brotación Vegetativa': '#FFF176',
  'Floración/Formación de Racimo': '#FFF176',
  'Fructificación': '#FF9800', // Naranja
  'Llenado de Grano': '#FFB74D',
  'Llenado de Vaina': '#FFB74D',
  'Cuajado/Engorde': '#FFA726',
  'Cuajado del fruto': '#FFA726',
  'Desarrollo del fruto': '#2638ffff',
  'Cosecha': '#795548', // Marrón
  'Madurez': '#A1887F',
  'Madurez de cosecha': '#A1887F',
  'Madurez Fisiológica': '#A1887F',
  'Cosecha Continua': '#BCAAA4',
  // Etapas de Frutales o Dormancia
  'Latencia/Dormancia': '#607D8B',
  'Dormancia/Latencia': '#607D8B',
  'Propagación/Enraizamiento': '#B0BEC5',
  'Establecimiento/Formación': '#90A4AE',
};

export default function GanttFenologico({ etapas, duracionTotal }) {
  if (!etapas || etapas.length === 0 || !duracionTotal || duracionTotal === 0) return (
    <View style={ganttStyles.container}>
        <Text style={ganttStyles.titulo}>Diagrama no disponible (duración total 0)</Text>
    </View>
  );

  return (
    <View style={ganttStyles.container}>
      <Text style={ganttStyles.titulo}>Diagrama de Etapas ({duracionTotal} días)</Text>
      
      {/* Barra principal que representa el ciclo total */}
      <View style={ganttStyles.barraPrincipal}>
        {etapas.map((etapa, index) => {
          // Calcula el porcentaje de la duración total
          const porcentaje = (etapa.duracion_dias / duracionTotal) * 100;
          // Usa el mapa de colores o gris por defecto
          const color = COLOR_MAP[etapa.nombre] || COLOR_MAP[etapa.nombre.split('(')[0].trim()] || '#9E9E9E'; 

          return (
            <View
              key={index}
              style={[
                ganttStyles.segmento,
                { width: `${porcentaje}%`, backgroundColor: color },
              ]}
            >
              {/* Muestra texto solo si el segmento es lo suficientemente grande (más del 10% del ciclo) */}
              {porcentaje > 10 && (
                <Text style={ganttStyles.segmentoTexto}>{etapa.nombre.split('/')[0]}</Text>
              )}
            </View>
          );
        })}
      </View>
      
      {/* Leyenda */}
      <View style={ganttStyles.leyendaContainer}>
        {etapas.map((etapa, index) => {
            const color = COLOR_MAP[etapa.nombre] || COLOR_MAP[etapa.nombre.split('(')[0].trim()] || '#9E9E9E'; 
            return (
                <View key={index} style={ganttStyles.leyendaItem}>
                    <View style={[ganttStyles.leyendaColor, { backgroundColor: color }]} />
                    <Text style={ganttStyles.leyendaTexto}>{etapa.nombre}</Text>
                </View>
            );
        })}
      </View>
    </View>
  );
}

const ganttStyles = StyleSheet.create({
  container: { 
    marginTop: 10, 
    paddingBottom: 10, 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  titulo: { 
    fontSize: 16, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    marginBottom: 10, 
    padding: 5, 
    backgroundColor: '#f5f5f5', 
    borderTopLeftRadius: 8, 
    borderTopRightRadius: 8 
  },
  barraPrincipal: {
    flexDirection: 'row',
    height: 30,
    borderRadius: 5,
    overflow: 'hidden', 
    marginBottom: 10,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  segmento: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  segmentoTexto: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  leyendaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
    marginTop: 5,
  },
  leyendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    marginBottom: 5,
  },
  leyendaColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 5,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  leyendaTexto: {
    fontSize: 12,
  },
});