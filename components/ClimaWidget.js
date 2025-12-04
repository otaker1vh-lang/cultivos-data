import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, TouchableOpacity, Alert } from 'react-native';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// ⚠️ IMPORTANTE: REEMPLAZA ESTO CON TU PROPIA API KEY DE OPENWEATHERMAP
const API_KEY = '8dd59ff1da764345cdd89f05c6326380'; 

export default function ClimaWidget() {
  const [location, setLocation] = useState(null);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Función para obtener datos
  const fetchWeather = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Pedir permiso de ubicación
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permiso de ubicación denegado');
        setLoading(false);
        return;
      }

      // 2. Obtener coordenadas
      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);

      // 3. Llamar a la API del clima
      const { latitude, longitude } = location.coords;
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric&lang=es`
      );
      
      const data = await response.json();

      if (response.ok) {
        setWeather(data);
      } else {
        setErrorMsg('Error al cargar clima');
      }
    } catch (e) {
      setErrorMsg('Sin conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
  }, []);

  // Renderizado de estados
  if (loading) {
    return (
      <View style={styles.cardLoading}>
        <ActivityIndicator size="small" color="#4CAF50" />
        <Text style={styles.loadingText}>Cargando clima...</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <TouchableOpacity style={styles.cardError} onPress={fetchWeather}>
        <MaterialCommunityIcons name="cloud-off-outline" size={24} color="#777" />
        <Text style={styles.errorText}>{errorMsg} (Toca para reintentar)</Text>
      </TouchableOpacity>
    );
  }

  if (!weather) return null;

  // Extraer datos útiles
  const { main, weather: details, wind, name } = weather;
  const iconUrl = `https://openweathermap.org/img/wn/${details[0].icon}@2x.png`;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.locationText}>📍 {name}</Text>
        <Text style={styles.descText}>{details[0].description}</Text>
      </View>
      
      <View style={styles.body}>
        <Image source={{ uri: iconUrl }} style={styles.icon} />
        <Text style={styles.tempText}>{Math.round(main.temp)}°C</Text>
        
        <View style={styles.stats}>
            <View style={styles.statItem}>
                <MaterialCommunityIcons name="water-percent" size={16} color="#1976D2" />
                <Text style={styles.statText}>{main.humidity}% Hum.</Text>
            </View>
            <View style={styles.statItem}>
                <MaterialCommunityIcons name="weather-windy" size={16} color="#555" />
                <Text style={styles.statText}>{wind.speed} m/s</Text>
            </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#E0F2F1', // Verde menta muy suave
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#80CBC4',
    elevation: 2,
  },
  cardLoading: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 15,
  },
  cardError: {
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    flexDirection: 'row'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  locationText: { fontWeight: 'bold', fontSize: 16, color: '#00695C' },
  descText: { textTransform: 'capitalize', color: '#555', fontSize: 14 },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: { width: 50, height: 50 },
  tempText: { fontSize: 32, fontWeight: 'bold', color: '#333' },
  stats: { alignItems: 'flex-end' },
  statItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  statText: { fontSize: 12, color: '#555', marginLeft: 4 },
  loadingText: { marginTop: 5, color: '#888', fontSize: 12 },
  errorText: { color: '#D32F2F', marginLeft: 8 },
});