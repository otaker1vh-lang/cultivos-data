// src/screens/LoteSatelitalScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import MapView, { Polygon, UrlTile, MAP_TYPES } from 'react-native-maps';
import { supabase } from '../src/services/supabaseClient'; 

export default function LoteSatelitalScreen({ route }) {
    // Recibimos el ID del lote que el usuario seleccionó en la pantalla principal
    const { lote_id } = route.params || {};
    
    const [poligono, setPoligono] = useState([]);
    const [region, setRegion] = useState(null);
    const [tileUrl, setTileUrl] = useState(null);
    const [fechaSatelite, setFechaSatelite] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!lote_id) {
            Alert.alert("Error", "No se ha seleccionado ningún lote para analizar.");
            setLoading(false);
            return;
        }
        cargarDatosLoteYNDVI();
    }, [lote_id]);

    const cargarDatosLoteYNDVI = async () => {
        try {
            setLoading(true);
            
            // 1. Obtener las coordenadas del lote desde Supabase
            // (Asumimos que guardaste el polígono como JSON en la columna 'coordenadas_poligono')
            const { data, error } = await supabase
                .from('lotes')
                .select('nombre, coordenadas_poligono')
                .eq('id', lote_id)
                .single();

            // Si es un lote de prueba y no tiene coordenadas, usaremos las de Texcoco para que veas la magia
            let coords = data?.coordenadas_poligono;
            if (error || !coords || coords.length === 0) {
                console.log("No se encontraron coordenadas en la BD, usando lote de prueba (Texcoco)...");
                coords = [
                    { lat: 19.46, lng: -98.88 },
                    { lat: 19.47, lng: -98.88 },
                    { lat: 19.47, lng: -98.87 },
                    { lat: 19.46, lng: -98.87 }
                ];
            }

            setPoligono(coords);
            
            // Centrar el mapa en la parcela
            setRegion({
                latitude: coords[0].lat,
                longitude: coords[0].lng,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            });

            // 2. Convertir coordenadas a formato GeoJSON [[lng, lat]] para Python
            const geoJsonCoords = coords.map(p => [p.lng, p.lat]);
            // Cerrar el polígono repitiendo el primer punto al final
            geoJsonCoords.push([coords[0].lng, coords[0].lat]);

            // 3. Consultar a tu servidor Python local
            // 🚨 ¡CAMBIA 192.168.1.X POR LA IP DE TU COMPUTADORA! 🚨
            const urlServidorPython = 'https://motor-satelital-roslin.onrender.com/get_ndvi_tile'; 

            const response = await fetch(urlServidorPython, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ polygon: [geoJsonCoords] })
            });

            const result = await response.json();

            if (result.status === "success") {
                setTileUrl(result.tile_url);
                setFechaSatelite(result.fecha_imagen);
            } else {
                Alert.alert("Aviso", "No hay imágenes recientes sin nubes para esta zona.");
            }

        } catch (e) {
            console.error("Error conectando con el motor satelital:", e);
            Alert.alert("Error de Red", "No se pudo contactar al servidor satelital.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>📡 Monitoreo Satelital (NDVI)</Text>
                {fechaSatelite && <Text style={styles.subtitle}>Imagen libre de nubes del: {fechaSatelite}</Text>}
            </View>

            {loading ? (
                <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color="#2E7D32" />
                    <Text style={{marginTop: 10, color: '#555', fontWeight: 'bold'}}>Descargando datos Sentinel-2...</Text>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <MapView
                        style={styles.map}
                        mapType={MAP_TYPES.HYBRID} // Mapa satelital de fondo con calles
                        initialRegion={region}
                    >
                        {/* 1. Dibujamos el contorno blanco de la parcela */}
                        {poligono.length > 0 && (
                            <Polygon
                                coordinates={poligono}
                                strokeColor="#FFFFFF"
                                strokeWidth={3}
                                fillColor="rgba(0,0,0,0)" // Transparente para ver colores adentro
                                zIndex={2}
                            />
                        )}

                        {/* 2. PINTAMOS LA CAPA MÁGICA DE COLORES NDVI DE GOOGLE */}
                        {tileUrl && (
                            <UrlTile
                                urlTemplate={tileUrl}
                                maximumZ={19}
                                zIndex={1}
                                opacity={0.7} // 70% opaco para ver el relieve real debajo
                            />
                        )}
                    </MapView>

                    {/* Simbología para el agricultor */}
                    {tileUrl && (
                        <View style={styles.legendContainer}>
                            <Text style={styles.legendTitle}>Vigor del Cultivo</Text>
                            <View style={styles.colorBar}>
                                <View style={[styles.colorBox, {backgroundColor: '#d7191c'}]}><Text style={styles.colorText}>Malo</Text></View>
                                <View style={[styles.colorBox, {backgroundColor: '#fdae61'}]} />
                                <View style={[styles.colorBox, {backgroundColor: '#ffffbf'}]} />
                                <View style={[styles.colorBox, {backgroundColor: '#a6d96a'}]} />
                                <View style={[styles.colorBox, {backgroundColor: '#1a9641'}]}><Text style={styles.colorText}>Excelente</Text></View>
                            </View>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFF' },
    header: { padding: 15, backgroundColor: '#1B5E20', paddingTop: 40 },
    title: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    subtitle: { color: '#A5D6A7', fontSize: 12, marginTop: 4 },
    map: { flex: 1 },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    legendContainer: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: 'rgba(255,255,255,0.95)', padding: 10, borderRadius: 10, elevation: 5 },
    legendTitle: { fontSize: 12, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 5 },
    colorBar: { flexDirection: 'row', height: 20, borderRadius: 5, overflow: 'hidden' },
    colorBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    colorText: { fontSize: 9, color: 'white', fontWeight: 'bold', textShadowColor: 'black', textShadowRadius: 2 }
});