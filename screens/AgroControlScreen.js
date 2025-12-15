import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, Switch, Vibration, Animated, ActivityIndicator, TextInput, TouchableOpacity, Alert, Keyboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// --- CONFIGURACIÓN DE FIREBASE ---
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, update } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBQ9eIxrMB-XhmqGA0fzyBH2NrIQjvjJ2g", 
  databaseURL: "https://agrocontrol-fd75d-default-rtdb.firebaseio.com", 
  projectId: "agrocontrol-fd75d", 
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default function AgroControlScreen() {
  const [temp, setTemp] = useState(0);
  const [hum, setHum] = useState(0);
  const [r1Estado, setR1Estado] = useState(false); 
  const [r2Estado, setR2Estado] = useState(false);
  const [conectado, setConectado] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Estados de los interruptores manuales
  const [switchR1, setSwitchR1] = useState(false);
  const [switchR2, setSwitchR2] = useState(false);

  // Estados para los inputs de los temporizadores
  const [inputTimerR1, setInputTimerR1] = useState('');
  const [inputTimerR2, setInputTimerR2] = useState('');

  // --- NUEVOS ESTADOS PARA UMBRALES ---
  const [cfgTempAlta, setCfgTempAlta] = useState('');
  const [cfgTempBaja, setCfgTempBaja] = useState('');
  const [cfgHumBaja, setCfgHumBaja] = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current; 
  const [alertaActiva, setAlertaActiva] = useState(false);

  useEffect(() => {
    const sensoresRef = ref(db, '/sensores');
    const estadoRef = ref(db, '/estado');
    const configRef = ref(db, '/config'); // Referencia a la configuración

    // 1. Escuchar Sensores
    const unsubscribeSensores = onValue(sensoresRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTemp(data.temperatura || 0);
        setHum(data.humedad || 0);
        setConectado(true);
        setCargando(false);
        
        // Lógica de Alerta Visual (Usamos los valores que vienen de config si existen, si no, defaults)
        const limiteT = parseFloat(cfgTempAlta) || 35;
        const limiteH = parseFloat(cfgHumBaja) || 40;

        if (data.temperatura > limiteT || data.humedad < limiteH) {
           if(!alertaActiva) { setAlertaActiva(true); Vibration.vibrate(500); }
           Animated.loop(Animated.sequence([Animated.timing(fadeAnim, { toValue: 0.5, duration: 500, useNativeDriver: true }), Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true })])).start();
        } else {
           setAlertaActiva(false); fadeAnim.setValue(1);
        }
      }
    });

    // 2. Escuchar Estado Real de los Relés
    const unsubscribeEstado = onValue(estadoRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setR1Estado(data.r1); setR2Estado(data.r2);
        setSwitchR1(data.r1); setSwitchR2(data.r2);
      }
    });

    // 3. NUEVO: Escuchar Configuración Actual (Umbrales)
    const unsubscribeConfig = onValue(configRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convertimos a string para mostrar en los Inputs
        if (data.tempAlta) setCfgTempAlta(data.tempAlta.toString());
        if (data.tempBaja) setCfgTempBaja(data.tempBaja.toString());
        if (data.humBaja)  setCfgHumBaja(data.humBaja.toString());
      }
    });

    return () => { unsubscribeSensores(); unsubscribeEstado(); unsubscribeConfig(); };
  }, []);

  // --- FUNCIONES DE CONTROL ---

  const toggleRiego = () => {
    const nuevoValor = !switchR1; setSwitchR1(nuevoValor); 
    update(ref(db, '/comandos'), { r1: nuevoValor, timerR1: 0 }).catch(e => alert("Error: " + e.message));
  };

  const toggleVentilacion = () => {
    const nuevoValor = !switchR2; setSwitchR2(nuevoValor);
    update(ref(db, '/comandos'), { r2: nuevoValor, timerR2: 0 }).catch(e => alert("Error"));
  };

  const enviarTemporizador = (rele, minutosTexto, setInput) => {
      const minutos = parseInt(minutosTexto);
      if (isNaN(minutos) || minutos <= 0) {
          Alert.alert("Error", "Ingresa un número válido de minutos.");
          return;
      }
      const segundos = minutos * 60; 
      const pathTimer = rele === 1 ? 'timerR1' : 'timerR2';
      
      update(ref(db, '/comandos'), { [pathTimer]: segundos })
        .then(() => {
            Alert.alert("Temporizador Iniciado", `El sistema se apagará en ${minutos} minutos.`);
            setInput(''); 
            Keyboard.dismiss();
        })
        .catch(e => Alert.alert("Error", "No se pudo enviar el temporizador."));
  };

  // --- NUEVA FUNCIÓN: GUARDAR UMBRALES ---
  const guardarUmbrales = () => {
    const tAlta = parseFloat(cfgTempAlta);
    const tBaja = parseFloat(cfgTempBaja);
    const hBaja = parseFloat(cfgHumBaja);

    if (isNaN(tAlta) || isNaN(tBaja) || isNaN(hBaja)) {
      Alert.alert("Error", "Por favor ingresa valores numéricos válidos.");
      return;
    }

    if (tBaja >= tAlta) {
      Alert.alert("Lógica Incorrecta", "La temperatura de apagado debe ser menor a la de encendido.");
      return;
    }

    // Actualizamos Firebase
    update(ref(db, '/config'), {
      tempAlta: tAlta,
      tempBaja: tBaja,
      humBaja: hBaja
    })
    .then(() => {
      Alert.alert("Configuración Guardada", "El ESP32 ahora usará estos nuevos valores automáticos.");
      Keyboard.dismiss();
    })
    .catch(error => {
      Alert.alert("Error", "No se pudo guardar: " + error.message);
    });
  };

  const headerColor = alertaActiva ? '#D32F2F' : '#2E7D32';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: headerColor }]}>
        <Text style={styles.headerTitle}>{alertaActiva ? "⚠️ ALERTA EN CULTIVO" : "Control Remoto 🚜"}</Text>
        <View style={{flexDirection:'row', alignItems:'center', marginTop: 5}}>
           <View style={[styles.dot, {backgroundColor: conectado ? '#76FF03' : '#ccc'}]} />
           <Text style={styles.subTitle}> {conectado ? "Conectado a Nube" : "Sincronizando..."}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        
        {/* TARJETA CLIMA */}
        <Animated.View style={[styles.card, { opacity: fadeAnim, borderColor: alertaActiva ? '#D32F2F' : 'transparent', borderWidth: alertaActiva ? 2 : 0 }]}>
          <Text style={styles.cardTitle}>Estado del Clima</Text>
          {cargando ? <ActivityIndicator color="#2E7D32" /> : (
            <View style={styles.sensorRow}>
              <View style={styles.sensorItem}>
                <MaterialCommunityIcons name="thermometer" size={45} color={temp > (parseFloat(cfgTempAlta)||35) ? "#D32F2F" : "#FF6B6B"} />
                <Text style={styles.sensorLabel}>Temperatura</Text>
                <Text style={styles.sensorValue}>{temp.toFixed(1)}°C</Text>
              </View>
              <View style={styles.separator} />
              <View style={styles.sensorItem}>
                <MaterialCommunityIcons name="water-percent" size={45} color={hum < (parseFloat(cfgHumBaja)||40) ? "#D32F2F" : "#4ECDC4"} />
                <Text style={styles.sensorLabel}>Humedad</Text>
                <Text style={styles.sensorValue}>{hum.toFixed(0)}%</Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* --- NUEVA TARJETA: CONFIGURACIÓN DE UMBRALES --- */}
        <View style={[styles.card, { borderLeftWidth: 5, borderLeftColor: '#FF9800' }]}>
          <View style={{flexDirection:'row', alignItems:'center', marginBottom:10}}>
             <MaterialCommunityIcons name="cog" size={24} color="#FF9800" />
             <Text style={[styles.cardTitle, {marginLeft: 10}]}>Configuración Automática</Text>
          </View>
          <Text style={styles.helpText}>Define cuándo se activan los equipos automáticamente.</Text>
          
          <View style={styles.configRow}>
            <View style={styles.configItem}>
               <Text style={styles.labelSmall}>Encender si T &gt;</Text>
               <TextInput 
                  style={styles.inputConfig} 
                  keyboardType="numeric" 
                  value={cfgTempAlta} 
                  onChangeText={setCfgTempAlta} 
                  placeholder="35"
               />
            </View>
            <View style={styles.configItem}>
               <Text style={styles.labelSmall}>Apagar si T &lt;</Text>
               <TextInput 
                  style={styles.inputConfig} 
                  keyboardType="numeric" 
                  value={cfgTempBaja} 
                  onChangeText={setCfgTempBaja} 
                  placeholder="33"
               />
            </View>
            <View style={styles.configItem}>
               <Text style={styles.labelSmall}>Activar si H &lt;</Text>
               <TextInput 
                  style={styles.inputConfig} 
                  keyboardType="numeric" 
                  value={cfgHumBaja} 
                  onChangeText={setCfgHumBaja} 
                  placeholder="50"
               />
            </View>
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={guardarUmbrales}>
             <MaterialCommunityIcons name="content-save" size={20} color="#fff" />
             <Text style={styles.saveButtonText}>GUARDAR UMBRALES</Text>
          </TouchableOpacity>
        </View>

        {/* TARJETA RIEGO */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <View style={[styles.iconBox, {backgroundColor: '#E8F5E9'}]}><MaterialCommunityIcons name="sprinkler" size={28} color="#2E7D32" /></View>
                <View style={{marginLeft: 15}}><Text style={styles.cardTitle}>Sistema de Riego</Text><Text style={styles.statusText}>{r1Estado ? "REGANDO 💧" : "INACTIVO"}</Text></View>
            </View>
            <Switch trackColor={{ false: "#767577", true: "#81b0ff" }} thumbColor={switchR1 ? "#2E7D32" : "#f4f3f4"} onValueChange={toggleRiego} value={switchR1} />
          </View>
          <View style={styles.timerContainer}>
             <TextInput 
                style={styles.timerInput} 
                placeholder="Minutos..." 
                keyboardType="numeric"
                value={inputTimerR1}
                onChangeText={setInputTimerR1}
             />
             <TouchableOpacity style={styles.timerButton} onPress={() => enviarTemporizador(1, inputTimerR1, setInputTimerR1)}>
                <MaterialCommunityIcons name="clock-start" size={20} color="#fff" />
                <Text style={styles.timerButtonText}>ACTIVAR</Text>
             </TouchableOpacity>
          </View>
        </View>

        {/* TARJETA VENTILACIÓN */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <View style={[styles.iconBox, {backgroundColor: '#E3F2FD'}]}><MaterialCommunityIcons name="fan" size={28} color="#1976D2" /></View>
                <View style={{marginLeft: 15}}><Text style={styles.cardTitle}>Ventilación</Text><Text style={styles.statusText}>{r2Estado ? "ENCENDIDO 💨" : "APAGADO"}</Text></View>
            </View>
            <Switch trackColor={{ false: "#767577", true: "#64B5F6" }} thumbColor={switchR2 ? "#1976D2" : "#f4f3f4"} onValueChange={toggleVentilacion} value={switchR2} />
          </View>
          <View style={styles.timerContainer}>
             <TextInput 
                style={styles.timerInput} 
                placeholder="Minutos..." 
                keyboardType="numeric"
                value={inputTimerR2}
                onChangeText={setInputTimerR2}
             />
             <TouchableOpacity style={[styles.timerButton, {backgroundColor: '#1976D2'}]} onPress={() => enviarTemporizador(2, inputTimerR2, setInputTimerR2)}>
                <MaterialCommunityIcons name="clock-start" size={20} color="#fff" />
                <Text style={styles.timerButtonText}>ACTIVAR</Text>
             </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { 
    padding: 25, 
    paddingTop: 60, 
    borderBottomLeftRadius: 30, 
    borderBottomRightRadius: 30, 
    elevation: 5 
  },
  headerTitle: { fontSize: 22, color: '#fff', fontWeight: 'bold' },
  subTitle: { color: '#E8F5E9', fontSize: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  scroll: { padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 15, elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  cardHeader: { flexDirection: 'row', justifyContent:'space-between', alignItems: 'center', marginBottom: 15 },
  sensorRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 15 },
  sensorItem: { alignItems: 'center' },
  sensorLabel: { fontSize: 12, color: '#888', marginTop: 5 },
  sensorValue: { fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 2 },
  separator: { width: 1, height: '80%', backgroundColor: '#eee' },
  iconBox: { padding: 10, borderRadius: 12 },
  statusText: { fontSize: 12, color: '#666', marginTop: 2 },
  
  // Estilos del Temporizador
  timerContainer: { flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  timerInput: { flex: 1, backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, height: 40, marginRight: 10 },
  timerButton: { flexDirection: 'row', backgroundColor: '#2E7D32', borderRadius: 8, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', height: 40 },
  timerButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 5, fontSize: 12 },

  // --- NUEVOS ESTILOS PARA CONFIGURACIÓN ---
  helpText: { fontSize: 12, color: '#777', marginBottom: 10, fontStyle: 'italic' },
  configRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  configItem: { flex: 1, alignItems: 'center', marginHorizontal: 2 },
  labelSmall: { fontSize: 10, color: '#555', marginBottom: 5, fontWeight: 'bold' },
  inputConfig: { 
    backgroundColor: '#fff', 
    borderWidth: 1, 
    borderColor: '#FF9800', 
    borderRadius: 8, 
    width: '100%', 
    height: 40, 
    textAlign: 'center',
    fontSize: 16,
    color: '#333'
  },
  saveButton: { 
    flexDirection: 'row', 
    backgroundColor: '#FF9800', 
    borderRadius: 10, 
    paddingVertical: 12, 
    alignItems: 'center', 
    justifyContent: 'center', 
    elevation: 3 
  },
  saveButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 8, fontSize: 14 }
});