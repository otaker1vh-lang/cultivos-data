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
import { cargarRiesgosDesdeJSON, calcularRiesgosMultiples, generarAlertas } from '../utils/gdd_calculator';

// Componentes
import ClimaWidget from '../components/ClimaWidget'; 
import { TreatmentCard } from '../components/TreatmentCard';
import { usePlantClassifier } from '../src/hooks/usePlantClassifier';

const { width } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const obtenerIconoCultivo = (nombre, categoria) => {
  const n = nombre ? nombre.toLowerCase() : "";
  const c = categoria ? categoria.toLowerCase() : "";
  if (n.includes("maiz") || n.includes("elote")) return "corn";
  if (n.includes("trigo") || n.includes("cebada") || n.includes("avena") || n.includes("sorgo")) return "barley";
  if (n.includes("frijol") || n.includes("soja") || n.includes("haba")) return "seed";
  if (n.includes("tomate") || n.includes("jitomate")) return "fruit-cherries"; 
  if (n.includes("chile") || n.includes("pimiento") || n.includes("jalape")) return "chili-hot";
  if (n.includes("zanahoria")) return "carrot";
  if (n.includes("papa") || n.includes("patata")) return "food-steak"; 
  if (n.includes("cafe") || n.includes("café")) return "coffee";
  if (n.includes("limon") || n.includes("naranja") || n.includes("citrico")) return "fruit-citrus";
  if (c.includes("frut")) return "food-apple";
  return "sprout";
};

export default function HomeScreen({ navigation }) {
  // Estados de Búsqueda y Lista
  const [busqueda, setBusqueda] = useState("");
  const [cultivosFiltrados, setCultivosFiltrados] = useState([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [listaCultivos, setListaCultivos] = useState([]);
  const [cultivosGuardados, setCultivosGuardados] = useState([]); 
  const [favoritosExpanded, setFavoritosExpanded] = useState(true);

  // Estados de GDD y Firebase
  const [dbCultivos, setDbCultivos] = useState(null);
  const [climaActual, setClimaActual] = useState(null);
  const [alertasGDD, setAlertasGDD] = useState([]);
  const [loadingGDD, setLoadingGDD] = useState(false);
  const [selectedCropGDD, setSelectedCropGDD] = useState(null);
  const [showCropSelector, setShowCropSelector] = useState(false);
  const [gddSectionExpanded, setGddSectionExpanded] = useState(false); 
  const [expandedGddId, setExpandedGddId] = useState(null); 

  // Estados de Cámara e IA
  const [modalCameraVisible, setModalCameraVisible] = useState(false);
  const [image, setImage] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef(null);
  const isCalculatingRef = useRef(false);

  const { prediction, setPrediction, loadingIA, classifyImage } = usePlantClassifier(isOnline, climaActual, alertasGDD);

  // Efectos Iniciales
  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener(state => setIsOnline(!!state.isConnected));
    cargarFavoritos();
    
    // Cargar datos iniciales de JSON
    if (datosBasicos?.cultivos) {
        setListaCultivos(Object.keys(datosBasicos.cultivos).map(nombre => ({ nombre, ...datosBasicos.cultivos[nombre] })));
    }

    // Sincronizar con Supabase
    const sincronizar = async () => {
      try {
        const datosSupabase = await CultivoDataManager.obtenerListaCultivos();
        if (datosSupabase?.length > 0) setListaCultivos(datosSupabase);
      } catch (error) { console.log("Modo offline activo"); }
    };
    sincronizar();

    return () => unsubscribeNet();
  }, []);

  // Firebase Realtime DB para GDD
  useEffect(() => {
    const db = getDatabase(app);
    const dbRef = ref(db, 'cultivos'); 
    return onValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setDbCultivos(data);
        if (!selectedCropGDD) {
            const firstKey = Object.keys(data)[0];
            setSelectedCropGDD({ id: firstKey, ...data[firstKey] });
        }
      }
    });
  }, []);

  // Lógica de cálculo GDD al actualizar clima o cultivo
  useEffect(() => {
    if (climaActual && selectedCropGDD && !isCalculatingRef.current) {
        isCalculatingRef.current = true;
        calcularRiesgoGDD(selectedCropGDD, climaActual).finally(() => { isCalculatingRef.current = false; });
    }
  }, [climaActual, selectedCropGDD]);

  // Manejo de Búsqueda
  useEffect(() => {
    if (busqueda.trim() === "") {
      setCultivosFiltrados([]);
      setMostrarLista(false);
      return;
    }
    const query = busqueda.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const resultados = listaCultivos.filter((cultivo) => {
      const nombreNorm = cultivo.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return nombreNorm.includes(query);
    });
    setCultivosFiltrados(resultados);
    setMostrarLista(true);
  }, [busqueda, listaCultivos]);

  // Funciones de Almacenamiento
  const cargarFavoritos = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem('@mis_cultivos');
      if (jsonValue != null) setCultivosGuardados(JSON.parse(jsonValue));
    } catch(e) { console.log("Error favoritos"); }
  };

  const toggleFavorito = async (item) => {
    try {
      const existe = cultivosGuardados.find(c => c.nombre === item.nombre);
      const nuevoArray = existe ? cultivosGuardados.filter(c => c.nombre !== item.nombre) : [...cultivosGuardados, item];
      setCultivosGuardados(nuevoArray);
      await AsyncStorage.setItem('@mis_cultivos', JSON.stringify(nuevoArray));
    } catch (e) { console.log("Error guardando"); }
  };

  // Lógica GDD Compatible con gdd_calculator.js
  const calcularRiesgoGDD = async (cultivo, clima) => {
    if (!clima?.temp_max || !clima?.temp_min) return;
    setLoadingGDD(true);
    try {
        const storageKey = `@gdd_historial_${cultivo.id}`;
        const historialStr = await AsyncStorage.getItem(storageKey);
        let historial = historialStr ? JSON.parse(historialStr) : [];
        const hoy = new Date().toISOString().split('T')[0];
        
        // Extraer humedad para el cálculo de enfermedades (valor por defecto 50 si no está disponible)
        const humedad = clima.humedad_relativa || clima.humedad || clima.humidity || 50;

        const nuevoDato = { 
            fecha: hoy, 
            tmax: parseFloat(clima.temp_max), 
            tmin: parseFloat(clima.temp_min),
            humedad_relativa: parseFloat(humedad)
        };
        const idx = historial.findIndex(d => d.fecha === hoy);
        if (idx !== -1) historial[idx] = nuevoDato;
        else historial.push(nuevoDato);
        
        await AsyncStorage.setItem(storageKey, JSON.stringify(historial.slice(-180)));
        
        // Uso directo de las funciones de gdd_calculator
        const riesgosConfig = cargarRiesgosDesdeJSON(cultivo); 
        const predicciones = calcularRiesgosMultiples(historial, riesgosConfig);
        const alertas = generarAlertas(predicciones);

        setAlertasGDD(alertas.map(alerta => ({
            id: alerta.riesgo,
            nombre: alerta.riesgo,
            gdd: alerta.gdd_actual,
            gddRequeridos: predicciones[alerta.riesgo].gdd_requeridos,
            nivel: (alerta.nivel === 'CRÍTICO' || alerta.nivel === 'ALTO') ? 'ALTO' : 'MEDIO',
            mensaje: alerta.mensaje,
            detalle: cultivo.riesgos_detallados?.[alerta.riesgo] || cultivo.riesgos_fitosanitarios?.[alerta.riesgo],
            progreso: parseFloat(alerta.progreso).toFixed(0)
        })));
    } catch (error) { console.error("GDD Error:", error); } finally { setLoadingGDD(false); }
  };

  const reiniciarTemporadaGDD = async () => {
    Alert.alert("Reiniciar", `¿Reiniciar monitoreo de ${selectedCropGDD.id}?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Reiniciar", style: "destructive", onPress: async () => {
            await AsyncStorage.removeItem(`@gdd_historial_${selectedCropGDD.id}`);
            setAlertasGDD([]);
        }}
    ]);
  };

  // Cámara
  const abrirCamara = async () => { 
    if (!hasPermission) {
      const permiso = await requestPermission();
      if (!permiso) return Alert.alert("Error", "Permiso de cámara denegado.");
    }
    setModalCameraVisible(true); 
  };
  
  const takePicture = async () => { 
    if (cameraRef.current) { 
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      setImage(`file://${photo.path}`); 
    }
  };

  // Renderizado de Items
  const renderCultivo = ({ item }) => {
    const iconName = obtenerIconoCultivo(item.nombre, item.categoria);
    const esFavorito = cultivosGuardados.some(c => c.nombre === item.nombre);
    return (
      <View style={styles.cultivoCardContainer}>
        <TouchableOpacity style={styles.cardMainArea} onPress={() => navigation.navigate('MenuDetalle', { cultivo: item.nombre })}>
          <View style={styles.iconBox}>
             {item.imagen_url ? <Image source={{ uri: item.imagen_url }} style={styles.cardImage} /> : <MaterialCommunityIcons name={iconName} size={28} color="#43A047" />}
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>{item.nombre}</Text>
            <Text style={styles.cardSubtitle}>{item.nombre_cientifico || item.categoria || "Ficha técnica"}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={{padding: 10}} onPress={() => toggleFavorito(item)}>
            <MaterialCommunityIcons name={esFavorito ? "heart" : "heart-outline"} size={24} color={esFavorito ? "#E91E63" : "#B0BEC5"} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGuiaArea} onPress={() => navigation.navigate('Guia', { cultivo: item.nombre })}>
          <MaterialCommunityIcons name="compass-rose" size={24} color="#F57C00" />
          <Text style={styles.btnGuiaText}>Guía</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* CONTENEDOR DINÁMICO AJUSTADO AL CLIMA */}
          <View style={styles.dynamicHeaderWrapper}>
            <LinearGradient 
              colors={['#1B5E20', '#2E7D32', '#43A047']} 
              style={styles.headerGradientBackground} 
            />
            
            <View style={styles.topSection}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.welcomeSub}>Bienvenido a</Text>
                  <Text style={styles.appName}>RóslinApp</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('About')}>
                  <Ionicons name="information-circle" size={28} color="#FFF" />
                </TouchableOpacity>
              </View>
              
              {/* Click hacia WeatherScreen */}
              <TouchableOpacity onPress={() => navigation.navigate('WeatherScreen')} activeOpacity={0.9}>
                <View style={styles.weatherContainer}>
                  <ClimaWidget onClimaUpdate={setClimaActual} />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sección Favoritos Desplegable */}
          {cultivosGuardados.length > 0 && (
            <View style={styles.favoritosMinContainer}>
              <TouchableOpacity 
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setFavoritosExpanded(!favoritosExpanded);
                }}
                style={[styles.gddHeaderRow, { paddingHorizontal: 24, paddingBottom: 10 }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="heart-multiple" size={20} color="#2E7D32" />
                  <Text style={[styles.sectionTitleFav, { marginLeft: 10, marginBottom: 0 }]}>Mis Cultivos</Text>
                </View>
                <Ionicons 
                  name={favoritosExpanded ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color="#546E7A" 
                />
              </TouchableOpacity>
              
              {favoritosExpanded && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  contentContainerStyle={styles.favoritosScroll}
                >
                  {cultivosGuardados.map((item, index) => (
                    <TouchableOpacity 
                      key={index} 
                      style={styles.favMinCard}
                      onPress={() => navigation.navigate('MenuDetalle', { cultivo: item.nombre })}
                    >
                      <View style={styles.favMinIconBadge}>
                        <MaterialCommunityIcons 
                          name={obtenerIconoCultivo(item.nombre, item.categoria)} 
                          size={22} 
                          color="#2E7D32" 
                        />
                      </View>
                      <Text numberOfLines={1} style={styles.favMinText}>{item.nombre}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* Banner Diagnóstico */}
          <View style={styles.heroSection}>
            <TouchableOpacity style={styles.diagnoseCard} onPress={abrirCamara}>
                <LinearGradient colors={['#FF8F00', '#FF6F00']} style={styles.diagnoseGradient} start={{x: 0, y: 0}} end={{x: 1, y: 0}}>
                    <View style={styles.diagnoseContent}>
                        <MaterialCommunityIcons name="camera-iris" size={30} color="#FFF" />
                        <View style={{marginLeft: 15, flex: 1}}>
                            <Text style={styles.diagnoseTitle}>Diagnóstico Inteligente</Text>
                            <Text style={styles.diagnoseSub}>Analiza la salud de tus plantas</Text>
                        </View>
                    </View>
                </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Búsqueda */}
          <View style={styles.searchContainer}>
             <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="#757575" style={{marginRight: 10}} />
                <TextInput style={styles.searchInput} placeholder="Buscar cultivos..." value={busqueda} onChangeText={setBusqueda} />
             </View>
          </View>

          {mostrarLista && <FlatList data={cultivosFiltrados} keyExtractor={(item) => item.nombre} renderItem={renderCultivo} scrollEnabled={false} />}

          {/* Herramientas */}
          <View style={styles.quickAccessContainer}>
             <Text style={[styles.sectionTitleFav, {paddingHorizontal: 24}]}>Herramientas de Campo</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAccessScroll}>
                {[
                  {n: 'AgroControl', i: 'router-wireless', c: '#00695C', bg: '#E0F2F1'},
                  {n: 'Fertilizantes', i: 'sack', c: '#2E7D32', bg: '#E8F5E9'},
                  {n: 'Dosis', i: 'flask', c: '#006064', bg: '#E0F7FA'},
                  {n: 'Bitacora', i: 'notebook', c: '#E65100', bg: '#FFF3E0'},
                  {n: 'Noticias', i: 'newspaper', c: '#7B1FA2', bg: '#F3E5F5'},
                  {n: 'ReporteAvanzado', i: 'file-chart', c: '#D32F2F', bg: '#FFEBEE', label: 'Reportes'},
                  {n: 'Costos', i: 'finance', c: '#FBC02D', bg: '#FFFDE7', label: 'Mis Costos'}
                ].map((item, idx) => (
                  <TouchableOpacity key={idx} style={styles.quickBtn} onPress={() => navigation.navigate(item.n, { cultivo: selectedCropGDD?.id })}>
                    <View style={[styles.quickIcon, {backgroundColor: item.bg}]}><MaterialCommunityIcons name={item.i} size={26} color={item.c} /></View>
                    <Text style={styles.quickText}>{item.label || item.n}</Text>
                  </TouchableOpacity>
                ))}
             </ScrollView>
          </View>

          {/* Sección GDD */}
          <View style={styles.gddMainCard}>
             <TouchableOpacity onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setGddSectionExpanded(!gddSectionExpanded); }} style={styles.gddHeaderRow}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <FontAwesome5 name="temperature-low" size={18} color="#2E7D32" />
                    <Text style={[styles.gddTitleMain, {marginLeft:12}]}>Monitoreo GDD (Plagas)</Text>
                </View>
                <Ionicons name={gddSectionExpanded ? "chevron-up" : "chevron-down"} size={24} color="#546E7A" />
             </TouchableOpacity>

             {gddSectionExpanded && (
                 <View style={styles.gddContentArea}>
                    <TouchableOpacity onPress={() => setShowCropSelector(true)} style={styles.gddSelectorBtn}>
                        <Text style={styles.gddSelectorText}>{selectedCropGDD?.id || "Seleccionar Cultivo"}</Text>
                        <Ionicons name="caret-down" size={12} color="#2E7D32" />
                    </TouchableOpacity>
                    
                    {alertasGDD.map((alerta, index) => (
                        <TouchableOpacity key={index} style={styles.gddCard} onPress={() => setExpandedGddId(expandedGddId === alerta.id ? null : alerta.id)}>
                            <View style={styles.gddHeader}>
                                <View style={{flex:1}}>
                                    <Text style={styles.gddTitle}>{alerta.nombre}</Text>
                                    <View style={styles.progressBarContainer}>
                                        <View style={[styles.progressBarFill, { width: `${Math.min(alerta.progreso, 100)}%`, backgroundColor: alerta.nivel === 'ALTO' ? '#D32F2F' : '#4CAF50' }]} />
                                    </View>
                                </View>
                                <View style={[styles.riskBadge, { backgroundColor: alerta.nivel === 'ALTO' ? '#FFCDD2' : '#C8E6C9' }]}>
                                    <Text style={[styles.riskText, { color: alerta.nivel === 'ALTO' ? '#B71C1C' : '#1B5E20' }]}>{alerta.nivel}</Text>
                                </View>
                            </View>
                            {expandedGddId === alerta.id && (
                                <Text style={styles.gddMsg}>{alerta.mensaje}</Text>
                            )}
                        </TouchableOpacity>
                    ))}
                    
                    {alertasGDD.length > 0 && (
                        <TouchableOpacity style={styles.btnReiniciarTemporada} onPress={reiniciarTemporadaGDD}>
                            <MaterialCommunityIcons name="restart" size={16} color="#F57C00" />
                            <Text style={styles.btnReiniciarText}>Reiniciar Ciclo</Text>
                        </TouchableOpacity>
                    )}
                 </View>
             )}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Modal Cámara e IA */}
      <Modal visible={modalCameraVisible} animationType="slide">
         <View style={{flex: 1, backgroundColor: 'black'}}>
             <View style={styles.cameraHeader}>
                 <TouchableOpacity onPress={() => {setModalCameraVisible(false); setImage(null); setPrediction(null);}}><Ionicons name="close" size={30} color="white" /></TouchableOpacity>
                 <Text style={{color:'white', fontWeight:'bold', fontSize: 18}}>Scanner Phytosanitario</Text>
                 <View style={{width:40}}/>
             </View>
             {image ? (
                 <ScrollView contentContainerStyle={{alignItems:'center', padding:20}}>
                    <Image source={{ uri: image }} style={styles.previewImage} />
                    <TouchableOpacity style={styles.btnAction} onPress={() => classifyImage(image)}>
                        {loadingIA ? <ActivityIndicator color="white"/> : <Text style={styles.btnText}>🔍 Iniciar Análisis</Text>}
                    </TouchableOpacity>
                    {prediction && (
                        <View style={{width:'100%', marginTop:20}}>
                            <TreatmentCard predictionClass={prediction.label} />
                            <TouchableOpacity style={[styles.btnAction, {backgroundColor:'#1565C0', marginTop:15}]} onPress={() => Alert.alert("Registro", "Diagnóstico guardado en bitácora.")}>
                                <Text style={styles.btnText}>✅ Guardar Resultado</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <TouchableOpacity style={{marginTop:25}} onPress={() => {setImage(null); setPrediction(null);}}><Text style={{color:'white', fontSize: 16}}>Capturar otra vez</Text></TouchableOpacity>
                 </ScrollView>
             ) : (
                 <View style={{flex:1}}>
                    {device && <Camera style={StyleSheet.absoluteFill} device={device} isActive={modalCameraVisible} ref={cameraRef} photo={true} />}
                    <View style={styles.cameraFooter}>
                       <TouchableOpacity style={styles.captureOuter} onPress={takePicture}><View style={styles.captureInner}/></TouchableOpacity>
                    </View>
                 </View>
             )}
         </View>
      </Modal>

      {/* Modal Selector */}
      <Modal visible={showCropSelector} transparent animationType="fade">
         <View style={styles.modalOverlay}>
             <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Seleccionar Cultivo</Text>
                <FlatList 
                    data={dbCultivos ? Object.keys(dbCultivos) : []}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => {setSelectedCropGDD({id: item, ...dbCultivos[item]}); setShowCropSelector(false);}}>
                            <Text style={styles.modalItemText}>{item}</Text>
                            {selectedCropGDD?.id === item && <Ionicons name="checkmark-circle" size={20} color="green"/>}
                        </TouchableOpacity>
                    )}
                />
                <TouchableOpacity onPress={()=>setShowCropSelector(false)} style={styles.closeModalBtn}><Text style={styles.closeModalText}>Cancelar</Text></TouchableOpacity>
             </View>
         </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 60 },
  
  dynamicHeaderWrapper: {
    width: '100%',
    paddingBottom: 25,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#1B5E20',
  },
  headerGradientBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  
  topSection: { paddingHorizontal: 24, paddingTop: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  welcomeSub: { color: '#A5D6A7', fontSize: 14 },
  appName: { fontSize: 28, fontWeight: '800', color: '#fff' },
  weatherContainer: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  heroSection: { marginTop: 20, paddingHorizontal: 20 },
  diagnoseCard: { borderRadius: 20, elevation: 5 },
  diagnoseGradient: { borderRadius: 20, padding: 2 },
  diagnoseContent: { flexDirection: 'row', alignItems: 'center', padding: 18 },
  diagnoseTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  diagnoseSub: { fontSize: 12, color: '#FFF', opacity: 0.9 },
  searchContainer: { marginVertical: 15, paddingHorizontal: 24 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 15, paddingHorizontal: 15, height: 50, elevation: 2 },
  searchInput: { flex: 1, fontSize: 15 },
  quickAccessContainer: { marginBottom: 20 },
  sectionTitleFav: { fontSize: 18, fontWeight: '700', color: '#263238', marginBottom: 12 },
  quickAccessScroll: { paddingLeft: 24 },
  quickBtn: { alignItems: 'center', marginRight: 18, width: 75 },
  quickIcon: { width: 55, height: 55, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  quickText: { fontSize: 10, fontWeight: '600', color: '#546E7A', textAlign: 'center' },
  cultivoCardContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 15, marginBottom: 12, marginHorizontal: 24, elevation: 2, overflow: 'hidden' },
  cardMainArea: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12 },
  iconBox: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center' },
  cardImage: { width: '100%', height: '100%', borderRadius: 12 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#2E384D" },
  cardSubtitle: { fontSize: 12, color: "#90A4AE" },
  btnGuiaArea: { padding: 12, backgroundColor: '#FAFAFA', alignItems: 'center' },
  btnGuiaText: { fontSize: 9, color: '#F57C00', fontWeight: 'bold' },
  gddMainCard: { backgroundColor: '#fff', marginHorizontal: 24, borderRadius: 15, elevation: 2, borderWidth: 1, borderColor: '#E8F5E9', paddingBottom: 10, marginBottom: 20 },
  gddHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
  gddTitleMain: { fontSize: 16, fontWeight: '700', color: '#2E7D32' },
  gddContentArea: { paddingHorizontal: 15 },
  gddSelectorBtn: { backgroundColor:'#F1F8E9', padding:8, borderRadius:10, alignSelf: 'flex-start', marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  gddSelectorText: { color:'#33691E', fontWeight:'700', fontSize:12, marginRight: 5 },
  gddCard: { backgroundColor: '#FAFAFA', borderRadius: 10, marginBottom: 8, padding: 12, borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  gddHeader: { flexDirection: 'row', alignItems: 'center' },
  gddTitle: { fontSize: 14, fontWeight: '600', color: '#37474F' },
  gddMsg: { fontSize: 11, color: '#546E7A', marginTop: 5, fontStyle: 'italic' },
  progressBarContainer: { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginTop: 5, width: '90%' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  riskText: { fontSize: 9, fontWeight: '800' },
  cameraHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20 },
  previewImage: { width: width * 0.8, height: width * 0.8, borderRadius: 20, marginBottom: 20 },
  btnAction: { padding: 15, borderRadius: 25, width: '80%', alignItems: 'center', backgroundColor: '#2E7D32', elevation: 3 },
  btnText: { color: 'white', fontWeight: 'bold' },
  cameraFooter: { position: 'absolute', bottom: 60, width: '100%', alignItems: 'center' },
  captureOuter: { width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: 'white', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'white' },
  modalOverlay: { flex: 1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', padding: 30 },
  modalContent: { backgroundColor:'white', borderRadius:20, padding:20, maxHeight: '70%' },
  modalTitle: { fontSize:18, fontWeight:'bold', marginBottom:15, textAlign:'center' },
  modalItem: { padding:15, borderBottomWidth:1, borderBottomColor:'#EEE', flexDirection:'row', justifyContent:'space-between' },
  modalItemText: { fontSize:16 },
  closeModalBtn: { marginTop:15, alignSelf:'center' },
  closeModalText: { color:'red', fontWeight:'bold' },
  btnReiniciarTemporada: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF3E0', padding: 8, borderRadius: 10, marginTop: 10 },
  btnReiniciarText: { color: '#F57C00', fontSize: 12, fontWeight: '700', marginLeft: 6 },
  favoritosMinContainer: {
    marginTop: 15,
    marginBottom: 5,
    backgroundColor: 'transparent',
  },
  favoritosScroll: {
    paddingLeft: 24,
    paddingRight: 10,
    paddingBottom: 10,
  },
  favMinCard: {
    alignItems: 'center',
    marginRight: 20,
    width: 70,
  },
  favMinIconBadge: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  favMinText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#37474F',
    textAlign: 'center',
  },
});