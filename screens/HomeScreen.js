import React, { useState, useEffect, useRef, useCallback } from "react";
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
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '../src/services/supabaseClient'; 
import datosBasicos from "../data/cultivos_basico.json";
import CultivoDataManager from '../utils/CultivoDataManager';
import { getDatabase, ref, onValue } from "firebase/database";
import { app } from '../utils/firebase';  
import { cargarRiesgosDesdeJSON, calcularRiesgosMultiples, generarAlertas } from '../utils/gdd_calculator';
import ClimaWidget from '../components/ClimaWidget'; 
import { TreatmentCard } from '../components/TreatmentCard';
import { usePlantClassifier } from '../src/hooks/usePlantClassifier';
import AsistenteVoz from '../components/AsistenteVoz';
import { SyncManager } from '../src/services/SyncManager'; 
import MapView, { Marker, Polygon } from 'react-native-maps';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
  const [busqueda, setBusqueda] = useState("");
  const [listaCultivos, setListaCultivos] = useState([]);
  const [cultivosGuardados, setCultivosGuardados] = useState([]); 
  const [favoritosExpanded, setFavoritosExpanded] = useState(true);

  const [dbCultivos, setDbCultivos] = useState(null);
  const [climaActual, setClimaActual] = useState(null);
  const [alertasGDD, setAlertasGDD] = useState([]);
  const [loadingGDD, setLoadingGDD] = useState(false);
  const [lotesUsuario, setLotesUsuario] = useState([]);
  const [loteActivo, setLoteActivo] = useState(null); 
  const [cultivoActivo, setCultivoActivo] = useState(null);
  const [showCropSelector, setShowCropSelector] = useState(false);
  const [gddSectionExpanded, setGddSectionExpanded] = useState(true); 
  const [expandedGddId, setExpandedGddId] = useState(null); 

  const [modalCameraVisible, setModalCameraVisible] = useState(false);
  const [image, setImage] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef(null);

  // 🚨 BLINDAJE: Sustituimos el Modal problemático por un booleano para vista absoluta
  const [mostrarMapaTrazador, setMostrarMapaTrazador] = useState(false);
  const [nuevoLoteCoords, setNuevoLoteCoords] = useState([]);
  const [nuevoLoteNombre, setNuevoLoteNombre] = useState('');
  const [nuevoLoteCultivos, setNuevoLoteCultivos] = useState('');

  const [expoPushToken, setExpoPushToken] = useState('');
  const notificationListener = useRef();
  const responseListener = useRef();

  const { prediction, setPrediction, loadingIA, classifyImage } = usePlantClassifier(isOnline, climaActual, alertasGDD);

  const handleClimaUpdate = useCallback((datos) => {
    setClimaActual(datos);
  }, []);
  
  // 🚨 FIX: Blindaje Offline con Try/Catch
  // 🚨 FIX: Blindaje Offline Total, Caché Visual y Recuperación de Coordenadas
  const cargarLotes = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) throw new Error("Fallo de red en validación");

      const { data, error } = await supabase
        .from('lotes')
        // 🚨 FIX IMPORTANTE: Faltaba incluir 'coordenadas_poligono' en el select
        .select('id, nombre, cultivos, coordenadas_poligono, predios(id, nombre, estado)')
        .eq('predios.user_id', user.id);
        
      if (error) throw error;
      if (data) {
          setLotesUsuario(data);
          // Guardamos la copia de seguridad para el modo offline
          await AsyncStorage.setItem('@lotes_cache', JSON.stringify(data));
      }
    } catch (error) {
      console.warn("Modo Offline activo, cargando lotes desde memoria local...");
      // 🚨 FIX: Rescate del estado desde la caché local
      try {
          const cacheStr = await AsyncStorage.getItem('@lotes_cache');
          if (cacheStr) setLotesUsuario(JSON.parse(cacheStr));
      } catch (cacheErr) {
          console.error("Error leyendo caché", cacheErr);
      }
    }
  };

  useEffect(() => { cargarLotes(); }, []);

  useEffect(() => {
    registrarParaNotificacionesAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        guardarTokenEnSupabase(token);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log("Notificación recibida en primer plano:", notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const pantallaDestino = response.notification.request.content.data?.pantalla;
      if (pantallaDestino) {
        navigation.navigate(pantallaDestino);
      }
    });

    SyncManager.iniciarListener();

    return () => {
      if (notificationListener.current) Notifications.removeNotificationSubscription(notificationListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  async function registrarParaNotificacionesAsync() {
    let token;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Alertas GDD',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2E7D32',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') return null;
      
      try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } catch (e) { console.error(e); }
    }
    return token;
  }

  async function guardarTokenEnSupabase(token) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('perfiles').upsert({ id: user.id, expo_push_token: token }, { onConflict: 'id' });
      }
    } catch (error) { console.error(error); }
  }

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
      } catch (error) {}
    };
    sincronizar();
    return () => unsubscribeNet();
  }, []);

  useEffect(() => {
    const db = getDatabase(app);
    const dbRef = ref(db, 'cultivos'); 
    return onValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setDbCultivos(data);
    });
  }, []);

  // 🚨 FIX: Debounce de 500ms para evitar Race Condition y corrupción en AsyncStorage
  useEffect(() => {
    const timeoutId = setTimeout(() => {
        if (climaActual && loteActivo && cultivoActivo) {
            const configCultivo = dbCultivos?.[cultivoActivo] || datosBasicos?.cultivos?.[cultivoActivo] || {}; 
            const cultivoParaGDD = { id: loteActivo.id, nombre: cultivoActivo, ...configCultivo };
            
            calcularRiesgoGDD(cultivoParaGDD, climaActual);
        }
    }, 500); // Esperamos medio segundo para permitir que Firebase se estabilice

    return () => clearTimeout(timeoutId);
  }, [climaActual, loteActivo, cultivoActivo, dbCultivos]);

  // 🚨 FIX: Optimización de Rendimiento (Estado Derivado). 
  // Elimina el doble renderizado y libera el hilo de JavaScript al escribir.
  const cultivosFiltrados = React.useMemo(() => {
    if (busqueda.trim() === "") return [];
    const query = busqueda.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return listaCultivos.filter((cultivo) => {
      const nombreNorm = cultivo.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return nombreNorm.includes(query);
    });
  }, [busqueda, listaCultivos]);

  const mostrarLista = cultivosFiltrados.length > 0;

  const cargarFavoritos = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem('@mis_cultivos');
      if (jsonValue != null) setCultivosGuardados(JSON.parse(jsonValue));
    } catch(e) {}
  };

  const toggleFavorito = async (item) => {
    try {
      const existe = cultivosGuardados.find(c => c.nombre === item.nombre);
      const nuevoArray = existe ? cultivosGuardados.filter(c => c.nombre !== item.nombre) : [...cultivosGuardados, item];
      setCultivosGuardados(nuevoArray);
      await AsyncStorage.setItem('@mis_cultivos', JSON.stringify(nuevoArray));
    } catch (e) {}
  };

  const handleMapPress = (e) => {
    if (e.nativeEvent.coordinate) {
       setNuevoLoteCoords([...nuevoLoteCoords, e.nativeEvent.coordinate]);
    }
  };

  const guardarNuevoLote = async () => {
    if (!nuevoLoteNombre || nuevoLoteCoords.length < 3) {
      Alert.alert("Incompleto", "Asigna un nombre y marca al menos 3 puntos en el mapa para formar un polígono.");
      return;
    }

    let predioIdLocal = lotesUsuario.length > 0 ? (lotesUsuario[0].predios?.id || lotesUsuario[0].predios?.[0]?.id) : null;
    let esNuevoPredioOffline = false;

    if (!predioIdLocal) {
        predioIdLocal = `temp_predio_${Date.now()}`;
        esNuevoPredioOffline = true;
    }

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      // Si hay error de red, lanzamos la excepción para saltar a la lógica offline en el catch
      if (authError) throw authError; 
      
      if (!user) return Alert.alert("Error", "Debes iniciar sesión.");

      if (esNuevoPredioOffline) {
        const { data: predioData, error: errP } = await supabase
          .from('predios')
          .insert([{ nombre: 'Mi Parcela Principal', user_id: user.id, estado: 'ND' }])
          .select('id').single();
        if (errP) throw errP;
        predioIdLocal = predioData.id; 
      }

      const arrCultivos = nuevoLoteCultivos.split(',').map(c => c.trim()).filter(c => c !== '');
      const coordsFormatoBD = nuevoLoteCoords.map(c => ({ lat: c.latitude, lng: c.longitude }));

      const { error: errLote } = await supabase
        .from('lotes')
        .insert([{
          predio_id: predioIdLocal,
          nombre: nuevoLoteNombre,
          cultivos: arrCultivos.length > 0 ? arrCultivos : ['General'],
          coordenadas_poligono: coordsFormatoBD
        }]);

      if (errLote) throw errLote;

      Alert.alert("Éxito", "El lote fue registrado y trazado correctamente.");
      setMostrarMapaTrazador(false);
      setNuevoLoteCoords([]);
      setNuevoLoteNombre('');
      setNuevoLoteCultivos('');
      
      cargarLotes(); 
    } catch (e) {
      Alert.alert(
          "Modo Sin Conexión",
          "El lote se guardó localmente. Se sincronizará en la nube de forma automática."
      );

      if (esNuevoPredioOffline) {
          const predioPendiente = {
              id: predioIdLocal,
              nombre: 'Mi Parcela Principal',
              estado: 'ND',
              pendiente_sincronizacion: true
          };
          AsyncStorage.getItem('@predios_pendientes').then(str => {
              const arr = str ? JSON.parse(str) : [];
              arr.push(predioPendiente);
              AsyncStorage.setItem('@predios_pendientes', JSON.stringify(arr));
          }).catch(console.error);
      }

      const arrCultivosOffline = nuevoLoteCultivos.split(',').map(c => c.trim()).filter(c => c !== '');

      const lotePendiente = {
          id: `temp_lote_${Date.now()}`,
          predio_id: predioIdLocal, 
          nombre: nuevoLoteNombre,
          coordenadas_poligono: nuevoLoteCoords.map(c => ({ lat: c.latitude, lng: c.longitude })),
          cultivos: arrCultivosOffline.length > 0 ? arrCultivosOffline : ['General'], 
          pendiente_sincronizacion: true,
          predios: { 
              id: predioIdLocal, 
              nombre: lotesUsuario.length > 0 ? lotesUsuario[0].predios?.nombre : 'Mi Parcela Principal' 
          }
      };

      try {
          const str = await AsyncStorage.getItem('@lotes_pendientes');
          const pendientes = str ? JSON.parse(str) : [];
          pendientes.push(lotePendiente);
          await AsyncStorage.setItem('@lotes_pendientes', JSON.stringify(pendientes));

          const cacheStr = await AsyncStorage.getItem('@lotes_cache');
          const cache = cacheStr ? JSON.parse(cacheStr) : [];
          cache.push(lotePendiente);
          await AsyncStorage.setItem('@lotes_cache', JSON.stringify(cache));

      } catch (storageErr) {
          console.error("Error guardando en caché local", storageErr);
      }

      setLotesUsuario(prev => [...prev, lotePendiente]);
      setMostrarMapaTrazador(false);
      setNuevoLoteCoords([]);
      setNuevoLoteNombre('');
      setNuevoLoteCultivos('');
    }
  };

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
            const datosPrediccion = prediccionesTotales[nombreRiesgo];

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
    if (!loteActivo || !cultivoActivo) return;
    Alert.alert("Reiniciar Todo", `¿Desea borrar todo el historial de monitoreo de ${cultivoActivo}?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Reiniciar", style: "destructive", onPress: async () => {
            await AsyncStorage.removeItem(`@gdd_historial_${loteActivo.id}`);
            await AsyncStorage.removeItem(`@gdd_resets_${loteActivo.id}`);
            
            // 🚨 FIX: Fallback Offline asegurado al resetear
            const configCultivo = dbCultivos?.[cultivoActivo] || datosBasicos?.cultivos?.[cultivoActivo] || {};
            const cultivoParaGDD = { id: loteActivo.id, nombre: cultivoActivo, ...configCultivo };
            if (climaActual) calcularRiesgoGDD(cultivoParaGDD, climaActual);
        }}
    ]);
  };

  const reiniciarPlagaIndividual = (nombrePlaga) => {
    if (!loteActivo || !cultivoActivo) return;
    Alert.alert("Reiniciar Ciclo", `¿Desea restablecer el desarrollo biológico de la plaga "${nombrePlaga}"?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Restablecer", style: "destructive", onPress: async () => {
            try {
                const storageKey = `@gdd_resets_${loteActivo.id}`;
                const resetDatesStr = await AsyncStorage.getItem(storageKey);
                const resetDates = resetDatesStr ? JSON.parse(resetDatesStr) : {};
                
                const hoy = new Date().toISOString().split('T')[0];
                resetDates[nombrePlaga] = hoy;
                
                await AsyncStorage.setItem(storageKey, JSON.stringify(resetDates));
                
                // 🚨 FIX: Fallback Offline asegurado al resetear plaga individual
                const configCultivo = dbCultivos?.[cultivoActivo] || datosBasicos?.cultivos?.[cultivoActivo] || {};
                const cultivoParaGDD = { id: loteActivo.id, nombre: cultivoActivo, ...configCultivo };
                if (climaActual) calcularRiesgoGDD(cultivoParaGDD, climaActual);
            } catch (error) { 
                console.error("Error al reiniciar plaga individual:", error); 
            }
        }}
    ]);
  };

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
          
          <View style={styles.dynamicHeaderWrapper}>
            <LinearGradient colors={['#1b4332', '#2d6a4f', '#40916c']} style={styles.headerGradientBackground} />
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
              <ClimaWidget onClimaUpdate={handleClimaUpdate} onPressWeather={() => navigation.navigate('WeatherScreen')} />
            </View>
          </View>

          {cultivosGuardados.length > 0 && (
            <View style={styles.favoritosMinContainer}>
              <TouchableOpacity onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setFavoritosExpanded(!favoritosExpanded); }} style={[styles.gddHeaderRow, { paddingHorizontal: 24, paddingBottom: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="heart-multiple" size={20} color="#2d6a4f" />
                  <Text style={[styles.sectionTitleFav, { marginLeft: 10, marginBottom: 0 }]}>Mis Cultivos</Text>
                </View>
                <Ionicons name={favoritosExpanded ? "chevron-up" : "chevron-down"} size={20} color="#546E7A" />
              </TouchableOpacity>
              {favoritosExpanded && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favoritosScroll}>
                  {cultivosGuardados.map((item, index) => (
                    <TouchableOpacity key={index} style={styles.favMinCard} onPress={() => navigation.navigate('MenuDetalle', { cultivo: item.nombre })}>
                      <View style={styles.favMinIconBadge}>
                        <MaterialCommunityIcons name={obtenerIconoCultivo(item.nombre, item.categoria)} size={22} color="#2d6a4f" />
                      </View>
                      <Text numberOfLines={1} style={styles.favMinText}>{item.nombre}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

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

          <View style={styles.searchContainer}>
             <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="#757575" style={{marginRight: 10}} />
                <TextInput style={styles.searchInput} placeholder="Buscar cultivos o variedades..." value={busqueda} onChangeText={setBusqueda} />
             </View>
          </View>

          {/* 🚨 FIX: Rendimiento - Reemplazo de FlatList anidada por un mapeo directo */}
          {mostrarLista && (
             <View style={{ marginBottom: 15 }}>
                {cultivosFiltrados.map((item, index) => (
                    <React.Fragment key={item.nombre || index}>
                        {renderCultivo({ item })}
                    </React.Fragment>
                ))}
             </View>
          )}

          <View style={styles.quickAccessContainer}>
             <Text style={[styles.sectionTitleFav, {paddingHorizontal: 24}]}>Herramientas de Campo</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAccessScroll}>
                {/* 🚨 FIX: Comentario corregido a formato JSX para evitar "Invariant Violation Crash" nativo */}
                {[ {n: 'AgroControl', i: 'router-wireless', c: '#1b4332', bg: '#E8F5E9'}, {n: 'Fertilizantes', i: 'sack', c: '#2d6a4f', bg: '#E8F5E9'}, {n: 'Dosis', i: 'flask', c: '#40916c', bg: '#EAF7EE'}, {n: 'Bitacora', i: 'notebook', c: '#b98b5c', bg: '#FDF8F2'}, {n: 'Noticias', i: 'newspaper', c: '#52b788', bg: '#EAFBF3'}, {n: 'ReporteAvanzado', i: 'file-chart', c: '#1b4332', bg: '#E8F5E9', label: 'Reportes'}, {n: 'Costos', i: 'finance', c: '#d4a373', bg: '#FDF8F2', label: 'Mis Costos'}, {n: 'Recordatorios', i: 'alarm', c: '#D32F2F', bg: '#FFEBEE', label: 'Agenda'}, {n: 'LoteSatelital', i: 'satellite-uplink', c: '#1976D2', bg: '#E3F2FD', label: 'Satélite'} ].map((item, idx) => (
                  <TouchableOpacity key={idx} style={styles.quickBtn} onPress={() => navigation.navigate(item.n, { 
                      cultivo: cultivoActivo || "General", 
                      lote_id: loteActivo?.id,
                      coords_offline: loteActivo?.coordenadas_poligono // <--- Polígono en memoria
                  })}>
                    <View style={[styles.quickIcon, {backgroundColor: item.bg}]}><MaterialCommunityIcons name={item.i} size={26} color={item.c} /></View>
                    <Text style={styles.quickText}>{item.label || item.n}</Text>
                  </TouchableOpacity>
                ))}
             </ScrollView>
          </View>

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
                        <Text style={styles.gddSelectorText}>
                            {loteActivo 
                                ? `📍 ${loteActivo.predios?.nombre} - ${loteActivo.nombre}` 
                                : "Seleccionar Predio y Lote"}
                        </Text>
                        <Ionicons name="caret-down" size={14} color="#2d6a4f" />
                    </TouchableOpacity>

                    {loteActivo && cultivoActivo && alertasGDD.length === 0 && !loadingGDD && (
                      <Text style={styles.noGddText}>No hay datos epidemiológicos configurados o disponibles para este cultivo.</Text>
                    )}

                    {loteActivo && cultivoActivo && alertasGDD.map((alerta, index) => (
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
                                    <TouchableOpacity style={styles.btnReiniciarIndividual} onPress={() => reiniciarPlagaIndividual(alerta.nombre)}>
                                        <MaterialCommunityIcons name="restart" size={14} color="#c32f27" />
                                        <Text style={styles.btnReiniciarTextInd}>Reiniciar ciclo biológico de esta plaga</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </TouchableOpacity>
                    ))}
                    
                    {loteActivo && cultivoActivo && alertasGDD.length > 0 && (
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

      {/* 🚨 BLINDAJE: Mapa Geoespacial como Capa Absoluta para evitar crash de Modal nativo */}
      {mostrarMapaTrazador && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 9999, backgroundColor: '#FFF', elevation: 10 }]}>
           <View style={[styles.headerRow, {backgroundColor: '#1b4332', padding: 15, paddingTop: 50, marginBottom: 0}]}>
               <Text style={{color: 'white', fontSize: 18, fontWeight: 'bold'}}>Trazar Nuevo Lote</Text>
               <TouchableOpacity onPress={() => setMostrarMapaTrazador(false)}>
                   <Ionicons name="close" size={28} color="white" />
               </TouchableOpacity>
           </View>
           
           <View style={{padding: 15, backgroundColor: '#FFF', elevation: 4, zIndex: 10}}>
               <TextInput 
                   style={[styles.searchInput, {backgroundColor: '#F5F5F5', padding: 10, borderRadius: 8}]} 
                   placeholder="Nombre del Lote (Ej. Parcela Norte)" 
                   value={nuevoLoteNombre} 
                   onChangeText={setNuevoLoteNombre} 
               />
               <TextInput 
                   style={[styles.searchInput, {marginTop: 10, backgroundColor: '#F5F5F5', padding: 10, borderRadius: 8}]} 
                   placeholder="Cultivos separados por coma (Ej. Maíz, Frijol)" 
                   value={nuevoLoteCultivos} 
                   onChangeText={setNuevoLoteCultivos} 
               />
               <Text style={{fontSize: 12, color: '#78909C', marginTop: 10}}>
                   Toca el mapa para agregar los vértices del terreno.
               </Text>
           </View>

           <MapView 
               style={{flex: 1}} 
               mapType="hybrid"
               initialRegion={{
                   latitude: 23.6345,
                   longitude: -102.5528,
                   latitudeDelta: 20, 
                   longitudeDelta: 20,
               }}
               onPress={handleMapPress}
           >
               {nuevoLoteCoords.length >= 3 ? (
                   <Polygon 
                       coordinates={nuevoLoteCoords} 
                       strokeColor="#FFF" 
                       strokeWidth={2} 
                       fillColor="#2E7D3266" 
                   />
               ) : null}
               
               {nuevoLoteCoords.length > 0 ? nuevoLoteCoords.map((c, i) => (
                   <Marker key={i} coordinate={c} />
               )) : null}
           </MapView>

           <View style={{flexDirection: 'row', padding: 15, backgroundColor: '#FFF', justifyContent: 'space-between', alignItems: 'center'}}>
               <TouchableOpacity 
                   style={{flex: 1, marginRight: 10, padding: 14, borderWidth: 1, borderColor: '#c32f27', borderRadius: 10, justifyContent: 'center'}} 
                   onPress={() => setNuevoLoteCoords(prev => prev.slice(0, -1))}
               >
                   <Text style={{color: '#c32f27', textAlign: 'center', fontWeight: 'bold'}}>Deshacer Punto</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                   style={[styles.btnAction, {flex: 2, borderRadius: 10, marginBottom: 0}]} 
                   onPress={guardarNuevoLote}
               >
                   <Text style={styles.btnText}>Guardar Geometría</Text>
               </TouchableOpacity>
           </View>
        </View>
      )}

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

      <Modal visible={showCropSelector} transparent animationType="fade">
         <View style={styles.modalOverlay}>
             <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Seleccionar Predio y Lote</Text>
                <FlatList 
                    data={lotesUsuario}
                    keyExtractor={(item) => item?.id?.toString() || Math.random().toString()}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => {
                            setLoteActivo(item);
                            if (item.cultivos && item.cultivos.length > 0) {
                                setCultivoActivo(item.cultivos[0]);
                            } else {
                                setCultivoActivo(null);
                            }
                            setShowCropSelector(false);
                        }}>
                            <Text style={styles.modalItemText}>{item.predios?.nombre} - {item.nombre}</Text>
                            {loteActivo?.id === item.id && <Ionicons name="checkmark-circle" size={20} color="green"/>}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{textAlign: 'center', marginVertical: 20, color: '#78909C'}}>No tiene lotes registrados aún.</Text>}
                />
                
                {/* Botón para abrir el trazador en capa absoluta */}
                <TouchableOpacity 
                    onPress={() => { 
                        setShowCropSelector(false); 
                        setMostrarMapaTrazador(true);
                    }} 
                    style={[styles.btnAction, {backgroundColor: '#2E7D32', width: '100%', marginBottom: 10, alignSelf: 'center', borderRadius: 12}]}
                >
                    <Text style={styles.btnText}>+ Trazar Nuevo Lote en Mapa</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={()=>setShowCropSelector(false)} style={styles.closeModalBtn}>
                    <Text style={styles.closeModalText}>Cancelar</Text>
                </TouchableOpacity>
             </View>
         </View>
      </Modal>

      <AsistenteVoz 
        cultivoActual={cultivoActivo || "General"} 
        loteId={loteActivo?.id || null}
        climaActual={climaActual} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 80 },
  dynamicHeaderWrapper: { 
    width: '100%', 
    paddingBottom: 30, 
    borderBottomLeftRadius: 35, 
    borderBottomRightRadius: 35, 
    overflow: 'hidden',
    elevation: 8, 
    shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 6 },
  headerGradientBackground: { ...StyleSheet.absoluteFillObject },
  topSection: { paddingHorizontal: 24, paddingTop: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  welcomeSub: { color: '#D8F3DC', fontSize: 13, fontWeight: '500' },
  appName: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  heroSection: { marginTop: 20, paddingHorizontal: 24 },
  diagnoseCard: { borderRadius: 16, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 3 }, shadowRadius: 5, marginVertical: 10 },
  diagnoseGradient: { borderRadius: 16, padding: 4 },
  diagnoseContent: { flexDirection: 'row', alignItems: 'center', padding: 18, backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  diagnoseTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', letterSpacing: 0.3 },
  diagnoseSub: { fontSize: 13, color: '#F5F5F5', opacity: 0.95, marginTop: 4, lineHeight: 18 },
  searchContainer: { marginVertical: 15, paddingHorizontal: 24 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 14, paddingHorizontal: 16, height: 52, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, borderWidth: 0 },
  searchInput: { flex: 1, fontSize: 15, color: '#37474F' },
  quickAccessContainer: { marginBottom: 20 },
  sectionTitleFav: { fontSize: 16, fontWeight: '700', color: '#1b4332', marginBottom: 12 },
  quickAccessScroll: { paddingLeft: 24 },
  quickBtn: { alignItems: 'center', marginRight: 16, width: 75 },
  quickIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  quickText: { fontSize: 10, fontWeight: '600', color: '#455A64', textAlign: 'center' },
  cultivoCardContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 14, marginBottom: 12, marginHorizontal: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 3, borderWidth: 1, borderColor: '#F0F2F5' },
  cardMainArea: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  cardImage: { width: '100%', height: '100%', borderRadius: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1b4332", letterSpacing: 0.2 },
  cardSubtitle: { fontSize: 12, color: "#78909C", marginTop: 2 },
  btnGuiaArea: { padding: 12, backgroundColor: '#FDFBF7', alignItems: 'center', borderLeftWidth: 1, borderLeftColor: '#ECEFF1' },
  btnGuiaText: { fontSize: 10, color: '#b98b5c', fontWeight: 'bold', marginTop: 2 },
  gddMainCard: { backgroundColor: '#fff', marginHorizontal: 24, borderRadius: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, borderWidth: 1, borderColor: '#ECEFF1', paddingBottom: 15, marginBottom: 25 },
  gddHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
  gddTitleMain: { fontSize: 15, fontWeight: '700', color: '#1b4332' },
  gddContentArea: { paddingHorizontal: 15 },
  gddSelectorBtn: { backgroundColor:'#E8F5E9', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  gddSelectorText: { color:'#1b4332', fontWeight:'700', fontSize:12, marginRight: 6 },
  gddCard: { backgroundColor: '#FAFAFA', borderRadius: 12, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: '#ECEFF1', borderLeftWidth: 4, borderLeftColor: '#2d6a4f' },
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