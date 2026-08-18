// src/screens/LoteSatelitalScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import MapView, { Polygon, UrlTile } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons'; 
import { supabase } from '../src/services/supabaseClient'; 

export default function LoteSatelitalScreen({ route }) {
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
            
            const { data, error } = await supabase
                .from('lotes')
                .select('nombre, coordenadas_poligono')
                .eq('id', lote_id)
                .single();

            let coordsRaw = data?.coordenadas_poligono;
            
            // 🚨 BLINDAJE 1: Validar array correcto
            if (error || !coordsRaw || !Array.isArray(coordsRaw) || coordsRaw.length < 3) {
                console.log("Coordenadas inválidas, usando lote de prueba (Texcoco)...");
                coordsRaw = [
                    { lat: 19.46, lng: -98.88 },
                    { lat: 19.47, lng: -98.88 },
                    { lat: 19.47, lng: -98.87 },
                    { lat: 19.46, lng: -98.87 }
                ];
            }

            // 🚨 BLINDAJE 2: Forzar conversión a Números Reales estrictos. 
            // Si pasamos Strings, el mapa nativo crasheará al instante.
            const coordsMapeadas = coordsRaw.map(p => {
                const lat = parseFloat(p.lat);
                const lng = parseFloat(p.lng);
                return {
                    latitude: isNaN(lat) ? 0 : lat,
                    longitude: isNaN(lng) ? 0 : lng
                };
            });

            setPoligono(coordsMapeadas);
            
            setRegion({
                latitude: coordsMapeadas[0].latitude,
                longitude: coordsMapeadas[0].longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            });

            // Formato GeoJSON exacto para el backend en Python
            const geoJsonCoords = coordsRaw.map(p => {
                const lat = parseFloat(p.lat);
                const lng = parseFloat(p.lng);
                return [isNaN(lng) ? 0 : lng, isNaN(lat) ? 0 : lat];
            });
            geoJsonCoords.push(geoJsonCoords[0]); // Cerramos el polígono repitiendo el primer punto

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
            console.error("Error conectando con motor satelital:", e);
            Alert.alert("Error de Red", "No se pudo contactar al servidor satelital.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>📡 Monitoreo Satelital (NDVI)</Text>
                {fechaSatelite ? <Text style={styles.subtitle}>Imagen libre de nubes del: {fechaSatelite}</Text> : null}
            </View>

            {loading ? (
                <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color="#2E7D32" />
                    <Text style={{marginTop: 10, color: '#555', fontWeight: 'bold'}}>Descargando datos Sentinel-2...</Text>
                </View>
            ) : !region ? (
                <View style={styles.loadingBox}>
                    <MaterialCommunityIcons name="map-marker-off" size={50} color="#D32F2F" />
                    <Text style={{marginTop: 10, color: '#555', textAlign: 'center', paddingHorizontal: 20}}>
                        No se encontraron coordenadas válidas para mostrar el mapa.
                    </Text>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <MapView
                        style={styles.map}
                        mapType="hybrid" /* 🚨 BLINDAJE 3: Forzamos la cadena de texto 'hybrid' */
                        initialRegion={region}
                    >
                        {poligono.length >= 3 ? (
                            <Polygon
                                coordinates={poligono}
                                strokeColor="#FFFFFF"
                                strokeWidth={3}
                                fillColor="transparent" /* 🚨 BLINDAJE 4: Evitar crash por rgba en alfa 0 */
                                zIndex={2}
                            />
                        ) : null}

                        {tileUrl ? (
                            <UrlTile
                                urlTemplate={tileUrl}
                                maximumZ={19}
                                minimumZ={0} /* 🚨 BLINDAJE 5: Agregar límite mínimo para evitar Crash */
                                zIndex={1}
                                opacity={0.7} 
                            />
                        ) : null}
                    </MapView>

                    {tileUrl ? (
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
                    ) : null}
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