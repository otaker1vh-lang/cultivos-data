import React from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const TrendChart = ({ data, metric, unit }) => {
  // 1. Validación de datos para evitar errores de renderizado
  if (!data || data.length === 0) {
    return (
      <View style={styles.noDataContainer}>
        <Text style={styles.noDataText}>Gráfica no disponible para este cultivo</Text>
      </View>
    );
  }

  // 2. Preparar etiquetas (Años) y valores dinámicos
  // El nuevo JSON usa 'year' o 'año', manejamos ambos casos
  const labels = data.map(item => String(item.year || item.año || ''));
  const values = data.map(item => item[metric] || 0);

  // 3. Configuración visual del gráfico
  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 1, 
    color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`, // Verde SADER
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: {
      r: "6",
      strokeWidth: "2",
      stroke: "#2E7D32"
    }
  };

  return (
    <View style={styles.container}>
      <LineChart
        data={{
          labels: labels,
          datasets: [{ data: values }]
        }}
        width={Dimensions.get('window').width - 60} // Ajuste dinámico al ancho de pantalla
        height={220}
        yAxisSuffix={` ${unit}`}
        chartConfig={chartConfig}
        bezier // Curva suave para las líneas
        style={styles.chart}
        verticalLabelRotation={30} // Rota etiquetas de años para que no se amontonen
      />
      <Text style={styles.footerText}>Fuente: Panorama Agroalimentario 2025</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 10,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  footerText: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 5
  },
  noDataContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 16
  },
  noDataText: {
    color: '#666',
    fontSize: 14
  }
});

export default TrendChart;