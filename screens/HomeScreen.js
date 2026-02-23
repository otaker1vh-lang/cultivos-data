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

import datosBasicos from "../data/cultivos_basico.json";
import CultivoDataManager from '../utils/CultivoDataManager';
import { getDatabase, ref, onValue } from "firebase/database";
import { app } from '../utils/firebase';  
import { cargarRiesgosDesdeJSON, calcularRiesgosMultiples, generarAlertas } from '../utils/gdd_calculator';
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
  if (n.includes("trigo") || n.includes("cebada") || n.includes("avena")) return "barley";
  if (n.includes("frijol") || n.includes("soja")) return "seed";
  if (n.includes("tomate") || n.includes("jitomate")) return "fruit-cherries"; 
  if (n.includes("chile") || n.includes("pimiento")) return "chili-hot";
  if (n.includes("zanahoria")) return "carrot";
  if (n.includes("papa")) return "food-steak"; 
  if (n.includes("cafe")) return "coffee";
  if (n.includes("limon") || n.includes("naranja")) return "fruit-citrus";
  if (c.includes("frut")) return "food-apple";
  return "sprout";
};

export default function HomeScreen({ navigation }) {
  const [busqueda, setBusqueda] = useState("");
  const [cultivosFiltrados, setCultivosFiltrados] = useState([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [cultivosGuardados, setCultivosGuardados] = useState([]); 
  const [modalCameraVisible, setModalCameraVisible] = useState(false);
  const [dbCultivos, setDbCultivos] = useState(null);
  const [climaActual, setClimaActual] = useState(null);
  const [alertasGDD, setAlertasGDD] = useState([]);
  const [loadingGDD, setLoadingGDD] = useState(false);
  const [selectedCropGDD, setSelectedCropGDD] = useState(null);
  const [showCropSelector, setShowCropSelector] = useState(false);
  const [gddSectionExpanded, setGddSectionExpanded] = useState(false); 
  const [expandedGddId, setExpandedGddId] = useState(null); 
  const [isOnline, setIsOnline] = useState(false);
  const [image, setImage] = useState(null);

  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef(null);

  const { prediction, setPrediction, loadingIA, classifyImage } = usePlantClassifier(isOnline, climaActual, alertasGDD);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(!!state.isConnected));
    return () => unsubscribe();
  }, []);

  useEffect(() => { cargarFavoritos(); }, []);

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

  const isCalculatingRef = useRef(false);
  useEffect(() => {
    if (climaActual && selectedCropGDD && !isCalculatingRef.current) {
        isCalculatingRef.current = true;
        calcularRiesgoGDD(selectedCropGDD, climaActual).finally(() => { isCalculatingRef.current = false; });
    }
  }, [climaActual, selectedCropGDD]);

  const [listaCultivos, setListaCultivos] = useState(() => {
    return datosBasicos?.cultivos 
      ? Object.keys(datosBasicos.cultivos).map(nombre => ({ nombre, ...datosBasicos.cultivos[nombre] }))
      : [];
  });

  useEffect(() => {
    const sincronizarDatos = async () => {
      try {
        const datosSupabase = await CultivoDataManager.obtenerListaCultivos();
        if (datosSupabase?.length > 0) setListaCultivos(datosSupabase);
      } catch (error) { console.log("Usando datos offline"); }
    };
    sincronizarDatos();
  }, []);

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

  const cargarFavoritos = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem('@mis_cultivos');
      if (jsonValue != null) setCultivosGuardados(JSON.parse(jsonValue));
    } catch(e) { console.log("Error cargando favoritos"); }
  };

  const toggleFavorito = async (item) => {
    try {
      const existe = cultivosGuardados.find(c => c.nombre === item.nombre);
      const nuevoArray = existe ? cultivosGuardados.filter(c => c.nombre !== item.nombre) : [...cultivosGuardados, item];
      setCultivosGuardados(nuevoArray);
      await AsyncStorage.setItem('@mis_cultivos', JSON.stringify(nuevoArray));
    } catch (e) { console.log("Error guardando favorito"); }
  };

  const calcularRiesgoGDD = async (cultivo, clima) => {
    if (!clima?.temp_max || !clima?.temp_min) return;
    setLoadingGDD(true);
    try {
        const storageKey = `@gdd_historial_${cultivo.id}`;
        const historialStr = await AsyncStorage.getItem(storageKey);
        let historial = historialStr ? JSON.parse(historialStr) : [];
        const hoy = new Date().toLocaleDateString('en-CA');
        const indexExistente = historial.findIndex(d => d.fecha === hoy);
        const nuevoDato = { fecha: hoy, tmax: parseFloat(clima.temp_max), tmin: parseFloat(clima.temp_min) };
        
        if (indexExistente !== -1) historial[indexExistente] = nuevoDato;
        else historial.push(nuevoDato);
        
        await AsyncStorage.setItem(storageKey, JSON.stringify(historial.slice(-180)));
        const riesgosRaw = cargarRiesgosDesdeJSON(cultivo); 
        const riesgosConfig = riesgosRaw.map(r => ({
            nombre: r.nombre, metodo: "PROMEDIO",
            umbral_base: r.ciclo_desarrollo.grados_dia_desarrollo.base_termica,
            gdd_requeridos: r.ciclo_desarrollo.grados_dia_desarrollo.gdd_ciclo_completo
        }));

        const predicciones = calcularRiesgosMultiples(historial, riesgosConfig);
        const alertasGeneradas = generarAlertas(predicciones, 0);

        setAlertasGDD(alertasGeneradas.map(alerta => ({
            id: alerta.riesgo,
            nombre: alerta.riesgo,
            gdd: predicciones[alerta.riesgo].prediccion.gdd_alcanzado.toFixed(1),
            gddRequeridos: predicciones[alerta.riesgo].gdd_requeridos,
            nivel: (alerta.nivel === 'CRÍTICO' || alerta.nivel === 'ALTO') ? 'ALTO' : 'MEDIO',
            detalle: cultivo.riesgos_detallados?.[alerta.riesgo],
            mensaje: alerta.mensaje,
            progreso: ((predicciones[alerta.riesgo].prediccion.gdd_alcanzado / predicciones[alerta.riesgo].gdd_requeridos) * 100).toFixed(0)
        })));
    } catch (error) { console.error("Error GDD:", error); } finally { setLoadingGDD(false); }
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

  const abrirCamara = async () => { 
    if (!hasPermission) {
      const permiso = await requestPermission();
      if (!permiso) return Alert.alert("Permiso", "Se requiere cámara.");
    }
    setModalCameraVisible(true); 
  };
  
  const takePicture = async () => { 
    if (cameraRef.current) { 
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      setImage(`file://${photo.path}`); 
    }
  };

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
        <TouchableOpacity style={{padding: 8}} onPress={() => navigation.navigate('Recordatorios', { cultivo: item.nombre })}>
            <MaterialCommunityIcons name="calendar-clock" size={24} color="#009688" />
        </TouchableOpacity>
        <TouchableOpacity style={{padding: 8}} onPress={() => toggleFavorito(item)}>
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
      <View style={styles.headerContainer}>
        <LinearGradient colors={['#1B5E20', '#2E7D32', '#43A047']} style={styles.headerBackground} start={{x: 0, y: 0}} end={{x: 1, y: 1}}/>
      </View>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.topSection}>
            <View style={styles.headerRow}>
                <View><Text style={styles.welcomeSub}>Bienvenido a</Text><Text style={styles.appName}>RóslinApp</Text></View>
                <TouchableOpacity style={styles.aboutBtn} onPress={() => navigation.navigate('About')}><Ionicons name="information-circle" size={24} color="#FFF" /></TouchableOpacity>
            </View>
            <View style={styles.weatherContainer}>
                <View style={styles.weatherHeader}>
                    <Text style={styles.weatherTitle}>🌤️ Clima en tu zona</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Weather')}><Text style={styles.weatherLink}>Ver más</Text></TouchableOpacity>
                </View>
                <ClimaWidget onClimaUpdate={setClimaActual} />
            </View>
          </View>

          <View style={styles.heroSection}>
            <TouchableOpacity style={styles.diagnoseCard} onPress={abrirCamara}>
                <LinearGradient colors={['#FF8F00', '#FF6F00']} style={styles.diagnoseGradient} start={{x: 0, y: 0}} end={{x: 1, y: 0}}>
                    <View style={styles.diagnoseContent}>
                        <View style={styles.diagnoseIconCircle}><MaterialCommunityIcons name="camera-iris" size={28} color="#FF6F00" /></View>
                        <View style={{marginLeft: 15, flex: 1}}><Text style={styles.diagnoseTitle}>Diagnóstico Inteligente</Text><Text style={styles.diagnoseSub}>Detecta plagas y enfermedades.</Text></View>
                        <MaterialCommunityIcons name="arrow-right-circle" size={32} color="rgba(255,255,255,0.8)" />
                    </View>
                </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
             <View style={styles.searchBar}>
                <Ionicons name="search-outline" size={20} color="#757575" style={{ marginRight: 10 }} />
                <TextInput style={styles.searchInput} placeholder="Buscar cultivos..." value={busqueda} onChangeText={setBusqueda} />
             </View>
          </View>

          {mostrarLista && <FlatList data={cultivosFiltrados} keyExtractor={(item) => item.nombre} renderItem={renderCultivo} scrollEnabled={false} />}

          {/* Sección Herramientas */}
          <View style={styles.quickAccessContainer}>
             <Text style={styles.sectionTitleFav}>Herramientas</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAccessScroll}>
                {[
                  {n: 'AgroControl', i: 'router-wireless', c: '#00695C', bg: '#E0F2F1'},
                  {n: 'Fertilizantes', i: 'sack', c: '#2E7D32', bg: '#E8F5E9'},
                  {n: 'Dosis', i: 'flask', c: '#006064', bg: '#E0F7FA'},
                  {n: 'Bitacora', i: 'notebook', c: '#E65100', bg: '#FFF3E0'}
                ].map((item, idx) => (
                  <TouchableOpacity key={idx} style={styles.quickBtn} onPress={() => navigation.navigate(item.n)}>
                    <View style={[styles.quickIcon, {backgroundColor: item.bg}]}><MaterialCommunityIcons name={item.i} size={26} color={item.c} /></View>
                    <Text style={styles.quickText}>{item.n}</Text>
                  </TouchableOpacity>
                ))}
             </ScrollView>
          </View>

          <View style={styles.gddMainCard}>
             <TouchableOpacity onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setGddSectionExpanded(!gddSectionExpanded); }} style={styles.gddHeaderRow}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <View style={styles.gddHeaderIcon}><FontAwesome5 name="temperature-low" size={18} color="#FFF" /></View>
                    <Text style={[styles.gddTitleMain, {marginLeft:12}]}>Riesgo de Plagas (GDD)</Text>
                </View>
                <Ionicons name={gddSectionExpanded ? "chevron-up" : "chevron-down"} size={24} color="#546E7A" />
             </TouchableOpacity>

             {gddSectionExpanded && (
                 <View style={styles.gddContentArea}>
                    <TouchableOpacity onPress={() => setShowCropSelector(true)} style={styles.gddSelectorBtn}>
                        <Text style={styles.gddSelectorText}>{selectedCropGDD?.id || "Seleccionar"}</Text>
                        <Ionicons name="caret-down" size={12} color="#2E7D32" />
                    </TouchableOpacity>
                    {alertasGDD.map((alerta, index) => (
                        <View key={index} style={styles.gddCard}>
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
                        </View>
                    ))}
                    {alertasGDD.length > 0 && (
                        <TouchableOpacity style={styles.btnReiniciarTemporada} onPress={reiniciarTemporadaGDD}>
                            <MaterialCommunityIcons name="restart" size={16} color="#F57C00" />
                            <Text style={styles.btnReiniciarText}>Reiniciar Temporada</Text>
                        </TouchableOpacity>
                    )}
                 </View>
             )}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Modal Cámara */}
      <Modal visible={modalCameraVisible} animationType="fade" onRequestClose={() => setModalCameraVisible(false)}>
         <View style={{flex: 1, backgroundColor: 'black'}}>
             <View style={styles.cameraHeader}>
                 <TouchableOpacity onPress={() => {setModalCameraVisible(false); setImage(null); setPrediction(null);}}><Ionicons name="close" size={24} color="white" /></TouchableOpacity>
                 <Text style={{color:'white', fontWeight:'bold'}}>Scanner IA</Text>
                 <View style={{width:40}}/>
             </View>
             {image ? (
                 <ScrollView contentContainerStyle={{alignItems:'center', padding:20}}>
                    <Image source={{ uri: image }} style={styles.previewImage} />
                    <TouchableOpacity style={styles.btnAction} onPress={() => classifyImage(image)}>
                        {loadingIA ? <ActivityIndicator color="white"/> : <Text style={styles.btnText}>🔍 Analizar</Text>}
                    </TouchableOpacity>
                    {prediction && (
                        <View style={{width:'100%', marginTop:20}}>
                            <TreatmentCard predictionClass={prediction.label} />
                            <TouchableOpacity style={[styles.btnAction, {backgroundColor:'#1565C0', marginTop:10}]} onPress={() => Alert.alert("Éxito", "Guardado")}><Text style={styles.btnText}>✅ Confirmar</Text></TouchableOpacity>
                        </View>
                    )}
                    <TouchableOpacity style={{marginTop:20}} onPress={() => {setImage(null); setPrediction(null);}}><Text style={{color:'white'}}>Nueva Foto</Text></TouchableOpacity>
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

      {/* Modal Selector de Cultivo */}
      <Modal visible={showCropSelector} transparent animationType="slide">
         <View style={styles.modalOverlay}>
             <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Seleccionar Cultivo (GDD)</Text>
                {dbCultivos && Object.keys(dbCultivos).map((item, idx) => (
                    <TouchableOpacity key={idx} style={styles.modalItem} onPress={() => {setSelectedCropGDD({id: item, ...dbCultivos[item]}); setShowCropSelector(false);}}>
                        <Text style={styles.modalItemText}>{item}</Text>
                        {selectedCropGDD?.id === item && <Ionicons name="checkmark" size={20} color="green"/>}
                    </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={()=>setShowCropSelector(false)} style={styles.closeModalBtn}><Text style={styles.closeModalText}>Cerrar</Text></TouchableOpacity>
             </View>
         </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  headerContainer: { position: 'absolute', top: 0, width: '100%', height: 320, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden' },
  headerBackground: { width: '100%', height: '100%' },
  topSection: { paddingHorizontal: 24, paddingTop: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  welcomeSub: { color: '#A5D6A7', fontSize: 14, fontWeight: '500' },
  appName: { fontSize: 28, fontWeight: '800', color: '#fff' },
  aboutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 12 },
  weatherContainer: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  weatherHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  weatherTitle: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  weatherLink: { color: '#E8F5E9', fontSize: 12, textDecorationLine: 'underline' },
  heroSection: { marginTop: 25, paddingHorizontal: 20, marginBottom: 15 },
  diagnoseCard: { borderRadius: 24, elevation: 8 },
  diagnoseGradient: { borderRadius: 24, padding: 4 },
  diagnoseContent: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  diagnoseIconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  diagnoseTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  diagnoseSub: { fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  gddMainCard: { backgroundColor: '#fff', marginHorizontal: 24, marginTop: 15, borderRadius: 16, elevation: 3, borderWidth: 1, borderColor: '#E8F5E9' },
  gddHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  gddHeaderIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center' },
  gddTitleMain: { fontSize: 16, fontWeight: '700', color: '#2E7D32' },
  gddContentArea: { paddingHorizontal: 16, paddingBottom: 16 },
  gddSelectorBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#F1F8E9', padding:6, borderRadius:12, alignSelf: 'flex-start', marginBottom: 10 },
  gddSelectorText: { color:'#33691E', fontWeight:'600', marginRight:5, fontSize:12 },
  gddCard: { backgroundColor: '#FAFAFA', borderRadius: 12, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: '#ECEFF1' },
  gddHeader: { flexDirection: 'row', alignItems: 'center' },
  gddTitle: { fontSize: 14, fontWeight: '600', color: '#37474F' },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 10 },
  riskText: { fontSize: 10, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding: 20 },
  modalContent: { backgroundColor:'white', borderRadius:20, padding:20 },
  modalTitle: { fontSize:18, fontWeight:'bold', marginBottom:15, textAlign:'center' },
  modalItem: { padding:15, borderBottomWidth:1, borderBottomColor:'#EEE', flexDirection:'row', justifyContent:'space-between' },
  modalItemText: { fontSize:16 },
  closeModalBtn: { marginTop:15, alignSelf:'center' },
  closeModalText: { color:'red', fontWeight:'bold' },
  sectionTitleFav: { fontSize: 18, fontWeight: '700', color: '#263238', marginLeft: 24, marginBottom: 10 },
  quickAccessContainer: { marginBottom: 20, marginTop: 10 },
  quickAccessScroll: { paddingHorizontal: 24 },
  quickBtn: { alignItems: 'center', marginRight: 20, width: 70 },
  quickIcon: { width: 60, height: 60, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickText: { fontSize: 11, fontWeight: '600', color: '#546E7A', textAlign: 'center' },
  searchContainer: { marginBottom: 10, marginTop: 10 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", marginHorizontal: 24, borderRadius: 16, paddingHorizontal: 15, height: 50, elevation: 3 },
  searchInput: { flex: 1, fontSize: 15, color: "#37474F" },
  cultivoCardContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 20, marginBottom: 16, marginHorizontal: 24, elevation: 3, overflow: 'hidden' },
  cardMainArea: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 15 },
  iconBox: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#F1F8E9', justifyContent: 'center', alignItems: 'center' },
  cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#2E384D" },
  cardSubtitle: { fontSize: 13, color: "#90A4AE" },
  btnGuiaArea: { paddingHorizontal: 15, paddingVertical: 15, backgroundColor: '#FAFAFA', alignItems: 'center' },
  btnGuiaText: { fontSize: 10, color: '#F57C00', fontWeight: 'bold' },
  cameraHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 50, backgroundColor: 'rgba(0,0,0,0.5)' },
  previewImage: { width: 224, height: 224, borderRadius: 20, marginBottom: 20 },
  btnAction: { padding: 15, borderRadius: 30, width: '80%', alignItems: 'center', backgroundColor: '#2E7D32' },
  btnText: { color: 'white', fontWeight: 'bold' },
  cameraFooter: { position: 'absolute', bottom: 50, width: '100%', alignItems: 'center' },
  captureOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: 'white', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'white' },
  progressBarContainer: { height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, marginTop: 6, width: 100 },
  progressBarFill: { height: '100%', borderRadius: 2 },
  btnReiniciarTemporada: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF3E0', padding: 10, borderRadius: 8, marginTop: 12 },
  btnReiniciarText: { color: '#F57C00', fontSize: 12, fontWeight: '600', marginLeft: 6 }
});