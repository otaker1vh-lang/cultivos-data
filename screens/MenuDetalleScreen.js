import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function MenuDetalleScreen({ navigation, route }) {
    const { cultivo } = route.params;

    // Secciones de la aplicación
    const menus = [
        { titulo: '📊 Estadísticas', descripcion: 'Rendimiento, precios y superficie.', icono: 'chart-bar', ruta: 'Estadisticas' },
        { titulo: '📅 Ciclo Fenológico', descripcion: 'Etapas, BBCH y calendario de siembra.', icono: 'calendar-clock', ruta: 'Fenologia' },
        { titulo: '🧑‍🌾 Labores Culturales', descripcion: 'Prácticas recomendadas por etapa.', icono: 'shovel', ruta: 'Labores' },
        { titulo: '🐛 Plagas y Enfermedades', descripcion: 'Riesgos, síntomas y control.', icono: 'bug', ruta: 'Plagas' },
        { titulo: '🧮 Cálculo de Dosis', descripcion: 'Balanceo NPK e insumos necesarios.', icono: 'calculator-variant', ruta: 'Calculo' },
        // 🛑 DATOS AGRÍCOLAS (ELIMINADOS)
        { titulo: '🗒️ Bitácora de Campo', descripcion: 'Registro de actividades y notas.', icono: 'notebook', ruta: 'Bitacora' }, 
    ];

    React.useLayoutEffect(() => {
        // Establece el título de la barra de navegación al nombre del cultivo
        navigation.setOptions({
            title: `Menú de ${cultivo}`,
        });
    }, [navigation, cultivo]);

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.titulo}>Menú Detallado: **{cultivo}**</Text>

            <View style={styles.cardGrid}>
                {menus.map((m, i) => (
                    <TouchableOpacity
                        key={i}
                        style={styles.card}
                        // Navega a la ruta con el cultivo seleccionado
                        onPress={() => navigation.navigate(m.ruta, { cultivo: cultivo })}
                    >
                        <MaterialCommunityIcons name={m.icono} size={36} color="#007bff" />
                        <Text style={styles.cardTitle}>{m.titulo}</Text>
                        <Text style={styles.cardDesc}>{m.descripcion}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff', padding: 20 },
    titulo: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
    cardGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    card: {
        width: '48%',
        backgroundColor: '#f0f8ff',
        borderRadius: 10,
        padding: 15,
        marginBottom: 15,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#cce0ff',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    cardTitle: { fontSize: 16, fontWeight: '600', marginTop: 5, color: '#333', textAlign: 'center' },
    cardDesc: { fontSize: 12, color: '#666', marginTop: 5, textAlign: 'center' },
});