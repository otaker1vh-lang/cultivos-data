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
    const [capaActiva, setCapaActiva] = useState('NDVI'); 

    useEffect(() => {
        const controller = new AbortController();
        let isMounted = true;
        let timeoutId = null;

        if (!lote_id) {
            Alert.alert("Error", "No se ha seleccionado ningún lote para analizar.");
            setLoading(false);
            return;
        }

        const cargarDatosLoteYNDVI = async () => {
            try {
                if (isMounted) {
                    setLoading(true);
                    setTileUrl(null);
                }
                
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

                if (isMounted) {
                    setPoligono(coordsMapeadas);
                    setRegion({
                        latitude: coordsMapeadas[0].latitude,
                        longitude: coordsMapeadas[0].longitude,
                        latitudeDelta: 0.02,
                        longitudeDelta: 0.02,
                    });
                }

                const geoJsonCoords = coordsRaw.map(p => [
                    isNaN(parseFloat(p.lng)) ? 0 : parseFloat(p.lng), 
                    isNaN(parseFloat(p.lat)) ? 0 : parseFloat(p.lat)
                ]);
                geoJsonCoords.push(geoJsonCoords[0]); 

                const urlServidorPython = 'https://motor-satelital-roslin.onrender.com/get_ndvi_tile'; 
                timeoutId = setTimeout(() => controller.abort(), 15000); 

                const response = await fetch(urlServidorPython, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ polygon: [geoJsonCoords], index_type: capaActiva }),
                    signal: controller.signal
                });
                
                if (timeoutId) clearTimeout(timeoutId);

                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                if (controller.signal.aborted) return;

                const result = await response.json();
                if (controller.signal.aborted) return;

                if (isMounted) {
                    if (result.status === "success") {
                        setTileUrl(result.tile_url);
                        setFechaSatelite(result.fecha_imagen);
                    } else {
                        Alert.alert("Aviso", "No hay imágenes recientes sin nubes para esta zona.");
                    }
                }

            } catch (error) { 
                if (timeoutId) clearTimeout(timeoutId);
                if (error.name !== 'AbortError' && isMounted) {
                    Alert.alert("Error de Red", "No se pudo contactar al servidor satelital.");
                }
            } finally {
                if (isMounted && !controller.signal.aborted) setLoading(false);
            }
        };

        cargarDatosLoteYNDVI();

        return () => {
            isMounted = false;
            controller.abort();
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [lote_id, coords_offline, capaActiva]); 

    return (
        <View style={styles.container}>
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
                            <UrlTile urlTemplate={tileUrl} maximumZ={19} minimumZ={0} zIndex={1} opacity={0.75} />
                        )}
                    </MapView>

                    <View style={styles.floatingSelector}>
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

                    {tileUrl && (
                        <View style={styles.legendContainer}>
                            <View style={styles.legendHeader}>
                                <Text style={styles.legendTitle}>
                                    {capaActiva === 'NDVI' ? 'Vigor (Biomasa)' : 
                                     capaActiva === 'NDWI' ? 'Estrés Hídrico (Humedad)' : 
                                     capaActiva === 'MSAVI2' ? 'Vigor Temprano' : 'Desarrollo Foliar (EVI)'}
                                </Text>
                                {fechaSatelite && <Text style={styles.dateBadge}>📅 {fechaSatelite}</Text>}
                            </View>
                            
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
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    map: { flex: 1 },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
    floatingSelector: { 
        position: 'absolute', top: 50, left: 15, right: 15, 
        flexDirection: 'row', justifyContent: 'space-around', 
        backgroundColor: 'rgba(27, 94, 32, 0.85)', 
        paddingVertical: 10, paddingHorizontal: 5, 
        borderRadius: 25, elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { height: 2, width: 0 }
    },
    layerBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
    layerBtnActive: { backgroundColor: '#FFCA28' },
    layerBtnText: { color: '#E8F5E9', fontSize: 13, fontWeight: '700' },
    legendContainer: { 
        position: 'absolute', bottom: 35, left: 20, right: 20, 
        backgroundColor: 'rgba(255,255,255,0.95)', 
        padding: 15, borderRadius: 16, elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { height: 4, width: 0 }
    },
    legendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    legendTitle: { fontSize: 14, fontWeight: '800', color: '#263238' },
    dateBadge: { fontSize: 11, color: '#546E7A', fontWeight: '600', backgroundColor: '#ECEFF1', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    colorBar: { flexDirection: 'row', height: 24, borderRadius: 8, overflow: 'hidden' },
    colorBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    colorText: { fontSize: 10, color: 'white', fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 }
});