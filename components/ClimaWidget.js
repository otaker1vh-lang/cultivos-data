import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, TouchableOpacity, ScrollView, LayoutAnimation, Platform, UIManager } from 'react-native';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Habilitar animaciones en Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// TU API KEY
const API_KEY = '8dd59ff1da764345cdd89f05c6326380'; 

export default function ClimaWidget({ onEvaluarCondiciones }) {
  const [weather, setWeather] = useState(null);
  const [forecastsManana, setForecastsManana] = useState([]); 
  const [selectedForecast, setSelectedForecast] = useState(null); 
  const [altitude, setAltitude] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  
  const [expanded, setExpanded] = useState(false);

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

      // 2. Pronóstico
      const responseForecast = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric&lang=es`
      );
      const dataForecast = await responseForecast.json();

      if (responseCurrent.ok && responseForecast.ok) {
        setWeather(dataCurrent);

        // --- CORRECCIÓN AQUÍ ---
        const now = new Date();
        // Generamos la fecha de mañana sumando 1 día (24 horas)
        const manana = new Date(now);
        manana.setDate(manana.getDate() + 1);
        
        // Formato YYYY-MM-DD para filtrar
        const tomorrowStr = manana.toISOString().split("T")[0];

        const listaManana = dataForecast.list.filter(item =>
          item.dt_txt.startsWith(tomorrowStr)
        );

        setForecastsManana(listaManana);
        if (listaManana.length > 0) {
            const defaultSelection = listaManana.find(i => i.dt_txt.includes("12:00")) || listaManana.find(i => i.dt_txt.includes("15:00")) || listaManana[0];
            setSelectedForecast(defaultSelection);
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
      const lluvia = mainCond === 'Rain' || mainCond === 'Thunderstorm' || mainCond === 'Drizzle';
      
      if (viento < 15 && temp < 30 && !lluvia) {
          return { apto: true, texto: "APTO ✅", color: "#2E7D32" };
      } else {
          return { apto: false, texto: "NO APTO ⚠️", color: "#D32F2F" };
      }
  };

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  if (loading) return <View style={styles.cardSmall}><ActivityIndicator size="small" color="#4CAF50"/></View>;
  if (errorMsg || !weather) return <TouchableOpacity onPress={fetchWeather} style={styles.cardSmall}><Text style={{color:'red'}}>Error Clima (Toque para reintentar)</Text></TouchableOpacity>;

  const { main, weather: details, wind, name } = weather;
  const iconUrl = `https://openweathermap.org/img/wn/${details[0].icon}.png`;
  const evalActual = evaluarData(weather);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={toggleExpand} style={styles.card}>
      <View style={styles.compactRow}>
         <View style={{flexDirection: 'row', alignItems: 'center', width: '30%'}}>
            <Image source={{ uri: iconUrl }} style={{width: 35, height: 35}} />
            <View>
                <Text style={styles.cityText} numberOfLines={1}>{name}</Text>
                <Text style={styles.altText}>{altitude} m</Text>
            </View>
         </View>
         <View style={styles.statsRow}>
            <View style={styles.statItem}>
                <MaterialCommunityIcons name="thermometer" size={14} color="#333"/>
                <Text style={styles.statVal}>{Math.round(main.temp)}°</Text>
            </View>
            <View style={styles.statItem}>
                <MaterialCommunityIcons name="weather-windy" size={14} color="#333"/>
                <Text style={styles.statVal}>{Math.round(wind.speed * 3.6)}k/h</Text>
            </View>
            <View style={styles.statItem}>
                <MaterialCommunityIcons name="water" size={14} color="#1976D2"/>
                <Text style={styles.statVal}>{main.humidity}%</Text>
            </View>
         </View>
         <View style={[styles.badge, {backgroundColor: evalActual.color}]}>
            <Text style={styles.badgeText}>{evalActual.apto ? 'APTO' : 'NO'}</Text>
         </View>
         <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={20} color="#777" />
      </View>

      {expanded && forecastsManana.length > 0 && (
          <View style={styles.expandedContent}>
              <View style={styles.divider} />
              <Text style={styles.expandTitle}>📅 Planificar para Mañana:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
                  {forecastsManana.map((item, index) => {
                      const hora = item.dt_txt.split(' ')[1].substring(0, 5); 
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
                       <Text style={styles.detailText}>
                           🌡 {Math.round(selectedForecast.main.temp)}°C   💨 {(selectedForecast.wind.speed * 3.6).toFixed(1)} km/h   💧 {selectedForecast.main.humidity}%
                       </Text>
                       <Text style={[styles.detailRecom, { color: evaluarData(selectedForecast).color }]}>
                           {evaluarData(selectedForecast).texto} para aplicar
                       </Text>
                  </View>
              )}
          </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 10, elevation: 2, borderWidth: 1, borderColor: '#eee' },
  cardSmall: { padding: 10, alignItems: 'center' },
  compactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cityText: { fontWeight: 'bold', fontSize: 13, color: '#333' },
  altText: { fontSize: 10, color: '#777' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statItem: { alignItems: 'center' },
  statVal: { fontSize: 12, fontWeight: 'bold', color: '#444' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  expandedContent: { marginTop: 5 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 5 },
  expandTitle: { fontSize: 11, fontWeight: 'bold', color: '#555', marginBottom: 5 },
  chipsContainer: { flexDirection: 'row', marginBottom: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, marginRight: 6, borderWidth: 1 },
  chipSelected: { backgroundColor: '#E0F2F1' },
  chipText: { fontSize: 11, color: '#333' },
  chipTextSelected: { fontWeight: 'bold', color: '#00695C' },
  dot: { width: 6, height: 6, borderRadius: 3, marginLeft: 4 },
  forecastDetail: { backgroundColor: '#FAFAFA', padding: 8, borderRadius: 5, alignItems: 'center' },
  detailText: { fontSize: 12, color: '#333' },
  detailRecom: { fontSize: 12, fontWeight: 'bold', marginTop: 2 }
});