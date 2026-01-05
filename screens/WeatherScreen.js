import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ActivityIndicator, Image, 
  ScrollView, Dimensions, FlatList, StatusBar 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// API Key
const API_KEY = '8dd59ff1da764345cdd89f05c6326380'; 

const { width } = Dimensions.get('window');

// FUNCIÓN PARA MAPEAR ÍCONOS Y COLORES DE MANERA PROFESIONAL
const getWeatherIcon = (iconCode) => {
  const iconMap = {
    '01d': 'weather-sunny',
    '01n': 'weather-night',
    '02d': 'weather-partly-cloudy',
    '02n': 'weather-night-partly-cloudy',
    '03d': 'weather-cloudy',
    '03n': 'weather-cloudy',
    '04d': 'weather-cloudy',
    '04n': 'weather-cloudy',
    '09d': 'weather-pouring',
    '09n': 'weather-pouring',
    '10d': 'weather-rainy',
    '10n': 'weather-rainy',
    '11d': 'weather-lightning',
    '11n': 'weather-lightning',
    '13d': 'weather-snowy',
    '13n': 'weather-snowy',
    '50d': 'weather-fog',
    '50n': 'weather-fog',
  };
  return iconMap[iconCode] || 'weather-cloudy';
};

// FUNCIÓN PARA OBTENER COLORES PROFESIONALES SEGÚN EL CLIMA
const getWeatherColors = (iconCode) => {
  const colorMap = {
    '01d': { primary: '#FDB813', secondary: '#FDD835', gradient: ['#FDB813', '#FFEB3B'] }, // Sol brillante
    '01n': { primary: '#5C6BC0', secondary: '#7986CB', gradient: ['#5C6BC0', '#9FA8DA'] }, // Noche clara
    '02d': { primary: '#FFB74D', secondary: '#FFA726', gradient: ['#FFB74D', '#FF9800'] }, // Parcialmente nublado día
    '02n': { primary: '#7986CB', secondary: '#5C6BC0', gradient: ['#7986CB', '#5C6BC0'] }, // Parcialmente nublado noche
    '03d': { primary: '#90A4AE', secondary: '#78909C', gradient: ['#90A4AE', '#78909C'] }, // Nublado
    '03n': { primary: '#78909C', secondary: '#607D8B', gradient: ['#78909C', '#607D8B'] },
    '04d': { primary: '#78909C', secondary: '#607D8B', gradient: ['#78909C', '#546E7A'] }, // Muy nublado
    '04n': { primary: '#607D8B', secondary: '#546E7A', gradient: ['#607D8B', '#455A64'] },
    '09d': { primary: '#42A5F5', secondary: '#1E88E5', gradient: ['#42A5F5', '#1976D2'] }, // Lluvia intensa
    '09n': { primary: '#1E88E5', secondary: '#1565C0', gradient: ['#1E88E5', '#0D47A1'] },
    '10d': { primary: '#5C6BC0', secondary: '#3949AB', gradient: ['#5C6BC0', '#3949AB'] }, // Lluvia
    '10n': { primary: '#3949AB', secondary: '#283593', gradient: ['#3949AB', '#1A237E'] },
    '11d': { primary: '#FFA726', secondary: '#F57C00', gradient: ['#FFA726', '#EF6C00'] }, // Tormenta
    '11n': { primary: '#F57C00', secondary: '#E65100', gradient: ['#F57C00', '#BF360C'] },
    '13d': { primary: '#81D4FA', secondary: '#4FC3F7', gradient: ['#81D4FA', '#29B6F6'] }, // Nieve
    '13n': { primary: '#4FC3F7', secondary: '#03A9F4', gradient: ['#4FC3F7', '#0288D1'] },
    '50d': { primary: '#B0BEC5', secondary: '#90A4AE', gradient: ['#B0BEC5', '#78909C'] }, // Niebla
    '50n': { primary: '#90A4AE', secondary: '#78909C', gradient: ['#90A4AE', '#607D8B'] },
  };
  return colorMap[iconCode] || { primary: '#90A4AE', secondary: '#78909C', gradient: ['#90A4AE', '#78909C'] };
};

export default function WeatherScreen() {
  const [currentWeather, setCurrentWeather] = useState(null);
  const [forecastHourly, setForecastHourly] = useState([]);
  const [forecastDaily, setForecastDaily] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationName, setLocationName] = useState('Localizando...');

  // --- HELPERS ---
  const getHora = (dt) => {
    return new Date(dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getDiaSemana = (dt) => {
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return dias[new Date(dt * 1000).getDay()];
  };

  const checkAptitud = (temp, windSpeed, pop) => {
      const vientoKmH = windSpeed * 3.6;
      if (pop > 0.3) return false;
      if (vientoKmH > 20) return false;
      if (temp > 30) return false;
      return true;
  };

  const fetchWeatherData = async () => {
    try {
      setLoading(true);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Se requiere permiso de ubicación');
        setLoading(false);
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      // 1. Fetch Current
      const resCurrent = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric&lang=es`
      );
      const dataCurrent = await resCurrent.json();
      setCurrentWeather(dataCurrent);
      setLocationName(dataCurrent.name);

      // 2. Fetch Forecast
      const resForecast = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric&lang=es`
      );
      const dataForecast = await resForecast.json();

      if (dataForecast.list) {
        // A) Procesar Horas
        setForecastHourly(dataForecast.list.slice(0, 9));

        // B) Procesar Días
        const dailyGroups = {};
        dataForecast.list.forEach(item => {
          const date = new Date(item.dt * 1000).toDateString();
          if (!dailyGroups[date]) {
            dailyGroups[date] = {
              dt: item.dt,
              temps: [],
              weather: item.weather[0],
              rainProb: item.pop
            };
          }
          dailyGroups[date].temps.push(item.main.temp);
          const hour = new Date(item.dt * 1000).getHours();
          if (hour >= 10 && hour <= 14) {
             dailyGroups[date].weather = item.weather[0];
          }
          dailyGroups[date].rainProb = Math.max(dailyGroups[date].rainProb, item.pop);
        });

        const dailyArray = Object.keys(dailyGroups).map(key => {
          const group = dailyGroups[key];
          return {
            dt: group.dt,
            min: Math.min(...group.temps),
            max: Math.max(...group.temps),
            weather: group.weather,
            pop: group.rainProb
          };
        }).slice(1, 6); 

        setForecastDaily(dailyArray);
      }

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeatherData();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00695C" />
        <Text style={{ marginTop: 10, color: '#555' }}>Cargando pronóstico...</Text>
      </View>
    );
  }

  if (!currentWeather) return null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f0f2f5" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.cityName}>{locationName}</Text>
          <Text style={styles.dateText}>{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          
          <View style={styles.mainInfo}>
            {/* ÍCONO PRINCIPAL - Con fondo degradado profesional */}
            <View style={[
              styles.mainIconContainer,
              { backgroundColor: getWeatherColors(currentWeather.weather[0].icon).primary + '20' }
            ]}>
              <MaterialCommunityIcons 
                name={getWeatherIcon(currentWeather.weather[0].icon)} 
                size={100} 
                color={getWeatherColors(currentWeather.weather[0].icon).primary} 
              />
            </View>
            <View>
              <Text style={styles.tempLarge}>{Math.round(currentWeather.main.temp)}°</Text>
              <Text style={styles.conditionText}>{currentWeather.weather[0].description}</Text>
            </View>
          </View>
          
          <View style={styles.headerStats}>
             <Text style={styles.headerStatText}>H: {Math.round(currentWeather.main.temp_max)}°  L: {Math.round(currentWeather.main.temp_min)}°</Text>
             <Text style={styles.headerStatText}>Sensación: {Math.round(currentWeather.main.feels_like)}°</Text>
          </View>
        </View>

        {/* PRONÓSTICO 24 HORAS */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Pronóstico de Aplicación (24h)</Text>
          <FlatList
            horizontal
            data={forecastHourly}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.dt.toString()}
            contentContainerStyle={{ paddingHorizontal: 10 }}
            renderItem={({ item }) => {
                const isApto = checkAptitud(item.main.temp, item.wind.speed, item.pop);
                const weatherColors = getWeatherColors(item.weather[0].icon);
                
                return (
                  <View style={styles.hourlyCard}>
                    <Text style={styles.hourText}>{getHora(item.dt)}</Text>
                    
                    {/* Ícono con fondo circular de color */}
                    <View style={[
                      styles.hourlyIconContainer,
                      { backgroundColor: weatherColors.primary + '15' }
                    ]}>
                      <MaterialCommunityIcons 
                        name={getWeatherIcon(item.weather[0].icon)} 
                        size={40} 
                        color={weatherColors.primary} 
                      />
                    </View>
                    
                    <Text style={styles.hourTemp}>{Math.round(item.main.temp)}°</Text>
                    
                    {item.pop > 0.2 && (
                        <Text style={styles.probRain}>{Math.round(item.pop * 100)}% 💧</Text>
                    )}

                    <View style={[styles.aptoBadge, { backgroundColor: isApto ? '#E8F5E9' : '#FFEBEE' }]}>
                        <Text style={[styles.aptoText, { color: isApto ? '#2E7D32' : '#C62828' }]}>
                            {isApto ? 'Apto' : 'No'}
                        </Text>
                    </View>
                  </View>
                );
            }}
          />
        </View>

        {/* PRONÓSTICO 5 DÍAS */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Próximos 5 Días</Text>
          <View style={styles.dailyCardContainer}>
            
            <View style={styles.dailyHeaderRow}>
                <Text style={[styles.dailyHeaderLabel, {width: 50}]}>Día</Text>
                <View style={{flex: 1}}></View> 
                <View style={{width: 100, flexDirection:'row', justifyContent:'space-between'}}>
                    <Text style={styles.dailyHeaderLabel}>Mín</Text>
                    <Text style={styles.dailyHeaderLabel}>Máx</Text>
                </View>
            </View>
            <View style={styles.divider} />

            {forecastDaily.map((item, index) => {
              const weatherColors = getWeatherColors(item.weather.icon);
              
              return (
              <View key={item.dt} style={[styles.dailyRow, index !== forecastDaily.length -1 && styles.borderBottom]}>
                <Text style={styles.dayName}>{getDiaSemana(item.dt)}</Text>
                
                <View style={styles.dailyIconContainer}>
                   {item.pop > 0.3 && (
                      <View style={styles.rainBadge}>
                         <MaterialCommunityIcons name="water" size={12} color="#1976D2" />
                         <Text style={styles.rainText}>{Math.round(item.pop*100)}%</Text>
                      </View>
                   )}
                   {/* Ícono con fondo circular de color */}
                   <View style={[
                     styles.dailyIconCircle,
                     { backgroundColor: weatherColors.primary + '15' }
                   ]}>
                     <MaterialCommunityIcons 
                       name={getWeatherIcon(item.weather.icon)} 
                       size={32} 
                       color={weatherColors.primary} 
                     />
                   </View>
                </View>

                <View style={styles.tempBar}>
                    <Text style={styles.tempLow}>{Math.round(item.min)}°</Text>
                    <View style={styles.tempBarLine}>
                        <View style={{flex:1, backgroundColor:'#eee', borderRadius:2}} />
                    </View>
                    <Text style={styles.tempHigh}>{Math.round(item.max)}°</Text>
                </View>
              </View>
              );
            })}
          </View>
        </View>

        {/* GRILLA DE DETALLES */}
        <View style={styles.gridContainer}>
            <View style={styles.gridItem}>
                <MaterialCommunityIcons name="weather-windy" size={24} color="#555" />
                <Text style={styles.gridLabel}>Viento</Text>
                <Text style={styles.gridValue}>{(currentWeather.wind.speed * 3.6).toFixed(1)} km/h</Text>
            </View>
            <View style={styles.gridItem}>
                <MaterialCommunityIcons name="water-percent" size={24} color="#1976D2" />
                <Text style={styles.gridLabel}>Humedad</Text>
                <Text style={styles.gridValue}>{currentWeather.main.humidity}%</Text>
            </View>
            <View style={styles.gridItem}>
                <MaterialCommunityIcons name="eye-outline" size={24} color="#555" />
                <Text style={styles.gridLabel}>Visibilidad</Text>
                <Text style={styles.gridValue}>{currentWeather.visibility / 1000} km</Text>
            </View>
            <View style={styles.gridItem}>
                <MaterialCommunityIcons name="gauge" size={24} color="#555" />
                <Text style={styles.gridLabel}>Presión</Text>
                <Text style={styles.gridValue}>{currentWeather.main.pressure} hPa</Text>
            </View>
        </View>
      
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  scrollContent: { paddingBottom: 40 },
  
  // Header
  header: { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
  cityName: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  dateText: { fontSize: 16, color: '#666', textTransform: 'capitalize', marginBottom: 10 },
  mainInfo: { flexDirection: 'row', alignItems: 'center' },
  mainIconContainer: { 
    width: 110, 
    height: 110, 
    justifyContent: 'center', 
    alignItems: 'center',
    marginRight: 15,
    borderRadius: 55,
  },
  tempLarge: { fontSize: 64, fontWeight: 'bold', color: '#222', includeFontPadding: false },
  conditionText: { fontSize: 18, color: '#555', textTransform: 'capitalize', marginTop: -5 },
  headerStats: { flexDirection: 'row', gap: 15, marginTop: 10 },
  headerStatText: { fontSize: 14, color: '#666', fontWeight: '500' },

  // Sections
  sectionContainer: { marginTop: 20, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },

  // Hourly Card
  hourlyCard: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 8,
    borderRadius: 16,
    alignItems: 'center',
    marginRight: 10,
    width: 80,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  hourlyIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 5,
  },
  hourText: { fontSize: 13, color: '#666', marginBottom: 5 },
  hourTemp: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 5 },
  probRain: { fontSize: 10, color: '#1976D2', fontWeight: 'bold', marginTop: 2 },
  
  aptoBadge: { marginTop: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  aptoText: { fontSize: 10, fontWeight: 'bold' },

  // Daily List
  dailyCardContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },
  dailyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  dailyHeaderLabel: { fontSize: 12, color: '#999', fontWeight: 'bold', textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginBottom: 5 },

  dailyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  dayName: { fontSize: 16, fontWeight: '600', color: '#444', width: 50 },
  
  dailyIconContainer: { flexDirection: 'row', alignItems: 'center', width: 100, justifyContent: 'center' },
  dailyIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rainBadge: { flexDirection: 'row', alignItems: 'center', marginRight: 5 },
  rainText: { fontSize: 11, color: '#1976D2', fontWeight: 'bold' },
  
  tempBar: { flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 10 },
  tempLow: { width: 35, textAlign: 'right', fontSize: 15, color: '#888' },
  tempBarLine: { flex: 1, height: 4, marginHorizontal: 8, backgroundColor: '#eee', borderRadius: 2 },
  tempHigh: { width: 35, textAlign: 'left', fontSize: 15, fontWeight: 'bold', color: '#333' },

  // Grid
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 25 },
  gridItem: {
    width: (width - 55) / 2,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 15,
    marginBottom: 15,
    alignItems: 'flex-start',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  gridLabel: { fontSize: 14, color: '#888', marginTop: 5 },
  gridValue: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 2 },
});