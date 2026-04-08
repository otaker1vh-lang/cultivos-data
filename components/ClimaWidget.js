import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ActivityIndicator, Image, 
  TouchableOpacity, TextInput, Keyboard, Alert, Modal, FlatList
} from 'react-native';
import * as Location from 'expo-location';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

const API_KEY = '8dd59ff1da764345cdd89f05c6326380'; 

export default function ClimaWidget({ onClimaUpdate, onPressWeather }) {
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Estados visuales y lógica
  const [esApto, setEsApto] = useState(false);
  const [recomendacion, setRecomendacion] = useState("Cargando...");
  const [colorEstado, setColorEstado] = useState("#B0BEC5");

  // Estados de búsqueda
  const [modoBusqueda, setModoBusqueda] = useState(false);
  const [ciudadBusqueda, setCiudadBusqueda] = useState("");
  const [modalVisible, setModalVisible] = useState(false); 

  useEffect(() => {
    fetchWeather(); 
  }, []);

  const analizarCondiciones = (temp, windSpeed, weatherMain) => {
    const vientoKmh = windSpeed * 3.6;
    
    if (vientoKmh > 15) return { apto: false, mensaje: "Viento Alto", color: "#EF5350" }; 
    if (['Rain', 'Thunderstorm', 'Drizzle', 'Snow'].includes(weatherMain)) return { apto: false, mensaje: "Lluvia", color: "#42A5F5" }; 
    if (temp > 29) return { apto: false, mensaje: "Mucho Calor", color: "#FFA726" }; 
    
    return { apto: true, mensaje: "Apto", color: "#4CAF50" }; 
  };

  const fetchWeather = async (busqueda = null) => {
    setLoading(true);
    setErrorMsg(null);
    Keyboard.dismiss();

    try {
      let lat, lon;
      
      // 1. OBTENER COORDENADAS (GPS o BÚSQUEDA)
      if (busqueda) {
        // --- CAMBIO CLAVE: USAR GEOCODER NATIVO ---
        // Esto busca localidad, calle, rancho, etc. usando Google/Apple Maps
        try {
            const geocodedLocation = await Location.geocodeAsync(busqueda);
            
            if (geocodedLocation.length > 0) {
                lat = geocodedLocation[0].latitude;
                lon = geocodedLocation[0].longitude;
            } else {
                Alert.alert("No encontrada", "No se encontró esa localidad específica.");
                setLoading(false);
                return;
            }
        } catch (geoError) {
            Alert.alert("Error", "Error al buscar la ubicación.");
            setLoading(false);
            return;
        }

      } else {
        // GPS NORMAL
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Sin permiso GPS');
          setLoading(false);
          return;
        }
        let locationResult = await Location.getCurrentPositionAsync({});
        lat = locationResult.coords.latitude;
        lon = locationResult.coords.longitude;
      }

      // 2. PEDIR CLIMA EXACTO CON LAS COORDENADAS
      // Ya no usamos ?q=ciudad, siempre usamos ?lat=&lon=
      const urlWeather = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=es`;
      
      const response = await fetch(urlWeather);
      const data = await response.json();

      if (!response.ok) {
        Alert.alert("Error API", "Error obteniendo datos del clima.");
        setLoading(false);
        return; 
      }

      setWeather(data);

      const analisis = analizarCondiciones(data.main.temp, data.wind.speed, data.weather[0].main);
      setEsApto(analisis.apto);
      setRecomendacion(analisis.mensaje);
      setColorEstado(analisis.color);

      // 3. PEDIR PRONÓSTICO PARA ESA MISMA UBICACIÓN
      const urlForecast = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=es`;
      const resForecast = await fetch(urlForecast);
      const dataForecast = await resForecast.json();
      
      if(resForecast.ok){
          setForecast(dataForecast.list.slice(0, 9)); 
      }

      if (onClimaUpdate) {
          onClimaUpdate({
              temp: data.main.temp,
              temp_max: data.main.temp_max,
              temp_min: data.main.temp_min,
              humedad: data.main.humidity
          });
      }

    } catch (e) {
      console.log(e);
      setErrorMsg('Error de conexión');
    } finally {
      setLoading(false);
      if(busqueda) setModoBusqueda(false); 
    }
  };

  const renderForecastItem = ({ item }) => {
    const date = new Date(item.dt * 1000);
    const hora = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const analisis = analizarCondiciones(item.main.temp, item.wind.speed, item.weather[0].main);

    return (
        <View style={styles.forecastItem}>
            <View style={{flexDirection:'row', alignItems:'center', width: 60}}>
                <Text style={styles.forecastTime}>{hora}</Text>
            </View>
            <View style={{flexDirection:'row', alignItems:'center', flex:1, justifyContent:'center'}}>
                 <Image 
                    source={{ uri: `https://openweathermap.org/img/wn/${item.weather[0].icon}.png` }} 
                    style={{ width: 30, height: 30 }} 
                />
                <Text style={styles.forecastTemp}>{Math.round(item.main.temp)}°</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: analisis.color, width: 90, justifyContent:'center' }]}>
                <Text style={styles.statusText}>{analisis.mensaje.toUpperCase()}</Text>
            </View>
        </View>
    );
  };

  if (loading && !weather) return <ActivityIndicator size="small" color="#fff" style={{margin: 20}} />;
  
  if (errorMsg) return (
      <TouchableOpacity onPress={() => fetchWeather()} style={styles.errorContainer}>
        <Text style={{color:'#FFCDD2', fontSize:12}}>Error: {errorMsg}. Toca para reintentar.</Text>
      </TouchableOpacity>
  );

  return (
    <View style={styles.compactContainer}>
      
      {/* 1. CABECERA */}
      <View style={styles.headerRow}>
         <View style={styles.locationWrap}>
             <Ionicons name="location-sharp" size={14} color="#E0F2F1" />
             {/* Mostramos el nombre que devuelve OpenWeather (suele ser el pueblo o municipio más cercano) */}
             <Text style={styles.cityText} numberOfLines={1}>{weather?.name}</Text>
         </View>
         
         <TouchableOpacity 
            style={[styles.statusBadge, { backgroundColor: colorEstado }]}
            onPress={() => setModalVisible(true)}
         >
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <Text style={styles.statusText}>{esApto ? "APTO" : "NO APTO"}</Text>
                <Ionicons name="chevron-down" size={12} color="white" style={{marginLeft:4}} />
            </View>
         </TouchableOpacity>

         <TouchableOpacity onPress={() => setModoBusqueda(!modoBusqueda)} style={{padding:6}}>
             <Ionicons name={modoBusqueda ? "close" : "search"} size={20} color="#fff" />
         </TouchableOpacity>
      </View>

      <TouchableOpacity 
        activeOpacity={0.7} 
        onPress={onPressWeather} // <--- Aquí activamos la navegación
        style={styles.dataRow}
      >
        <View style={styles.mainInfo}>
            <Image 
              source={{ uri: `https://openweathermap.org/img/wn/${weather.weather[0].icon}.png` }} 
              style={{ width: 40, height: 40 }} 
            />
            <View>
                <Text style={styles.tempBig}>{Math.round(weather.main.temp)}°</Text>
                <Text style={styles.descTiny}>{weather.weather[0].description}</Text>
            </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.detailsGrid}>
            {/* ... detalles ... */}
        </View>
      </TouchableOpacity>

      {/* 2. BARRA DE BÚSQUEDA */}
      {modoBusqueda && (
        <View style={styles.searchRow}>
          <TextInput 
            style={styles.input} 
            placeholder="Ej: Ejido La Machuca, MX" // Placeholder actualizado
            placeholderTextColor="#ddd"
            value={ciudadBusqueda}
            onChangeText={setCiudadBusqueda}
            onSubmitEditing={() => fetchWeather(ciudadBusqueda)}
            returnKeyType="search"
          />
          <TouchableOpacity 
             onPress={() => fetchWeather(ciudadBusqueda)} 
             style={{backgroundColor:'rgba(255,255,255,0.2)', borderRadius:4, padding:4, marginLeft: 4}}
          >
             <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setCiudadBusqueda(""); fetchWeather(null); }} style={{marginLeft: 8}}>
             <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#80DEEA" />
          </TouchableOpacity>
        </View>
      )}

      {/* 3. DATOS VISUALES */}
      <View style={styles.dataRow}>
        <View style={styles.mainInfo}>
            <Image 
              source={{ uri: `https://openweathermap.org/img/wn/${weather.weather[0].icon}.png` }} 
              style={{ width: 40, height: 40 }} 
            />
            <View>
                <Text style={styles.tempBig}>{Math.round(weather.main.temp)}°</Text>
                <Text style={styles.descTiny}>{weather.weather[0].description}</Text>
            </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
                <MaterialCommunityIcons name="weather-windy" size={14} color="#B2DFDB" />
                <Text style={styles.detailVal}>{(weather.wind.speed * 3.6).toFixed(0)} km/h</Text>
            </View>
            <View style={styles.detailItem}>
                <MaterialCommunityIcons name="water-percent" size={14} color="#B2DFDB" />
                <Text style={styles.detailVal}>{weather.main.humidity}%</Text>
            </View>
            <View style={styles.detailItem}>
                <MaterialCommunityIcons name={esApto ? "thermometer" : "alert-circle-outline"} size={14} color={esApto ? "#B2DFDB" : "#FFCCBC"} />
                <Text style={[styles.detailVal, !esApto && {color:'#FFCCBC'}]}>
                    {esApto ? `ST ${Math.round(weather.main.feels_like)}°` : recomendacion}
                </Text>
            </View>
        </View>
      </View>

      {/* 4. MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Pronóstico Local</Text>
                    <TouchableOpacity onPress={() => setModalVisible(false)}>
                        <Ionicons name="close-circle" size={28} color="#546E7A" />
                    </TouchableOpacity>
                </View>
                
                <Text style={styles.modalSubtitle}>Próximas 24 horas (Hora Local)</Text>

                <FlatList
                    data={forecast}
                    keyExtractor={(item) => item.dt.toString()}
                    renderItem={renderForecastItem}
                    style={{maxHeight: 350}}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <Text style={{textAlign:'center', padding:20, color:'#888'}}>
                             Cargando pronóstico...
                        </Text>
                    }
                />
            </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  compactContainer: { paddingVertical: 5 },
  errorContainer: { padding: 10, alignItems: 'center' },
  
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  locationWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cityText: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginLeft: 4 },
  
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4, 
    borderRadius: 12,
    marginRight: 10,
    alignItems: 'center'
  },
  statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  searchRow: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      marginBottom: 8, 
      backgroundColor:'rgba(0,0,0,0.3)', 
      borderRadius:8, 
      paddingHorizontal:8,
      paddingVertical: 2
  },
  input: { flex: 1, color: '#fff', height: 40, fontSize: 14 },

  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 8,
  },
  mainInfo: { flexDirection: 'row', alignItems: 'center', flex: 2 },
  tempBig: { fontSize: 26, fontWeight: 'bold', color: '#fff', lineHeight: 30 },
  descTiny: { fontSize: 11, color: '#B2DFDB', textTransform: 'capitalize', marginTop: -2 },
  divider: { width: 1, height: '80%', backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 10 },
  detailsGrid: { flex: 2, justifyContent: 'center', gap: 2 },
  detailItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  detailVal: { color: '#fff', fontSize: 11, marginLeft: 6 },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end', 
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#37474F' },
  modalSubtitle: { fontSize: 12, color: '#78909C', marginBottom: 15 },
  
  forecastItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE'
  },
  forecastTime: { fontSize: 15, fontWeight:'600', color: '#455A64' },
  forecastTemp: { fontSize: 15, fontWeight:'bold', color: '#333', marginLeft: 5 },
});