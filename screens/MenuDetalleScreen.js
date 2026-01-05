import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert, Image, StatusBar } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient'; // Asegúrate de tener instalado expo-linear-gradient
import CultivoDataManager from '../utils/CultivoDataManager'; 

export default function MenuDetalleScreen({ navigation, route }) {
    const { cultivo } = route.params; 
    
    const [panoramaUrl, setPanoramaUrl] = useState(null);
    const [imagenHeader, setImagenHeader] = useState(null);

    // --- CARGA DE DATOS ---
    useEffect(() => {
        const cargarDatos = async () => {
            const datos = await CultivoDataManager.obtenerCultivo(cultivo);
            if (datos) {
                if (datos.panorama_url) setPanoramaUrl(datos.panorama_url);
                if (datos.imagen_url) setImagenHeader(datos.imagen_url);
            }
        };
        cargarDatos();
    }, [cultivo]);

    const abrirPanorama = () => {
        if (panoramaUrl) {
            Linking.openURL(panoramaUrl).catch(err => 
                Alert.alert("Error", "No se pudo abrir el enlace.")
            );
        } else {
            Alert.alert("Próximamente", `El reporte Panorama 2025 para ${cultivo} estará disponible muy pronto.`);
        }
    };

    // Definición de menús con colores personalizados para ser más intuitivo
    const menus = [
        { titulo: 'Estadísticas', descripcion: 'Rendimiento y precios', icono: 'chart-bar', ruta: 'Estadisticas', color: '#1E88E5', bg: '#E3F2FD' },
        { titulo: 'Fenología', descripcion: 'Etapas y BBCH', icono: 'sprout', ruta: 'Fenologia', color: '#43A047', bg: '#E8F5E9' },
        { titulo: 'Labores', descripcion: 'Prácticas de campo', icono: 'shovel', ruta: 'Labores', color: '#FB8C00', bg: '#FFF3E0' },
        { titulo: 'Plagas', descripcion: 'Control sanitario', icono: 'bug', ruta: 'Plagas', color: '#E53935', bg: '#FFEBEE' },
        { titulo: 'Nutrición', descripcion: 'Plan NPK suelo', icono: 'sack', ruta: 'Fertilizantes', color: '#795548', bg: '#EFEBE9' },
        { titulo: 'Dosis', descripcion: 'Calibración foliar', icono: 'flask', ruta: 'Dosis', color: '#00897B', bg: '#E0F2F1' },
        { titulo: 'Bitácora', descripcion: 'Mis notas', icono: 'notebook-edit', ruta: 'Bitacora', color: '#8E24AA', bg: '#F3E5F5' }, 
    ];

    React.useLayoutEffect(() => {
        navigation.setOptions({ 
            title: 'Detalle del Cultivo', 
            headerStyle: { backgroundColor: '#1B5E20' },
            headerTintColor: '#fff',
            headerShadowVisible: false // Elimina la línea del header nativo para unirlo con nuestro gradiente
        });
    }, [navigation]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
            
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                
                {/* HEADER MODERNO: Imagen Izq + Texto Der */}
                <LinearGradient 
                    colors={['#1B5E20', '#2E7D32', '#43A047']} 
                    style={styles.headerContainer}
                    start={{x: 0, y: 0}} 
                    end={{x: 1, y: 1}}
                >
                    <View style={styles.headerContent}>
                        {/* Lado Izquierdo: Imagen */}
                        <View style={styles.imageContainer}>
                            {imagenHeader ? (
                                <Image 
                                    source={{ uri: imagenHeader }} 
                                    style={styles.cropImage}
                                />
                            ) : (
                                <View style={styles.fallbackIcon}>
                                    <MaterialCommunityIcons name="leaf" size={40} color="#2E7D32" />
                                </View>
                            )}
                        </View>

                        {/* Lado Derecho: Información */}
                        <View style={styles.textContainer}>
                            <Text style={styles.cultivoTitle}>{cultivo}</Text>
                            <View style={styles.tagContainer}>
                                <MaterialCommunityIcons name="check-decagram" size={14} color="#A5D6A7" />
                                <Text style={styles.cultivoSub}>Ficha Técnica</Text>
                            </View>
                        </View>
                    </View>
                </LinearGradient>

                {/* Grid de Menús */}
                <View style={styles.gridContainer}>
                    <Text style={styles.sectionLabel}>Herramientas Disponibles</Text>
                    <View style={styles.cardGrid}>
                        {menus.map((m, index) => (
                            <TouchableOpacity
                                key={index}
                                style={styles.card}
                                onPress={() => navigation.navigate(m.ruta, { cultivo: cultivo })}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.iconCircle, { backgroundColor: m.bg }]}>
                                    <MaterialCommunityIcons name={m.icono} size={28} color={m.color} />
                                </View>
                                <View style={styles.cardTextContent}>
                                    <Text style={styles.cardTitle}>{m.titulo}</Text>
                                    <Text style={styles.cardDesc} numberOfLines={2}>{m.descripcion}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Botón Panorama PDF */}
                <View style={styles.footerSection}>
                    <TouchableOpacity 
                        style={[styles.pdfButton, !panoramaUrl && styles.pdfButtonDisabled]} 
                        onPress={abrirPanorama}
                    >
                        <LinearGradient
                             colors={panoramaUrl ? ['#D32F2F', '#B71C1C'] : ['#E57373', '#EF9A9A']}
                             style={styles.pdfGradient}
                        >
                            <View style={styles.pdfIconContainer}>
                                <MaterialCommunityIcons name="file-pdf-box" size={30} color="#fff" />
                            </View>
                            <View style={{flex: 1}}>
                                <Text style={styles.pdfButtonText}>Panorama Agroalimentario</Text>
                                <Text style={styles.pdfButtonSub}>
                                    {panoramaUrl ? "Descargar reporte 2025" : "No disponible aún"}
                                </Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={24} color="rgba(255,255,255,0.7)" />
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F7FA' },
    
    // --- Header Estilos ---
    headerContainer: {
        paddingTop: 10,
        paddingBottom: 30,
        paddingHorizontal: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 5,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    imageContainer: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    },
    cropImage: {
        width: 90,
        height: 90,
        borderRadius: 45,
        borderWidth: 3,
        borderColor: '#fff',
        backgroundColor: '#fff'
    },
    fallbackIcon: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#E8F5E9',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#fff',
    },
    textContainer: {
        marginLeft: 20,
        flex: 1,
    },
    cultivoTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        textTransform: 'capitalize',
        marginBottom: 5,
    },
    tagContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 15,
        alignSelf: 'flex-start'
    },
    cultivoSub: {
        fontSize: 12,
        color: '#E8F5E9',
        marginLeft: 5,
        fontWeight: '600'
    },

    // --- Grid Estilos ---
    gridContainer: {
        paddingHorizontal: 20,
    },
    sectionLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#37474F',
        marginBottom: 15,
        marginLeft: 5
    },
    cardGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    card: {
        width: '48%', // Dos columnas
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 15,
        marginBottom: 15,
        alignItems: 'center', // Centrado horizontalmente
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    iconCircle: {
        width: 55,
        height: 55,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardTextContent: {
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    cardDesc: {
        fontSize: 11,
        color: '#90A4AE',
        textAlign: 'center',
        lineHeight: 14,
    },

    // --- Footer PDF ---
    footerSection: {
        paddingHorizontal: 20,
        marginTop: 10,
    },
    pdfButton: {
        borderRadius: 15,
        shadowColor: "#D32F2F",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 4,
    },
    pdfGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderRadius: 15,
    },
    pdfIconContainer: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 8,
        borderRadius: 10,
        marginRight: 15
    },
    pdfButtonDisabled: {
        shadowOpacity: 0.1,
        elevation: 1,
    },
    pdfButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16
    },
    pdfButtonSub: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        marginTop: 2
    }
});