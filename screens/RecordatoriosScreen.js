import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
  Keyboard,
  Switch,
  Modal,       // Nuevo: Para la pantalla de alarma
  Vibration,   // Nuevo: Para vibración continua
} from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av"; // Nuevo: Para reproducir sonido en bucle

// Configuración del Handler: Define qué pasa si la app está ABIERTA
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RecordatoriosScreen({ route }) {
  const { cultivo } = route.params || { cultivo: "General" };
  const STORAGE_KEY = `@agenda_v2_${cultivo}`;

  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(new Date());
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [modo, setModo] = useState("date");
  const [listaRecordatorios, setListaRecordatorios] = useState([]);
  const [esRepetitivo, setEsRepetitivo] = useState(false);
  const [diasIntervalo, setDiasIntervalo] = useState("");

  // --- ESTADOS PARA LA ALARMA ---
  const [alarmaVisible, setAlarmaVisible] = useState(false);
  const [soundObject, setSoundObject] = useState(null);
  const [tituloAlarmaActual, setTituloAlarmaActual] = useState("");
  // ------------------------------

  useEffect(() => {
    configurarNotificaciones();
    cargarDatosGuardados();

    // Listener 1: Si la app está abierta y llega la notificación
    const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
      activarPantallaAlarma(notification.request.content.title);
    });

    // Listener 2: Si la app está en segundo plano y el usuario toca la notificación
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      activarPantallaAlarma(response.notification.request.content.title);
    });

    return () => {
      foregroundSubscription.remove();
      responseSubscription.remove();
      detenerAlarma(); // Limpieza al salir
    };
  }, []);

  // --- LÓGICA DE PANTALLA DE ALARMA Y SONIDO ---
  const activarPantallaAlarma = async (tituloNotif) => {
    setTituloAlarmaActual(tituloNotif || "¡Recordatorio!");
    setAlarmaVisible(true);
    
    // Vibración en patrón infinito (Android) o larga (iOS)
    const pattern = [1000, 2000, 1000, 2000];
    Vibration.vibrate(pattern, true); // 'true' para repetir en Android

    try {
      // Cargar y reproducir sonido
      const { sound } = await Audio.Sound.createAsync(
        require('./assets/tu_alarma.mp3'), 
        { shouldPlay: true, isLooping: true }
      );
      setSoundObject(sound);
      await sound.playAsync();
    } catch (error) {
      console.log("No se pudo reproducir el audio de la alarma", error);
    }
  };

  const detenerAlarma = async () => {
    Vibration.cancel();
    if (soundObject) {
      try {
        await soundObject.stopAsync();
        await soundObject.unloadAsync();
      } catch (e) { console.log(e); }
    }
    setSoundObject(null);
    setAlarmaVisible(false);
  };
  // ---------------------------------------------

  // --- CONFIGURACIÓN DE NOTIFICACIONES ---
  const configurarNotificaciones = async () => {
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        Alert.alert("Permisos requeridos", "Habilita las notificaciones para que suene la alarma.");
        return;
      }
    }

    if (Platform.OS === 'android') {
      await Notifications.deleteNotificationChannelAsync('default'); 
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Alarmas Agrícolas', 
        importance: Notifications.AndroidImportance.MAX, 
        vibrationPattern: [0, 500, 200, 500], 
        lightColor: '#FF231F7C',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, 
        sound: true, 
        bypassDnd: true, // Intenta saltar el modo No Molestar
      });
    }
  };

  const cargarDatosGuardados = async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (json) {
        const datos = JSON.parse(json).map((i) => ({
          ...i,
          fecha: new Date(i.fecha),
        }));
        setListaRecordatorios(datos);
      }
    } catch (e) { 
      console.log("Error al cargar datos:", e); 
    }
  };

  const formatearFecha = (d) => {
    if (!d) return "Seleccionar fecha";
    return new Date(d).toLocaleString("es-MX", {
      weekday: "short", 
      day: "numeric", 
      month: "short", 
      year: "numeric",
      hour: "2-digit", 
      minute: "2-digit",
    });
  };

  const abrirSelector = () => {
    Keyboard.dismiss();
    setModo("date");
    setMostrarPicker(true);
  };

  const onChange = (event, selectedDate) => {
    if (event.type !== "set") {
      setMostrarPicker(false);
      return;
    }
    const currentDate = selectedDate || fecha;
    
    if (modo === "date") {
      const nueva = new Date(fecha);
      nueva.setFullYear(currentDate.getFullYear());
      nueva.setMonth(currentDate.getMonth());
      nueva.setDate(currentDate.getDate());
      setFecha(nueva);
      
      setMostrarPicker(false);
      setModo("time");
      setTimeout(() => setMostrarPicker(true), 100); 
    } else {
      const nueva = new Date(fecha);
      nueva.setHours(currentDate.getHours());
      nueva.setMinutes(currentDate.getMinutes());
      nueva.setSeconds(0); 
      nueva.setMilliseconds(0); 
      setFecha(nueva);
      setMostrarPicker(false);
      setModo("date");
    }
  };

  const programarRecordatorio = async () => {
    if (!titulo.trim()) {
      return Alert.alert("Falta información", "Escribe la actividad.");
    }

    const ahora = new Date();
    const fechaBase = new Date(fecha);
    
    if (fechaBase <= ahora) {
      return Alert.alert("Fecha inválida", "Selecciona una fecha y hora futura.");
    }

    let intervaloNum = 0;
    if (esRepetitivo) {
      intervaloNum = parseInt(diasIntervalo);
      if (!intervaloNum || intervaloNum <= 0) {
        return Alert.alert("Error", "Ingresa un número de días válido.");
      }
    }

    try {
      const notificationIds = [];
      const repeticiones = esRepetitivo ? 5 : 1; 

      for (let i = 0; i < repeticiones; i++) {
        const triggerDate = new Date(fechaBase.getTime());
        triggerDate.setDate(triggerDate.getDate() + (i * intervaloNum));
        
        const diffMs = triggerDate.getTime() - Date.now();
        const diffSec = Math.floor(diffMs / 1000);

        if (diffSec <= 0) {
          continue;
        }

        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `🚜 ${cultivo}: ${titulo}`,
            body: i === 0 ? "¡Es hora de tu actividad! Toca para apagar." : `Recordatorio recurrente (Día ${i * intervaloNum}).`,
            sound: true, 
            color: '#2E7D32',
            priority: Notifications.AndroidNotificationPriority.MAX,
            vibrate: [0, 500, 200, 500],
            interruptionLevel: 'timeSensitive',
            data: { esAlarma: true } 
          },
          trigger: { 
            date: triggerDate, 
            channelId: 'default', 
          },
        });
        
        notificationIds.push(id);
      }

      if (notificationIds.length === 0) {
        return Alert.alert("Atención", "No se pudo programar (¿Fecha muy cercana?).");
      }

      const nuevaTarea = {
        id: Date.now().toString(),
        notificationIds,
        titulo,
        fecha: fechaBase,
        esRepetitivo,
        diasIntervalo: esRepetitivo ? intervaloNum : null,
        completado: false,
      };

      const nuevaLista = [nuevaTarea, ...listaRecordatorios];
      setListaRecordatorios(nuevaLista);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nuevaLista));

      Alert.alert(
        "¡Listo!", 
        esRepetitivo 
          ? `Agenda guardada (${notificationIds.length} alarmas).` 
          : `Alarma programada con éxito.`
      );
      
      setTitulo("");
      setFecha(new Date()); 
      setEsRepetitivo(false);
      setDiasIntervalo("");
      Keyboard.dismiss();

    } catch (e) {
      console.log("Error CRÍTICO al programar:", e);
      Alert.alert("Error", "Revisa la consola para más detalles.");
    }
  };

  const eliminarTarea = async (id, idsNotificaciones) => {
    Alert.alert("Eliminar", "¿Borrar esta actividad?", [
      { text: "Cancelar" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            if (idsNotificaciones) {
              const ids = Array.isArray(idsNotificaciones) ? idsNotificaciones : [idsNotificaciones];
              for (const notifId of ids) {
                await Notifications.cancelScheduledNotificationAsync(notifId);
              }
            }
            const nuevaLista = listaRecordatorios.filter((i) => i.id !== id);
            setListaRecordatorios(nuevaLista);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nuevaLista));
          } catch (e) { 
            console.log("Error al eliminar:", e); 
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>⏰ Agenda para {cultivo}</Text>

      {/* --- FORMULARIO --- */}
      <View style={styles.cardForm}>
        <Text style={styles.label}>Actividad:</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Aplicar fertilizante"
          value={titulo}
          onChangeText={setTitulo}
        />

        <Text style={styles.label}>Fecha y Hora de inicio:</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={abrirSelector}>
          <MaterialCommunityIcons name="calendar-clock" size={24} color="#2E7D32" />
          <Text style={styles.dateText}>{formatearFecha(fecha)}</Text>
        </TouchableOpacity>

        {mostrarPicker && (
          <DateTimePicker
            value={fecha}
            mode={modo}
            is24Hour={true}
            display="default"
            onChange={onChange}
            minimumDate={new Date()}
          />
        )}

        <View style={styles.rowSwitch}>
          <Text style={styles.labelSwitch}>¿Repetir actividad?</Text>
          <Switch 
            value={esRepetitivo} 
            onValueChange={setEsRepetitivo}
            trackColor={{ false: "#767577", true: "#81C784" }}
            thumbColor={esRepetitivo ? "#2E7D32" : "#f4f3f4"}
          />
        </View>

        {esRepetitivo && (
          <View style={styles.intervaloContainer}>
            <Text style={styles.label}>Repetir cada (días):</Text>
            <TextInput 
              style={styles.input}
              placeholder="Ej. 3, 7, 15..."
              keyboardType="numeric"
              value={diasIntervalo}
              onChangeText={setDiasIntervalo}
            />
          </View>
        )}

        <TouchableOpacity style={styles.btnProgramar} onPress={programarRecordatorio}>
          <Text style={styles.btnText}>💾 Guardar Agenda</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitulo}>Próximas Actividades:</Text>

      <FlatList
        data={listaRecordatorios}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Sin tareas pendientes.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.itemCard, item.esRepetitivo && styles.itemRepetitivo]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.titulo}</Text>
              <Text style={styles.itemDate}>📅 {formatearFecha(item.fecha)}</Text>
              {item.esRepetitivo && (
                <Text style={styles.tagRepetitivo}>
                  🔄 Se repite cada {item.diasIntervalo} días
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => eliminarTarea(item.id, item.notificationIds)}>
              <MaterialCommunityIcons name="trash-can" size={28} color="#E57373" />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* --- MODAL DE ALARMA (PANTALLA COMPLETA) --- */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={alarmaVisible}
        onRequestClose={detenerAlarma} // Botón físico atrás
      >
        <View style={styles.alarmContainer}>
          <MaterialCommunityIcons name="alarm-light" size={100} color="#fff" style={styles.alarmIcon} />
          <Text style={styles.alarmTitle}>¡ES HORA!</Text>
          <Text style={styles.alarmText}>{tituloAlarmaActual}</Text>
          
          <View style={styles.alarmAnimation}>
            <MaterialCommunityIcons name="bell-ring" size={60} color="#FFEB3B" />
          </View>

          <TouchableOpacity style={styles.stopButton} onPress={detenerAlarma}>
            <MaterialCommunityIcons name="alarm-off" size={32} color="#D32F2F" />
            <Text style={styles.stopButtonText}>APAGAR ALARMA</Text>
          </TouchableOpacity>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f4f4f4" },
  titulo: { fontSize: 22, fontWeight: "bold", textAlign: "center", color: "#2E7D32", marginBottom: 15 },
  cardForm: { backgroundColor: "#fff", padding: 15, borderRadius: 10, elevation: 3 },
  label: { fontSize: 14, fontWeight: "600", color: "#666", marginBottom: 5 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 15, fontSize: 16, backgroundColor: '#FAFAFA' },
  dateBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#E8F5E9", padding: 12, borderRadius: 8, marginBottom: 15 },
  dateText: { marginLeft: 10, fontSize: 16, fontWeight: "bold", color: "#2E7D32" },
  rowSwitch: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  labelSwitch: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  intervaloContainer: { marginBottom: 10 },
  btnProgramar: { backgroundColor: "#2E7D32", padding: 15, borderRadius: 8, alignItems: "center", marginTop: 5 },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  subtitulo: { fontSize: 18, fontWeight: "bold", color: "#555", marginTop: 25, marginBottom: 10 },
  empty: { textAlign: "center", color: "#999", marginTop: 10, fontStyle: "italic" },
  itemCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: "#2196F3", elevation: 1 },
  itemRepetitivo: { borderLeftColor: "#FF9800" },
  itemTitle: { fontSize: 16, fontWeight: "bold", color: "#333" },
  itemDate: { fontSize: 14, color: "#666", marginTop: 4 },
  tagRepetitivo: { fontSize: 12, color: "#FF9800", fontWeight: 'bold', marginTop: 4 },
  
  // ESTILOS DE LA PANTALLA DE ALARMA
  alarmContainer: { flex: 1, backgroundColor: "#D32F2F", justifyContent: "center", alignItems: "center", padding: 30 },
  alarmIcon: { marginBottom: 20 },
  alarmTitle: { fontSize: 32, fontWeight: "900", color: "#fff", marginBottom: 10, letterSpacing: 2 },
  alarmText: { fontSize: 20, color: "#fff", textAlign: "center", marginBottom: 50, fontWeight: "500" },
  alarmAnimation: { marginBottom: 50, padding: 20, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100 },
  stopButton: { flexDirection: 'row', backgroundColor: "#fff", paddingVertical: 20, paddingHorizontal: 40, borderRadius: 50, alignItems: "center", elevation: 10 },
  stopButtonText: { color: "#D32F2F", fontWeight: "bold", fontSize: 18, marginLeft: 10 }
});