// GanttFenologico.js

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Mapeo de colores para las etapas fenológicas clave
const COLOR_MAP = {
  'Siembra/Plántula': '#A5D6A7',
  'Siembra': '#A5D6A7', 
  'Germinación/Emergencia': '#A5D6A7',
  'Emergencia/Plántula': '#A5D6A7',
  'Emergencia': '#A5D6A7',
  'Plántula': '#A5D6A7',
  'Vegetativo': '#4CAF50',
  'Vegetativo Rápido': '#4CAF50',
  'Crecimiento Vegetativo': '#4CAF50',
  'Desarrollo vegetativo': '#4CAF50',
  'Macollamiento': '#66BB6A',
  'Embuche/Espiga': '#81C784',
  'Encañado/Espigado': '#81C784',
  'Floración': '#FFEB3B',
  'Brotación/Floración': '#FFF176',
  'Brotación Vegetativa': '#FFF176',
  'Floración/Formación de Racimo': '#FFF176',
  'Fructificación': '#FF9800',
  'Llenado de Grano': '#FFB74D',
  'Llenado de Vaina': '#FFB74D',
  'Cuajado/Engorde': '#FFA726',
  'Cuajado del fruto': '#FFA726',
  'Desarrollo del fruto': '#FF8A65',
  'Cosecha': '#795548',
  'Madurez': '#A1887F',
  'Madurez de cosecha': '#A1887F',
  'Madurez Fisiológica': '#A1887F',
  'Cosecha Continua': '#BCAAA4',
  'Latencia/Dormancia': '#607D8B',
  'Dormancia/Latencia': '#607D8B',
  'Propagación/Enraizamiento': '#B0BEC5',
  'Establecimiento/Formación': '#90A4AE',
};

// Colores por defecto para etapas BBCH o no mapeadas
const COLORES_DEFAULT = [
  '#81C784', '#AED581', '#DCE775', '#FFF176', '#FFD54F',
  '#FFB74D', '#FF8A65', '#A1887F', '#90A4AE', '#B39DDB'
];

// Función para obtener color de una etapa
const obtenerColor = (nombreEtapa, index) => {
  // Intenta buscar coincidencia exacta
  if (COLOR_MAP[nombreEtapa]) {
    return COLOR_MAP[nombreEtapa];
  }
  
  // Intenta buscar por palabras clave (sin lo que está entre paréntesis)
  const nombreLimpio = nombreEtapa.split('(')[0].trim();
  if (COLOR_MAP[nombreLimpio]) {
    return COLOR_MAP[nombreLimpio];
  }
  
  // Busca coincidencias parciales en el nombre
  const palabrasClave = Object.keys(COLOR_MAP);
  for (let palabra of palabrasClave) {
    if (nombreLimpio.toLowerCase().includes(palabra.toLowerCase()) ||
        palabra.toLowerCase().includes(nombreLimpio.toLowerCase())) {
      return COLOR_MAP[palabra];
    }
  }
  
  // Si es BBCH, extrae la palabra clave después de los dos puntos
  if (nombreEtapa.includes('BBCH') && nombreEtapa.includes(':')) {
    const partes = nombreEtapa.split(':');
    if (partes.length > 1) {
      const descripcion = partes[1].trim();
      // Busca en el mapa por la descripción
      for (let palabra of palabrasClave) {
        if (descripcion.toLowerCase().includes(palabra.toLowerCase())) {
          return COLOR_MAP[palabra];
        }
      }
    }
  }
  
  // Retorna un color del array por índice (rotativo)
  return COLORES_DEFAULT[index % COLORES_DEFAULT.length];
};

// Función para acortar nombres largos
const acortarNombre = (nombre, maxLength = 20) => {
  if (!nombre) return '';
  
  // Si es BBCH, extrae solo el código
  if (nombre.includes('BBCH')) {
    const match = nombre.match(/BBCH\s+(\d+)/);
    if (match) {
      return `BBCH ${match[1]}`;
    }
  }
  
  // Si tiene dos puntos, toma solo la parte después
  if (nombre.includes(':')) {
    const partes = nombre.split(':');
    nombre = partes[partes.length - 1].trim();
  }
  
  // Trunca si es muy largo
  if (nombre.length > maxLength) {
    return nombre.substring(0, maxLength - 2) + '..';
  }
  
  return nombre;
};

export default function GanttFenologico({ etapas, duracionTotal }) {
  if (!etapas || etapas.length === 0 || !duracionTotal || duracionTotal === 0) {
    //return (
    //  <View style={ganttStyles.container}>
    //    <Text style={ganttStyles.titulo}>Diagrama no disponible (duración total 0)</Text>
    //  </View>
    //);
  }

  return (
    <View style={ganttStyles.container}>
      <Text style={ganttStyles.titulo}>Diagrama de Etapas ({duracionTotal} días)</Text>
      
      {/* Barra principal que representa el ciclo total */}
      <View style={ganttStyles.barraPrincipal}>
        {etapas.map((etapa, index) => {
          const porcentaje = (etapa.duracion_dias / duracionTotal) * 100;
          const color = obtenerColor(etapa.nombre, index);
          const nombreCorto = acortarNombre(etapa.nombre);

          return (
            <View
              key={index}
              style={[
                ganttStyles.segmento,
                { width: `${porcentaje}%`, backgroundColor: color },
              ]}
            >
              {/* Muestra texto solo si el segmento es mayor al 8% */}
              {porcentaje > 8 && (
                <Text 
                  style={ganttStyles.segmentoTexto}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {nombreCorto}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      
      {/* Leyenda */}
      {/*<View style={ganttStyles.leyendaContainer}>
        {etapas.map((etapa, index) => {
          const color = obtenerColor(etapa.nombre, index);
          return (
            <View key={index} style={ganttStyles.leyendaItem}>
              <View style={[ganttStyles.leyendaColor, { backgroundColor: color }]} />
              <Text style={ganttStyles.leyendaTexto} numberOfLines={2}>
                {etapa.nombre} ({etapa.duracion_dias}d)
              </Text>
            </View>
          );
        })}
      </View>
      */}
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
    height: 40,
    borderRadius: 5,
    overflow: 'hidden', 
    marginBottom: 15,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  segmento: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.3)',
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
    marginRight: 10,
    marginBottom: 8,
    maxWidth: '45%',
  },
  leyendaColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#999',
  },
  leyendaTexto: {
    fontSize: 11,
    color: '#333',
    flex: 1,
  },
});