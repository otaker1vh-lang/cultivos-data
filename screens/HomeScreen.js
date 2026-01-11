import React, { useState, useEffect, useRef } from "react";
import { 
  View, Text, StyleSheet, FlatList, TextInput, 
  TouchableOpacity, StatusBar, Image, ScrollView, Modal, ActivityIndicator, Alert, Dimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient'; 
import datosBasicos from "../data/cultivos_basico.json";
import AsyncStorage from '@react-native-async-storage/async-storage'; 

import CultivoDataManager from '../utils/CultivoDataManager';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
// Importamos manipulateAsync y SaveFormat
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import ClimaWidget from '../components/ClimaWidget'; 
import { TreatmentCard } from '../components/TreatmentCard';

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  // --- ESTADOS ---
  const [busqueda, setBusqueda] = useState("");
  const [cultivosFiltrados, setCultivosFiltrados] = useState([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [cultivosGuardados, setCultivosGuardados] = useState([]); 
  const [modalCameraVisible, setModalCameraVisible] = useState(false);
  
  // --- IA Y CÁMARA ---
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef(null);
  const [image, setImage] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loadingIA, setLoadingIA] = useState(false);
  const [labels, setLabels] = useState([]);

  const tflite = useTensorflowModel(require('../assets/model/roslin_model.tflite'));
  const model = tflite.model;

  // --- EFECTOS DE CARGA ---
  useEffect(() => {
    async function loadLabels() {
      try {
        const labelsAsset = Asset.fromModule(require('../assets/model/labels.txt'));
        await labelsAsset.downloadAsync();
        const uri = labelsAsset.localUri || labelsAsset.uri;
        const text = await FileSystem.readAsStringAsync(uri);
        setLabels(text.split('\n').map(l => l.trim()).filter(l => l.length > 0));
      } catch (e) { console.log("Nota: Etiquetas IA pendientes o error al cargar"); }
    }
    loadLabels();
  }, []);

  useEffect(() => { cargarFavoritos(); }, []);

  const cargarFavoritos = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem('@mis_cultivos');
      if (jsonValue != null) setCultivosGuardados(JSON.parse(jsonValue));
    } catch(e) { console.log("Error cargando cultivos"); }
  }

  const toggleFavorito = async (item) => {
    try {
      const existe = cultivosGuardados.find(c => c.nombre === item.nombre);
      let nuevoArray;
      if (existe) nuevoArray = cultivosGuardados.filter(c => c.nombre !== item.nombre);
      else nuevoArray = [...cultivosGuardados, item];
      
      setCultivosGuardados(nuevoArray);
      await AsyncStorage.setItem('@mis_cultivos', JSON.stringify(nuevoArray));
    } catch (e) { console.log("Error guardando"); }
  };

  const [listaCultivos, setListaCultivos] = useState(() => {
    return datosBasicos?.cultivos 
      ? Object.keys(datosBasicos.cultivos).map(nombre => ({ nombre, ...datosBasicos.cultivos[nombre] }))
      : [];
  });

  useEffect(() => {
    const sincronizarDatos = async () => {
      try {
        const datosSupabase = await CultivoDataManager.obtenerListaCultivos();
        if (datosSupabase && datosSupabase.length > 0) setListaCultivos(datosSupabase);
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

  // --- FUNCIONES CÁMARA E IA ---
  const abrirCamara = async () => { 
    if (!hasPermission) {
      const permisoConcedido = await requestPermission();
      if (!permisoConcedido) return Alert.alert("Permiso requerido", "Se necesita acceso a la cámara.");
    }
    setModalCameraVisible(true); 
  };
  
  const cerrarCamara = () => { setImage(null); setPrediction(null); setModalCameraVisible(false); };
  
  const takePicture = async () => { 
    if (cameraRef.current) { 
      try {
        const photo = await cameraRef.current.takePhoto({ flash: 'off' });
        setImage(`file://${photo.path}`); 
      } catch (error) { console.log("Error foto:", error); }
    }
  };
  
  const pickImage = async () => { 
    // Mantenemos aspect: [1, 1] porque el recorte cuadrado es vital para el modelo
    let r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 1 }); 
    if (!r.canceled) setImage(r.assets[0].uri); 
  };

  // --- FUNCIÓN CORREGIDA Y OPTIMIZADA PARA REDIMENSIONAR ---
  const classifyImage = async () => {
    if (!model || !image) return;
    setLoadingIA(true);
    try {
      // 1. Redimensionar a 224x224 y obtener Base64 directamente
      const result = await manipulateAsync(
        image,
        [{ resize: { width: 224, height: 224 } }],
        { 
          compress: 1, 
          format: SaveFormat.JPEG, 
          base64: true // <--- ESTO ES CLAVE: Obtenemos el base64 aquí
        }
      );

      // 2. Convertir Base64 a Uint8Array
      // Nota: Si el modelo falla, intenta dividir estos valores entre 255.0 si el modelo espera Float32
      const imgBuffer = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      
      // 3. Ejecutar Inferencia
      const outputs = await model.run([imgBuffer]);
      const probabilities = outputs[0];
      
      let maxProb = 0; 
      let maxIndex = 0;
      for (let i = 0; i < probabilities.length; i++) { 
        if (probabilities[i] > maxProb) { 
          maxProb = probabilities[i]; 
          maxIndex = i; 
        } 
      }
      setPrediction({ label: labels[maxIndex] || "Desconocido", confidence: maxProb });

    } catch (error) { 
      console.log("Error en clasificación:", error);
      Alert.alert("Error", "No se pudo analizar la imagen. Verifica el formato."); 
    } finally { 
      setLoadingIA(false); 
    }
  };

  // --- RENDERIZADO TARJETAS ---
  const renderCultivo = ({ item }) => {
    let iconName = "sprout";
    const cat = item.categoria ? item.categoria.toLowerCase() : "";
    if (cat.includes("frut")) iconName = "food-apple";
    if (cat.includes("hort")) iconName = "carrot";
    if (cat.includes("gran")) iconName = "corn";

    const tieneImagen = item.imagen_url && item.imagen_url.trim() !== "";
    const esFavorito = cultivosGuardados.some(c => c.nombre === item.nombre);

    return (
      <View style={styles.cultivoCardContainer}>
        <TouchableOpacity style={styles.cardMainArea} onPress={() => navigation.navigate('MenuDetalle', { cultivo: item.nombre })}>
          <View style={[styles.iconBox, { backgroundColor: tieneImagen ? 'transparent' : '#F1F8E9' }]}>
             {tieneImagen ? (
                <Image source={{ uri: item.imagen_url }} style={styles.cardImage} />
             ) : (
                <MaterialCommunityIcons name={iconName} size={28} color="#43A047" />
             )}
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>{item.nombre}</Text>
            <Text style={styles.cardSubtitle}>{item.nombre_cientifico || item.categoria || "Ficha técnica"}</Text>
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity style={{padding: 8}} onPress={() => navigation.navigate('Recordatorios', { cultivo: item.nombre })}>
            <MaterialCommunityIcons name="calendar-clock" size={24} color="#009688" />
        </TouchableOpacity>

        <TouchableOpacity style={{padding: 8, marginRight: 2}} onPress={() => toggleFavorito(item)}>
            <MaterialCommunityIcons name={esFavorito ? "heart" : "heart-outline"} size={24} color={esFavorito ? "#E91E63" : "#B0BEC5"} />
        </TouchableOpacity>
        <View style={styles.verticalDivider} />
        <TouchableOpacity style={styles.btnGuiaArea} onPress={() => navigation.navigate('Guia', { cultivo: item.nombre })}>
          <MaterialCommunityIcons name="compass-rose" size={24} color="#F57C00" />
          <Text style={styles.btnGuiaText}>Guía</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderFavoritoItem = ({ item }) => (
    <TouchableOpacity style={styles.favItem} onPress={() => navigation.navigate('MenuDetalle', { cultivo: item.nombre })}>
      <View style={styles.favIconCircle}>
        <MaterialCommunityIcons name="sprout" size={18} color="#fff" />
      </View>
      <Text style={styles.favText} numberOfLines={1}>{item.nombre}</Text>
      <TouchableOpacity style={styles.favRemove} onPress={() => toggleFavorito(item)}>
        <View style={styles.favRemoveBg}><Ionicons name="close" size={10} color="#FFF" /></View>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
      
      {/* HEADER FONDO */}
      <View style={styles.headerContainer}>
        <LinearGradient colors={['#1B5E20', '#2E7D32', '#43A047']} style={styles.headerBackground} start={{x: 0, y: 0}} end={{x: 1, y: 1}}/>
        <Image source={require('../assets/adaptive-icon.png')} style={styles.headerPattern} />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* 1. TOP SECTION: BIENVENIDA Y CLIMA */}
          <View style={styles.topSection}>
            <View style={styles.headerRow}>
                <View>
                    <Text style={styles.welcomeSub}>Bienvenido a</Text>
                    <Text style={styles.appName}>RóslinApp</Text>
                </View>
                <TouchableOpacity style={styles.aboutBtn} onPress={() => navigation.navigate('About')}>
                    <Ionicons name="information-circle" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>
            <View style={styles.weatherContainer}>
                <View style={styles.weatherHeader}>
                    <Text style={styles.weatherTitle}>🌤️ Clima en tu zona</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Weather')}>
                        <Text style={styles.weatherLink}>Ver más</Text>
                    </TouchableOpacity>
                </View>
                <ClimaWidget />
            </View>
          </View>

          {/* 2. HERO: DIAGNÓSTICO IA */}
          <View style={styles.heroSection}>
            <TouchableOpacity style={styles.diagnoseCard} onPress={abrirCamara}>
                <LinearGradient colors={['#FF8F00', '#FF6F00']} style={styles.diagnoseGradient} start={{x: 0, y: 0}} end={{x: 1, y: 0}}>
                    <View style={styles.diagnoseContent}>
                        <View style={styles.diagnoseIconCircle}>
                             <MaterialCommunityIcons name="camera-iris" size={28} color="#FF6F00" />
                        </View>
                        <View style={{marginLeft: 15, flex: 1}}>
                            <Text style={styles.diagnoseTitle}>Diagnóstico Inteligente</Text>
                            <Text style={styles.diagnoseSub}>Detecta plagas y enfermedades.</Text>
                        </View>
                        <MaterialCommunityIcons name="arrow-right-circle" size={32} color="rgba(255,255,255,0.8)" />
                    </View>
                </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* 3. SECCIÓN DE CULTIVOS */}
          {/* A. MIS FAVORITOS */}
          {cultivosGuardados.length > 0 && (
            <View style={styles.favSection}>
               <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Mis Cultivos 🌱</Text>
               </View>
               <FlatList 
                  data={cultivosGuardados}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 10}}
                  keyExtractor={(item) => "fav_" + item.nombre}
                  renderItem={renderFavoritoItem}
               />
            </View>
          )}

          {/* B. BUSCADOR */}
          <View style={styles.searchContainer}>
             {!cultivosGuardados.length > 0 && <Text style={styles.sectionTitle}>Biblioteca de Cultivos</Text>}
             <View style={styles.searchBar}>
                <Ionicons name="search-outline" size={20} color="#757575" style={{ marginRight: 10 }} />
                <TextInput 
                  style={styles.searchInput}
                  placeholder="Buscar maíz, tomate, frijol..."
                  placeholderTextColor="#9E9E9E"
                  value={busqueda}
                  onChangeText={setBusqueda}
                />
                {busqueda.length > 0 && (
                  <TouchableOpacity onPress={() => setBusqueda("")}>
                    <Ionicons name="close-circle" size={20} color="#BDBDBD" />
                  </TouchableOpacity>
                )}
             </View>
          </View>

          {/* C. RESULTADOS */}
          {mostrarLista ? (
            <FlatList 
              data={cultivosFiltrados}
              keyExtractor={(item) => item.nombre}
              renderItem={renderCultivo}
              scrollEnabled={false} 
              contentContainerStyle={{paddingBottom: 20}}
              ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>No se encontró el cultivo.</Text></View>}
            />
          ) : null}

          {/* 4. HERRAMIENTAS GLOBALES */}
          <View style={styles.quickAccessContainer}>
             <Text style={styles.sectionTitle}>Herramientas</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAccessScroll}>
                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Fertilizantes')}>
                    <View style={[styles.quickIcon, {backgroundColor:'#E8F5E9'}]}><MaterialCommunityIcons name="sack" size={26} color="#2E7D32" /></View>
                    <Text style={styles.quickText}>Fertilizantes</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Dosis')}>
                    <View style={[styles.quickIcon, {backgroundColor:'#E0F7FA'}]}><MaterialCommunityIcons name="flask" size={26} color="#006064" /></View>
                    <Text style={styles.quickText}>Dosis</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Bitacora')}>
                    <View style={[styles.quickIcon, {backgroundColor:'#FFF3E0'}]}><MaterialCommunityIcons name="notebook" size={26} color="#E65100" /></View>
                    <Text style={styles.quickText}>Bitácora</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Noticias')}>
                    <View style={[styles.quickIcon, {backgroundColor:'#F3E5F5'}]}><MaterialCommunityIcons name="newspaper" size={26} color="#7B1FA2" /></View>
                    <Text style={styles.quickText}>Noticias</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('AgroControl')}>
                    <View style={[styles.quickIcon, {backgroundColor:'#E3F2FD'}]}><MaterialCommunityIcons name="monitor-dashboard" size={26} color="#1565C0" /></View>
                    <Text style={styles.quickText}>Control</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('ReporteAvanzado')}>
                      <View style={[styles.quickIcon, {backgroundColor:'#FFEBEE'}]}><MaterialCommunityIcons name="file-chart" size={26} color="#D32F2F" /></View>
                      <Text style={styles.quickText}>Reportes</Text>
                </TouchableOpacity>
             </ScrollView>
          </View>

        </ScrollView>
      </SafeAreaView>

      {/* MODAL CÁMARA */}
      <Modal visible={modalCameraVisible} animationType="fade" onRequestClose={cerrarCamara}>
         <View style={{flex: 1, backgroundColor: 'black'}}>
             <View style={styles.cameraHeader}>
                 <TouchableOpacity onPress={cerrarCamara} style={styles.closeCameraBtn}><Ionicons name="close" size={24} color="white" /></TouchableOpacity>
                 <Text style={{color:'white', fontSize:16, fontWeight:'bold'}}>Scanner IA</Text>
                 <View style={{width:40}}/>
             </View>
             {image ? (
                 <View style={{flex:1, backgroundColor:'#F5F5F5'}}>
                    <ScrollView contentContainerStyle={{alignItems:'center', padding:20, paddingTop: 80}}>
                       <Image source={{ uri: image }} style={styles.previewImage} />
                       {!prediction ? (
                          <TouchableOpacity style={[styles.btnAction, {backgroundColor:'#2E7D32'}]} onPress={classifyImage}>
                             {loadingIA ? <ActivityIndicator color="white"/> : <Text style={styles.btnText}>🔍 Analizar Planta</Text>}
                          </TouchableOpacity>
                       ) : (
                          <View style={{width:'100%', alignItems:'center'}}>
                             <TreatmentCard predictionClass={prediction.label} />
                             <TouchableOpacity style={[styles.btnAction, {backgroundColor:'#2E7D32', marginTop:15}]} onPress={() => setImage(null)}><Text style={styles.btnText}>Nueva Foto</Text></TouchableOpacity>
                          </View>
                       )}
                       <TouchableOpacity style={[styles.btnAction, {backgroundColor:'#90A4AE', marginTop:10}]} onPress={() => setImage(null)}><Text style={styles.btnText}>Cancelar</Text></TouchableOpacity>
                    </ScrollView>
                 </View>
             ) : (
                 <View style={{flex:1}}>
                    {device != null ? <Camera style={{flex: 1}} device={device} isActive={modalCameraVisible} ref={cameraRef} photo={true} /> 
                    : <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text style={{color:'white'}}>Cámara no disponible</Text></View>}
                    <View style={styles.cameraFooter}>
                       <TouchableOpacity style={styles.iconBtn} onPress={pickImage}><Ionicons name="images-outline" size={28} color="white"/></TouchableOpacity>
                       <TouchableOpacity style={styles.captureOuter} onPress={takePicture}><View style={styles.captureInner}/></TouchableOpacity>
                       <View style={{width:50}}/>
                    </View>
                 </View>
             )}
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
  headerPattern: { position: 'absolute', width: '100%', height: '100%', opacity: 0.05, resizeMode: 'repeat' }, 
  topSection: { paddingHorizontal: 24, paddingTop: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  welcomeSub: { color: '#A5D6A7', fontSize: 14, fontWeight: '500' },
  appName: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  aboutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 12 },
  weatherContainer: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  weatherHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 5 },
  weatherTitle: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  weatherLink: { color: '#E8F5E9', fontSize: 12, textDecorationLine: 'underline' },
  heroSection: { marginTop: 25, paddingHorizontal: 20, marginBottom: 15 },
  diagnoseCard: { borderRadius: 24, elevation: 8, shadowColor: '#FF6F00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  diagnoseGradient: { borderRadius: 24, padding: 4 },
  diagnoseContent: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: 20 },
  diagnoseIconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  diagnoseTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  diagnoseSub: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#263238', marginBottom: 12, paddingHorizontal: 24 },
  quickAccessContainer: { marginBottom: 20, marginTop: 10 },
  quickAccessScroll: { paddingHorizontal: 24, paddingBottom: 10 },
  quickBtn: { alignItems: 'center', marginRight: 20, width: 70 },
  quickIcon: { width: 60, height: 60, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  quickText: { fontSize: 11, fontWeight: '600', color: '#546E7A', textAlign: 'center' },
  searchContainer: { marginBottom: 10, marginTop: 10 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", marginHorizontal: 24, borderRadius: 16, paddingHorizontal: 15, height: 50, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 3 },
  searchInput: { flex: 1, fontSize: 15, color: "#37474F" },
  cultivoCardContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 20, marginBottom: 16, marginHorizontal: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 3, borderWidth: 1, borderColor: '#F0F0F0', overflow: 'hidden' },
  cardMainArea: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 15 },
  iconBox: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#2E384D" },
  cardSubtitle: { fontSize: 13, color: "#90A4AE", marginTop: 2 },
  verticalDivider: { width: 1, height: '60%', backgroundColor: '#EEEEEE' },
  btnGuiaArea: { paddingHorizontal: 15, paddingVertical: 15, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA' },
  btnGuiaText: { fontSize: 10, color: '#F57C00', fontWeight: 'bold', marginTop: 2 },
  favSection: { marginTop: 10, marginBottom: 10 },
  favItem: { backgroundColor: '#fff', borderRadius: 16, padding: 12, marginRight: 15, width: 100, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2, height: 110, justifyContent: 'center' },
  favIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  favText: { fontSize: 12, fontWeight: '600', color: '#455A64', textAlign: 'center' },
  favRemove: { position: 'absolute', top: 5, right: 5 },
  favRemoveBg: { backgroundColor: '#FF5252', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', marginTop: 20 },
  emptyText: { color: '#B0BEC5' },
  cameraHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 50, backgroundColor: 'rgba(0,0,0,0.6)', position: 'absolute', top: 0, width: '100%', zIndex: 10 },
  closeCameraBtn: { padding: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 },
  cameraFooter: { position: 'absolute', bottom: 40, width: '100%', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', zIndex: 10 },
  captureOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'white' },
  iconBtn: { padding: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 30 },
  previewImage: { width: width - 40, height: 400, resizeMode: 'contain', marginBottom: 20, borderRadius: 20, backgroundColor: '#000' },
  btnAction: { padding: 16, borderRadius: 14, width: '100%', alignItems: 'center', elevation: 2 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});