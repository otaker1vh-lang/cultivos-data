import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert, Platform, Keyboard 
} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Configuración de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RecordatoriosScreen({ route }) {
  const { cultivo } = route.params || { cultivo: 'General' };
  const STORAGE_KEY = `@agenda_${cultivo}`;
  
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(new Date());
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [modo, setModo] = useState('date');
  const [listaRecordatorios, setListaRecordatorios] = useState([]);

  // 1. INICIALIZACIÓN
  useEffect(() => {
    registerForPushNotificationsAsync();
    cargarDatosGuardados();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        Alert.alert('Permiso denegado', 'No podremos enviarte recordatorios.');
      }
    }
  };

  const cargarDatosGuardados = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
      if (jsonValue != null) {
        setListaRecordatorios(JSON.parse(jsonValue));
      }
    } catch (e) {
      console.log("Error cargando lista");
    }
  };

  // 2. FUNCIONES DEL CALENDARIO
  const formatearFecha = (date) => {
    if (!date) return "Seleccionar Fecha";
    const fechaObj = new Date(date);
    const opciones = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
    return fechaObj.toLocaleString('es-MX', opciones);
  };

  const abrirSelector = () => {
    Keyboard.dismiss();
    setModo('date');
    setMostrarPicker(true);
  };

  const onChange = (event, selectedDate) => {
    setMostrarPicker(false);
    if (event.type !== 'set' || !selectedDate) return;

    const fechaActual = selectedDate;
    setFecha(fechaActual);

    if (modo === 'date') {
      setModo('time');
      setTimeout(() => setMostrarPicker(true), 100);
    }
  };

  // 3. PROGRAMAR Y GUARDAR
  const programarRecordatorio = async () => {
    if (titulo.trim() === '') {
      Alert.alert("Falta información", "Escribe la actividad.");
      return;
    }
    
    const ahora = new Date();
    if (fecha.getTime() < (ahora.getTime() - 60000)) {
      Alert.alert("Fecha inválida", "La fecha debe ser futura.");
      return;
    }

    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `🚜 ${cultivo}: ${titulo}`,
          body: `Es hora de realizar tu actividad programada.`,
          sound: true,
        },
        trigger: { date: fecha },
      });

      const nuevaTarea = {
        id: Date.now().toString(),
        notificationId: notificationId,
        titulo: titulo,
        fecha: fecha.toISOString(),
        completado: false
      };

      const nuevaLista = [nuevaTarea, ...listaRecordatorios];
      setListaRecordatorios(nuevaLista);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nuevaLista));

      Alert.alert("¡Agendado!", "La actividad se guardó y te avisaremos.");
      setTitulo('');
      Keyboard.dismiss();

    } catch (e) {
      Alert.alert("Error", "No se pudo guardar el recordatorio.");
      console.error(e);
    }
  };

  const eliminarTarea = async (id, notificationId) => {
    Alert.alert("Eliminar", "¿Borrar esta actividad?", [
      { text: "Cancelar" },
      { 
        text: "Borrar", 
        style: "destructive",
        onPress: async () => {
          if (notificationId) {
            await Notifications.cancelScheduledNotificationAsync(notificationId);
          }
          const listaFiltrada = listaRecordatorios.filter(item => item.id !== id);
          setListaRecordatorios(listaFiltrada);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(listaFiltrada));
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>⏰ Agenda para {cultivo}</Text>

      <View style={styles.cardForm}>
        <Text style={styles.label}>Actividad:</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Ej. Riego, Poda..." 
          value={titulo}
          onChangeText={setTitulo}
        />

        <Text style={styles.label}>Fecha y Hora:</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={abrirSelector}>
          <MaterialCommunityIcons name="calendar-clock" size={24} color="#555" />
          <Text style={styles.dateText}>
            {formatearFecha(fecha)}
          </Text>
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

        <TouchableOpacity style={styles.btnProgramar} onPress={programarRecordatorio}>
          <Text style={styles.btnText}>💾 Guardar y Programar</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitulo}>Mis Actividades Guardadas:</Text>
      
      <FlatList
        data={listaRecordatorios}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={<Text style={styles.empty}>No hay actividades guardadas.</Text>}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <View style={{flex:1}}>
                <Text style={styles.itemTitle}>{item.titulo}</Text>
                <Text style={styles.itemDate}>
                    📅 {formatearFecha(item.fecha)}
                </Text>
            </View>
            <TouchableOpacity onPress={() => eliminarTarea(item.id, item.notificationId)}>
                <MaterialCommunityIcons name="delete-circle" size={32} color="#E57373" />
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f4f4' },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32', marginBottom: 15, textAlign: 'center' },
  subtitulo: { fontSize: 18, fontWeight: 'bold', color: '#555', marginTop: 20, marginBottom: 10 },
  cardForm: { backgroundColor: '#fff', padding: 15, borderRadius: 10, elevation: 2 },
  label: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 15, fontSize: 16 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 12, borderRadius: 8, marginBottom: 20 },
  dateText: { marginLeft: 10, fontSize: 16, color: '#2E7D32', fontWeight: 'bold' },
  btnProgramar: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#2196F3', elevation: 1 },
  itemTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  itemDate: { fontSize: 14, color: '#666', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 10, fontStyle: 'italic' }
});