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
import AsistenteVoz from '../components/AsistenteVoz';

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
  const [gddSectionExpanded, setGddSectionExpanded] = useState(true); 
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

  const handleClimaUpdate = (datos) => {
    setClimaActual(datos);
  };
  
  // Efectos Iniciales
  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener(state => setIsOnline(!!state.isConnected));
    cargarFavoritos();
    
    if (datosBasicos?.cultivos) {
        setListaCultivos(Object.keys(datosBasicos.cultivos).map(nombre => ({ nombre, ...datosBasicos.cultivos[nombre] })));
    }

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

  // Lógica GDD Fitosanitaria Corregida
  const calcularRiesgoGDD = async (cultivo, clima) => {
    if (!clima?.temp_max || !clima?.temp_min) return;
    setLoadingGDD(true);
    try {
        const storageKey = `@gdd_historial_${cultivo.id}`;
        const historialStr = await AsyncStorage.getItem(storageKey);
        let historial = historialStr ? JSON.parse(historialStr) : [];
        const hoy = new Date().toISOString().split('T')[0];
        
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
        
        const riesgosConfig = cargarRiesgosDesdeJSON(cultivo); 
        const resetKey = `@gdd_resets_${cultivo.id}`;
        const resetDatesStr = await AsyncStorage.getItem(resetKey);
        const resetDates = resetDatesStr ? JSON.parse(resetDatesStr) : {};

        let prediccionesTotales = {};

        for (const riesgo of riesgosConfig) {
            let historialFiltrado = historial;
            if (resetDates[riesgo.nombre]) {
                const fechaReinicio = resetDates[riesgo.nombre];
                historialFiltrado = historial.filter(dia => dia.fecha >= fechaReinicio);
            }
            const prediccionIndividual = calcularRiesgosMultiples([riesgo], historialFiltrado);
            Object.assign(prediccionesTotales, prediccionIndividual);
        }

        const alertas = generarAlertas(prediccionesTotales);

        setAlertasGDD(alertas.map(alerta => {
            const nombreRiesgo = alerta.nombre; 
            const datosPrediccion = prediccionesTotales[nombreRiesgo]; // Mantiene la referencia correcta fijada

            return {
                id: nombreRiesgo,
                nombre: nombreRiesgo,
                gdd: datosPrediccion?.gdd_alcanzado || 0, 
                gddRequeridos: datosPrediccion?.gdd_meta_texto || "N/A", 
                nivel: (alerta.nivel === 'CRÍTICO' || alerta.nivel === 'ALTO') ? 'ALTO' : 'MEDIO',
                mensaje: `Acumulados: ${(datosPrediccion?.gdd_alcanzado || 0).toFixed(1)} / ${datosPrediccion?.gdd_meta_texto || "N/A"} GDD`, 
                detalle: cultivo.riesgos_detallados?.[nombreRiesgo] || cultivo.riesgos_fitosanitarios?.[nombreRiesgo],
                progreso: Math.round(parseFloat(alerta.progreso || 0))
            };
        }));
    } catch (error) { console.error("GDD Error:", error); } finally { setLoadingGDD(false); }
  };

  const reiniciarTemporadaGDD = async () => {
    Alert.alert("Reiniciar Todo", `¿Desea borrar todo el historial de monitoreo de ${selectedCropGDD.id}?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Reiniciar", style: "destructive", onPress: async () => {
            await AsyncStorage.removeItem(`@gdd_historial_${selectedCropGDD.id}`);
            await AsyncStorage.removeItem(`@gdd_resets_${selectedCropGDD.id}`);
            if (climaActual) calcularRiesgoGDD(selectedCropGDD, climaActual);
        }}
    ]);
  };

  const reiniciarPlagaIndividual = (nombrePlaga) => {
    Alert.alert("Reiniciar Ciclo", `¿Desea restablecer el desarrollo biológico de la plaga "${nombrePlaga}"?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Restablecer", style: "destructive", onPress: async () => {
            try {
                const storageKey = `@gdd_resets_${selectedCropGDD.id}`;
                const resetDatesStr = await AsyncStorage.getItem(storageKey);
                const resetDates = resetDatesStr ? JSON.parse(resetDatesStr) : {};
                
                const hoy = new Date().toISOString().split('T')[0];
                resetDates[nombrePlaga] = hoy;
                
                await AsyncStorage.setItem(storageKey, JSON.stringify(resetDates));
                
                if (climaActual) {
                    calcularRiesgoGDD(selectedCropGDD, climaActual);
                }
            } catch (error) { 
                console.error("Error al reiniciar plaga individual:", error); 
            }
        }}
    ]);
  };

  // Cámara e IA
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

  const renderCultivo = ({ item }) => {
    const iconName = obtenerIconoCultivo(item.nombre, item.categoria);
    const esFavorito = cultivosGuardados.some(c => c.nombre === item.nombre);
    return (
      <View style={styles.cultivoCardContainer}>
        <TouchableOpacity style={styles.cardMainArea} onPress={() => navigation.navigate('MenuDetalle', { cultivo: item.nombre })}>
          <View style={styles.iconBox}>
             {item.imagen_url ? <Image source={{ uri: item.imagen_url }} style={styles.cardImage} /> : <MaterialCommunityIcons name={iconName} size={28} color="#2d6a4f" />}
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>{item.nombre}</Text>
            <Text style={styles.cardSubtitle}>{item.nombre_cientifico || item.categoria || "Ficha técnica"}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={{padding: 10}} onPress={() => toggleFavorito(item)}>
            <MaterialCommunityIcons name={esFavorito ? "heart" : "heart-outline"} size={24} color={esFavorito ? "#d4a373" : "#B0BEC5"} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGuiaArea} onPress={() => navigation.navigate('Guia', { cultivo: item.nombre })}>
          <MaterialCommunityIcons name="compass-rose" size={24} color="#d4a373" />
          <Text style={styles.btnGuiaText}>Guía</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1b4332" />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Header con gradiente */}
          <View style={styles.dynamicHeaderWrapper}>
            <LinearGradient 
              colors={['#1b4332', '#2d6a4f', '#40916c']} 
              style={styles.headerGradientBackground} 
            />
            
            <View style={styles.topSection}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.welcomeSub}>Gestión Integral</Text>
                  <Text style={styles.appName}>RóslinApp</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('About')}>
                  <Ionicons name="information-circle" size={28} color="#FFF" />
                </TouchableOpacity>
              </View>
              
              <ClimaWidget 
                onClimaUpdate={handleClimaUpdate} 
                onPressWeather={() => navigation.navigate('WeatherScreen')} 
              />
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
                  <MaterialCommunityIcons name="heart-multiple" size={20} color="#2d6a4f" />
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
                          color="#2d6a4f" 
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
                <LinearGradient colors={['#d4a373', '#b98b5c']} style={styles.diagnoseGradient} start={{x: 0, y: 0}} end={{x: 1, y: 0}}>
                    <View style={styles.diagnoseContent}>
                        <MaterialCommunityIcons name="camera-iris" size={30} color="#FFF" />
                        <View style={{marginLeft: 15, flex: 1}}>
                            <Text style={styles.diagnoseTitle}>Diagnóstico Inteligente</Text>
                            <Text style={styles.diagnoseSub}>Analiza fitosanitarios por Inteligencia Artificial</Text>
                        </View>
                    </View>
                </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Búsqueda */}
          <View style={styles.searchContainer}>
             <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="#757575" style={{marginRight: 10}} />
                <TextInput style={styles.searchInput} placeholder="Buscar cultivos o variedades..." value={busqueda} onChangeText={setBusqueda} />
             </View>
          </View>

          {mostrarLista && <FlatList data={cultivosFiltrados} keyExtractor={(item) => item.nombre} renderItem={renderCultivo} scrollEnabled={false} />}

          {/* Herramientas Rápidas */}
          <View style={styles.quickAccessContainer}>
             <Text style={[styles.sectionTitleFav, {paddingHorizontal: 24}]}>Herramientas de Campo</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAccessScroll}>
                {[
                  {n: 'AgroControl', i: 'router-wireless', c: '#1b4332', bg: '#E8F5E9'},
                  {n: 'Fertilizantes', i: 'sack', c: '#2d6a4f', bg: '#E8F5E9'},
                  {n: 'Dosis', i: 'flask', c: '#40916c', bg: '#EAF7EE'},
                  {n: 'Bitacora', i: 'notebook', c: '#b98b5c', bg: '#FDF8F2'},
                  {n: 'Noticias', i: 'newspaper', c: '#52b788', bg: '#EAFBF3'},
                  {n: 'ReporteAvanzado', i: 'file-chart', c: '#1b4332', bg: '#E8F5E9', label: 'Reportes'},
                  {n: 'Costos', i: 'finance', c: '#d4a373', bg: '#FDF8F2', label: 'Mis Costos'}
                ].map((item, idx) => (
                  <TouchableOpacity key={idx} style={styles.quickBtn} onPress={() => navigation.navigate(item.n, { cultivo: selectedCropGDD?.id })}>
                    <View style={[styles.quickIcon, {backgroundColor: item.bg}]}><MaterialCommunityIcons name={item.i} size={26} color={item.c} /></View>
                    <Text style={styles.quickText}>{item.label || item.n}</Text>
                  </TouchableOpacity>
                ))}
             </ScrollView>
          </View>

          {/* Sección de Monitoreo GDD */}
          <View style={styles.gddMainCard}>
             <TouchableOpacity onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setGddSectionExpanded(!gddSectionExpanded); }} style={styles.gddHeaderRow}>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <FontAwesome5 name="temperature-low" size={18} color="#2d6a4f" />
                    <Text style={[styles.gddTitleMain, {marginLeft:12}]}>Monitoreo GDD Fitosanitario</Text>
                </View>
                <Ionicons name={gddSectionExpanded ? "chevron-up" : "chevron-down"} size={24} color="#546E7A" />
             </TouchableOpacity>

             {gddSectionExpanded && (
                 <View style={styles.gddContentArea}>
                    <TouchableOpacity onPress={() => setShowCropSelector(true)} style={styles.gddSelectorBtn}>
                        <Text style={styles.gddSelectorText}>{selectedCropGDD?.id || "Seleccionar Cultivo"}</Text>
                        <Ionicons name="caret-down" size={12} color="#2d6a4f" />
                    </TouchableOpacity>
                    
                    {alertasGDD.length === 0 && !loadingGDD && (
                      <Text style={styles.noGddText}>No hay datos epidemiológicos configurados o disponibles para este cultivo.</Text>
                    )}

                    {alertasGDD.map((alerta, index) => (
                        <TouchableOpacity key={index} style={styles.gddCard} onPress={() => setExpandedGddId(expandedGddId === alerta.id ? null : alerta.id)}>
                            <View style={styles.gddHeader}>
                                <View style={{flex:1}}>
                                    <Text style={styles.gddTitle}>{alerta.nombre}</Text>
                                    <View style={styles.progressBarContainer}>
                                        <View style={[styles.progressBarFill, { width: `${Math.min(alerta.progreso, 100)}%`, backgroundColor: alerta.nivel === 'ALTO' ? '#d32f2f' : '#2d6a4f' }]} />
                                    </View>
                                </View>
                                <View style={[styles.riskBadge, { backgroundColor: alerta.nivel === 'ALTO' ? '#FFEBEE' : '#E8F5E9' }]}>
                                    <Text style={[styles.riskText, { color: alerta.nivel === 'ALTO' ? '#c32f27' : '#2d6a4f' }]}>{alerta.nivel}</Text>
                                </View>
                            </View>
                            {expandedGddId === alerta.id && (
                                <View style={styles.containerDetallePlaga}>
                                    <Text style={styles.gddMsg}>{alerta.mensaje}</Text>
                                    <TouchableOpacity 
                                        style={styles.btnReiniciarIndividual} 
                                        onPress={() => reiniciarPlagaIndividual(alerta.nombre)}
                                    >
                                        <MaterialCommunityIcons name="restart" size={14} color="#c32f27" />
                                        <Text style={styles.btnReiniciarTextInd}>Reiniciar ciclo biológico de esta plaga</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </TouchableOpacity>
                    ))}
                    
                    {alertasGDD.length > 0 && (
                        <TouchableOpacity style={styles.btnReiniciarTemporada} onPress={reiniciarTemporadaGDD}>
                            <MaterialCommunityIcons name="refresh" size={16} color="#d4a373" />
                            <Text style={styles.btnReiniciarText}>Reiniciar Monitoreo Completo</Text>
                        </TouchableOpacity>
                    )}
                 </View>
             )}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* MODAL MANTENIDO - Cámara nativa nativa y Procesamiento IA */}
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

      {/* MODAL MANTENIDO - Selector de Cultivos de Firebase */}
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

      <AsistenteVoz cultivoActual={selectedCropGDD?.id || ""} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 80 },
  dynamicHeaderWrapper: { width: '100%', paddingBottom: 25, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden' },
  headerGradientBackground: { ...StyleSheet.absoluteFillObject },
  topSection: { paddingHorizontal: 24, paddingTop: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  welcomeSub: { color: '#D8F3DC', fontSize: 13, fontWeight: '500' },
  appName: { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroSection: { marginTop: 20, paddingHorizontal: 24 },
  diagnoseCard: { borderRadius: 15, elevation: 2 },
  diagnoseGradient: { borderRadius: 15, padding: 2 },
  diagnoseContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  diagnoseTitle: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
  diagnoseSub: { fontSize: 12, color: '#FFF', opacity: 0.9, marginTop: 2 },
  searchContainer: { marginVertical: 15, paddingHorizontal: 24 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 15, height: 48, elevation: 1, borderWidth: 1, borderColor: '#ECEFF1' },
  searchInput: { flex: 1, fontSize: 14, color: '#263238' },
  quickAccessContainer: { marginBottom: 20 },
  sectionTitleFav: { fontSize: 16, fontWeight: '700', color: '#1b4332', marginBottom: 12 },
  quickAccessScroll: { paddingLeft: 24 },
  quickBtn: { alignItems: 'center', marginRight: 16, width: 75 },
  quickIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  quickText: { fontSize: 10, fontWeight: '600', color: '#455A64', textAlign: 'center' },
  cultivoCardContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, marginBottom: 10, marginHorizontal: 24, elevation: 1, borderWidth: 1, borderColor: '#ECEFF1' },
  cardMainArea: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  cardImage: { width: '100%', height: '100%', borderRadius: 10 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#1b4332" },
  cardSubtitle: { fontSize: 12, color: "#78909C", marginTop: 2 },
  btnGuiaArea: { padding: 12, backgroundColor: '#FDFBF7', alignItems: 'center', borderLeftWidth: 1, borderLeftColor: '#ECEFF1' },
  btnGuiaText: { fontSize: 10, color: '#b98b5c', fontWeight: 'bold', marginTop: 2 },
  gddMainCard: { backgroundColor: '#fff', marginHorizontal: 24, borderRadius: 12, elevation: 1, borderWidth: 1, borderColor: '#E8F5E9', paddingBottom: 12, marginBottom: 20 },
  gddHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
  gddTitleMain: { fontSize: 15, fontWeight: '700', color: '#1b4332' },
  gddContentArea: { paddingHorizontal: 15 },
  gddSelectorBtn: { backgroundColor:'#E8F5E9', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  gddSelectorText: { color:'#1b4332', fontWeight:'700', fontSize:12, marginRight: 6 },
  gddCard: { backgroundColor: '#FAFBFB', borderRadius: 10, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: '#ECEFF1', borderLeftWidth: 4, borderLeftColor: '#2d6a4f' },
  gddHeader: { flexDirection: 'row', alignItems: 'center' },
  gddTitle: { fontSize: 14, fontWeight: '600', color: '#263238' },
  gddMsg: { fontSize: 12, color: '#546E7A', fontStyle: 'italic', lineHeight: 16 },
  progressBarContainer: { height: 6, backgroundColor: '#ECEFF1', borderRadius: 3, marginTop: 6, width: '90%' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  riskText: { fontSize: 10, fontWeight: '700' },
  noGddText: { textAlign: 'center', color: '#90A4AE', marginVertical: 15, fontSize: 13 },
  btnReiniciarTemporada: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDF8F2', padding: 10, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#F5E6D3' },
  btnReiniciarText: { color: '#b98b5c', fontSize: 12, fontWeight: '700', marginLeft: 6 },
  favoritosMinContainer: { marginTop: 12, marginBottom: 4 },
  containerDetallePlaga: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#ECEFF1', paddingTop: 8 },
  btnReiniciarIndividual: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, marginTop: 8, alignSelf: 'flex-start' },
  btnReiniciarTextInd: { color: '#c32f27', fontSize: 11, fontWeight: '700', marginLeft: 5 },
  favoritosScroll: { paddingLeft: 24, paddingRight: 10, paddingBottom: 8 },
  favMinCard: { alignItems: 'center', marginRight: 16, width: 65 },
  favMinIconBadge: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', elevation: 2, marginBottom: 6, borderWidth: 1, borderColor: '#E8F5E9' },
  favMinText: { fontSize: 11, fontWeight: '600', color: '#37474F', textAlign: 'center' },
  
  // Estilos de la cámara recuperados
  cameraHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20, alignItems: 'center' },
  previewImage: { width: width * 0.8, height: width * 0.8, borderRadius: 15, marginBottom: 20 },
  btnAction: { padding: 14, borderRadius: 25, width: '80%', alignItems: 'center', backgroundColor: '#2d6a4f', elevation: 2 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  cameraFooter: { position: 'absolute', bottom: 60, width: '100%', alignItems: 'center' },
  captureOuter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: 'white', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'white' },
  modalOverlay: { flex: 1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'center', padding: 24 },
  modalContent: { backgroundColor:'white', borderRadius:16, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize:17, fontWeight:'bold', marginBottom:12, textAlign:'center', color: '#1b4332' },
  modalItem: { padding:14, borderBottomWidth:1, borderBottomColor:'#ECEFF1', flexDirection:'row', justifyContent:'space-between', alignItems: 'center' },
  modalItemText: { fontSize:15, color: '#263238' },
  closeModalBtn: { marginTop:14, alignSelf:'center' },
  closeModalText: { color:'#c32f27', fontWeight:'bold', fontSize: 15 },
});