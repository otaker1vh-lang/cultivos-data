import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ScrollView, Switch,
  ActivityIndicator, TextInput, TouchableOpacity,
  Alert, StatusBar, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initializeApp, getApps, getApp } from 'firebase/app';
// OPTIMIZACIÓN: Importamos query, limitToLast y orderByKey para ahorrar datos
import { getDatabase, ref, onValue, update, query, limitToLast, orderByKey } from 'firebase/database';
import * as Notifications from 'expo-notifications';
import { LineChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/* ---------------- PUSH HANDLER ---------------- */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/* ---------------- FIREBASE ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyBQ9eIxrMB-XhmqGA0fzyBH2NrIQjvjJ2g",
  databaseURL: "https://agrocontrol-fd75d-default-rtdb.firebaseio.com",
  projectId: "agrocontrol-fd75d",
};

let app;
const appName = 'AgroControlApp';
const existingApp = getApps().find(a => a.name === appName);

if (existingApp) {
  app = getApp(appName);
} else {
  app = initializeApp(firebaseConfig, appName);
}

const db = getDatabase(app);

const MAX_DELAY = 15000; // Tiempo para considerar "Offline"
const CMD_TIMEOUT = 5000;

/* ---------------- DISPOSITIVOS DISPONIBLES ---------------- */
const DISPOSITIVOS = [
  {
    id: 'esp32_germinacion',
    nombre: 'Germinación',
    icono: 'sprout',
    color: '#4CAF50',
    descripcion: 'Control de riego y temperatura'
  },
  {
    id: 'esp32_esquejes',
    nombre: 'Esquejes',
    icono: 'water',
    color: '#2196F3',
    descripcion: 'Nebulización y humedad'
  },
  {
    id: 'esp32_hidroponico',
    nombre: 'Hidropónico',
    icono: 'flower',
    color: '#FF9800',
    descripcion: 'Sistema NFT/DWC'
  }
];

export default function AgroControlScreen() {
  // ============= SELECTOR DE DISPOSITIVO =============
  const [deviceId, setDeviceId] = useState('esp32_esquejes');
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);

  // ============= ESTADOS SENSORES =============
  const [temp, setTemp] = useState(0);
  const [hum, setHum] = useState(0);
  const [humedadSuelo, setHumedadSuelo] = useState(0);
  const [tempAgua, setTempAgua] = useState(0);
  const [nivelAgua, setNivelAgua] = useState(true);
  const [ph, setPh] = useState(7.0);
  
  const watchdogRef = useRef(null);

  // ============= ESTADOS RELÉS/BOMBAS =============
  const [bombaEstado, setBombaEstado] = useState(false);
  const [loadingBomba, setLoadingBomba] = useState(false);
  const [inputTimerBomba, setInputTimerBomba] = useState('');
  const [unitBomba, setUnitBomba] = useState('min');
  const [countdownBomba, setCountdownBomba] = useState(0);

  const [ventEstado, setVentEstado] = useState(false);
  const [loadingVent, setLoadingVent] = useState(false);

  // ============= CONTROL DE CICLOS =============
  const [cicloON, setCicloON] = useState('10');
  const [cicloOFF, setCicloOFF] = useState('30');
  const [cicloHabilitado, setCicloHabilitado] = useState(true);
  const [modoManual, setModoManual] = useState(false);

  // ============= CONFIGURACIÓN =============
  const [cfgTempMax, setCfgTempMax] = useState('');
  const [cfgTempMin, setCfgTempMin] = useState('');
  const [cfgHumMin, setCfgHumMin] = useState('');
  const [cfgSoilMin, setCfgSoilMin] = useState('');

  // ============= CONEXIÓN Y GRÁFICA =============
  const [conectado, setConectado] = useState(false);
  const lastCmdTsRef = useRef(null);
  const [histHora, setHistHora] = useState({});

  const pendingTimerBomba = useRef(0);

  /* ---------------- PERMISOS ---------------- */
  useEffect(() => {
    Notifications.requestPermissionsAsync();
  }, []);

  /* ---------------- LISTENERS FIREBASE ---------------- */
  useEffect(() => {
    const base = `/${deviceId}`;
    setConectado(false); // Reset al cambiar dispositivo

    // 1. Sensores (Tiempo Real)
    const u1 = onValue(ref(db, base + '/sensores'), snap => {
      const d = snap.val();
      if (d) {
        setTemp(Math.round(d.temperatura ?? 0));
        setHum(Math.round(d.humedad ?? 0));
        
        // Sensor específico según dispositivo
        if (deviceId === 'esp32_esquejes' || deviceId === 'esp32_germinacion') {
          setHumedadSuelo(Math.round(d.humedad_suelo ?? 0));
          
          if (d.humedad_suelo < 30) {
            enviarAlerta('💧 Sustrato Seco', `Humedad: ${d.humedad_suelo}%`);
          }
        }
        
        if (deviceId === 'esp32_hidroponico') {
          // El ESP32 envía 'ph' y 'humedad_suelo' (que usaremos como nivel de agua)
          setPh(d.ph ?? 7.0);
          setNivelAgua((d.humedad_suelo ?? 0) > 20); // Asumimos que menos de 20% es nivel bajo
          
          if ((d.humedad_suelo ?? 0) < 20) {
            enviarAlerta('⚠️ Nivel Bajo', 'Verificar depósito de agua');
          }
          if (d.ph < 5.5 || d.ph > 6.5) {
            enviarAlerta('🧪 Alerta de pH', `El pH está fuera de rango: ${d.ph}`);
          }
        }
        
        if (d.temperatura > 35) {
          enviarAlerta('🌡️ Temperatura Alta', `${d.temperatura}°C detectada`);
        }
        
        // WATCHDOG: Lógica para saber si está online
        // Si recibimos datos, está conectado.
        setConectado(true);
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        // Si no recibimos nada nuevo en 15s (MAX_DELAY), marcamos offline.
        watchdogRef.current = setTimeout(() => setConectado(false), MAX_DELAY);
      }
    });

    // 2. Estado
    const u2 = onValue(ref(db, base + '/estado'), snap => {
      const d = snap.val();
      if (!d) return;

      if (deviceId === 'esp32_esquejes') {
        setBombaEstado(!!d.r1);
        setVentEstado(!!d.r2);
        //setModoManual(!!d.modo_manual);
        //setCicloHabilitado(!!d.ciclo_activo);
      } else if (deviceId === 'esp32_germinacion') {
        setBombaEstado(!!d.r1);
        //setModoManual(!d.auto_mode);
      } else if (deviceId === 'esp32_hidroponico') {
        setBombaEstado(!!d.bomba);
        //setModoManual(!d.auto_mode);
      }

      //if (lastCmdTsRef.current && d.ts >= lastCmdTsRef.current) {
      setLoadingBomba(false);
      setLoadingVent(false);
      lastCmdTsRef.current = null;

      if (pendingTimerBomba.current > 0) {
        setCountdownBomba(pendingTimerBomba.current);
        pendingTimerBomba.current = 0;
      }
    });

    // 3. Config
    const u3 = onValue(ref(db, base + '/config'), snap => {
      const d = snap.val();
      if (d) {
        if (d.temp_max) setCfgTempMax(d.temp_max.toString());
        if (d.temp_min) setCfgTempMin(d.temp_min.toString());
        if (d.hum_min) setCfgHumMin(d.hum_min.toString());
        if (d.soil_moisture_min) setCfgSoilMin(d.soil_moisture_min.toString());
        
        if (deviceId === 'esp32_esquejes') {
          if (d.ciclo_on_ms) setCicloON((d.ciclo_on_ms / 1000).toString());
          if (d.ciclo_off_ms) setCicloOFF((d.ciclo_off_ms / 60000).toString());
          if (d.ciclo_habilitado !== undefined) setCicloHabilitado(d.ciclo_habilitado);
        }
      }
    });

    // 4. Histórico OPTIMIZADO: Solo traer las últimas 24 horas
    // Esto reduce el consumo de datos enormemente.
    const statsQuery = query(
        ref(db, base + '/estadisticas'), 
        orderByKey(), 
        limitToLast(24)
    );
    const u4 = onValue(statsQuery, s => setHistHora(s.val() || {}));

    return () => {
      u1();
      u2();
      u3();
      u4();
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, [deviceId]);

  /* ---------------- CONTADORES LOCALES ---------------- */
  useEffect(() => {
    const i = setInterval(() => {
      setCountdownBomba(v => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  /* ---------------- ALERTAS PUSH ---------------- */
  const enviarAlerta = async (titulo, mensaje) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: titulo,
        body: mensaje,
        sound: true,
      },
      trigger: null,
    });
  };

  /* ---------------- COMANDOS ---------------- */
  const enviarComando = (payload, setLoading) => {
    if (!conectado) {
      Alert.alert('Sin Conexión', 'El dispositivo no está reportando datos.');
      return;
    }
    const cmdTs = Date.now();
    lastCmdTsRef.current = cmdTs;
    if (setLoading) setLoading(true);

    // Extraer la llave del comando (ej. 'r1', 'bomba')
    let cmdKey = Object.keys(payload)[0]; 
    let cmdValue = payload[cmdKey];
    
    // FORZAR EL ENVÍO SIEMPRE AL GATEWAY (MAESTRO)
    let targetPath = `/esp32_esquejes/comandos`; 
    let finalPayload = { cmdTs: cmdTs };

    // Asignar llaves específicas para que el Gateway sepa a quién reenviar
    if (deviceId === 'esp32_esquejes') {
      finalPayload[cmdKey] = cmdValue; 
    } else if (deviceId === 'esp32_germinacion') {
      if (cmdKey === 'r1') finalPayload['germ_r1'] = cmdValue;
    } else if (deviceId === 'esp32_hidroponico') {
      if (cmdKey === 'bomba') finalPayload['hidro_bomba'] = cmdValue;
    }

    update(ref(db, targetPath), finalPayload)
      .catch(e => {
        if (setLoading) setLoading(false);
        Alert.alert("Error Firebase", e.message);
      });

    setTimeout(() => {
      if (setLoading) setLoading(prev => {
        if (prev) {
          Alert.alert("Aviso", "El dispositivo tardó en confirmar.");
          pendingTimerBomba.current = 0;
        }
        return false;
      });
    }, CMD_TIMEOUT);
  };

  const toggleBomba = () => {
    const comando = (deviceId === 'esp32_hidroponico') ? 'bomba' : 'r1';
    enviarComando({ [comando]: !bombaEstado }, setLoadingBomba);
  };

  const toggleVent = () => {
  const comando = deviceId === 'esp32_esquejes' ? 'r2' : 'aux'; // Cambiado a r2
    enviarComando({ [comando]: !ventEstado }, setLoadingVent);
  };

  const timerBomba = () => {
   const val = parseInt(inputTimerBomba);
   if (isNaN(val) || val <= 0) {
     Alert.alert("Error", "Ingresa un valor válido");
     return;
   }
   const secs = unitBomba === 'min' ? val * 60 : val;
   pendingTimerBomba.current = secs;

   const comando = (deviceId === 'esp32_hidroponico') ? 'bomba' : 'r1';
   enviarComando({ [comando]: true }, setLoadingBomba);
  };

  const cancelarTimerBomba = () => {
    setCountdownBomba(0);
    const comando = (deviceId === 'esp32_hidroponico') ? 'bomba' : 'r1';
    enviarComando({ [comando]: false }, setLoadingBomba);
  };

  const toggleModoAuto = () => {
    if (deviceId === 'esp32_esquejes') {
      enviarComando({ modo_manual: !modoManual });
    } else {
      enviarComando({ auto_mode: modoManual }); 
    }
  };

  /* ---------------- CONFIGURACIÓN ---------------- */
  const guardarConfig = () => {
    const cfg = {};
    if (cfgTempMax && !isNaN(parseFloat(cfgTempMax))) cfg.temp_max = parseFloat(cfgTempMax);
    if (cfgTempMin && !isNaN(parseFloat(cfgTempMin))) cfg.temp_min = parseFloat(cfgTempMin);
    if (cfgHumMin && !isNaN(parseFloat(cfgHumMin))) cfg.hum_min = parseFloat(cfgHumMin);
    if (cfgSoilMin && !isNaN(parseInt(cfgSoilMin))) cfg.soil_moisture_min = parseInt(cfgSoilMin);

    if (Object.keys(cfg).length === 0) {
        Alert.alert("Error", "Ingresa valores numéricos válidos");
        return;
    }

    update(ref(db, `/${deviceId}/config`), cfg)
      .then(() => Alert.alert("✓", "Configuración guardada"))
      .catch(e => Alert.alert("Error", e.message));
  };

  const guardarCiclo = () => {
    const onVal = parseInt(cicloON);
    const offVal = parseInt(cicloOFF);

    if (isNaN(onVal) || isNaN(offVal)) {
        Alert.alert("Error", "Tiempos de ciclo inválidos");
        return;
    }

    const onMs = onVal * 1000;
    const offMs = offVal * 60000;

    update(ref(db, `/${deviceId}/config`), {
      ciclo_on_ms: onMs,
      ciclo_off_ms: offMs,
      ciclo_habilitado: cicloHabilitado
    })
      .then(() => Alert.alert("✓", "Ciclo configurado"))
      .catch(e => Alert.alert("Error", e.message));
  };

  /* ---------------- GRÁFICA ---------------- */
  const chartData = React.useMemo(() => {
    // Ordenar cronológicamente las claves (timestamps/fechas)
    const entries = Object.entries(histHora)
        .sort((a, b) => a[0].localeCompare(b[0]));
    
    // Si no hay suficientes datos para una línea, retornamos null
    if (entries.length < 2) return null;
    
    return {
      // Tomamos solo los últimos 6 puntos para que se vea bien en el ancho del celular
      labels: entries.slice(-6).map(([k]) => k.slice(-2) + 'h'),
      datasets: [{ 
          data: entries.slice(-6).map(([, v]) => v.temp_promedio ?? v.temp ?? 0) 
      }]
    };
  }, [histHora]);

  /* ---------------- OBTENER INFO DEL DISPOSITIVO ACTUAL ---------------- */
  const dispositivoActual = DISPOSITIVOS.find(d => d.id === deviceId);
  const nombreBomba = deviceId === 'esp32_esquejes' ? 'Nebulización' :
                      deviceId === 'esp32_hidroponico' ? 'Bomba NFT' : 'Riego';
  const iconoBomba = deviceId === 'esp32_esquejes' ? 'water' :
                     deviceId === 'esp32_hidroponico' ? 'pump' : 'sprinkler';

  /* ---------------- RENDER ---------------- */
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* HEADER CON SELECTOR Y ESTADO ONLINE/OFFLINE */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.deviceSelector}
          onPress={() => setShowDeviceSelector(!showDeviceSelector)}
        >
          <MaterialCommunityIcons 
            name={dispositivoActual?.icono || 'apps'} 
            size={24} 
            color={dispositivoActual?.color || '#333'} 
          />
          <View style={{marginLeft: 10}}>
            <Text style={styles.title}>{dispositivoActual?.nombre || 'Dispositivo'}</Text>
            <Text style={styles.subtitle}>{dispositivoActual?.descripcion}</Text>
          </View>
          <MaterialCommunityIcons 
            name={showDeviceSelector ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#666" 
          />
        </TouchableOpacity>
        
        {/* INDICADOR DE CONEXIÓN */}
        <View style={[
          styles.badge,
          { borderColor: conectado ? '#4CAF50' : '#F44336' }
        ]}>
          <View style={[
            styles.statusDot,
            { backgroundColor: conectado ? '#4CAF50' : '#F44336' }
          ]} />
          <Text style={{ fontSize: 11, color: conectado ? '#4CAF50' : '#F44336', fontWeight:'bold' }}>
            {conectado ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      {/* LISTA DESPLEGABLE DE DISPOSITIVOS */}
      {showDeviceSelector && (
        <View style={styles.deviceList}>
          {DISPOSITIVOS.map(disp => (
            <TouchableOpacity
              key={disp.id}
              style={[
                styles.deviceItem,
                deviceId === disp.id && { backgroundColor: '#F0F2F5' }
              ]}
              onPress={() => {
                setDeviceId(disp.id);
                setShowDeviceSelector(false);
              }}
            >
              <MaterialCommunityIcons name={disp.icono} size={28} color={disp.color} />
              <View style={{marginLeft: 12, flex: 1}}>
                <Text style={styles.deviceName}>{disp.nombre}</Text>
                <Text style={styles.deviceDesc}>{disp.descripcion}</Text>
              </View>
              {deviceId === disp.id && (
                <MaterialCommunityIcons name="check-circle" size={20} color={disp.color} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* SENSORES */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Clima Tiempo Real</Text>
          <View style={styles.rowCenter}>
            <View style={styles.metric}>
              <MaterialCommunityIcons 
                name="thermometer" 
                size={30} 
                color={temp > 35 ? "#D32F2F" : "#2E7D32"} 
              />
              <Text style={styles.val}>{temp}°C</Text>
              <Text style={styles.lbl}>Temp</Text>
            </View>
            
            <View style={styles.separator} />
            
            <View style={styles.metric}>
              <MaterialCommunityIcons 
                name="water-percent" 
                size={30} 
                color={hum < 40 ? "#D32F2F" : "#1976D2"} 
              />
              <Text style={styles.val}>{hum}%</Text>
              <Text style={styles.lbl}>Humedad</Text>
            </View>
            
            {(deviceId === 'esp32_esquejes' || deviceId === 'esp32_germinacion') && (
              <>
                <View style={styles.separator} />
                <View style={styles.metric}>
                  <MaterialCommunityIcons 
                    name="watering-can" 
                    size={30} 
                    color={humedadSuelo < 40 ? "#D32F2F" : "#2E7D32"} 
                  />
                  <Text style={styles.val}>{humedadSuelo}%</Text>
                  <Text style={styles.lbl}>Sustrato</Text>
                </View>
              </>
            )}
            
            {deviceId === 'esp32_hidroponico' && (
              <>
                <View style={styles.separator} />
                <View style={styles.metric}>
                  <MaterialCommunityIcons 
                    name="flask" // Ícono de matraz para pH
                    size={30} 
                    color={(ph < 5.5 || ph > 6.5) ? "#D32F2F" : "#9C27B0"} 
                  />
                  <Text style={styles.val}>{ph.toFixed(1)}</Text>
                  <Text style={styles.lbl}>Nivel pH</Text>
                </View>
                <View style={styles.separator} />
                <View style={styles.metric}>
                  <MaterialCommunityIcons 
                    name={nivelAgua ? "water" : "water-off"} 
                    size={30} 
                    color={nivelAgua ? "#1976D2" : "#D32F2F"} 
                  />
                  <Text style={[styles.val, {fontSize: 14}]}>
                    {nivelAgua ? 'OK' : 'BAJO'}
                  </Text>
                  <Text style={styles.lbl}>Nivel</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* CICLOS AUTOMÁTICOS (Solo Esquejes) */}
        {deviceId === 'esp32_esquejes' && (
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#2196F3' }]}>
            <Text style={styles.cardTitle}>⏱️ Ciclo Automático de Nebulización</Text>
            <View style={styles.rowSpace}>
              <View style={styles.cfgItem}>
                <Text style={styles.lbl}>ON (seg)</Text>
                <TextInput 
                  style={styles.inpCfg} 
                  value={cicloON} 
                  onChangeText={setCicloON} 
                  keyboardType="numeric" 
                  placeholder="10" 
                />
              </View>
              <View style={styles.cfgItem}>
                <Text style={styles.lbl}>OFF (min)</Text>
                <TextInput 
                  style={styles.inpCfg} 
                  value={cicloOFF} 
                  onChangeText={setCicloOFF} 
                  keyboardType="numeric" 
                  placeholder="30" 
                />
              </View>
              <View style={styles.cfgItem}>
                <Text style={styles.lbl}>Activo</Text>
                <Switch 
                  value={cicloHabilitado} 
                  onValueChange={setCicloHabilitado} 
                  trackColor={{ false: "#ccc", true: "#90CAF9" }}
                  thumbColor={cicloHabilitado ? "#2196F3" : "#f4f3f4"}
                />
              </View>
            </View>
            <TouchableOpacity style={[styles.btnSave, {backgroundColor: '#2196F3'}]} onPress={guardarCiclo}>
              <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>GUARDAR CICLO</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* CONFIGURACIÓN */}
        <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#FF9800' }]}>
          <Text style={styles.cardTitle}>⚙️ Configuración</Text>
          <View style={styles.rowSpace}>
            <View style={styles.cfgItem}>
              <Text style={styles.lbl}>Max T°</Text>
              <TextInput 
                style={styles.inpCfg} 
                value={cfgTempMax} 
                onChangeText={setCfgTempMax} 
                keyboardType="numeric" 
                placeholder="35" 
              />
            </View>
            <View style={styles.cfgItem}>
              <Text style={styles.lbl}>Min T°</Text>
              <TextInput 
                style={styles.inpCfg} 
                value={cfgTempMin} 
                onChangeText={setCfgTempMin} 
                keyboardType="numeric" 
                placeholder="22" 
              />
            </View>
            <View style={styles.cfgItem}>
              <Text style={styles.lbl}>Min Hum</Text>
              <TextInput 
                style={styles.inpCfg} 
                value={cfgHumMin} 
                onChangeText={setCfgHumMin} 
                keyboardType="numeric" 
                placeholder="70" 
              />
            </View>
            {(deviceId === 'esp32_esquejes' || deviceId === 'esp32_germinacion') && (
              <View style={styles.cfgItem}>
                <Text style={styles.lbl}>Min Suelo</Text>
                <TextInput 
                  style={styles.inpCfg} 
                  value={cfgSoilMin} 
                  onChangeText={setCfgSoilMin} 
                  keyboardType="numeric" 
                  placeholder="60" 
                />
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.btnSave} onPress={guardarConfig}>
            <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>GUARDAR CONFIG</Text>
          </TouchableOpacity>
        </View>

        {/* CONTROL PRINCIPAL (BOMBA) */}
        <View style={styles.card}>
          <View style={styles.rowSpace}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
              <MaterialCommunityIcons 
                name={iconoBomba} 
                size={24} 
                color={bombaEstado ? dispositivoActual?.color : "#ccc"} 
              />
              <Text style={[styles.cardTitle, {marginBottom:0, marginLeft:8}]}>
                {nombreBomba}
              </Text>
            </View>
            
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <View style={[
                styles.modeBadge,
                { backgroundColor: modoManual ? '#FF9800' : '#4CAF50' }
              ]}>
                <Text style={styles.modeText}>
                  {modoManual ? 'MANUAL' : 'AUTO'}
                </Text>
              </View>
              
              {loadingBomba ? (
                <ActivityIndicator color={dispositivoActual?.color} />
              ) : (
                <Switch 
                  value={bombaEstado} 
                  onValueChange={toggleBomba} 
                  trackColor={{ false: "#ccc", true: "#A5D6A7" }} 
                  thumbColor={bombaEstado ? dispositivoActual?.color : "#f4f3f4"} 
                />
              )}
            </View>
          </View>
          
          <View style={styles.timerBox}>
            <Text style={{fontSize:12, marginBottom:5, color: countdownBomba > 0 ? '#D32F2F' : '#666'}}>
              {countdownBomba > 0 ? `⏳ Apagado en: ${countdownBomba}s` : "Temporizador:"}
            </Text>
            <View style={styles.rowSpace}>
              <TextInput 
                style={[styles.inpTimer, countdownBomba > 0 && {backgroundColor:'#eee'}]} 
                value={inputTimerBomba} 
                onChangeText={setInputTimerBomba} 
                keyboardType="numeric" 
                placeholder="0"
                editable={countdownBomba === 0}
              />
              <View style={styles.unitSel}>
                <UnitBtn u={unitBomba} v="min" set={setUnitBomba} />
                <UnitBtn u={unitBomba} v="sec" set={setUnitBomba} />
              </View>
              <TouchableOpacity 
                style={[
                  styles.btnGo, 
                  { backgroundColor: countdownBomba > 0 ? '#D32F2F' : dispositivoActual?.color }
                ]} 
                onPress={countdownBomba > 0 ? cancelarTimerBomba : timerBomba}
              >
                <MaterialCommunityIcons 
                  name={countdownBomba > 0 ? "stop" : "play"} 
                  size={20} 
                  color="#fff" 
                />
              </TouchableOpacity>
            </View>
          </View>
          
          <TouchableOpacity 
            style={[styles.btnMode, { backgroundColor: modoManual ? '#4CAF50' : '#FF9800' }]}
            onPress={toggleModoAuto}
          >
            <MaterialCommunityIcons 
              name={modoManual ? "auto-fix" : "hand-back-right"} 
              size={16} 
              color="#fff" 
            />
            <Text style={styles.btnModeText}>
              {modoManual ? 'Cambiar a AUTOMÁTICO' : 'Cambiar a MANUAL'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* VENTILACIÓN (Solo Esquejes) */}
        {deviceId === 'esp32_esquejes' && (
          <View style={styles.card}>
            <View style={styles.rowSpace}>
              <View style={{flexDirection:'row', alignItems:'center'}}>
                <MaterialCommunityIcons 
                  name="fan" 
                  size={24} 
                  color={ventEstado ? "#1976D2" : "#ccc"} 
                />
                <Text style={[styles.cardTitle, {marginBottom:0, marginLeft:8}]}>
                  Ventilación
                </Text>
              </View>
              {loadingVent ? (
                <ActivityIndicator color="#1976D2" />
              ) : (
                <Switch 
                  value={ventEstado} 
                  onValueChange={toggleVent} 
                  trackColor={{ false: "#ccc", true: "#90CAF9" }} 
                  thumbColor={ventEstado ? "#1976D2" : "#f4f3f4"} 
                />
              )}
            </View>
          </View>
        )}

        {/* HISTÓRICO OPTIMIZADO */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Histórico Temp (Últimas 24h)</Text>
          {chartData ? (
            <LineChart
              data={chartData}
              width={Dimensions.get('window').width - 60}
              height={200}
              yAxisSuffix="°C"
              fromZero={false}
              segments={4}
              chartConfig={{
                backgroundColor: '#fff',
                backgroundGradientFrom: '#fff',
                backgroundGradientTo: '#fff',
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
                labelColor: () => `#333`,
                propsForDots: { r: '4', strokeWidth: '2', stroke: dispositivoActual?.color },
                style: { borderRadius: 16 }
              }}
              bezier
              style={{ marginVertical: 8, borderRadius: 16 }}
            />
          ) : (
            <Text style={{ textAlign: 'center', padding: 20, color: '#aaa', fontSize:12 }}>
              Esperando datos del historial...
            </Text>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- COMPONENTES AUXILIARES ---------------- */
const UnitBtn = ({ u, v, set }) => (
  <TouchableOpacity 
    style={[styles.ubtn, u === v && styles.ubtnA]} 
    onPress={() => set(v)}
  >
    <Text style={{ fontSize: 10, color: u === v ? '#fff' : '#333' }}>
      {v.toUpperCase()}
    </Text>
  </TouchableOpacity>
);

/* ---------------- ESTILOS ---------------- */
const styles = StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: '#F0F2F5' 
  },
  header: { 
    padding: 16, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  deviceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  title: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#333' 
  },
  subtitle: {
    fontSize: 11,
    color: '#666',
    marginTop: 2
  },
  badge: { 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 16, 
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  deviceList: {
    backgroundColor: '#fff',
    elevation: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333'
  },
  deviceDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 2
  },
  scroll: { 
    padding: 16 
  },
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 16, 
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  cardTitle: { 
    fontWeight: 'bold', 
    fontSize: 16, 
    marginBottom: 12, 
    color: '#333' 
  },
  rowCenter: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    alignItems: 'center' 
  },
  rowSpace: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  metric: { 
    alignItems: 'center' 
  },
  separator: {
    width: 1,
    height: 40,
    backgroundColor: '#eee'
  },
  val: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    color: '#333',
    marginTop: 4
  },
  lbl: { 
    fontSize: 11, 
    color: '#666',
    marginTop: 2
  },
  cfgItem: { 
    flex: 1, 
    alignItems: 'center', 
    marginHorizontal: 4 
  },
  inpCfg: { 
    borderWidth: 1, 
    borderColor: '#FFB74D', 
    borderRadius: 8, 
    width: '100%', 
    textAlign: 'center', 
    height: 40, 
    backgroundColor:'#FFF8E1',
    marginTop: 4
  },
  btnSave: { 
    backgroundColor: '#FF9800', 
    padding: 12, 
    borderRadius: 8, 
    alignItems: 'center', 
    marginTop: 15 
  },
  timerBox: { 
    marginTop: 10, 
    paddingTop: 10, 
    borderTopWidth: 1, 
    borderTopColor: '#f0f0f0' 
  },
  inpTimer: { 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    flex: 1, 
    height: 40, 
    textAlign: 'center', 
    backgroundColor: '#f9f9f9', 
    marginRight: 8 
  },
  unitSel: { 
    flexDirection: 'row', 
    backgroundColor: '#eee', 
    borderRadius: 8, 
    padding: 2, 
    marginRight: 8 
  },
  ubtn: { 
    paddingVertical: 8, 
    paddingHorizontal: 8, 
    borderRadius: 6 
  },
  ubtnA: { 
    backgroundColor: '#333' 
  },
  btnGo: { 
    width: 40, 
    height: 40, 
    borderRadius: 8, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  modeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold'
  },
  btnMode: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    gap: 6
  },
  btnModeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  }
});