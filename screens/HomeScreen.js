import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  View, Text, StyleSheet, FlatList, TextInput, 
  TouchableOpacity, StatusBar, Image, ScrollView, Modal, ActivityIndicator, Alert, Dimensions,
  LayoutAnimation, Platform, UIManager, AppState
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
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';

const HERRAMIENTAS_CAMPO = [
  {n: 'AgroControl', i: 'router-wireless', c: '#1b4332', bg: '#E8F5E9', label: 'AgroControl'}, 
  {n: 'Fertilizantes', i: 'sack', c: '#2d6a4f', bg: '#E8F5E9', label: 'Fertilizantes'}, 
  {n: 'Dosis', i: 'flask', c: '#40916c', bg: '#EAF7EE', label: 'Dosis'}, 
  {n: 'Bitacora', i: 'notebook', c: '#b98b5c', bg: '#FDF8F2', label: 'Bitácora'}, 
  {n: 'Noticias', i: 'newspaper', c: '#52b788', bg: '#EAFBF3', label: 'Noticias'}, 
  {n: 'ReporteAvanzado', i: 'file-chart', c: '#1b4332', bg: '#E8F5E9', label: 'Reportes'}, 
  {n: 'Costos', i: 'finance', c: '#d4a373', bg: '#FDF8F2', label: 'Mis Costos'}, 
  {n: 'Recordatorios', i: 'alarm', c: '#D32F2F', bg: '#FFEBEE', label: 'Agenda'}, 
  {n: 'LoteSatelital', i: 'satellite-uplink', c: '#1976D2', bg: '#E3F2FD', label: 'Satélite'}
];

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
  const n = typeof nombre === 'string' ? nombre.toLowerCase() : "";
  const c = typeof categoria === 'string' ? categoria.toLowerCase() : "";
  
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
  const [climaLoteActivo, setClimaLoteActivo] = useState(null);
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
  const [appState, setAppState] = useState(AppState.currentState);
  
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => setAppState(nextState));
    return () => subscription.remove();
  }, []);

  // 🚨 BLINDAJE: Sustituimos el Modal problemático por un booleano para vista absoluta
  const [mostrarMapaTrazador, setMostrarMapaTrazador] = useState(false);
  const [nuevoLoteCoords, setNuevoLoteCoords] = useState([]);
  const [nuevoLoteNombre, setNuevoLoteNombre] = useState('');
  const [nuevoLoteCultivos, setNuevoLoteCultivos] = useState('');
  const [isSavingLote, setIsSavingLote] = useState(false);
  // --- NUEVOS ESTADOS PARA BÚSQUEDA EN MAPA ---
  const mapRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingMap, setIsSearchingMap] = useState(false);

  const [isLocating, setIsLocating] = useState(false);

  const centrarEnUbicacionActual = async () => {
    setIsLocating(true);
    try {
      // 1. Validar y solicitar permiso nativo al SO (Previene crasheos fatales)
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso Denegado', 'Se requiere acceso al GPS para centrar el mapa en tu ubicación.');
        setIsLocating(false);
        return;
      }

      // 2. Obtener la coordenada. Usamos 'High' porque en campo abierto el cielo despejado da precisión submétrica.
      // Funciona 100% offline sin consumir datos móviles.
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.005, // Zoom hiper-cercano para trazar linderos
          longitudeDelta: 0.005,
        }, 1200);
      }
    } catch (error) {
      Alert.alert('Señal GPS Débil', 'No se pudo triangular la ubicación. Verifica que tu GPS (Ubicación) esté encendido.');
    } finally {
      setIsLocating(false);
    }
  };

   const coordenadasValidas = React.useMemo(() => {
      return nuevoLoteCoords.filter(p => 
          typeof p?.latitude === 'number' && 
          typeof p?.longitude === 'number' && 
          !isNaN(p.latitude) && 
          !isNaN(p.longitude)
      );
  }, [nuevoLoteCoords]);

  const { prediction, setPrediction, loadingIA, classifyImage } = usePlantClassifier(isOnline, climaActual, alertasGDD);

  const handleClimaUpdate = useCallback((datos) => {
    setClimaActual(datos);
  }, []);
  
  const cargarLotes = async () => {
    // 1. CARGA INMEDIATA DESDE CACHÉ (Evita la pantalla vacía al iniciar sin internet)
    try {
        const cacheStr = await AsyncStorage.getItem('@lotes_cache');
        if (cacheStr) {
            const parsedCache = JSON.parse(cacheStr);
            // Inyectamos a la UI instantáneamente si hay datos guardados
            if (Array.isArray(parsedCache) && parsedCache.length > 0) {
                setLotesUsuario(parsedCache);
            }
        }
    } catch (cacheErr) {
        console.error("Error leyendo caché de lotes", cacheErr);
    }

    // 2. ABORTO TEMPRANO SI NO HAY RED (Previene timeouts largos de Supabase)
    if (!isOnline) return;

    // 3. SINCRONIZACIÓN SILENCIOSA EN SEGUNDO PLANO
    try {
      const { data, error } = await supabase
        .from('lotes')
        .select('id, nombre, cultivos, coordenadas_poligono, predios!inner(id, nombre, estado)');
        
      if (error) throw error;
      if (data) {
          let lotesCompletos = [...data];
          try {
              const pendientesStr = await AsyncStorage.getItem('@lotes_pendientes');
              if (pendientesStr) {
                  const pendientes = JSON.parse(pendientesStr);
                  if (Array.isArray(pendientes) && pendientes.length > 0) {
                      lotesCompletos = [...data, ...pendientes];
                  }
              }
          } catch (e) { console.warn("Error leyendo pendientes:", e); }

          setLotesUsuario(lotesCompletos); 
          await AsyncStorage.setItem('@lotes_cache', JSON.stringify(lotesCompletos)); 
      }
    } catch (error) {
      console.warn("Fallo sincronización de lotes...", error.message);
    }
  };

  useEffect(() => {
      const controller = new AbortController();
      let isMounted = true;
      
      const fetchClimaLote = async () => {
          if (loteActivo?.coordenadas_poligono?.length > 0 && isOnline) {
              try {
                  const coord = loteActivo.coordenadas_poligono[0]; 
                  // Open-Meteo: Datos por cuadrícula de alta resolución (Microclimas exactos por lat/lon)
                  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lng}&daily=temperature_2m_max,temperature_2m_min&current=relative_humidity_2m&timezone=America/Mexico_City&forecast_days=1`;
                  
                  const response = await fetch(url, { signal: controller.signal });
                  const data = await response.json();
                  
                  if (response.ok && isMounted && data.daily) {
                      setClimaLoteActivo({
                          temp_max: data.daily.temperature_2m_max[0],
                          temp_min: data.daily.temperature_2m_min[0],
                          humedad_relativa: data.current.relative_humidity_2m
                      });
                  }
              } catch (error) {
                  if (error.name !== 'AbortError') console.log("Error obteniendo clima de cuadrícula:", error);
              }
          } else {
              if (isMounted) setClimaLoteActivo(null);
          }
      };

      fetchClimaLote();
      return () => { 
          isMounted = false; 
          controller.abort(); 
      };
  }, [loteActivo, isOnline]);
  
  useEffect(() => {
    cargarLotes();
  }, [isOnline]);

  useEffect(() => {
    registrarParaNotificacionesAsync().then(token => {
      if (token) {
        guardarTokenEnSupabase(token);
      }
    });
  
    const notifSub = Notifications.addNotificationReceivedListener(notification => {
      console.log("Notificación recibida en primer plano:", notification);
    });
  
    const respSub = Notifications.addNotificationResponseReceivedListener(response => {
      const pantallaDestino = response.notification.request.content.data?.pantalla;
      if (pantallaDestino) {
        navigation.navigate(pantallaDestino);
      }
    });
  
    SyncManager.iniciarListener();
  
    return () => {
      notifSub.remove();
      respSub.remove();
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
    let isMounted = true;
    
    // NUEVA FUNCIÓN: Identidad Anónima Silenciosa
    const iniciarSesionSilenciosa = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          await supabase.auth.signInAnonymously();
        }
      } catch (error) {
        console.warn("Fallo al generar identidad anónima:", error.message);
      }
    };

    const unsubscribeNet = NetInfo.addEventListener(state => {
        const online = !!(state.isConnected && state.isInternetReachable);
        if (isMounted) {
            setIsOnline(online);
            if (online) iniciarSesionSilenciosa(); // Ejecutamos al tener red
        }
    });


    cargarFavoritos();
    
    if (datosBasicos?.cultivos) {
        setListaCultivos(Object.keys(datosBasicos.cultivos).map(nombre => ({ nombre, ...datosBasicos.cultivos[nombre] })));
    }

    const sincronizar = async () => {
      try {
        const datosSupabase = await CultivoDataManager.obtenerListaCultivos();
        if (isMounted && Array.isArray(datosSupabase) && datosSupabase.length > 0) {
            setListaCultivos(datosSupabase);
        }
      } catch (error) {
          console.warn("Fallo sincronización silenciosa:", error.message);
      }
    };
    sincronizar();

    return () => {
        isMounted = false; // Corta la actualización de estados si el componente se desmonta
        unsubscribeNet();
    };
  }, []);

  useEffect(() => {
    const db = getDatabase(app);
    const dbRef = ref(db, 'cultivos'); 
    return onValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setDbCultivos(data);
    });
  }, []);

  const ultimoCalculoGDD = useRef(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
        const climaParaEvaluar = climaLoteActivo || climaActual; 
        if (climaParaEvaluar && loteActivo && cultivoActivo) {
            const hoyFirma = new Date().toISOString().split('T')[0];
            // Sello único que fuerza la evaluación diaria
            const firmaCalculo = `${loteActivo.id}-${cultivoActivo}-${climaParaEvaluar.temp_max}-${climaParaEvaluar.temp_min}-${hoyFirma}`;
            
            if (ultimoCalculoGDD.current !== firmaCalculo) {
                ultimoCalculoGDD.current = firmaCalculo;
                
                const configCultivo = dbCultivos?.[cultivoActivo] || datosBasicos?.cultivos?.[cultivoActivo] || {}; 
                // Aislamiento: Se genera un ID compuesto para que cada cultivo tenga su propio historial en AsyncStorage
                const cultivoParaGDD = { id: `${loteActivo.id}_${cultivoActivo}`, nombre: cultivoActivo, ...configCultivo };
                
                if (Object.keys(configCultivo).length > 0) {
                    calcularRiesgoGDD(cultivoParaGDD, climaParaEvaluar);
                }
            }
        }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [climaLoteActivo, climaActual, loteActivo, cultivoActivo, dbCultivos]);

 const cultivosFiltrados = React.useMemo(() => {
    if (busqueda.trim() === "") return [];
    const query = busqueda.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return listaCultivos.filter((cultivo) => {
      // FIX: Optional chaining en 'cultivo' previene TypeError si el array listaCultivos recibe un 'null' o 'undefined'
      const nombreNorm = (cultivo?.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return nombreNorm.includes(query);
    });
  }, [busqueda, listaCultivos]);

  const mostrarLista = cultivosFiltrados.length > 0;

  const cargarFavoritos = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem('@mis_cultivos');
      if (jsonValue != null) {
         try {
            const parsed = JSON.parse(jsonValue);
            setCultivosGuardados(Array.isArray(parsed) ? parsed : []);
         } catch {
            setCultivosGuardados([]);
         }
      }
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
    const { latitude, longitude } = e.nativeEvent.coordinate;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
       setNuevoLoteCoords(prev => [...prev, { latitude, longitude }]);
    }
  };

  const guardarNuevoLote = async () => {
    if (isSavingLote) return; 
    if (!nuevoLoteNombre.trim() || coordenadasValidas.length < 3) {
      Alert.alert("Incompleto", "Asigna un nombre y marca al menos 3 puntos válidos en el mapa.");
      return;
    }

    setIsSavingLote(true);
    let predioIdLocal = lotesUsuario?.length > 0 ? (lotesUsuario[0].predios?.id || lotesUsuario[0].predio_id) : null;

    try {
      if (!isOnline) throw { code: 'OFFLINE_MODE' };

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (!predioIdLocal) {
        const predioPayload = { nombre: 'Mi Parcela Principal', estado: 'ND' };
        if (userId) predioPayload.user_id = userId; // Inyección segura para RLS

        const { data: predioData, error: errP } = await supabase
          .from('predios')
          .insert([predioPayload])
          .select('id').single();
        if (errP) throw errP;
        predioIdLocal = predioData.id;
      }

      const arrCultivos = (nuevoLoteCultivos || '').split(',').map(c => c.trim()).filter(c => c.length > 0);
      const cultivosFinales = arrCultivos.length > 0 ? arrCultivos : ['General'];
      const coordsFormatoBD = coordenadasValidas.map(c => ({ lat: c.latitude, lng: c.longitude }));

      const lotePayload = {
        predio_id: predioIdLocal,
        nombre: nuevoLoteNombre.trim(),
        cultivos: cultivosFinales,
        coordenadas_poligono: coordsFormatoBD
      };
      if (userId) lotePayload.user_id = userId; // Inyección segura para RLS

      const { error: errLote } = await supabase
        .from('lotes')
        .insert([lotePayload]);

      if (errLote) throw errLote;

      Alert.alert("Éxito", "El lote fue registrado y trazado correctamente.");
      setMostrarMapaTrazador(false);
      setNuevoLoteCoords([]);
      setNuevoLoteNombre('');
      setNuevoLoteCultivos('');
      cargarLotes(); 

    } catch (e) {
      console.error("DEBUG - Error al guardar lote en la nube:", e);
      if (e.code === 'OFFLINE_MODE') {
        console.log('Guardando lote en caché local...');
        Alert.alert("Modo Sin Conexión", "El lote se guardó localmente. Se sincronizará en la nube automáticamente.");
        
        const arrCultivos = (nuevoLoteCultivos || '').split(',').map(c => c.trim()).filter(c => c.length > 0);
        const cultivosFinales = arrCultivos.length > 0 ? arrCultivos : ['General'];
        const coordsFormatoBD = coordenadasValidas.map(c => ({ lat: c.latitude, lng: c.longitude }));

        const lotePendiente = {
            id: `temp_lote_${Date.now()}`,
            predio_id: predioIdLocal || 'temp_predio_default', 
            nombre: nuevoLoteNombre.trim(),
            coordenadas_poligono: coordsFormatoBD,
            cultivos: cultivosFinales, 
            pendiente_sincronizacion: true,
            predios: { id: predioIdLocal || 'temp_predio_default', nombre: 'Mi Parcela Principal' }
        };

        try {
            const str = await AsyncStorage.getItem('@lotes_pendientes');
            let pendientes = str ? JSON.parse(str) : [];
            pendientes.push(lotePendiente);
            await AsyncStorage.setItem('@lotes_pendientes', JSON.stringify(pendientes));

            const cacheStr = await AsyncStorage.getItem('@lotes_cache');
            let cache = cacheStr ? JSON.parse(cacheStr) : [];
            cache.push(lotePendiente);
            await AsyncStorage.setItem('@lotes_cache', JSON.stringify(cache));
        } catch (storageErr) {}

        setLotesUsuario(prev => [...prev, lotePendiente]);
        setMostrarMapaTrazador(false);
        setNuevoLoteCoords([]);
        setNuevoLoteNombre('');
        setNuevoLoteCultivos('');
      } else {
        // 🚨 BLINDAJE: Ahora el desarrollador verá exactamente qué falló en Supabase.
        const msgError = e.message || e.details || e.hint || "Problema de permisos o conexión RLS.";
        Alert.alert("Error de Escritura", `No se guardó el lote.\nDetalle: ${msgError}`);
      }
    } finally {
      setIsSavingLote(false);
    }
  };

  const eliminarLote = (idLote, nombreLote) => {
    Alert.alert(
      "Eliminar Lote",
      `¿Estás seguro de que deseas eliminar "${nombreLote}"? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Eliminar", 
          style: "destructive", 
          onPress: async () => {
            try {
              if (!isOnline) {
                Alert.alert("Aviso", "Necesitas conexión a internet para eliminar un lote de la nube.");
                return;
              }
              // 1. Borrar de Supabase
              const { error } = await supabase
                .from('lotes')
                .delete()
                .eq('id', idLote);

              if (error) throw error;

              // 2. Actualizar estado y caché local
              const nuevosLotes = lotesUsuario.filter(l => l.id !== idLote);
              setLotesUsuario(nuevosLotes);
              await AsyncStorage.setItem('@lotes_cache', JSON.stringify(nuevosLotes));
              
              // 3. Limpiar lote activo si era el que estábamos viendo
              if (loteActivo?.id === idLote) {
                setLoteActivo(null);
                setCultivoActivo(null);
                setAlertasGDD([]);
              }

              Alert.alert("Éxito", "Lote eliminado correctamente.");
            } catch (error) {
              Alert.alert("Error", "No se pudo eliminar el lote: " + error.message);
            }
          } 
        }
      ]
    );
  };

  async function calcularRiesgoGDD(cultivo, clima) {
    if (clima?.temp_max == null || clima?.temp_min == null) return;
    setLoadingGDD(true);
    try {
        const storageKey = `@gdd_historial_${cultivo.id}`;
        const historialStr = await AsyncStorage.getItem(storageKey);
        let historial = historialStr ? JSON.parse(historialStr) : [];
        if (!Array.isArray(historial)) historial = [];
        const d = new Date();
        const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        const humedad = clima.humedad_relativa || clima.humedad || clima.humidity || 50;

        const nuevoDato = { 
            fecha: hoy, 
            tmax: parseFloat(clima.temp_max), 
            tmin: parseFloat(clima.temp_min),
            humedad_relativa: parseFloat(humedad)
        };
        const idx = historial.findIndex(d => d.fecha === hoy);
        if (idx !== -1) {
            historial[idx] = {
                fecha: hoy,
                tmax: Math.max(historial[idx].tmax, parseFloat(clima.temp_max)),
                tmin: Math.min(historial[idx].tmin, parseFloat(clima.temp_min)),
                humedad_relativa: parseFloat(humedad)
            };
        } else {
            historial.push({ 
                fecha: hoy, 
                tmax: parseFloat(clima.temp_max), 
                tmin: parseFloat(clima.temp_min),
                humedad_relativa: parseFloat(humedad)
            });
        }
        
        await AsyncStorage.setItem(storageKey, JSON.stringify(historial.slice(-730)));
        
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
  }

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
                
                const d = new Date();
                const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                resetDates[nombrePlaga] = hoy;
                
                await AsyncStorage.setItem(storageKey, JSON.stringify(resetDates));
                
                const configCultivo = dbCultivos?.[cultivoActivo] || datosBasicos?.cultivos?.[cultivoActivo] || {};
                const cultivoParaGDD = { id: loteActivo.id, nombre: cultivoActivo, ...configCultivo };
                if (climaActual) calcularRiesgoGDD(cultivoParaGDD, climaActual);
            } catch (error) { 
                console.error("Error al reiniciar plaga individual:", error); 
            }
        }}
    ]);
  };

  const buscarUbicacionMapa = async () => {
    if (!isOnline) {
      Alert.alert("Modo Offline", "La búsqueda requiere internet. Ubica tu parcela deslizando el mapa manualmente.");
      return;
    }
    if (!searchQuery.trim()) return;
    setIsSearchingMap(true);
    
    try {
      // Photon Komoot: Motor ElasticSearch sobre OSM, ideal para localizar ejidos y localidades pequeñas en México.
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&lat=23.6345&lon=-102.5528&limit=1`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data && data.features && data.features.length > 0) {
        const [lon, lat] = data.features[0].geometry.coordinates; // El estándar GeoJSON devuelve [lon, lat]
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: lat,
            longitude: lon,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }, 1000);
        }
      } else {
        Alert.alert("Localidad no encontrada", "Intenta buscar un municipio cercano más grande, o desliza el mapa manualmente hacia tu parcela.");
      }
    } catch (error) {
      Alert.alert("Error de red", "No se pudo conectar al geocodificador.");
    } finally {
      setIsSearchingMap(false);
    }
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
      try {
          const photo = await cameraRef.current.takePhoto({ flash: 'off' });
          setImage(`file://${photo.path}`); 
      } catch (error) {
          Alert.alert("Aviso", "No se pudo acceder al hardware de la cámara. Intenta nuevamente.");
      }
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

          {mostrarLista && (
             <View style={{ marginBottom: 15 }}>
                {cultivosFiltrados.slice(0, 8).map((item, index) => (
                    <React.Fragment key={item.nombre || index}>
                        {renderCultivo({ item })}
                    </React.Fragment>
                ))}
                {cultivosFiltrados.length > 8 && (
                    <Text style={{textAlign: 'center', color: '#78909C', marginTop: 10, fontSize: 12}}>
                        Mostrando 8 resultados. Refina tu búsqueda para ver más.
                    </Text>
                )}
             </View>
          )}

          <View style={styles.quickAccessContainer}>
             <Text style={[styles.sectionTitleFav, {paddingHorizontal: 24}]}>Herramientas de Campo</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAccessScroll}>
                {HERRAMIENTAS_CAMPO.map((item, idx) => (
                  <TouchableOpacity key={idx} style={styles.quickBtn} onPress={() => navigation.navigate(item.n, { 
                      cultivo: cultivoActivo || "General", 
                      lote_id: loteActivo?.id,
                      coords_offline: loteActivo?.coordenadas_poligono 
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

                    {loteActivo && cultivoActivo && alertasGDD.map((alerta) => (
                        <TouchableOpacity key={alerta.id} style={styles.gddCard} onPress={() => setExpandedGddId(expandedGddId === alerta.id ? null : alerta.id)}>
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
    

    
      {mostrarMapaTrazador && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFF', zIndex: 1000, elevation: 10 }]}>
             <View style={[styles.headerRow, {backgroundColor: '#1b4332', padding: 15, marginBottom: 0, paddingTop: Platform.OS === 'android' ? 40 : 15}]}>
                 <Text style={{color: 'white', fontSize: 18, fontWeight: 'bold'}}>Trazar Nuevo Lote</Text>
                 <TouchableOpacity onPress={() => {
                     setMostrarMapaTrazador(false);
                     setNuevoLoteCoords([]);
                     setNuevoLoteNombre('');
                     setNuevoLoteCultivos('');
                     setSearchQuery(''); // Limpiamos la búsqueda al salir
                 }}>
                     <Ionicons name="close" size={28} color="white" />
                 </TouchableOpacity>
             </View>
             
             <View style={{padding: 20, backgroundColor: '#FFFFFF', elevation: 6, zIndex: 10, borderBottomWidth: 3, borderBottomColor: '#2d6a4f'}}>
                 <Text style={{fontSize: 16, fontWeight: 'bold', color: '#1b4332', marginBottom: 8}}>📍 Identificador del Lote</Text>
                 <TextInput 
                     style={{backgroundColor: '#F8F9FA', padding: 16, borderRadius: 10, fontSize: 18, color: '#000000', marginBottom: 15, borderWidth: 1, borderColor: '#90A4AE'}} 
                     placeholder="Ej. Parcela Norte" 
                     placeholderTextColor="#546E7A"
                     value={nuevoLoteNombre} 
                     onChangeText={setNuevoLoteNombre} 
                 />
                 <Text style={{fontSize: 16, fontWeight: 'bold', color: '#1b4332', marginBottom: 8}}>🌱 Cultivos Establecidos</Text>
                 <TextInput 
                     style={{backgroundColor: '#F8F9FA', padding: 16, borderRadius: 10, fontSize: 18, color: '#000000', borderWidth: 1, borderColor: '#90A4AE'}} 
                     placeholder="Ej. Maíz, Frijol" 
                     placeholderTextColor="#546E7A"
                     value={nuevoLoteCultivos} 
                     onChangeText={setNuevoLoteCultivos} 
                 />
                 <Text style={{fontSize: 14, color: '#E65100', marginTop: 12, fontWeight: 'bold', textAlign: 'center'}}>
                     👆 Toca el mapa para agregar los vértices.
                 </Text>
             </View>

             <View style={{ flex: 1, backgroundColor: '#E0E0E0', overflow: 'hidden' }}>
                  
                  {/* --- CONTENEDOR DE BÚSQUEDA FLOTANTE (Komoot) --- */}
                  <View style={{ position: 'absolute', top: 10, left: 15, right: 15, zIndex: 10, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, elevation: 5, shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: {width: 0, height: 2}, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ECEFF1' }}>
                      <Ionicons name="search" size={20} color="#2d6a4f" />
                      <TextInput
                          style={{ flex: 1, height: 48, paddingHorizontal: 12, fontSize: 15, color: '#263238' }}
                          placeholder="Buscar ciudad o municipio..."
                          placeholderTextColor="#90A4AE"
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          onSubmitEditing={buscarUbicacionMapa}
                          returnKeyType="search"
                      />
                      <TouchableOpacity onPress={buscarUbicacionMapa} disabled={isSearchingMap} style={{ padding: 8 }}>
                          {isSearchingMap ? <ActivityIndicator size="small" color="#2d6a4f" /> : <Text style={{ color: '#2d6a4f', fontWeight: 'bold' }}>Ir</Text>}
                      </TouchableOpacity>
                  </View>

                  {/* --- NUEVO: BOTÓN FLOTANTE GPS (OFFLINE) --- */}
                  <TouchableOpacity 
                      style={{ position: 'absolute', bottom: 20, right: 15, zIndex: 10, backgroundColor: '#FFF', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: {width: 0, height: 3} }}
                      onPress={centrarEnUbicacionActual}
                      disabled={isLocating}
                  >
                      {isLocating ? (
                          <ActivityIndicator size="small" color="#2d6a4f" />
                      ) : (
                          <MaterialCommunityIcons name="crosshairs-gps" size={26} color="#2E7D32" />
                      )}
                  </TouchableOpacity>

                  <MapView
                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    style={StyleSheet.absoluteFillObject}
                    mapType="hybrid"
                    initialRegion={{
                      latitude: 23.6345,
                      longitude: -102.5528,
                      latitudeDelta: 15.0, 
                      longitudeDelta: 15.0,
                    }}
                    onPress={handleMapPress}
                  >
                    {coordenadasValidas.length >= 3 && (
                      <Polygon
                        coordinates={coordenadasValidas}
                        strokeColor="#FFF"
                        strokeWidth={2}
                        fillColor="rgba(46,125,50,0.5)"
                      />
                    )}
                    {coordenadasValidas.map((c, i) => (
                      <Marker key={`vertice-${i}`} coordinate={c} pinColor="#2E7D32" />
                    ))}
                  </MapView>
              </View>

             <View style={{flexDirection: 'row', padding: 15, backgroundColor: '#FFF', justifyContent: 'space-between', alignItems: 'center'}}>
                 <TouchableOpacity 
                     style={{flex: 1, marginRight: 10, padding: 14, borderWidth: 1, borderColor: '#c32f27', borderRadius: 10, justifyContent: 'center'}} 
                     onPress={() => setNuevoLoteCoords(prev => Array.isArray(prev) ? prev.slice(0, -1) : [])} 
                 >
                     <Text style={{color: '#c32f27', textAlign: 'center', fontWeight: 'bold'}}>Deshacer Punto</Text>
                 </TouchableOpacity>
                 <TouchableOpacity 
                     style={[styles.btnAction, {flex: 2, borderRadius: 10, marginBottom: 0, opacity: isSavingLote ? 0.7 : 1}]} 
                     onPress={guardarNuevoLote}
                     disabled={isSavingLote}
                 >
                     {isSavingLote ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.btnText}>Guardar Geometría</Text>}
                 </TouchableOpacity>
             </View>
        </View>
      )}

      <Modal 
         visible={modalCameraVisible} 
         animationType="slide"
         onRequestClose={() => {
            setModalCameraVisible(false); 
            setImage(null); 
            setPrediction(null); 
        }}
      >
         <View style={{flex: 1, backgroundColor: 'black'}}>
             <View style={styles.cameraHeader}>
                 <TouchableOpacity onPress={() => {
                     setModalCameraVisible(false); 
                     setImage(null); 
                     setPrediction(null);
                 }}>
                     <Ionicons name="close" size={30} color="white" />
                 </TouchableOpacity>
                 <Text style={{color:'white', fontWeight:'bold', fontSize: 18}}>Scanner Fitosanitario</Text>
                 <View style={{width:40}}/>
             </View>
             {image ? (
                 <ScrollView contentContainerStyle={{alignItems:'center', padding:20}}>
                    <Image source={{ uri: image }} style={styles.previewImage} />
                    <TouchableOpacity 
                        style={[styles.btnAction, { opacity: loadingIA ? 0.6 : 1 }]} 
                        onPress={() => !loadingIA && classifyImage(image)} // FIX: Prevenir doble toque mientras carga
                        disabled={loadingIA}
                    >
                        {loadingIA ? <ActivityIndicator color="white"/> : <Text style={styles.btnText}>🔍 Iniciar Análisis</Text>}
                    </TouchableOpacity>
                    {prediction && !loadingIA && (
                        <View style={{width:'100%', marginTop:20}}>
                            <TreatmentCard predictionClass={prediction.label} />
                            <TouchableOpacity style={[styles.btnAction, {backgroundColor:'#1565C0', marginTop:15}]} onPress={() => Alert.alert("Registro", "Diagnóstico guardado en bitácora.")}>
                                <Text style={styles.btnText}>✅ Guardar Resultado</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <TouchableOpacity 
                        style={{marginTop:25}} 
                        onPress={() => {
                            if (!loadingIA) {
                                setImage(null); 
                                setPrediction(null);
                            }
                        }}
                    >
                        <Text style={{color: loadingIA ? 'gray' : 'white', fontSize: 16}}>
                            {loadingIA ? 'Analizando...' : 'Capturar otra vez'}
                        </Text>
                    </TouchableOpacity>
                 </ScrollView>
             ) : (
                 <View style={{flex:1}}>
                    {device && hasPermission && (
                        <Camera 
                            style={StyleSheet.absoluteFill} 
                            device={device} 
                            isActive={appState === 'active' && modalCameraVisible} 
                            ref={cameraRef} 
                            photo={true} 
                        />
                    )}
                    <View style={styles.cameraFooter}>
                       <TouchableOpacity style={styles.captureOuter} onPress={takePicture}>
                           <View style={styles.captureInner}/>
                       </TouchableOpacity>
                    </View>
                 </View>
             )}
         </View>
      </Modal>

      {showCropSelector && (
         <View style={[StyleSheet.absoluteFillObject, { zIndex: 1000, elevation: 10 }]}>
             <View style={styles.modalOverlay}>
                 <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>1. Seleccionar Lote</Text>
                    <FlatList 
                        data={lotesUsuario}
                        keyExtractor={(item, index) => item?.id?.toString() || `lote-temp-${index}`}
                        style={{ maxHeight: 150 }}
                        renderItem={({item}) => (
                            <View style={[styles.modalItem, loteActivo?.id === item.id && { backgroundColor: '#E8F5E9' }]}>
                                <TouchableOpacity style={{ flex: 1 }} onPress={() => setLoteActivo(item)}>
                                    <Text style={styles.modalItemText}>{item.predios?.nombre} - {item.nombre}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => eliminarLote(item.id, item.nombre)}>
                                    <Ionicons name="trash-outline" size={22} color="#c32f27" />
                                </TouchableOpacity>
                            </View>
                        )}
                        ListEmptyComponent={<Text style={{textAlign: 'center', color: '#78909C', marginVertical: 10}}>No tiene lotes registrados.</Text>}
                    />
                    
                    {/* BOTÓN EXTRAÍDO DEL RENDERITEM (AHORA ESTÁ ESTÁTICO) */}
                    <TouchableOpacity 
                        onPress={() => {
                           setShowCropSelector(false);
                           setMostrarMapaTrazador(true);
                        }}
                        style={[styles.btnAction, {backgroundColor: '#2E7D32', width: '100%', marginVertical: 10, alignSelf: 'center', borderRadius: 12}]}
                    >
                        <Text style={styles.btnText}>+ Trazar Nuevo Lote en Mapa</Text>
                    </TouchableOpacity>
                    
                    {loteActivo && (
                        <>
                            <Text style={[styles.modalTitle, { marginTop: 15, fontSize: 15 }]}>2. Seleccionar Cultivo</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                                {(loteActivo.cultivos || []).map(c => (
                                    <TouchableOpacity 
                                        key={c} 
                                        style={{ padding: 8, margin: 4, borderRadius: 8, backgroundColor: cultivoActivo === c ? '#FFCA28' : '#ECEFF1' }}
                                        onPress={() => setCultivoActivo(c)}>
                                        <Text style={{ color: '#1B5E20', fontWeight: 'bold' }}>{c}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TextInput 
                                style={{ backgroundColor: '#F8F9FA', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#90A4AE', marginBottom: 10 }}
                                placeholder="Escribir variedad u otro cultivo..."
                                onSubmitEditing={(e) => {
                                    const val = e.nativeEvent.text.trim();
                                    if(val) setCultivoActivo(val);
                                }}
                            />
                        </>
                    )}

                    <TouchableOpacity onPress={() => setShowCropSelector(false)} style={[styles.btnAction, {backgroundColor: '#1b4332', width: '100%', marginBottom: 10, alignSelf: 'center'}]}>
                        <Text style={styles.btnText}>Aceptar / Cerrar</Text>
                    </TouchableOpacity>
                 </View>
             </View>
         </View>
      )}

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