import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ScrollView, Switch,
  ActivityIndicator, TextInput, TouchableOpacity,
  Alert, Keyboard, SafeAreaView, StatusBar, Dimensions
} from 'react-native';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, update } from 'firebase/database';
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const MAX_DELAY = 15000;
const CMD_TIMEOUT = 5000;

export default function AgroControlScreen() {
  const [deviceId] = useState('esp32_1');

  // --- ESTADOS SENSORES ---
  const [temp, setTemp] = useState(0);
  const [hum, setHum] = useState(0);
  
  const watchdogRef = useRef(null);

  // --- ESTADOS RELÉS ---
  const [r1Estado, setR1Estado] = useState(false);
  const [loadingR1, setLoadingR1] = useState(false);
  const [inputTimerR1, setInputTimerR1] = useState('');
  const [unitR1, setUnitR1] = useState('min');
  const [countdownR1, setCountdownR1] = useState(0);

  const [r2Estado, setR2Estado] = useState(false);
  const [loadingR2, setLoadingR2] = useState(false);
  const [inputTimerR2, setInputTimerR2] = useState('');
  const [unitR2, setUnitR2] = useState('min');
  const [countdownR2, setCountdownR2] = useState(0);

  // --- CONFIGURACIÓN ---
  const [cfgTempAlta, setCfgTempAlta] = useState('');
  const [cfgTempBaja, setCfgTempBaja] = useState('');
  const [cfgHumBaja, setCfgHumBaja] = useState('');

  // --- CONEXIÓN Y GRÁFICA ---
  const [conectado, setConectado] = useState(false);
  const lastCmdTsRef = useRef(null);
  const [histHora, setHistHora] = useState({});

  // --- REFS PARA SINCRONIZACIÓN DE TIMER ---
  // Guardan el tiempo deseado hasta que el ESP32 confirma
  const pendingTimerR1 = useRef(0);
  const pendingTimerR2 = useRef(0);

  /* ---------------- PERMISOS ---------------- */
  useEffect(() => {
    Notifications.requestPermissionsAsync();
  }, []);

  /* ---------------- LISTENERS ---------------- */
  useEffect(() => {
    const base = `/${deviceId}`;

    // 1. Sensores (CORRECCIÓN 1: Math.round para enteros)
    const u1 = onValue(ref(db, base + '/sensores'), snap => {
      const d = snap.val();
      if (d) {
          // Redondeamos para quitar decimales
          setTemp(Math.round(d.temperatura ?? 0));
          setHum(Math.round(d.humedad ?? 0));
          
          setConectado(true);
          if (watchdogRef.current) clearTimeout(watchdogRef.current);
          watchdogRef.current = setTimeout(() => setConectado(false), MAX_DELAY);
      }
    });

    // 2. Estado (CORRECCIÓN 2: El Timer inicia SOLO al confirmar)
    const u2 = onValue(ref(db, base + '/estado'), snap => {
      const d = snap.val();
      if (!d) return;

      setR1Estado(!!d.r1);
      setR2Estado(!!d.r2);

      // Verificamos si es una respuesta a nuestro comando reciente
      if (lastCmdTsRef.current && d.ts >= lastCmdTsRef.current) {
        setLoadingR1(false);
        setLoadingR2(false);
        lastCmdTsRef.current = null;

        // ¡AQUÍ INICIA EL TEMPORIZADOR! (Sincronizado con ESP32)
        if (pendingTimerR1.current > 0) {
            setCountdownR1(pendingTimerR1.current);
            pendingTimerR1.current = 0; // Reset
        }
        if (pendingTimerR2.current > 0) {
            setCountdownR2(pendingTimerR2.current);
            pendingTimerR2.current = 0; // Reset
        }
      }
    });

    // 3. Config
    const u3 = onValue(ref(db, base + '/config'), snap => {
      const d = snap.val();
      if (d) {
        if (d.tempAlta) setCfgTempAlta(d.tempAlta.toString());
        if (d.tempBaja) setCfgTempBaja(d.tempBaja.toString());
        if (d.humBaja) setCfgHumBaja(d.humBaja.toString());
      }
    });

    // 4. Histórico
    const u4 = onValue(ref(db, base + '/historico/hora'), s => setHistHora(s.val() || {}));

    return () => { 
        u1(); u2(); u3(); u4(); 
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, []);

  /* ---------------- CONTADORES LOCALES ---------------- */
  useEffect(() => {
    const i = setInterval(() => {
      setCountdownR1(v => (v > 0 ? v - 1 : 0));
      setCountdownR2(v => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  /* ---------------- COMANDOS ---------------- */
  const enviarComando = (payload, setLoading) => {
    if (!conectado) {
      Alert.alert('Sin Conexión', 'El ESP32 no está reportando datos.');
      return;
    }
    const cmdTs = Date.now();
    lastCmdTsRef.current = cmdTs;
    if (setLoading) setLoading(true);

    update(ref(db, `/${deviceId}/comandos`), { ...payload, cmdTs })
      .catch(e => {
        if (setLoading) setLoading(false);
        Alert.alert("Error Firebase", e.message);
      });

    setTimeout(() => {
      if (setLoading) setLoading(prev => {
        if (prev) {
            Alert.alert("Aviso", "El ESP32 tardó en confirmar. El temporizador no iniciará.");
            // Limpiamos los pendientes si falló
            pendingTimerR1.current = 0;
            pendingTimerR2.current = 0;
        }
        return false;
      });
    }, CMD_TIMEOUT);
  };

  // --- R1 ---
  const toggleR1 = () => enviarComando({ r1: !r1Estado }, setLoadingR1);
  const timerR1 = () => {
    const val = parseInt(inputTimerR1);
    if (!val || val <= 0) return;
    const segs = unitR1 === 'min' ? val * 60 : val;
    
    // NO iniciamos setCountdownR1 aquí. Lo guardamos en ref.
    pendingTimerR1.current = segs;
    
    enviarComando({ timerR1: segs }, setLoadingR1);
    setInputTimerR1(''); Keyboard.dismiss();
  };
  const cancelarTimerR1 = () => {
    setCountdownR1(0); 
    pendingTimerR1.current = 0;
    enviarComando({ timerR1: 0 }, setLoadingR1);
  };

  // --- R2 ---
  const toggleR2 = () => enviarComando({ r2: !r2Estado }, setLoadingR2);
  const timerR2 = () => {
    const val = parseInt(inputTimerR2);
    if (!val || val <= 0) return;
    const segs = unitR2 === 'min' ? val * 60 : val;
    
    // NO iniciamos setCountdownR2 aquí. Lo guardamos en ref.
    pendingTimerR2.current = segs;

    enviarComando({ timerR2: segs }, setLoadingR2);
    setInputTimerR2(''); Keyboard.dismiss();
  };
  const cancelarTimerR2 = () => {
    setCountdownR2(0);
    pendingTimerR2.current = 0;
    enviarComando({ timerR2: 0 }, setLoadingR2);
  };

  const guardarConfig = () => {
    const tAlta = parseFloat(cfgTempAlta);
    const tBaja = parseFloat(cfgTempBaja);
    const hBaja = parseFloat(cfgHumBaja);
    if (isNaN(tAlta) || isNaN(tBaja) || isNaN(hBaja)) return;
    update(ref(db, `/${deviceId}/config`), { tempAlta: tAlta, tempBaja: tBaja, humBaja: hBaja })
      .then(() => { Alert.alert("Guardado", "Umbrales actualizados"); Keyboard.dismiss(); });
  };

  // --- DATOS GRÁFICA (CORRECCIÓN 3: Intervalos de 20 min) ---
  const processChartData = () => {
    // 1. Obtener todas las claves ordenadas
    const keys = Object.keys(histHora).sort((a, b) => Number(a) - Number(b));
    if (keys.length === 0) return null;

    // 2. Filtrar para tener intervalos de aprox 20 min
    // Recorremos de atrás (más reciente) hacia adelante para asegurar el último dato
    const filteredKeys = [];
    let lastAddedTs = 0;
    const INTERVAL_MS = 20 * 60 * 1000; // 20 minutos en milisegundos

    for (let i = keys.length - 1; i >= 0; i--) {
        const currentTs = Number(keys[i]);
        
        // Si es el primero (el más reciente) o la diferencia es >= 20 min
        if (filteredKeys.length === 0 || (lastAddedTs - currentTs >= INTERVAL_MS)) {
            filteredKeys.unshift(keys[i]); // Agregamos al principio para mantener orden cronológico
            lastAddedTs = currentTs;
        }

        // Limitamos a 6 puntos para que se vea bien en pantalla
        if (filteredKeys.length >= 6) break;
    }

    // 3. Formatear datos filtrados
    const labels = filteredKeys.map(key => {
        let ts = Number(key);
        if (ts < 10000000000) ts *= 1000; 
        const date = new Date(ts);
        return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    });

    const data = filteredKeys.map(key => {
        const val = Number(histHora[key]?.temp);
        return isNaN(val) ? 0 : val;
    });

    return { labels, datasets: [{ data }] };
  };

  const chartData = processChartData();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />

      <View style={styles.header}>
        <Text style={styles.title}>AgroControl 🚜</Text>
        <View style={[styles.badge, { borderColor: conectado ? '#4CAF50' : '#F44336' }]}>
          <Text style={{ color: conectado ? '#4CAF50' : '#F44336', fontWeight: 'bold', fontSize: 10 }}>
            {conectado ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* SENSORES (Enteros) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Clima Tiempo Real</Text>
          <View style={styles.rowCenter}>
            <View style={styles.metric}>
              <MaterialCommunityIcons name="thermometer" size={30} color={temp > 35 ? "#D32F2F" : "#2E7D32"} />
              <Text style={styles.val}>{temp}°C</Text> 
              <Text style={styles.lbl}>Temp</Text>
            </View>
            <View style={{ width: 1, height: 40, backgroundColor: '#eee' }} />
            <View style={styles.metric}>
              <MaterialCommunityIcons name="water-percent" size={30} color={hum < 40 ? "#D32F2F" : "#1976D2"} />
              <Text style={styles.val}>{hum}%</Text>
              <Text style={styles.lbl}>Humedad</Text>
            </View>
          </View>
        </View>

        {/* CONFIGURACIÓN */}
        <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#FF9800' }]}>
          <Text style={styles.cardTitle}>Configuración Automática</Text>
          <View style={styles.rowSpace}>
            <View style={styles.cfgItem}>
              <Text style={styles.lbl}>Max T°</Text>
              <TextInput style={styles.inpCfg} value={cfgTempAlta} onChangeText={setCfgTempAlta} keyboardType="numeric" placeholder="35" />
            </View>
            <View style={styles.cfgItem}>
              <Text style={styles.lbl}>Min T°</Text>
              <TextInput style={styles.inpCfg} value={cfgTempBaja} onChangeText={setCfgTempBaja} keyboardType="numeric" placeholder="33" />
            </View>
            <View style={styles.cfgItem}>
              <Text style={styles.lbl}>Min Hum</Text>
              <TextInput style={styles.inpCfg} value={cfgHumBaja} onChangeText={setCfgHumBaja} keyboardType="numeric" placeholder="40" />
            </View>
          </View>
          <TouchableOpacity style={styles.btnSave} onPress={guardarConfig}>
             <Text style={{color:'#fff', fontWeight:'bold', fontSize:12}}>GUARDAR</Text>
          </TouchableOpacity>
        </View>

        {/* RIEGO */}
        <View style={styles.card}>
          <View style={styles.rowSpace}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <MaterialCommunityIcons name="sprinkler" size={24} color={r1Estado ? "#2E7D32" : "#ccc"} />
                <Text style={[styles.cardTitle, {marginBottom:0, marginLeft:8}]}>Riego</Text>
            </View>
            {loadingR1 ? <ActivityIndicator color="#2E7D32" /> :
              <Switch value={r1Estado} onValueChange={toggleR1} trackColor={{ false: "#ccc", true: "#A5D6A7" }} thumbColor={r1Estado ? "#2E7D32" : "#f4f3f4"} />
            }
          </View>
          <View style={styles.timerBox}>
             <Text style={{fontSize:12, marginBottom:5, color: countdownR1 > 0 ? '#D32F2F' : '#666'}}>
               {countdownR1 > 0 ? `⏳ Apagado en: ${countdownR1}s` : "Temporizador:"}
             </Text>
             <View style={styles.rowSpace}>
                <TextInput 
                   style={[styles.inpTimer, countdownR1 > 0 && {backgroundColor:'#eee'}]} 
                   value={inputTimerR1} 
                   onChangeText={setInputTimerR1} 
                   keyboardType="numeric" 
                   placeholder="0"
                   editable={countdownR1 === 0}
                />
                <View style={styles.unitSel}>
                   <UnitBtn u={unitR1} v="min" set={setUnitR1} />
                   <UnitBtn u={unitR1} v="sec" set={setUnitR1} />
                </View>
                <TouchableOpacity 
                   style={[styles.btnGo, countdownR1 > 0 && { backgroundColor: '#D32F2F' }]} 
                   onPress={countdownR1 > 0 ? cancelarTimerR1 : timerR1}
                >
                   <MaterialCommunityIcons name={countdownR1 > 0 ? "stop" : "play"} size={20} color="#fff" />
                </TouchableOpacity>
             </View>
          </View>
        </View>

        {/* VENTILACIÓN */}
        <View style={styles.card}>
          <View style={styles.rowSpace}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <MaterialCommunityIcons name="fan" size={24} color={r2Estado ? "#1976D2" : "#ccc"} />
                <Text style={[styles.cardTitle, {marginBottom:0, marginLeft:8}]}>Ventilación</Text>
            </View>
            {loadingR2 ? <ActivityIndicator color="#1976D2" /> :
              <Switch value={r2Estado} onValueChange={toggleR2} trackColor={{ false: "#ccc", true: "#90CAF9" }} thumbColor={r2Estado ? "#1976D2" : "#f4f3f4"} />
            }
          </View>
          <View style={styles.timerBox}>
             <Text style={{fontSize:12, marginBottom:5, color: countdownR2 > 0 ? '#1976D2' : '#666'}}>
               {countdownR2 > 0 ? `⏳ Apagado en: ${countdownR2}s` : "Temporizador:"}
             </Text>
             <View style={styles.rowSpace}>
                <TextInput 
                   style={[styles.inpTimer, countdownR2 > 0 && {backgroundColor:'#eee'}]} 
                   value={inputTimerR2} 
                   onChangeText={setInputTimerR2} 
                   keyboardType="numeric" 
                   placeholder="0"
                   editable={countdownR2 === 0}
                />
                <View style={styles.unitSel}>
                   <UnitBtn u={unitR2} v="min" set={setUnitR2} />
                   <UnitBtn u={unitR2} v="sec" set={setUnitR2} />
                </View>
                <TouchableOpacity 
                   style={[styles.btnGo, {backgroundColor: countdownR2 > 0 ? '#D32F2F' : '#1976D2'}]} 
                   onPress={countdownR2 > 0 ? cancelarTimerR2 : timerR2}
                >
                   <MaterialCommunityIcons name={countdownR2 > 0 ? "stop" : "play"} size={20} color="#fff" />
                </TouchableOpacity>
             </View>
          </View>
        </View>

        {/* HISTÓRICO (20 min) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Histórico Temp (Cada ~20 min)</Text>
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
                decimalPlaces: 1, // Mantiene 1 decimal en la gráfica para precisión visual
                color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
                labelColor: () => `#333`, 
                propsForDots: { r: '4', strokeWidth: '2', stroke: '#2E7D32' },
                style: { borderRadius: 16 }
              }}
              bezier
              style={{ marginVertical: 8, borderRadius: 16 }}
            />
          ) : (
            <Text style={{ textAlign: 'center', padding: 20, color: '#aaa', fontSize:12 }}>
                Recopilando datos históricos...
            </Text>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const UnitBtn = ({ u, v, set }) => (
  <TouchableOpacity style={[styles.ubtn, u === v && styles.ubtnA]} onPress={() => set(v)}>
    <Text style={{ fontSize: 10, color: u === v ? '#fff' : '#333' }}>{v.toUpperCase()}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F0F2F5' },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', elevation: 2 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  scroll: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2 },
  cardTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 12, color: '#333' },
  rowCenter: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  rowSpace: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metric: { alignItems: 'center' },
  val: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  lbl: { fontSize: 11, color: '#666' },
  cfgItem: { flex: 1, alignItems: 'center', marginHorizontal: 4 },
  inpCfg: { borderWidth: 1, borderColor: '#FFB74D', borderRadius: 8, width: '100%', textAlign: 'center', height: 40, backgroundColor:'#FFF8E1' },
  btnSave: { backgroundColor: '#FF9800', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  timerBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  inpTimer: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, flex: 1, height: 40, textAlign: 'center', backgroundColor: '#f9f9f9', marginRight: 8 },
  unitSel: { flexDirection: 'row', backgroundColor: '#eee', borderRadius: 8, padding: 2, marginRight: 8 },
  ubtn: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6 },
  ubtnA: { backgroundColor: '#333' },
  btnGo: { backgroundColor: '#2E7D32', width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }
});