import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';


export default function CalculoFertilizantesScreen() {
const [superficie, setSuperficie] = useState('');
const [dosis, setDosis] = useState('');
const [resultado, setResultado] = useState(null);


const calcular = () => {
const s = Number(superficie);
const d = Number(dosis);
if (!s || !d) return Alert.alert('Error', 'Ingresa superficie y dosis válidas');
const total = s * d; // kg o L total
setResultado(total);
};


return (
<View style={styles.container}>
<Text style={styles.title}>Calculadora de dosis</Text>
<TextInput placeholder="Superficie (ha)" keyboardType="numeric" value={superficie} onChangeText={setSuperficie} style={styles.input} />
<TextInput placeholder="Dosis (kg/ha o L/ha)" keyboardType="numeric" value={dosis} onChangeText={setDosis} style={styles.input} />
<Button title="Calcular" onPress={calcular} />
{resultado !== null && (
<Text style={{ marginTop: 12 }}>Necesitas aplicar {resultado} unidades totales.</Text>
)}
</View>
);
}


const styles = StyleSheet.create({ container:{ flex:1, padding:20 }, title:{ fontSize:18, fontWeight:'bold', marginBottom:10 }, input:{ borderWidth:1, padding:8, marginBottom:10 } });