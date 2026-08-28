import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import MapView, { Polygon, UrlTile } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons'; 
import { supabase } from '../src/services/supabaseClient'; 

export default function LoteSatelitalScreen({ route }) {
    const { lote_id, coords_offline } = route.params || {};
    
    const [poligono, setPoligono] = useState([]);
    const [region, setRegion] = useState(null);
    const [tileUrl, setTileUrl] = useState(null);
    const [fechaSatelite, setFechaSatelite] = useState(null);
    const [loading, setLoading] = useState(true);
    // NUEVO ESTADO: Control de Índices Múltiples
    const [capaActiva, setCapaActiva] = useState('NDVI'); 

    useEffect(() => {
        const controller = new AbortController();

        if (!lote_id) {
            Alert.alert("Error", "No se ha seleccionado ningún lote para analizar.");
            setLoading(false);
            return;
        }
        
        cargarDatosLoteYNDVI(controller);

        return () => {
            controller.abort();
        };
    // Re-ejecutar la petición cuando el usuario cambie la capa satelital
    }, [lote_id, coords_offline, capaActiva]); 

    const cargarDatosLoteYNDVI = async (controller) => {
        try {
            setLoading(true);
            setTileUrl(null); // Limpiar mosaico anterior
            
            let coordsRaw = coords_offline;

            if (!coordsRaw) {
                const { data, error } = await supabase
                    .from('lotes')
                    .select('nombre, coordenadas_poligono')
                    .eq('id', lote_id)
                    .single();
                
                if (controller.signal.aborted) return;
                
                coordsRaw = data?.coordenadas_poligono;
                if (error) throw error;
            }

            if (!coordsRaw || !Array.isArray(coordsRaw) || coordsRaw.length < 3) {
                coordsRaw = [
                    { lat: 19.46, lng: -98.88 }, { lat: 19.47, lng: -98.88 },
                    { lat: 19.47, lng: -98.87 }, { lat: 19.46, lng: -98.87 }
                ];
            }

            const coordsMapeadas = coordsRaw.map(p => ({
                latitude: isNaN(parseFloat(p.lat)) ? 0 : parseFloat(p.lat),
                longitude: isNaN(parseFloat(p.lng)) ? 0 : parseFloat(p.lng)
            }));

            setPoligono(coordsMapeadas);
            
            setRegion({
                latitude: coordsMapeadas[0].latitude,
                longitude: coordsMapeadas[0].longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            });

            const geoJsonCoords = coordsRaw.map(p => [
                isNaN(parseFloat(p.lng)) ? 0 : parseFloat(p.lng), 
                isNaN(parseFloat(p.lat)) ? 0 : parseFloat(p.lat)
            ]);
            geoJsonCoords.push(geoJsonCoords[0]); 

            const urlServidorPython = 'https://motor-satelital-roslin.onrender.com/get_ndvi_tile'; 
            const timeoutId = setTimeout(() => controller.abort(), 15000); 

            try { 
                const response = await fetch(urlServidorPython, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // NUEVO: Enviamos el índice exacto que queremos calcular
                    body: JSON.stringify({ polygon: [geoJsonCoords], index_type: capaActiva }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                if (controller.signal.aborted) return;

                const result = await response.json();
                if (controller.signal.aborted) return;

                if (result.status === "success") {
                    setTileUrl(result.tile_url);
                    setFechaSatelite(result.fecha_imagen);
                } else {
                    Alert.alert("Aviso", "No hay imágenes recientes sin nubes para esta zona.");
                }

            } catch (error) { 
                clearTimeout(timeoutId);
                if (error.name !== 'AbortError') {
                    Alert.alert("Error de Red", "No se pudo contactar al servidor satelital.");
                }
            }
            
        } catch (errorSupabase) { 
            if (!controller.signal.aborted) {
                Alert.alert("Error", "No se pudo cargar la información del lote.");
            }
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>📡 Análisis Multiespectral</Text>
                {fechaSatelite ? <Text style={styles.subtitle}>Imagen libre de nubes del: {fechaSatelite}</Text> : null}
            </View>

            {/* UI NUEVA: Selector de Capas Agrícolas */}
            <View style={styles.layerSelector}>
               {['NDVI', 'NDWI', 'MSAVI2', 'EVI'].map(capa => (
                  <TouchableOpacity 
                     key={capa} 
                     style={[styles.layerBtn, capaActiva === capa && styles.layerBtnActive]}
                     onPress={() => setCapaActiva(capa)}
                  >
                     <Text style={[styles.layerBtnText, capaActiva === capa && {color: '#1B5E20'}]}>{capa}</Text>
                  </TouchableOpacity>
               ))}
            </View>

            {loading ? (
                <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color="#2E7D32" />
                    <Text style={{marginTop: 10, color: '#555', fontWeight: 'bold'}}>Calculando índice {capaActiva}...</Text>
                </View>
            ) : !region ? (
                <View style={styles.loadingBox}>
                    <MaterialCommunityIcons name="map-marker-off" size={50} color="#D32F2F" />
                    <Text style={{marginTop: 10, color: '#555', textAlign: 'center'}}>
                        No se encontraron coordenadas válidas.
                    </Text>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <MapView style={styles.map} mapType="hybrid" initialRegion={region}>
                        {poligono.length >= 3 && (
                            <Polygon coordinates={poligono} strokeColor="#FFFFFF" strokeWidth={3} fillColor="rgba(0,0,0,0)" zIndex={2} />
                        )}
                        {tileUrl && (
                            <UrlTile urlTemplate={tileUrl} maximumZ={19} minimumZ={0} zIndex={1} opacity={0.7} />
                        )}
                    </MapView>

                    {tileUrl && (
                        <View style={styles.legendContainer}>
                            <Text style={styles.legendTitle}>
                                {capaActiva === 'NDVI' ? 'Vigor (Biomasa)' : 
                                 capaActiva === 'NDWI' ? 'Estrés Hídrico (Humedad)' : 
                                 capaActiva === 'MSAVI2' ? 'Vigor en Etapa Temprana' : 'Desarrollo Foliar (EVI)'}
                            </Text>
                            <View style={styles.colorBar}>
                                <View style={[styles.colorBox, {backgroundColor: capaActiva === 'NDWI' ? '#d73027' : '#d7191c'}]}><Text style={styles.colorText}>{capaActiva === 'NDWI' ? 'Seco' : 'Malo'}</Text></View>
                                <View style={[styles.colorBox, {backgroundColor: capaActiva === 'NDWI' ? '#fc8d59' : '#fdae61'}]} />
                                <View style={[styles.colorBox, {backgroundColor: capaActiva === 'NDWI' ? '#fee090' : '#ffffbf'}]} />
                                <View style={[styles.colorBox, {backgroundColor: capaActiva === 'NDWI' ? '#91bfdb' : '#a6d96a'}]} />
                                <View style={[styles.colorBox, {backgroundColor: capaActiva === 'NDWI' ? '#4575b4' : '#1a9641'}]}><Text style={styles.colorText}>{capaActiva === 'NDWI' ? 'Húmedo' : 'Óptimo'}</Text></View>
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
    layerSelector: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#1B5E20', paddingBottom: 12, paddingHorizontal: 10 },
    layerBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
    layerBtnActive: { backgroundColor: '#FFCA28' },
    layerBtnText: { color: '#A5D6A7', fontSize: 13, fontWeight: 'bold' },
    map: { flex: 1 },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    legendContainer: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: 'rgba(255,255,255,0.95)', padding: 10, borderRadius: 10, elevation: 5 },
    legendTitle: { fontSize: 12, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 5 },
    colorBar: { flexDirection: 'row', height: 20, borderRadius: 5, overflow: 'hidden' },
    colorBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    colorText: { fontSize: 9, color: 'white', fontWeight: 'bold', textShadowColor: 'black', textShadowRadius: 2 }
});