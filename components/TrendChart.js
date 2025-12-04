// components/TrendChart.js

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const TrendChart = ({ data, metric, unit }) => {
    if (!data || data.length === 0) {
        return <Text style={chartStyles.emptyText}>No hay datos históricos disponibles para graficar.</Text>;
    }

    // Encuentra los valores máximos y mínimos para escalar el gráfico
    const values = data.map(item => item[metric]).filter(v => v !== null && v !== undefined);
    if (values.length === 0) {
        return <Text style={chartStyles.emptyText}>No hay datos válidos de rendimiento.</Text>;
    }

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;
    const normalizationFactor = range > 0 ? 100 / range : 0;
    
    // Altura mínima de la barra para que sea visible
    const baseHeight = 5;

    return (
        <View style={chartStyles.container}>
            <Text style={chartStyles.title}>Tendencia de Rendimiento Histórico ({unit})</Text>
            
            <View style={chartStyles.graphArea}>
                {/* Eje Y - Máximo */}
                <Text style={chartStyles.yLabelMax}>{maxValue.toFixed(1)}</Text>
                
                {/* Barras de datos */}
                {data.map((item, index) => {
                    const value = item[metric];
                    // Normaliza la altura entre 5% y 100%
                    let height;
                    if (range === 0) {
                        height = 80; // Altura fija si todos los valores son iguales
                    } else {
                        const normalizedValue = (value - minValue) * normalizationFactor;
                        height = Math.max(baseHeight, normalizedValue);
                    }

                    return (
                        <View key={index} style={chartStyles.barWrapper}>
                            <View 
                                style={[
                                    chartStyles.bar, 
                                    { height: `${height}%` }
                                ]} 
                            />
                            {/* Etiqueta de valor sobre la barra */}
                            <Text style={chartStyles.barValue}>{value?.toFixed(2)}</Text>
                            {/* Etiqueta del eje X (Año) */}
                            <Text style={chartStyles.xLabel}>{item.year}</Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

const chartStyles = StyleSheet.create({
    container: {
        marginTop: 20,
        padding: 10,
        backgroundColor: '#f9f9f9',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
        minHeight: 200,
    },
    title: {
        fontSize: 15,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
    },
    graphArea: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-around',
        height: 150, // Altura del área de la gráfica
        borderBottomWidth: 1,
        borderLeftWidth: 1,
        borderColor: '#ccc',
        position: 'relative',
        paddingLeft: 30, // Espacio para el label Y
    },
    yLabelMax: {
        position: 'absolute',
        top: 0,
        left: 0,
        fontSize: 10,
        fontWeight: 'bold',
        color: '#555',
    },
    barWrapper: {
        flex: 1,
        alignItems: 'center',
        marginHorizontal: 5,
        justifyContent: 'flex-end',
        position: 'relative',
    },
    bar: {
        width: '60%',
        backgroundColor: '#4CAF50',
        borderRadius: 3,
        minHeight: 1, // Mínimo de 1% para evitar 0
    },
    barValue: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#333',
        position: 'absolute',
        top: -15, // Mover la etiqueta por encima de la barra
    },
    xLabel: {
        fontSize: 11,
        marginTop: 5,
        textAlign: 'center',
        width: '100%',
    },
    emptyText: {
        textAlign: 'center',
        color: '#999',
        marginTop: 10,
    },
});

export default TrendChart;