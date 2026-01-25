import React, { useState, useEffect, useRef } from "react";
import { 
  View, Text, StyleSheet, FlatList, TextInput, 
  TouchableOpacity, StatusBar, Image, ScrollView, Modal, ActivityIndicator, Alert, Dimensions,
  LayoutAnimation, Platform, UIManager
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient'; 
import datosBasicos from "../data/cultivos_basico.json";
import AsyncStorage from '@react-native-async-storage/async-storage'; 

import CultivoDataManager from '../utils/CultivoDataManager';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import ClimaWidget from '../components/ClimaWidget'; 
import { TreatmentCard } from '../components/TreatmentCard';

// --- NUEVOS IMPORTS PARA GDD Y FIREBASE ---
import { getDatabase, ref, onValue } from "firebase/database";
import { app } from '../utils/firebase';  
import { cargarRiesgosDesdeJSON, calcularRiesgosMultiples, generarAlertas } from '../utils/gdd_calculator';
// -------------------------------------------

const { width } = Dimensions.get('window');

// Habilitar animaciones en Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- FUNCIÓN HELPER PARA ÍCONOS (NUEVA) ---
const obtenerIconoCultivo = (nombre, categoria) => {
  const n = nombre ? nombre.toLowerCase() : "";
  const c = categoria ? categoria.toLowerCase() : "";

  // 1. Búsqueda específica por nombre
  if (n.includes("maiz") || n.includes("elote")) return "corn";
  if (n.includes("trigo") || n.includes("cebada") || n.includes("avena") || n.includes("sorgo")) return "barley";
  if (n.includes("frijol") || n.includes("soja") || n.includes("haba")) return "seed";
  if (n.includes("tomate") || n.includes("jitomate")) return "fruit-cherries"; // Aproximación visual
  if (n.includes("chile") || n.includes("pimiento") || n.includes("jalape")) return "chili-hot";
  if (n.includes("zanahoria")) return "carrot";
  if (n.includes("papa") || n.includes("patata")) return "food-steak"; // A veces usado para tubérculos
  if (n.includes("cafe") || n.includes("café")) return "coffee";
  if (n.includes("limon") || n.includes("naranja") || n.includes("citrico") || n.includes("mandarina")) return "fruit-citrus";
  if (n.includes("uva") || n.includes("vid")) return "fruit-grapes";
  if (n.includes("calabaza") || n.includes("zapallo")) return "pumpkin";
  if (n.includes("hongo") || n.includes("seta")) return "mushroom";
  if (n.includes("flor")) return "flower";
  if (n.includes("arroz")) return "grass";
  if (n.includes("piña")) return "fruit-pineapple";
  if (n.includes("sandia")) return "fruit-watermelon";
  if (n.includes("caña")) return "corn"; // Aproximación visual

  // 2. Búsqueda por categoría (Fallback)
  if (c.includes("frut")) return "food-apple";
  if (c.includes("hort")) return "carrot";
  if (c.includes("gran") || c.includes("cereal")) return "corn";
  if (c.includes("flor")) return "flower-tulip";
  if (c.includes("forest")) return "tree";

  // 3. Default
  return "sprout";
};

export default function HomeScreen({ navigation }) {
  // --- ESTADOS ORIGINALES ---
  const [busqueda, setBusqueda] = useState("");
  const [cultivosFiltrados, setCultivosFiltrados] = useState([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [cultivosGuardados, setCultivosGuardados] = useState([]); 
  const [modalCameraVisible, setModalCameraVisible] = useState(false);
  
  // --- ESTADOS GDD & FIREBASE ---
  const [dbCultivos, setDbCultivos] = useState(null);
  const [climaActual, setClimaActual] = useState(null);
  const [alertasGDD, setAlertasGDD] = useState([]);
  const [loadingGDD, setLoadingGDD] = useState(false);
  const [selectedCropGDD, setSelectedCropGDD] = useState(null);
  const [showCropSelector, setShowCropSelector] = useState(false);
  
  // Estados de expansión
  const [gddSectionExpanded, setGddSectionExpanded] = useState(false); 
  const [expandedGddId, setExpandedGddId] = useState(null); 

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

  // --- CONEXIÓN FIREBASE ---
  useEffect(() => {
    const db = getDatabase(app);
    const dbRef = ref(db); 

    const unsubscribe = onValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.cultivos) {
        setDbCultivos(data.cultivos);
        if (!selectedCropGDD) {
            const keys = Object.keys(data.cultivos);
            if (keys.length > 0) {
                const firstKey = keys[0];
                setSelectedCropGDD({ id: firstKey, ...data.cultivos[firstKey] });
            }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const isCalculatingRef = useRef(false);

    useEffect(() => {
        if (climaActual && selectedCropGDD && !isCalculatingRef.current) {
            isCalculatingRef.current = true;
            calcularRiesgoGDD(selectedCropGDD, climaActual).finally(() => {
                isCalculatingRef.current = false;
            });
        }
    }, [climaActual, selectedCropGDD]);

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

  // --- LÓGICA GDD ---
  const handleClimaUpdate = (data) => {
      setClimaActual(data);
  };

  const toggleSectionMain = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setGddSectionExpanded(!gddSectionExpanded);
  };

  const toggleGddExpand = (id) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedGddId(expandedGddId === id ? null : id);
  };

  const calcularRiesgoGDD = async (cultivo, clima) => {
    if (!clima || !cultivo || !clima.temp_max || !clima.temp_min) {
        console.log("Datos climáticos incompletos para GDD");
        return;
    }
    
    setLoadingGDD(true);

    try {
        const storageKey = `@gdd_historial_${cultivo.id}`;
        const historialStr = await AsyncStorage.getItem(storageKey);
        let historial = historialStr ? JSON.parse(historialStr) : [];
        
        const hoy = new Date().toISOString().split('T')[0];
        const indexExistente = historial.findIndex(d => d.fecha === hoy);
      
        if (indexExistente !== -1) {
            const diaExistente = historial[indexExistente];
            if (diaExistente.tmax !== parseFloat(clima.temp_max) || 
                diaExistente.tmin !== parseFloat(clima.temp_min)) {
                historial[indexExistente] = {
                    fecha: hoy,
                    tmax: parseFloat(clima.temp_max),
                    tmin: parseFloat(clima.temp_min)
                };
                await AsyncStorage.setItem(storageKey, JSON.stringify(historial));
            }
        } else {
            historial.push({
                fecha: hoy,
                tmax: parseFloat(clima.temp_max),
                tmin: parseFloat(clima.temp_min)
            });
            
            if (historial.length > 180) {
                historial = historial.slice(-180);
            }
            
            await AsyncStorage.setItem(storageKey, JSON.stringify(historial));
        }

        const riesgos = cargarRiesgosDesdeJSON(cultivo);
        
        if (riesgos.length === 0) {
            setAlertasGDD([]);
            return;
        }

        const predicciones = calcularRiesgosMultiples(historial, riesgos);
        const alertasGeneradas = generarAlertas(predicciones, 0);

        const nuevasAlertas = alertasGeneradas.map(alerta => {
            const prediccion = predicciones[alerta.riesgo];
            const detalle = cultivo.riesgos_detallados?.[alerta.riesgo];
            
            return {
                id: alerta.riesgo,
                nombre: alerta.riesgo,
                gdd: prediccion.prediccion.gdd_alcanzado.toFixed(1),
                gddRequeridos: prediccion.gdd_requeridos,
                nivel: (alerta.nivel === 'CRÍTICO' || alerta.nivel === 'CRITICO') ? 'ALTO' : 'MEDIO',
                detalle: detalle,
                mensaje: alerta.mensaje,
                diasRestantes: alerta.dias_restantes || 0,
                progreso: ((prediccion.prediccion.gdd_alcanzado / prediccion.gdd_requeridos) * 100).toFixed(0)
            };
        });

        setAlertasGDD(nuevasAlertas);

    } catch (error) {
        console.error("Error calculando GDD:", error);
        Alert.alert("Error", "No se pudo calcular el riesgo de plagas.");
    } finally {
        setLoadingGDD(false);
    }
};

const reiniciarTemporadaGDD = async () => {
    if (!selectedCropGDD) return;
    
    Alert.alert(
        "Reiniciar Temporada",
        `¿Deseas reiniciar el monitoreo de ${selectedCropGDD.id}? Se perderán los datos acumulados.`,
        [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Reiniciar",
                style: "destructive",
                onPress: async () => {
                    try {
                        const storageKey = `@gdd_historial_${selectedCropGDD.id}`;
                        await AsyncStorage.removeItem(storageKey);
                        setAlertasGDD([]);
                        Alert.alert("Éxito", "Temporada reiniciada correctamente.");
                    } catch (error) {
                        console.error("Error reiniciando:", error);
                    }
                }
            }
        ]
    );
  };
  const selectCropForGDD = (key, data) => {
      setSelectedCropGDD({ id: key, ...data });
      setShowCropSelector(false);
  };

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
    let r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 1 }); 
    if (!r.canceled) setImage(r.assets[0].uri); 
  };

  const classifyImage = async () => {
    if (!model || !image) return;
    setLoadingIA(true);
    try {
      const result = await manipulateAsync(
        image,
        [{ resize: { width: 224, height: 224 } }],
        { compress: 1, format: SaveFormat.JPEG, base64: true }
      );
      const imgBuffer = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      const outputs = await model.run([imgBuffer]);
      const probabilities = outputs[0];
      
      let maxProb = 0; 
      let maxIndex = 0;
      for (let i = 0; i < probabilities.length; i++) { 
        if (probabilities[i] > maxProb) { maxProb = probabilities[i]; maxIndex = i; } 
      }
      setPrediction({ label: labels[maxIndex] || "Desconocido", confidence: maxProb });

    } catch (error) { 
      console.log("Error en clasificación:", error);
      Alert.alert("Error", "No se pudo analizar la imagen. Verifica el formato."); 
    } finally { setLoadingIA(false); }
  };

  // --- RENDERIZADO TARJETAS ---
  const renderCultivo = ({ item }) => {
    // MODIFICACIÓN: Usar función helper para íconos
    const iconName = obtenerIconoCultivo(item.nombre, item.categoria);
    
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

  const renderFavoritoItem = ({ item }) => {
    // MODIFICACIÓN: Usar función helper también para favoritos
    const iconName = obtenerIconoCultivo(item.nombre, item.categoria);
    
    return (
      <TouchableOpacity style={styles.favItem} onPress={() => navigation.navigate('MenuDetalle', { cultivo: item.nombre })}>
        <View style={styles.favIconCircle}>
          <MaterialCommunityIcons name={iconName} size={18} color="#fff" />
        </View>
        <Text style={styles.favText} numberOfLines={1}>{item.nombre}</Text>
        <TouchableOpacity style={styles.favRemove} onPress={() => toggleFavorito(item)}>
          <View style={styles.favRemoveBg}><Ionicons name="close" size={10} color="#FFF" /></View>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
      
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
                <ClimaWidget onClimaUpdate={handleClimaUpdate} />
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
          {cultivosGuardados.length > 0 && (
            <View style={styles.favSection}>
               <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitleFav}>Mis Cultivos 🌱</Text>
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

          <View style={styles.searchContainer}>
             {!cultivosGuardados.length > 0 && <Text style={styles.sectionTitleFav}>Cultivos</Text>}
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
             <Text style={styles.sectionTitleFav}>Herramientas</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAccessScroll}>
                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('AgroControl')}>
                    <View style={[styles.quickIcon, {backgroundColor:'#E0F2F1'}]}>
                        <MaterialCommunityIcons name="router-wireless" size={26} color="#00695C" />
                    </View>
                    <Text style={styles.quickText}>AgroControl</Text>
                </TouchableOpacity>
                
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

                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('ReporteAvanzado')}>
                      <View style={[styles.quickIcon, {backgroundColor:'#FFEBEE'}]}><MaterialCommunityIcons name="file-chart" size={26} color="#D32F2F" /></View>
                      <Text style={styles.quickText}>Reportes</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Costos', { cultivo: selectedCropGDD?.id || 'Mi Cultivo' })}>
                    <View style={[styles.quickIcon, {backgroundColor:'#FFFDE7'}]}>
                        <MaterialCommunityIcons name="finance" size={26} color="#FBC02D" />
                    </View>
                    <Text style={styles.quickText}>Mis Costos</Text>
                </TouchableOpacity>
             </ScrollView>
          </View>

          {/* 1.5. SECCIÓN GDD (MODIFICADA: FICHA COMPRIMIBLE) */}
          <View style={styles.gddMainCard}>
             
             {/* Header de la Ficha */}
             <TouchableOpacity 
                activeOpacity={0.8}
                onPress={toggleSectionMain}
                style={styles.gddHeaderRow}
             >
                <View style={{flexDirection:'row', alignItems:'center', flex: 1}}>
                    <View style={styles.gddHeaderIcon}>
                        <FontAwesome5 name="temperature-low" size={18} color="#FFF" />
                    </View>
                    <View style={{marginLeft: 12}}>
                        <Text style={styles.gddTitleMain}>
                            Riesgo de Plagas (GDD)
                        </Text>
                        <Text style={styles.gddSubtitleMain}>
                            {selectedCropGDD?.id ? `Cultivo: ${selectedCropGDD.id}` : "Toque para configurar"}
                        </Text>
                    </View>
                </View>
                <Ionicons name={gddSectionExpanded ? "chevron-up" : "chevron-down"} size={24} color="#546E7A" />
             </TouchableOpacity>

             {/* Contenido Expandible */}
             {gddSectionExpanded && (
                 <View style={styles.gddContentArea}>
                    
                    {/* Selector de cultivo */}
                    <View style={styles.gddSelectorRow}>
                         <Text style={styles.labelSelector}>Analizando para:</Text>
                         {dbCultivos ? (
                            <TouchableOpacity onPress={() => setShowCropSelector(true)} style={styles.gddSelectorBtn}>
                                <Text style={styles.gddSelectorText}>
                                     {selectedCropGDD ? selectedCropGDD.id : "Seleccionar"}
                                </Text>
                                <Ionicons name="caret-down" size={12} color="#2E7D32" />
                            </TouchableOpacity>
                         ) : <ActivityIndicator size="small" color="#4CAF50"/>}
                    </View>

                    <View style={styles.dividerMain} />

                    {!climaActual && <Text style={styles.loadingText}>Esperando datos del clima...</Text>}
                    
                    {/* Lista de Alertas */}
                    {alertasGDD.length > 0 ? (
                    alertasGDD.map((alerta, index) => {
                        const isExpanded = expandedGddId === alerta.id;
                        return (
                            <TouchableOpacity 
                                key={index} 
                                style={[styles.gddCard, isExpanded && styles.gddCardExpanded]} 
                                onPress={() => toggleGddExpand(alerta.id)}
                                activeOpacity={0.9}
                            >
                                <View style={styles.gddHeader}>
                                    <View style={[styles.gddIcon, { backgroundColor: alerta.nivel === 'ALTO' ? '#FFEBEE' : '#E8F5E9' }]}>
                                        <FontAwesome5 name="bug" size={16} color={alerta.nivel === 'ALTO' ? '#D32F2F' : '#2E7D32'} />
                                    </View>
                                    <View style={{flex:1, marginLeft: 10}}>
                                        <Text style={styles.gddTitle}>{alerta.nombre}</Text>
                                        <Text style={styles.gddSubtitle}>
                                            Acumulado: <Text style={{fontWeight:'bold'}}>{alerta.gdd}</Text> / {alerta.gddRequeridos} GDD
                                        </Text>
                                        {/* Barra de progreso */}
                                        <View style={styles.progressBarContainer}>
                                            <View style={[styles.progressBarFill, { 
                                                width: `${Math.min(alerta.progreso, 100)}%`,
                                                backgroundColor: alerta.nivel === 'ALTO' ? '#D32F2F' : '#4CAF50'
                                            }]} />
                                        </View>
                                        <Text style={styles.progressText}>{alerta.progreso}% completado</Text>
                                    </View>
                                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                        <View style={[styles.riskBadge, { 
                                            backgroundColor: alerta.nivel === 'ALTO' ? '#FFCDD2' : '#C8E6C9', 
                                            marginRight: 8 
                                        }]}>
                                            <Text style={[styles.riskText, { 
                                                color: alerta.nivel === 'ALTO' ? '#B71C1C' : '#1B5E20' 
                                            }]}>
                                                {alerta.nivel}
                                            </Text>
                                        </View>
                                        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#B0BEC5" />
                                    </View>
                                </View>
                                
                                {isExpanded && (
                                    <View style={styles.gddBody}>
                                        <View style={styles.divider} />
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Tipo:</Text>
                                            <Text style={styles.detailValue}>{alerta.detalle?.tipo || "No especificado"}</Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Síntomas:</Text>
                                            <Text style={styles.detailValue}>
                                                {alerta.detalle?.sintomas_visuales || "Consulte la guía técnica."}
                                            </Text>
                                        </View>
                                        {alerta.diasRestantes > 0 && (
                                            <View style={styles.detailRow}>
                                                <Text style={styles.detailLabel}>Estimación:</Text>
                                                <Text style={styles.detailValue}>
                                                    Ciclo completo en ~{alerta.diasRestantes} días
                                                </Text>
                                            </View>
                                        )}
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Mensaje:</Text>
                                            <Text style={[styles.detailValue, {fontStyle: 'italic'}]}>
                                                {alerta.mensaje}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })
                ) : (
                    <View style={styles.emptyGdd}>
                        {loadingGDD ? (
                            <ActivityIndicator size="small" color="#4CAF50"/>
                        ) : (
                            <Text style={styles.emptyTextGdd}>
                                {climaActual ? "Riesgo bajo o datos no disponibles." : "Esperando datos del clima..."}
                            </Text>
                        )}
                    </View>
                )}

                {/* Botón para reiniciar temporada */}
                {alertasGDD.length > 0 && (
                    <TouchableOpacity 
                        style={styles.btnReiniciarTemporada} 
                        onPress={reiniciarTemporadaGDD}
                    >
                        <MaterialCommunityIcons name="restart" size={16} color="#F57C00" />
                        <Text style={styles.btnReiniciarText}>Reiniciar Temporada</Text>
                    </TouchableOpacity>
                )}
                 </View>
             )}
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

      {/* MODAL SELECTOR CULTIVO GDD */}
      <Modal visible={showCropSelector} transparent animationType="slide" onRequestClose={()=>setShowCropSelector(false)}>
         <View style={styles.modalOverlay}>
             <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Seleccionar Cultivo (GDD)</Text>
                {dbCultivos ? (
                    <FlatList 
                        data={Object.keys(dbCultivos)}
                        keyExtractor={(k)=>k}
                        renderItem={({item}) => (
                            <TouchableOpacity style={styles.modalItem} onPress={() => selectCropForGDD(item, dbCultivos[item])}>
                                <Text style={styles.modalItemText}>{item}</Text>
                                {selectedCropGDD?.id === item && <Ionicons name="checkmark" size={20} color="green"/>}
                            </TouchableOpacity>
                        )}
                    />
                ) : <ActivityIndicator color="#4CAF50"/>}
                <TouchableOpacity onPress={()=>setShowCropSelector(false)} style={styles.closeModalBtn}>
                    <Text style={styles.closeModalText}>Cerrar</Text>
                </TouchableOpacity>
             </View>
         </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  // ... ESTILOS ORIGINALES ...
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  headerContainer: { position: 'absolute', top: 0, width: ' 100%', height: 320, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden' },
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
  
  // ... ESTILOS NUEVOS DE LA FICHA GDD ...
  gddMainCard: {
    backgroundColor: '#fff',
    marginHorizontal: 24,
    marginTop: 15,
    borderRadius: 16,
    paddingVertical: 4, 
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#E8F5E9'
  },
  gddHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  gddHeaderIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#2E7D32',
    justifyContent: 'center', alignItems: 'center'
  },
  gddTitleMain: { fontSize: 16, fontWeight: '700', color: '#2E7D32' },
  gddSubtitleMain: { fontSize: 12, color: '#78909C' },
  
  gddContentArea: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  gddSelectorRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10
  },
  labelSelector: { fontSize: 12, color: '#90A4AE', fontWeight: '600' },
  gddSelectorBtn: {
    flexDirection:'row', alignItems:'center', backgroundColor:'#F1F8E9', 
    padding:6, paddingHorizontal:12, borderRadius:12 
  },
  gddSelectorText: { color:'#33691E', fontWeight:'600', marginRight:5, fontSize:12 },
  dividerMain: { height: 1, backgroundColor: '#EEEEEE', marginBottom: 12 },

  // Estilos de las tarjetas internas (alertas)
  gddCard: { backgroundColor: '#FAFAFA', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#ECEFF1' },
  gddCardExpanded: { backgroundColor: '#FFF', borderColor: '#C8E6C9', elevation: 1 },
  gddHeader: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  gddIcon: { padding: 8, borderRadius: 8 },
  gddTitle: { fontSize: 14, fontWeight: '600', color: '#37474F' },
  gddSubtitle: { fontSize: 12, color: '#78909C' },
  gddBody: { paddingHorizontal: 15, paddingBottom: 15, paddingTop: 0 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 10 },
  detailRow: { flexDirection: 'row', marginBottom: 5 },
  detailLabel: { fontSize: 12, color: '#90A4AE', width: 70, fontWeight: '600' },
  detailValue: { fontSize: 12, color: '#455A64', flex: 1 },

  riskBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  riskText: { fontSize: 10, fontWeight: '700' },
  emptyGdd: { padding: 15, backgroundColor: '#F5F5F5', borderRadius: 12, alignItems: 'center', borderStyle: 'dashed', borderWidth:1, borderColor:'#CFD8DC' },
  emptyTextGdd: { color: '#90A4AE', fontStyle: 'italic', fontSize: 12 },
  loadingText: { textAlign:'center', color:'#90A4AE', fontSize:12, marginBottom:5 },
  
  modalOverlay: { flex: 1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding: 20 },
  modalContent: { backgroundColor:'white', borderRadius:20, padding:20, maxHeight:'60%' },
  modalTitle: { fontSize:18, fontWeight:'bold', marginBottom:15, textAlign:'center' },
  modalItem: { padding:15, borderBottomWidth:1, borderBottomColor:'#EEE', flexDirection:'row', justifyContent:'space-between' },
  modalItemText: { fontSize:16 },
  closeModalBtn: { marginTop:15, alignSelf:'center', padding:10 },
  closeModalText: { color:'red', fontWeight:'bold' },

  // ... RESTO DE ESTILOS ...
  sectionHeader: { marginBottom: 12, paddingHorizontal: 24 },
  sectionTitleFav: { fontSize: 18, fontWeight: '700', color: '#263238' },
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
  
  // ESTILOS CAMARA
  cameraHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 50, backgroundColor: 'rgba(0,0,0,0.5)' },
  closeCameraBtn: { padding: 5 },
  previewImage: { width: 224, height: 224, borderRadius: 20, marginBottom: 20, borderWidth:2, borderColor:'#FFF' },
  btnAction: { padding: 15, borderRadius: 30, width: '80%', alignItems: 'center', elevation: 5 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cameraFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 30, paddingBottom: 50 },
  iconBtn: { padding: 10 },
  captureOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: 'white', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'white' },
  // Agregar al final de StyleSheet.create:
progressBarContainer: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden'
},
progressBarFill: {
    height: '100%',
    borderRadius: 2
},
progressText: {
    fontSize: 10,
    color: '#78909C',
    marginTop: 3
},
btnReiniciarTemporada: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FFE0B2'
},
btnReiniciarText: {
    color: '#F57C00',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6
}
});