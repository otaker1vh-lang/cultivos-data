import React, { useState, useEffect } from "react";
import { 
  View, Text, StyleSheet, FlatList, TextInput, 
  TouchableOpacity, StatusBar, ScrollView, Modal, Alert, Dimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; 

// Datos y Utilidades
import CultivoDataManager from '../utils/CultivoDataManager';
import { cargarRiesgosDesdeJSON, calcularRiesgosMultiples, generarAlertas } from '../utils/gdd_calculator';

// Componentes
import ClimaWidget from '../components/ClimaWidget'; 

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [misAlertas, setMisAlertas] = useState([]);
  const [cultivoMonitoreado, setCultivoMonitoreado] = useState(null);
  const [favoritos, setFavoritos] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [listaCultivos, setListaCultivos] = useState([]);
  
  // NUEVO ESTADO: Controla el despliegue de favoritos
  const [showFavoritos, setShowFavoritos] = useState(false);

  useEffect(() => {
    cargarDatosMonitoreo();
    cargarFavoritos();
    
    // BLINDAJE: Asegurar que siempre sea un array para evitar crash en FlatList
    const listaRaw = CultivoDataManager.obtenerListaBasica();
    setListaCultivos(Array.isArray(listaRaw) ? listaRaw : []);
  }, []);

  const cargarFavoritos = async () => {
    try {
      const favs = await AsyncStorage.getItem('@favoritos');
      if (favs) setFavoritos(JSON.parse(favs));
    } catch (e) {
      console.error("Caché de favoritos corrupta", e);
      setFavoritos([]); 
    }
  };

  const cargarDatosMonitoreo = async () => {
    try {
      const idGuardado = await AsyncStorage.getItem('@cultivo_monitoreo_id');
      if (!idGuardado) return;

      const data = await CultivoDataManager.obtenerCultivo(idGuardado, 'completo');
      if (data) {
        setCultivoMonitoreado(data);
        const climaStored = await AsyncStorage.getItem('@historial_clima');
        
        let climaParsed = [];
        try {
          const parsed = climaStored ? JSON.parse(climaStored) : [];
          climaParsed = Array.isArray(parsed) ? parsed : Object.values(parsed);
        } catch (e) {
          climaParsed = [];
        }
        
        // BLINDAJE: Try/Catch encapsulado para que un fallo matemático no rompa el renderizado de la UI
        try {
          const riesgosConfig = cargarRiesgosDesdeJSON(data);
          const resultadosGDD = calcularRiesgosMultiples(riesgosConfig, climaParsed);
          setMisAlertas(generarAlertas(resultadosGDD));
        } catch (calcError) {
          console.log("⚠️ Error calculando GDD, omitiendo alertas:", calcError.message);
          setMisAlertas([]);
        }
      }
    } catch (error) {
      console.error("Error en monitoreo:", error);
    }
  };

  const seleccionarCultivoMonitoreo = async (nombre) => {
    await AsyncStorage.setItem('@cultivo_monitoreo_id', String(nombre));
    setModalVisible(false);
    cargarDatosMonitoreo();
  };

  const herramientas = [
    { id: 1, nombre: 'Riego', icon: 'water', screen: 'CalculadoraRiego', color: '#2196F3' },
    { id: 2, nombre: 'Calendario', icon: 'calendar-month', screen: 'LaboresScreen', color: '#4CAF50' },
    { id: 3, nombre: 'IA Plagas', icon: 'scan-helper', screen: 'CameraScreen', color: '#9C27B0' },
    { id: 4, nombre: 'Reportes', icon: 'file-chart', screen: 'EstadisticasScreen', color: '#FF9800' },
  ];

  // HELPER: Extrae el nombre de forma segura sin importar cómo venga de Firebase
  const nombreSeguroCultivo = cultivoMonitoreado?.cultivo || cultivoMonitoreado?.nombre || cultivoMonitoreado?.nombre_cientifico;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />
      <ScrollView showsVerticalScrollIndicator={false}>
        
        {/* FONDO VERDE: Envuelve el Header y el Buscador y scrollea con la pantalla */}
        <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.greenHeaderWrapper}>
          {/* HEADER */}
          <View style={styles.header}>
            <View>
              {/* Se agregó color blanco al texto para contrastar con el fondo verde */}
              <Text style={[styles.welcomeText, { color: '#FFF' }]}>Hola, Victor 👋</Text>
              <Text style={[styles.subWelcome, { color: '#E8F5E9' }]}>Agrónomo • San Juan Tepeuxila</Text>
            </View>
          </View>

          {/* BUSCADOR */}
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color="#888" />
              <TextInput 
                style={styles.searchInput}
                placeholder="Buscar cultivo..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => {
                  if(searchQuery.trim().length > 0) {
                    navigation.navigate("GuiaScreen", { cultivo: searchQuery.trim() });
                    setSearchQuery(""); // Limpiar tras buscar
                  }
                }}
              />
            </View>
          </View>
        </LinearGradient>

        {/* WIDGET CLIMA -> WeatherScreen */}
        <TouchableOpacity 
          onPress={() => navigation.navigate('WeatherScreen')}
          style={[styles.weatherWrapper, { marginTop: 20 }]} // Ajuste de margen por el fondo verde
        >
          <ClimaWidget />
        </TouchableOpacity>

        {/* NUEVO: SECCIÓN DESPLEGABLE DE FAVORITOS */}
        <View style={styles.sectionContainer}>
          <TouchableOpacity 
            style={styles.favoritosHeader}
            onPress={() => setShowFavoritos(!showFavoritos)}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionTitle}>Mis Favoritos</Text>
            <Ionicons name={showFavoritos ? "chevron-up" : "chevron-down"} size={22} color="#333" />
          </TouchableOpacity>

          {showFavoritos && (
            <View style={styles.favoritosContainer}>
              {favoritos.length > 0 ? (
                favoritos.map((fav, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.favoritoItem}
                    onPress={() => navigation.navigate("GuiaScreen", { cultivo: fav.nombre || fav })}
                  >
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <Ionicons name="leaf" size={18} color="#4CAF50" style={{marginRight: 10}} />
                      <Text style={styles.favoritoText}>{fav.nombre || fav}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#CCC" />
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.noFavoritosText}>Aún no has agregado cultivos favoritos.</Text>
              )}
            </View>
          )}
        </View>

        {/* MODULO DE HERRAMIENTAS */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Herramientas</Text>
          <View style={styles.toolsGrid}>
            {herramientas.map(tool => (
              <TouchableOpacity 
                key={tool.id} 
                style={styles.toolCard}
                onPress={() => {
                  if (!nombreSeguroCultivo) {
                    Alert.alert("Atención", "Por favor, selecciona un cultivo para monitorear primero.");
                    return;
                  }
                  navigation.navigate(tool.screen, { cultivo: nombreSeguroCultivo });
                }}
              >
                <View style={[styles.toolIconContainer, { backgroundColor: tool.color + '15' }]}>
                  <MaterialCommunityIcons name={tool.icon} size={28} color={tool.color} />
                </View>
                <Text style={styles.toolLabel}>{tool.nombre}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* MONITOREO ACTUAL */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Mi Monitoreo</Text>
          {cultivoMonitoreado ? (
            <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.monitoreoCard}>
              <View>
                <Text style={styles.monitoreoNombre}>{nombreSeguroCultivo || 'Cultivo Desconocido'}</Text>
                <Text style={styles.monitoreoFase}>
                  Etapa: {typeof cultivoMonitoreado.ciclo_fenologico?.etapa_actual === 'string' 
                            ? cultivoMonitoreado.ciclo_fenologico.etapa_actual 
                            : 'Vegetativa'}
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.btnDetalles}
                onPress={() => navigation.navigate('FenologiaScreen', { cultivo: nombreSeguroCultivo })}
              >
                <Text style={styles.btnDetallesText}>Detalles</Text>
              </TouchableOpacity>
            </LinearGradient>
          ) : (
            <TouchableOpacity style={styles.noCultivoCard} onPress={() => setModalVisible(true)}>
              <Ionicons name="add-circle-outline" size={30} color="#666" />
              <Text style={styles.noCultivoText}>Seleccionar cultivo para monitorear</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* MODAL SELECCIÓN CULTIVO OPTIMIZADO */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecciona un Cultivo</Text>
            <FlatList 
              data={listaCultivos}
              keyExtractor={(item, index) => String(item || index)}
              initialNumToRender={10}
              maxToRenderPerBatch={15}
              windowSize={5}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => seleccionarCultivoMonitoreo(item)}>
                  <Text style={styles.modalItemText}>{String(item)}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#CCC" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{textAlign: 'center', color: '#999', padding: 20}}>
                  No hay cultivos disponibles en caché local.
                </Text>
              }
            />
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeModalBtn}>
              <Text style={styles.closeModalText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  
  /* NUEVOS ESTILOS AGREGADOS */
  greenHeaderWrapper: {
    paddingBottom: 25,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  favoritosHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  favoritosContainer: { backgroundColor: '#FFF', borderRadius: 15, padding: 10, elevation: 1 },
  favoritoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  favoritoText: { fontSize: 16, color: '#444' },
  noFavoritosText: { color: '#888', fontStyle: 'italic', textAlign: 'center', padding: 15 },
  /* FIN NUEVOS ESTILOS */

  header: { paddingHorizontal: 24, paddingVertical: 20 },
  welcomeText: { fontSize: 24, fontWeight: 'bold' },
  subWelcome: { fontSize: 14, color: '#666' },
  searchContainer: { paddingHorizontal: 24, marginBottom: 15 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 15, paddingHorizontal: 15, height: 50, elevation: 2 },
  searchInput: { flex: 1, marginLeft: 10 },
  weatherWrapper: { marginHorizontal: 24, marginBottom: 20 },
  sectionContainer: { paddingHorizontal: 24, marginBottom: 25 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  toolsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  toolCard: { width: (width - 68) / 4, alignItems: 'center' },
  toolIconContainer: { width: 55, height: 55, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  toolLabel: { fontSize: 11, fontWeight: '600', color: '#444' },
  monitoreoCard: { padding: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monitoreoNombre: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  monitoreoFase: { color: '#E8F5E9', fontSize: 13 },
  btnDetalles: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnDetallesText: { color: '#2E7D32', fontWeight: 'bold' },
  noCultivoCard: { padding: 25, backgroundColor: '#fff', borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CCC', alignItems: 'center' },
  noCultivoText: { marginTop: 10, color: '#666' },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#EEE', flexDirection: 'row', justifyContent: 'space-between' },
  modalItemText: { fontSize: 16 },
  closeModalBtn: { marginTop: 15, alignSelf: 'center' },
  closeModalText: { color: 'red', fontWeight: 'bold' }
});