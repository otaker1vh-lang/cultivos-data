import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';


export default function EstadoDetalleScreen({ route }) {
const { estadoId } = route.params;
const [estado, setEstado] = useState(null);


useEffect(() => {
const fetchEstado = async () => {
const d = await getDoc(doc(db, 'estadisticas', estadoId));
if (d.exists()) setEstado({ id: d.id, ...d.data() });
};
fetchEstado();
}, []);


if (!estado) return <View style={styles.container}><Text>Cargando...</Text></View>;


return (
<View style={styles.container}>
<Text style={styles.title}>{estado.estado}</Text>
<Text>Rendimiento promedio: {estado.rendimiento}</Text>
<Text>Superficie sembrada: {estado.superficie_sembrada}</Text>
<Text>Superficie cosechada: {estado.superficie_cosechada}</Text>
<Text>Precio medio rural: {estado.precio_medio}</Text>
</View>
);
}


const styles = StyleSheet.create({ container: { flex:1, padding:20 }, title:{ fontSize:20, fontWeight:'bold', marginBottom:8 } });