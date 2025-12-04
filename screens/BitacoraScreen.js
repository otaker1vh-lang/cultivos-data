import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Keyboard, ScrollView, Image 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker'; // <--- IMPORTANTE
import { MaterialCommunityIcons } from '@expo/vector-icons';

const CATALOGO_ETAPAS = {
  "Maiz": ["Siembra", "Germinación", "V1-V3 (Plántula)", "V4-V10 (Crecimiento)", "VT (Floración)", "R1-R5 (Llenado)", "Madurez", "Cosecha"],
  "Frijol": ["Siembra", "Emergencia", "Vegetativo", "Floración", "Vainas", "Madurez", "Cosecha"],
  "General": ["Preparación", "Siembra", "Desarrollo", "Floración", "Fructificación", "Cosecha"]
};

export default function BitacoraScreen({ route }) {
  const { cultivo } = route.params || { cultivo: 'General' };
  const etapasDisponibles = CATALOGO_ETAPAS[cultivo] || CATALOGO_ETAPAS["General"];
  const STORAGE_KEY = `@bitacora_v3_fotos_${cultivo}`;

  // ESTADOS
  const [nota, setNota] = useState('');
  const [etapa, setEtapa] = useState(etapasDisponibles[0]);
  const [fechaObservacion, setFechaObservacion] = useState(new Date());
  const [imagen, setImagen] = useState(null); // <--- Estado para la foto temporal
  const [registros, setRegistros] = useState([]);
  
  // UI
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [expandirFormulario, setExpandirFormulario] = useState(true);

  useEffect(() => {
    cargarRegistros();
    setEtapa(etapasDisponibles[0]);
  }, [cultivo]);

  const cargarRegistros = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
      if (jsonValue != null) setRegistros(JSON.parse(jsonValue));
    } catch (e) { console.log("Error cargando"); }
  };

  // FUNCION DE CÁMARA
  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso necesario', 'Se requiere acceso a la cámara para la evidencia.');
      return;
    }
    
    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.5, // Calidad media para no llenar la memoria rápido
    });

    if (!resultado.canceled) {
      setImagen(resultado.assets[0].uri); // Guardamos la ruta de la foto
    }
  };

  const guardarRegistro = async () => {
    if (nota.trim() === '' && !imagen) {
      Alert.alert("Vacío", "Escribe una nota o toma una foto.");
      return;
    }

    const nuevoRegistro = {
      id: Date.now().toString(),
      fechaSuceso: fechaObservacion.toISOString(),
      etapa: etapa,
      texto: nota,
      fotoUri: imagen // <--- Guardamos la ruta de la foto en el registro
    };

    const nuevosRegistros = [nuevoRegistro, ...registros];

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nuevosRegistros));
      setRegistros(nuevosRegistros);
      // Limpiar
      setNota('');
      setImagen(null);
      Keyboard.dismiss();
      Alert.alert("Guardado", "Registro añadido con éxito.");
    } catch (e) { Alert.alert("Error", "No se pudo guardar."); }
  };

  const eliminarRegistro = async (id) => {
    const lista = registros.filter(item => item.id !== id);
    setRegistros(lista);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  };

  const formatearFecha = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => setExpandirFormulario(!expandirFormulario)}>
        <Text style={styles.titulo}>{expandirFormulario ? "▼ Nueva Entrada" : "▲ Ver Formulario"} ({cultivo})</Text>
      </TouchableOpacity>
      
      {expandirFormulario && (
        <View style={styles.formContainer}>
          {/* FECHA */}
          <TouchableOpacity style={styles.dateBtn} onPress={() => setMostrarPicker(true)}>
            <MaterialCommunityIcons name="calendar" size={20} color="#2E7D32" />
            <Text style={styles.dateText}> {formatearFecha(fechaObservacion)}</Text>
          </TouchableOpacity>
          
          {mostrarPicker && (
            <DateTimePicker value={fechaObservacion} mode="date" display="default" 
              onChange={(e, d) => { setMostrarPicker(false); if(d) setFechaObservacion(d); }} 
            />
          )}

          {/* ETAPAS */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginVertical:10}}>
            {etapasDisponibles.map((e) => (
              <TouchableOpacity key={e} style={[styles.chip, etapa === e && styles.chipSelected]} onPress={() => setEtapa(e)}>
                <Text style={[styles.chipText, etapa === e && styles.chipTextSelected]}>{e}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TextInput style={styles.inputArea} placeholder="Observaciones..." value={nota} onChangeText={setNota} multiline />

          {/* BOTÓN CÁMARA Y PREVIEW */}
          <View style={styles.camaraRow}>
            <TouchableOpacity style={styles.btnCamara} onPress={tomarFoto}>
              <MaterialCommunityIcons name="camera" size={24} color="#fff" />
              <Text style={{color:'#fff', marginLeft:5}}>Evidencia</Text>
            </TouchableOpacity>
            {imagen && <Image source={{uri: imagen}} style={styles.miniPreview} />}
          </View>

          <TouchableOpacity style={styles.botonGuardar} onPress={guardarRegistro}>
            <Text style={styles.textoBoton}>💾 Guardar</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={registros}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.badgeText}>{item.etapa}</Text>
              <Text style={styles.fecha}>{formatearFecha(item.fechaSuceso)}</Text>
            </View>
            {item.texto ? <Text style={styles.textoNota}>{item.texto}</Text> : null}
            
            {/* MOSTRAR FOTO SI EXISTE */}
            {item.fotoUri && (
              <Image source={{ uri: item.fotoUri }} style={styles.fotoGrande} />
            )}
            
            <TouchableOpacity style={styles.btnEliminar} onPress={() => eliminarRegistro(item.id)}>
              <MaterialCommunityIcons name="trash-can-outline" size={20} color="#999" />
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F8', padding: 15 },
  titulo: { fontSize: 20, fontWeight: 'bold', color: '#1B5E20', marginBottom: 10, textAlign: 'center' },
  formContainer: { backgroundColor: '#fff', padding: 15, borderRadius: 12, elevation: 3, marginBottom: 10 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 8, borderRadius: 8, alignSelf:'flex-start' },
  dateText: { color: '#2E7D32', fontWeight: 'bold' },
  chip: { padding: 8, borderRadius: 20, backgroundColor: '#eee', marginRight: 8 },
  chipSelected: { backgroundColor: '#4CAF50' },
  chipText: { fontSize: 12, color: '#555' },
  chipTextSelected: { color: '#fff', fontWeight: 'bold' },
  inputArea: { backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#eee', height: 60 },
  camaraRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  btnCamara: { flexDirection: 'row', backgroundColor: '#FF9800', padding: 8, borderRadius: 8, alignItems:'center' },
  miniPreview: { width: 40, height: 40, borderRadius: 5, marginLeft: 10, borderWidth:1, borderColor:'#ddd' },
  botonGuardar: { backgroundColor: '#2E7D32', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  textoBoton: { color: '#fff', fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  badgeText: { color: '#2E7D32', fontWeight: 'bold', backgroundColor: '#E8F5E9', paddingHorizontal:6, borderRadius:4, fontSize:12 },
  fecha: { color: '#999', fontSize: 12 },
  textoNota: { fontSize: 15, color: '#333', marginBottom: 5 },
  fotoGrande: { width: '100%', height: 200, borderRadius: 8, marginTop: 5, resizeMode: 'cover' },
  btnEliminar: { position: 'absolute', bottom: 10, right: 10 }
});