import React, { useState, useEffect, useRef } from "react";
import { 
  View, Text, StyleSheet, FlatList, TextInput, 
  TouchableOpacity, StatusBar, Image, ScrollView, Modal, ActivityIndicator, Alert, Dimensions,
  LayoutAnimation, Platform, UIManager
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import NetInfo from "@react-native-community/netinfo";
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';

// Datos y Utilidades
import datosBasicos from "../data/cultivos_basico.json";
import CultivoDataManager from '../utils/CultivoDataManager';
import { getDatabase, ref, onValue } from "firebase/database";
import { app } from '../utils/firebase';  

// --- CORRECCIÓN DE IMPORTACIÓN PARA gdd_calculator020326.js ---
import { calcularGDD_Seno, generarAlertas } from '../utils/gdd_calculator';

// Componentes
import ClimaWidget from '../components/ClimaWidget'; 
import { TreatmentCard } from '../components/TreatmentCard';
import { usePlantClassifier } from '../src/hooks/usePlantClassifier';

const { width } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HomeScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCropGDD, setSelectedCropGDD] = useState("Agave tequilero");
  const [climaData, setClimaData] = useState({ tmax: 30, tmin: 15 });
  const [riesgosActivos, setRiesgosActivos] = useState([]);
  const [loadingGDD, setLoadingGDD] = useState(false);
  const [dataFirebase, setDataFirebase] = useState(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  
  // Estados de Favoritos e Historial (Configuración original)
  const [favoritos, setFavoritos] = useState([]);
  const [historialEscaneos, setHistorialEscaneos] = useState([]);

  // Lógica de Clasificación e IA original
  const { device, hasPermission, requestPermission, takingPhoto, setTakingPhoto, model, result, classifyImage } = usePlantClassifier();

  // --- SOLUCIÓN AL ERROR DE PERMISOS ---
  // Solicitamos el permiso al montar el componente si no se tiene
  useEffect(() => {
    const checkPermissions = async () => {
      if (!hasPermission) {
        const status = await requestPermission();
        if (!status) {
          Alert.alert(
            "Permiso de Cámara",
            "RóslinApp necesita acceso a la cámara para identificar plagas. Por favor, actívalo en ajustes."
          );
        }
      }
    };
    checkPermissions();
  }, [hasPermission]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });
    fetchFirebaseData();
    cargarDatosLocales();
    return () => unsubscribe();
  }, []);

  const cargarDatosLocales = async () => {
    try {
      const favs = await AsyncStorage.getItem('favoritos_cultivos');
      const hist = await AsyncStorage.getItem('historial_escaneos');
      if (favs) setFavoritos(JSON.parse(favs));
      if (hist) setHistorialEscaneos(JSON.parse(hist));
    } catch (e) { console.error("Error cargando local:", e); }
  };

  const fetchFirebaseData = () => {
    setLoadingGDD(true);
    const db = getDatabase(app);
    const starCountRef = ref(db, 'cultivos');
    
    onValue(starCountRef, (snapshot) => {
      const data = snapshot.val();
      setDataFirebase(data);
      if (data && data[selectedCropGDD]) {
        procesarCalculosGDD(data[selectedCropGDD], climaData);
      }
      setLoadingGDD(false);
    }, (error) => {
      console.error(error);
      setLoadingGDD(false);
    });
  };

  const procesarCalculosGDD = (cultivoData, clima) => {
    if (!cultivoData || !cultivoData.riesgos_detallados) return;

    const predicciones = {};
    const riesgos = cultivoData.riesgos_detallados;

    Object.keys(riesgos).forEach(nombreRiesgo => {
      const infoRiesgo = riesgos[nombreRiesgo];
      
      if (infoRiesgo.ciclo_desarrollo && infoRiesgo.ciclo_desarrollo.grados_dia_desarrollo) {
        const gddConfig = infoRiesgo.ciclo_desarrollo.grados_dia_desarrollo;
        
        if (gddConfig.base_termica === "N/A") return; 

        const base = parseFloat(gddConfig.base_termica);
        const superior = (gddConfig.umbral_superior && gddConfig.umbral_superior !== "N/A") 
                          ? parseFloat(gddConfig.umbral_superior) 
                          : null;
        
        const requeridos = parseFloat(gddConfig.gdd_ciclo_completo) || 100;

        const gddDelDia = calcularGDD_Seno(clima.tmax, clima.tmin, base, superior);
        const gddAcumuladoSimulado = gddDelDia * 20; 

        predicciones[nombreRiesgo] = {
          gdd_requeridos: requeridos,
          gdd_alcanzado: gddAcumuladoSimulado,
          progreso: (gddAcumuladoSimulado / requeridos) * 100
        };
      }
    });

    const alertasFinales = generarAlertas(predicciones);
    setRiesgosActivos(alertasFinales);
  };

  const renderRiesgoItem = ({ item }) => (
    <View style={styles.riesgoCard}>
      <View style={[styles.statusBadge, { backgroundColor: item.nivel === 'CRÍTICO' ? '#FFCDD2' : '#FFF9C4' }]}>
        <Text style={[styles.statusText, { color: item.nivel === 'CRÍTICO' ? '#C62828' : '#F9A825' }]}>{item.nivel}</Text>
      </View>
      <Text style={styles.riesgoNombre}>{item.riesgo}</Text>
      <Text style={styles.riesgoMensaje} numberOfLines={2}>{item.mensaje}</Text>
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarFill, { width: `${Math.min(parseFloat(item.progreso), 100)}%`, backgroundColor: item.nivel === 'CRÍTICO' ? '#E53935' : '#FB8C00' }]} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar plagas, cultivos o síntomas..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#2E7D32', '#43A047']} style={styles.header}>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.welcomeText}>Panel Agrícola Pro</Text>
              <Text style={styles.userName}>Estación: Central Texcoco</Text>
            </View>
            <TouchableOpacity style={styles.profileBtn}>
              <Ionicons name="notifications-outline" size={24} color="white" />
              <View style={styles.notificationBadge} />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={() => navigation.navigate('WeatherScreen')}
          >
              <ClimaWidget onWeatherData={(data) => {
                   setClimaData(data);
                   if(dataFirebase) procesarCalculosGDD(dataFirebase[selectedCropGDD], data);
              }} />
          </TouchableOpacity>

          {favoritos.length > 0 && (
            <View style={styles.favoritosMinContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favoritosScroll}>
                {favoritos.map((fav, index) => (
                  <TouchableOpacity key={index} style={styles.favMinCard}>
                    <View style={styles.favMinIconBadge}>
                      <FontAwesome5 name="leaf" size={20} color="#43A047" />
                    </View>
                    <Text style={styles.favMinText} numberOfLines={1}>{fav.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Análisis de Riesgo (GDD)</Text>
              <TouchableOpacity onPress={() => setShowCropModal(true)}>
                <Text style={styles.changeText}>Cambiar Cultivo</Text>
              </TouchableOpacity>
            </View>

            {loadingGDD ? (
              <ActivityIndicator color="#2E7D32" style={{ margin: 20 }} />
            ) : (
              <FlatList
                data={riesgosActivos}
                renderItem={renderRiesgoItem}
                keyExtractor={item => item.riesgo}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listPadding}
                ListEmptyComponent={<Text style={styles.emptyText}>Selecciona un cultivo para ver riesgos.</Text>}
            />
            )}
          </View>

          <TouchableOpacity 
            style={styles.mainActionCard}
            onPress={() => {
              if (hasPermission) {
                setTakingPhoto(true);
              } else {
                requestPermission();
              }
            }}
          >
            <LinearGradient colors={['#66BB6A', '#43A047']} style={styles.actionGradient}>
              <MaterialCommunityIcons name="camera-iris" size={42} color="white" />
              <View style={styles.actionTextContainer}>
                <Text style={styles.actionTitle}>Identificar con IA</Text>
                <Text style={styles.actionSub}>Escanea síntomas en tiempo real</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="white" />
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Escaneos Recientes</Text>
            {historialEscaneos.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={40} color="#CBD5E1" />
                <Text style={styles.emptyText}>No hay escaneos guardados</Text>
              </View>
            ) : (
              historialEscaneos.slice(0, 3).map((item, idx) => (
                <TouchableOpacity key={idx} style={styles.historialCard}>
                  <Image source={{ uri: item.uri }} style={styles.historialImg} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historialLabel}>{item.label}</Text>
                    <Text style={styles.historialFecha}>{item.fecha}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal visible={showCropModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cultivos Disponibles</Text>
            {dataFirebase && Object.keys(dataFirebase).map(cultivo => (
              <TouchableOpacity 
                key={cultivo} 
                style={styles.modalItem}
                onPress={() => {
                  setSelectedCropGDD(cultivo);
                  setShowCropModal(false);
                  procesarCalculosGDD(dataFirebase[cultivo], climaData);
                }}
              >
                <Text style={styles.modalItemText}>{cultivo}</Text>
                {selectedCropGDD === cultivo && <Ionicons name="checkmark-circle" size={22} color="#2E7D32" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowCropModal(false)} style={styles.closeModalBtn}>
              <Text style={styles.closeModalText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL DE CÁMARA CORREGIDO */}
      <Modal visible={takingPhoto} animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          {device != null && hasPermission ? (
            <Camera 
              style={StyleSheet.absoluteFill} 
              device={device} 
              isActive={takingPhoto} 
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="white" />
                <Text style={{ color: 'white', marginTop: 10 }}>Cargando cámara...</Text>
            </View>
          )}
          <TouchableOpacity style={styles.closeCamera} onPress={() => setTakingPhoto(false)}>
            <Ionicons name="close-circle" size={50} color="white" />
          </TouchableOpacity>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  searchContainer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: 'white' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 15, paddingHorizontal: 15, height: 45 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#1E293B' },
  header: { paddingBottom: 40, paddingTop: 20, borderBottomLeftRadius: 35, borderBottomRightRadius: 35 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25 },
  welcomeText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },
  userName: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  profileBtn: { backgroundColor: 'rgba(255,255,255,0.25)', padding: 12, borderRadius: 18 },
  notificationBadge: { position: 'absolute', top: 12, right: 12, width: 10, height: 10, backgroundColor: '#EF4444', borderRadius: 5, borderWidth: 2, borderColor: '#43A047' },
  content: { marginTop: -25, paddingHorizontal: 20 },
  sectionContainer: { marginTop: 25 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 19, fontWeight: 'bold', color: '#1E293B' },
  changeText: { color: '#2E7D32', fontWeight: 'bold', fontSize: 13 },
  listPadding: { paddingBottom: 15 },
  riesgoCard: { backgroundColor: 'white', borderRadius: 22, padding: 18, marginRight: 15, width: 240, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, marginBottom: 10 },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  riesgoNombre: { fontSize: 17, fontWeight: 'bold', color: '#334155' },
  riesgoMensaje: { fontSize: 13, color: '#64748B', marginTop: 5, lineHeight: 18 },
  progressBarContainer: { height: 7, backgroundColor: '#F1F5F9', borderRadius: 4, marginTop: 15 },
  progressBarFill: { height: '100%', borderRadius: 4 },
  mainActionCard: { marginTop: 20, borderRadius: 28, overflow: 'hidden', elevation: 8, shadowColor: '#2E7D32', shadowOpacity: 0.3 },
  actionGradient: { flexDirection: 'row', alignItems: 'center', padding: 25 },
  actionTextContainer: { flex: 1, marginLeft: 18 },
  actionTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  actionSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 },
  emptyState: { alignItems: 'center', marginTop: 30, opacity: 0.6 },
  emptyText: { color: '#94A3B8', marginTop: 10, fontSize: 14 },
  historialCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 18, marginBottom: 12, elevation: 2 },
  historialImg: { width: 50, height: 50, borderRadius: 12, marginRight: 15 },
  historialLabel: { fontWeight: 'bold', color: '#1E293B', fontSize: 15 },
  historialFecha: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: 'white', borderRadius: 30, padding: 25, maxHeight: '80%' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#1E293B' },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalItemText: { fontSize: 17, color: '#334155' },
  closeModalBtn: { marginTop: 25, alignSelf: 'center' },
  closeModalText: { color: '#EF4444', fontWeight: 'bold', fontSize: 16 },
  closeCamera: { position: 'absolute', top: 50, right: 25 },
  favoritosMinContainer: { marginTop: 15, marginBottom: 5 },
  favoritosScroll: { paddingVertical: 5 },
  favMinCard: { alignItems: 'center', marginRight: 22, width: 70 },
  favMinIconBadge: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: 6, borderWidth: 1, borderColor: '#DCFCE7' },
  favMinText: { fontSize: 12, color: '#475569', fontWeight: '500' }
});