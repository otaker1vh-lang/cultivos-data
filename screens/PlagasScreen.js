import React, { useState, useEffect } from 'react';
import { 
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Image, Alert, Modal, Dimensions 
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import cultivosData from "../data/cultivos.json";

const SCREEN_WIDTH = Dimensions.get('window').width;

const getRiesgo = (plagaTipo) => {
    const tipo = plagaTipo || 'Desconocido';
    if (tipo.includes('Plaga')) return { color: '#FF9800', nivel: 'Moderado (Monitoreo)' };
    if (tipo.includes('Hongo') || tipo.includes('Oomycete')) return { color: '#D32F2F', nivel: 'Alto (Preventivo)' };
    if (tipo.includes('Virus') || tipo.includes('Vector')) return { color: '#FBC02D', nivel: 'Crítico (Control)' };
    return { color: '#1976D2', nivel: 'Bajo' };
};

export default function PlagasScreen({ route }) {
  const { cultivo } = route.params || { cultivo: 'General' };
  
  const STORAGE_KEY_CUSTOM = `@plagas_nuevas_${cultivo}`;
  const STORAGE_KEY_DETAILS = `@plagas_detalles_${cultivo}`;

  // ESTADOS
  const [listaCompleta, setListaCompleta] = useState([]);
  const [vistaGaleria, setVistaGaleria] = useState(false);
  
  // Modal y Edición
  const [modalVisible, setModalVisible] = useState(false);
  const [plagaEditando, setPlagaEditando] = useState(null);
  const [editIngrediente, setEditIngrediente] = useState('');
  const [editDosis, setEditDosis] = useState('');
  const [editFoto, setEditFoto] = useState(null);

  // Crear Plaga
  const [mostrarFormularioNuevo, setMostrarFormularioNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');

  // DATOS PARA EL SEMÁFORO
  const cultivoDataJson = cultivosData?.cultivos?.[cultivo];
  const cicloMensual = cultivoDataJson?.ciclo_fenologico?.ciclo_mensual_principal;
  const mesActual = new Date().toLocaleString('es-ES', { month: 'long' });
  const etapaActual = cicloMensual ? (cicloMensual[mesActual.charAt(0).toUpperCase() + mesActual.slice(1)] || 'Fuera de Ciclo') : 'N/A';

  useEffect(() => {
    cargarYFusionarDatos();
  }, [cultivo, modalVisible]);

  const cargarYFusionarDatos = async () => {
    try {
      const datosEstaticos = cultivoDataJson?.plagas_y_enfermedades || [];
      const rawCustom = await AsyncStorage.getItem(STORAGE_KEY_CUSTOM);
      const datosUsuario = rawCustom ? JSON.parse(rawCustom) : [];
      const rawDetails = await AsyncStorage.getItem(STORAGE_KEY_DETAILS);
      const detallesExtra = rawDetails ? JSON.parse(rawDetails) : {};

      const baseCombinada = [...datosEstaticos, ...datosUsuario];

      const listaFinal = baseCombinada.map(plaga => {
        const extras = detallesExtra[plaga.nombre] || {};
        return { ...plaga, ...extras };
      });

      setListaCompleta(listaFinal);
    } catch (e) { console.log("Error cargando datos", e); }
  };

  // --- LOGICA DEL SEMÁFORO (CORREGIDA) ---
  // Ahora usamos "plagaCritica" consistentemente
  const plagaCritica = listaCompleta.reduce((masCritica, plaga) => {
      const riesgoActual = getRiesgo(plaga.tipo);
      const riesgoCritico = getRiesgo(masCritica ? masCritica.tipo : null);
      // Si la actual es crítica y la anterior no, o si no había anterior, esta gana
      return (riesgoActual.nivel.includes('Crítico') || riesgoActual.nivel.includes('Alto')) ? plaga : masCritica;
  }, null);

  const semaforo = plagaCritica ? getRiesgo(plagaCritica.tipo) : { color: '#4CAF50', nivel: 'Bajo Riesgo' };

  // --- FUNCIONES DE IMAGEN Y GUARDADO ---
  const gestionarImagen = async () => {
    Alert.alert("Subir Evidencia", "Fuente de la imagen:", [
        { text: "Cancelar", style: "cancel" },
        { text: "📸 Cámara", onPress: () => lanzarPicker('camara') },
        { text: "🖼️ Galería", onPress: () => lanzarPicker('galeria') },
      ]
    );
  };

  const lanzarPicker = async (modo) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Permiso denegado");
    
    let resultado;
    const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.6 };
    
    if (modo === 'camara') resultado = await ImagePicker.launchCameraAsync(opts);
    else resultado = await ImagePicker.launchImageLibraryAsync(opts);

    if (!resultado.canceled) setEditFoto(resultado.assets[0].uri);
  };

  const guardarDetalles = async () => {
    if (!plagaEditando) return;
    try {
      const rawDetails = await AsyncStorage.getItem(STORAGE_KEY_DETAILS);
      const detallesActuales = rawDetails ? JSON.parse(rawDetails) : {};
      detallesActuales[plagaEditando.nombre] = { userIngrediente: editIngrediente, userDosis: editDosis, userFoto: editFoto };
      await AsyncStorage.setItem(STORAGE_KEY_DETAILS, JSON.stringify(detallesActuales));
      setModalVisible(false);
      Alert.alert("Guardado", "Información actualizada.");
    } catch (e) { Alert.alert("Error"); }
  };

  const abrirEditor = (plaga) => {
    setPlagaEditando(plaga);
    setEditIngrediente(plaga.userIngrediente || ''); 
    setEditDosis(plaga.userDosis || '');
    setEditFoto(plaga.userFoto || null);
    setModalVisible(true);
  };

  const crearPlagaNueva = async () => {
    if (!nuevoNombre.trim()) return Alert.alert("Falta Nombre");
    const nueva = { id: Date.now().toString(), nombre: nuevoNombre, tipo: 'Plaga Registrada', descripcion: "Personalizado", control: { mecanismo: "Manual", productos_activos_mexico: [] }, esUsuario: true };
    try {
      const rawCustom = await AsyncStorage.getItem(STORAGE_KEY_CUSTOM);
      const list = rawCustom ? JSON.parse(rawCustom) : [];
      await AsyncStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify([nueva, ...list]));
      setNuevoNombre(''); setMostrarFormularioNuevo(false); cargarYFusionarDatos();
      setTimeout(() => abrirEditor(nueva), 500);
    } catch (e) { Alert.alert("Error"); }
  };

  // --- RENDERIZADO ---
  return (
    <View style={styles.mainContainer}>
      {/* HEADER */}
      <View style={styles.headerRow}>
        <Text style={styles.titulo}>🛡️ {cultivo}</Text>
        <View style={styles.switchContainer}>
          <TouchableOpacity style={[styles.switchBtn, !vistaGaleria && styles.switchActive]} onPress={() => setVistaGaleria(false)}>
            <MaterialCommunityIcons name="text-box-search-outline" size={20} color={!vistaGaleria ? '#fff' : '#666'} />
            <Text style={[styles.switchText, !vistaGaleria && {color:'#fff'}]}> Info</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.switchBtn, vistaGaleria && styles.switchActive]} onPress={() => setVistaGaleria(true)}>
            <MaterialCommunityIcons name="grid" size={20} color={vistaGaleria ? '#fff' : '#666'} />
            <Text style={[styles.switchText, vistaGaleria && {color:'#fff'}]}> Fotos IA</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* VISTA 1: CONFIGURACIÓN DETALLADA */}
        {!vistaGaleria && (
          <>
            {/* SEMÁFORO DETALLADO */}
            <View style={[styles.semaforoCard, { borderColor: semaforo.color, backgroundColor: semaforo.color + '15' }]}>
                <Text style={styles.semaforoEtapa}>Fase Actual: <Text style={{fontWeight:'bold'}}>{etapaActual}</Text></Text>
                <View style={styles.semaforoRiesgoContainer}>
                    <View style={[styles.semaforoLuz, { backgroundColor: semaforo.color }]} />
                    <Text style={styles.semaforoRiesgoText}>Riesgo: {semaforo.nivel}</Text>
                </View>
                {/* Aquí es donde fallaba antes: Ahora usamos 'plagaCritica' que sí existe */}
                {plagaCritica && (
                    <Text style={styles.semaforoAlerta}>⚠️ Alerta: {plagaCritica.nombre}</Text>
                )}
            </View>

            {/* BOTÓN NUEVA PLAGA */}
            {!mostrarFormularioNuevo ? (
              <TouchableOpacity style={styles.btnNuevo} onPress={() => setMostrarFormularioNuevo(true)}>
                <Text style={styles.btnText}>+ Registrar Plaga Manual</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.formNuevo}>
                <TextInput style={styles.input} value={nuevoNombre} onChangeText={setNuevoNombre} placeholder="Nombre de la plaga..." />
                <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:10}}>
                  <TouchableOpacity onPress={() => setMostrarFormularioNuevo(false)} style={[styles.btnSmall, {backgroundColor:'#999'}]}><Text style={{color:'white'}}>Cancelar</Text></TouchableOpacity>
                  <TouchableOpacity onPress={crearPlagaNueva} style={styles.btnSmall}><Text style={{color:'white'}}>Guardar</Text></TouchableOpacity>
                </View>
              </View>
            )}

            {/* LISTA DETALLADA */}
            {listaCompleta.map((plaga, index) => (
              <View key={index} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.nombrePlaga}>{plaga.nombre}</Text>
                  <TouchableOpacity onPress={() => abrirEditor(plaga)}>
                    <MaterialCommunityIcons name="pencil-circle" size={24} color="#1976D2" />
                  </TouchableOpacity>
                </View>
                
                <Text style={{fontStyle:'italic', color:'#666', marginBottom:5}}>{plaga.tipo}</Text>
                <Text style={styles.text}>Síntomas: <Text style={{fontWeight:'bold'}}>{plaga.descripcion}</Text></Text>

                {plaga.userFoto && <Image source={{ uri: plaga.userFoto }} style={styles.foto} />}

                <View style={styles.datosContainer}>
                  {plaga.userIngrediente && (
                    <View style={{marginBottom: 5}}>
                      <Text style={{fontWeight:'bold', color:'#2E7D32'}}>Tu Tratamiento:</Text>
                      <Text style={styles.textoUser}>💊 {plaga.userIngrediente} ({plaga.userDosis})</Text>
                    </View>
                  )}
                  
                  {!plaga.esUsuario && plaga.control?.productos_activos_mexico?.length > 0 && (
                    <View>
                      <Text style={{fontWeight:'bold', color:'#555', marginTop:5}}>Recomendado (Guía):</Text>
                      {plaga.control.productos_activos_mexico.map((prod, idx) => (
                        <Text key={idx} style={styles.textoRef}>• {prod.ingrediente} ({prod.dosis_tipo})</Text>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* VISTA 2: GALERÍA IA */}
        {vistaGaleria && (
          <View style={styles.galeriaContainer}>
            <Text style={styles.infoIA}>Dataset para entrenamiento: {listaCompleta.filter(p => p.userFoto).length} imágenes</Text>
            <View style={styles.grid}>
              {listaCompleta.filter(p => p.userFoto).map((item, index) => (
                <TouchableOpacity key={index} style={styles.gridItem} onPress={() => abrirEditor(item)}>
                  <Image source={{ uri: item.userFoto }} style={styles.gridImage} />
                  <View style={styles.gridLabel}><Text style={styles.gridText} numberOfLines={1}>{item.nombre}</Text></View>
                </TouchableOpacity>
              ))}
            </View>
            {listaCompleta.filter(p => p.userFoto).length === 0 && (
                <Text style={{textAlign:'center', color:'#999', marginTop:20}}>No hay fotos subidas. Ve a la pestaña "Info" y agrega fotos.</Text>
            )}
          </View>
        )}

      </ScrollView>

      {/* MODAL */}
      <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📝 {plagaEditando?.nombre}</Text>
            <Text style={styles.label}>Producto / Ingrediente:</Text>
            <TextInput style={styles.input} value={editIngrediente} onChangeText={setEditIngrediente} placeholder="Ej. Cipermetrina" />
            <Text style={styles.label}>Dosis:</Text>
            <TextInput style={styles.input} value={editDosis} onChangeText={setEditDosis} placeholder="Ej. 10 ml/L" />
            <TouchableOpacity style={styles.btnCamara} onPress={gestionarImagen}>
              <MaterialCommunityIcons name="camera" size={20} color="#fff" />
              <Text style={{color:'white', marginLeft:5}}>{editFoto ? "Cambiar Foto" : "Agregar Foto"}</Text>
            </TouchableOpacity>
            {editFoto && <Image source={{ uri: editFoto }} style={styles.previewFoto} />}
            <View style={styles.modalBotones}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.btnModal, {backgroundColor:'#E57373'}]}><Text style={{color:'white'}}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity onPress={guardarDetalles} style={[styles.btnModal, {backgroundColor:'#4CAF50'}]}><Text style={{color:'white'}}>Guardar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#F2F4F8" },
  scrollContent: { padding: 15, paddingBottom: 40 },
  headerRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:15, backgroundColor:'#fff', elevation:2 },
  titulo: { fontSize: 20, fontWeight: "bold", color: '#1B5E20' },
  switchContainer: { flexDirection:'row', backgroundColor:'#eee', borderRadius:8, padding:2 },
  switchBtn: { flexDirection:'row', padding: 8, borderRadius: 6, alignItems:'center' },
  switchActive: { backgroundColor: '#2E7D32' },
  switchText: { fontSize:12, fontWeight:'bold', color:'#666' },

  semaforoCard: { padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 2 },
  semaforoRiesgoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  semaforoLuz: { width: 16, height: 16, borderRadius: 8, marginRight: 10, borderWidth:1, borderColor:'rgba(0,0,0,0.1)' },
  semaforoEtapa: { fontSize: 15, marginBottom: 5, color:'#444' },
  semaforoRiesgoText: { fontSize: 16, fontWeight: 'bold', color:'#333' },
  semaforoAlerta: { fontSize: 14, marginTop: 5, color: '#D32F2F', fontWeight:'bold' },

  btnNuevo: { backgroundColor: '#1976D2', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom:15 },
  btnText: { color: 'white', fontWeight: 'bold' },
  formNuevo: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15 },
  btnSmall: { padding: 8, borderRadius: 5, backgroundColor: '#2E7D32', width:'45%', alignItems:'center' },
  
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 1, borderLeftWidth: 4, borderLeftColor: '#8BC34A' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom:5 },
  nombrePlaga: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  text: { fontSize: 15, marginBottom: 4, color:'#444', lineHeight:22 },
  foto: { width: '100%', height: 180, borderRadius: 8, marginVertical: 10 },
  datosContainer: { backgroundColor: '#F9F9F9', padding: 10, borderRadius: 8, marginTop:5 },
  textoUser: { fontSize: 15, color: '#2E7D32' },
  textoRef: { fontSize: 13, color: '#777', marginLeft: 10, marginBottom:2 },

  // Galería
  infoIA: { textAlign:'center', color:'#555', marginBottom:15, backgroundColor:'#E8F5E9', padding:10, borderRadius:8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridItem: { width: (SCREEN_WIDTH / 2) - 25, marginBottom: 15, backgroundColor:'#fff', borderRadius:10, elevation:2, overflow:'hidden' },
  gridImage: { width: '100%', height: 120 },
  gridLabel: { padding: 8, backgroundColor:'rgba(0,0,0,0.05)' },
  gridText: { fontSize: 12, fontWeight:'bold', textAlign:'center', color:'#333' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#1B5E20' },
  label: { fontWeight: 'bold', color: '#666', marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginTop: 5, backgroundColor: '#FAFAFA' },
  btnCamara: { flexDirection: 'row', backgroundColor: '#FF9800', padding: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 15 },
  previewFoto: { width: 100, height: 100, alignSelf: 'center', marginTop: 10, borderRadius: 8 },
  modalBotones: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  btnModal: { padding: 12, borderRadius: 8, width: '48%', alignItems: 'center' }
});