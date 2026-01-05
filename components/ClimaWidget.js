import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, TouchableOpacity, ScrollView, LayoutAnimation, Platform, UIManager } from 'react-native';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Habilitar animaciones
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_KEY = '8dd59ff1da764345cdd89f05c6326380'; 

export default function ClimaWidget({ onEvaluarCondiciones }) {
  const [weather, setWeather] = useState(null);
  const [forecastsManana, setForecastsManana] = useState([]); 
  const [selectedForecast, setSelectedForecast] = useState(null); 
  const [altitude, setAltitude] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [expanded, setExpanded] = useState(false);

  // Función para convertir TIMESTAMP a HORA LOCAL legible (ej: "14:00")
  const getHoraLocal = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const fetchWeather = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setErrorMsg('Sin permiso'); setLoading(false); return; }

      let location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude, altitude } = location.coords;
      setAltitude(altitude ? Math.round(altitude) : 'N/A');

      // 1. Clima Actual
      const responseCurrent = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric&lang=es`
      );
      const dataCurrent = await responseCurrent.json();

      // 2. Pronóstico 5 días / 3 horas
      const responseForecast = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric&lang=es`
      );
      const dataForecast = await responseForecast.json();

      if (responseCurrent.ok && responseForecast.ok) {
        setWeather(dataCurrent);

        // --- LÓGICA DE FECHAS CORREGIDA ---
        const hoy = new Date();
        const manana = new Date(hoy);
        manana.setDate(hoy.getDate() + 1); // Sumamos 1 día exacto
        
        // Obtenemos el día del mes de mañana (ej: si hoy es 7, mañana es 8)
        const diaManana = manana.getDate();

        const listaManana = dataForecast.list.filter(item => {
           // Convertimos el timestamp de la API a fecha LOCAL del celular
           const fechaItem = new Date(item.dt * 1000);
           // Comparamos si el día del mes coincide con mañana
           return fechaItem.getDate() === diaManana;
        });

        setForecastsManana(listaManana);
        
        if (listaManana.length > 0) {
            // Buscamos seleccionar por defecto una hora central (ej: mediodía)
            const porDefecto = listaManana.find(i => {
                const h = new Date(i.dt * 1000).getHours();
                return h >= 12 && h <= 14; 
            }) || listaManana[0];
            setSelectedForecast(porDefecto);
        }

        if (onEvaluarCondiciones) {
            const temp = dataCurrent.main.temp;
            const vientoKmH = dataCurrent.wind.speed * 3.6; 
            const condicion = dataCurrent.weather[0].main; 
            const hayLluvia = condicion === 'Rain' || condicion === 'Thunderstorm' || condicion === 'Drizzle';
            const esIdealHoy = (vientoKmH < 15) && (temp < 30) && (!hayLluvia);
            onEvaluarCondiciones(esIdealHoy);
        }

      } else {
        setErrorMsg('Error API');
      }
    } catch (e) {
      setErrorMsg('Error Red');
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
  }, []);

  const evaluarData = (data) => {
      if(!data) return { apto: false, texto: "...", color: "#999" };
      const temp = data.main.temp;
      const viento = data.wind.speed * 3.6;
      const mainCond = data.weather[0].main;
      const lluvia = mainCond === 'Rain' || mainCond === 'Thunderstorm' || mainCond === 'Drizzle' || mainCond === 'Snow';
      
      if (viento < 15 && temp < 30 && !lluvia) {
          return { apto: true, texto: "APTO ✅", color: "#2E7D32" };
      } else {
          let razon = "";
          if (lluvia) razon = "Lluvia";
          else if (viento >= 15) razon = "Viento";
          else if (temp >= 30) razon = "Calor";
          
          return { apto: false, texto: `NO APTO (${razon}) ⚠️`, color: "#D32F2F" };
      }
  };

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  if (loading) return <View style={styles.cardSmall}><ActivityIndicator size="large" color="#4CAF50"/></View>;
  if (errorMsg || !weather) return <TouchableOpacity onPress={fetchWeather} style={styles.cardSmall}><Text style={{color:'red', fontSize: 16}}>Error Clima (Toque para reintentar)</Text></TouchableOpacity>;

  const { main, weather: details, wind, name } = weather;
  // const iconUrl = `https://openweathermap.org/img/wn/${details[0].icon}@2x.png`; // <-- Ya no necesitamos la URL del ícono principal
  const evalActual = evaluarData(weather);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={toggleExpand} style={styles.card}>
      
      {/* CABECERA (RESUMEN) */}
      <View style={styles.compactRow}>
         <View style={{flexDirection: 'row', alignItems: 'center', width: '35%'}}>
            {/* <Image source={{ uri: iconUrl }} style={{width: 50, height: 50}} />  <-- IMAGEN ELIMINADA */}
            <View>
                <Text style={styles.cityText} numberOfLines={1}>{name}</Text>
                <Text style={styles.altText}>{altitude} msnm</Text>
            </View>
         </View>
         
         <View style={styles.statsRow}>
            <View style={styles.statItem}>
                <MaterialCommunityIcons name="thermometer" size={18} color="#333"/>
                <Text style={styles.statVal}>{Math.round(main.temp)}°</Text>
            </View>
            <View style={styles.statItem}>
                <MaterialCommunityIcons name="weather-windy" size={18} color="#333"/>
                <Text style={styles.statVal}>{Math.round(wind.speed * 3.6)}</Text>
            </View>
            <View style={styles.statItem}>
                <MaterialCommunityIcons name="water" size={18} color="#1976D2"/>
                <Text style={styles.statVal}>{main.humidity}%</Text>
            </View>
         </View>

         <View style={[styles.badge, {backgroundColor: evalActual.color}]}>
            <Text style={styles.badgeText}>{evalActual.apto ? 'APTO' : 'NO'}</Text>
         </View>
      </View>

      {/* ÁREA EXPANDIBLE (PRONÓSTICO MAÑANA) */}
      {expanded && forecastsManana.length > 0 && (
          <View style={styles.expandedContent}>
              <View style={styles.divider} />
              <Text style={styles.expandTitle}>📅 Pronóstico para Mañana:</Text>
              
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
                  {forecastsManana.map((item, index) => {
                      const hora = getHoraLocal(item.dt);
                      const isSelected = selectedForecast && selectedForecast.dt === item.dt;
                      const evalItem = evaluarData(item);
                      
                      return (
                          <TouchableOpacity 
                            key={index} 
                            style={[styles.chip, isSelected && styles.chipSelected, {borderColor: evalItem.color}]} 
                            onPress={() => setSelectedForecast(item)}
                          >
                              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{hora}</Text>
                              <View style={[styles.dot, {backgroundColor: evalItem.color}]} />
                          </TouchableOpacity>
                      );
                  })}
              </ScrollView>

              {selectedForecast && (
                  <View style={styles.forecastDetail}>
                       <View style={{flexDirection:'row', alignItems:'center', marginBottom: 8}}>
                           <Image 
                               source={{ uri: `https://openweathermap.org/img/wn/${selectedForecast.weather[0].icon}.png` }} 
                               style={{width: 40, height: 40, marginRight: 10}} 
                           />
                           <Text style={{fontSize:16, fontWeight:'bold', color:'#333', textTransform:'capitalize'}}>
                               {selectedForecast.weather[0].description}
                           </Text>
                       </View>

                       <Text style={styles.detailText}>
                           🌡 {Math.round(selectedForecast.main.temp)}°C    💨 {(selectedForecast.wind.speed * 3.6).toFixed(1)} km/h
                       </Text>
                       <Text style={styles.detailText}>
                           💧 Humedad: {selectedForecast.main.humidity}%
                       </Text>

                       <View style={[styles.recomendacionBox, { backgroundColor: evaluarData(selectedForecast).apto ? '#E8F5E9' : '#FFEBEE' }]}>
                           <Text style={[styles.detailRecom, { color: evaluarData(selectedForecast).color }]}>
                               {evaluarData(selectedForecast).texto} para aplicar
                           </Text>
                       </View>
                  </View>
              )}
          </View>
      )}
    </TouchableOpacity>
  );
}

// ESTILOS CON FUENTE AUMENTADA
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 4, borderWidth: 1, borderColor: '#ddd' },
  cardSmall: { padding: 20, alignItems: 'center' },
  compactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  
  // Textos más grandes
  cityText: { fontWeight: 'bold', fontSize: 18, color: '#222', flex:1 },
  altText: { fontSize: 13, color: '#666' },
  
  statsRow: { flexDirection: 'row', gap: 12 },
  statItem: { alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: 'bold', color: '#444', marginTop: 2 },
  
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, marginLeft: 5 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  expandedContent: { marginTop: 15 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  expandTitle: { fontSize: 16, fontWeight: 'bold', color: '#444', marginBottom: 10 },
  
  chipsContainer: { flexDirection: 'row', marginBottom: 15 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, marginRight: 8, borderWidth: 1.5 },
  chipSelected: { backgroundColor: '#E0F2F1', borderColor: '#00695C', borderWidth: 2 },
  
  chipText: { fontSize: 14, color: '#555' },
  chipTextSelected: { fontWeight: 'bold', color: '#00695C', fontSize: 15 },
  dot: { width: 10, height: 10, borderRadius: 5, marginLeft: 6 },
  
  forecastDetail: { backgroundColor: '#FAFAFA', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#eee' },
  detailText: { fontSize: 16, color: '#333', marginVertical: 3 },
  
  recomendacionBox: { marginTop: 10, padding: 8, borderRadius: 5, alignItems: 'center', width: '100%' },
  detailRecom: { fontSize: 16, fontWeight: 'bold' }
});