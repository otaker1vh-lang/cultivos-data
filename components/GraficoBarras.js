import React from 'react';
import { BarChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';


export default function GraficoBarras({ labels, data }) {
const screenWidth = Dimensions.get('window').width - 40;
return (
<BarChart
data={{ labels, datasets: [{ data }] }}
width={screenWidth}
height={220}
yAxisLabel=""
chartConfig={{
backgroundGradientFrom: '#fff',
backgroundGradientTo: '#fff',
decimalPlaces: 2,
color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
labelColor: (opacity = 1) => `rgba(0,0,0, ${opacity})`
}}
style={{ marginVertical: 8 }}
/>
);
}