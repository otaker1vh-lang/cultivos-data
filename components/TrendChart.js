import React from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const TrendChart = ({ data, metric, unit, isPlaceholder }) => {
  // 1. Validación de datos
  if (isPlaceholder || !data || data.length === 0) {
    return (
      <View style={styles.noDataContainer}>
        <Text style={styles.noDataText}>Gráfica no disponible para este cultivo</Text>
      </View>
    );
  }

  // 2. Detectar si los datos ya vienen formateados con 'label' y 'value'
  const yaFormateado = data[0]?.label && data[0]?.value !== undefined;
  
  let labels, values;
  
  if (yaFormateado) {
    // Datos ya vienen con estructura {label, value}
    labels = data.map(item => String(item.label));
    values = data.map(item => parseFloat(item.value) || 0);
  } else {
    // Datos originales con metric específico
    labels = data.map(item => String(item.year || item.año || ''));
    values = data.map(item => parseFloat(item[metric]) || 0);
  }

  // 3. Configuración visual del gráfico
  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 1, 
    color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
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
        width={Dimensions.get('window').width - 60}
        height={220}
        yAxisSuffix={unit ? ` ${unit}` : ''}
        chartConfig={chartConfig}
        bezier
        style={styles.chart}
        verticalLabelRotation={30}
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