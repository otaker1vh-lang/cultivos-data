import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Image, Alert, Modal, Dimensions, ActivityIndicator 
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Asset } from 'expo-asset'; // Usamos la clase Asset directamente
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import cultivosData from "../data/cultivos.json";
import { TreatmentCard } from '../components/TreatmentCard';

const SCREEN_WIDTH = Dimensions.get('window').width;

const getRiesgo = (plagaTipo) => {
    const tipo = plagaTipo || 'Desconocido';
    if (tipo.includes('Plaga') || tipo.includes('Insecto')) return { color: '#FF9800', nivel: 'Moderado (Monitoreo)' };
    if (tipo.includes('Hongo') || tipo.includes('Oomycete') || tipo.includes('Bacteria')) return { color: '#D32F2F', nivel: 'Alto (Preventivo)' };
    if (tipo.includes('Virus') || tipo.includes('Vector')) return { color: '#FBC02D', nivel: 'Crítico (Control)' };
    return { color: '#1976D2', nivel: 'Bajo' };
};

export default function PlagasScreen({ route }) {
  const { cultivo } = route.params || { cultivo: 'General' };
  
  const STORAGE_KEY_CUSTOM = `@plagas_nuevas_${cultivo}`;
  const STORAGE_KEY_DETAILS = `@plagas_detalles_${cultivo}`;

  const [listaCompleta, setListaCompleta] = useState([]);
  const [vistaIA, setVistaIA] = useState(false);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [plagaEditando, setPlagaEditando] = useState(null);
  const [editIngrediente, setEditIngrediente] = useState('');
  const [editDosis, setEditDosis] = useState('');
  const [editFoto, setEditFoto] = useState(null);

  const [mostrarFormularioNuevo, setMostrarFormularioNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [imageIA, setImageIA] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loadingIA, setLoadingIA] = useState(false);
  const [labels, setLabels] = useState([]);
  const [isModelReady, setIsModelReady] = useState(false);
  const [areLabelsReady, setAreLabelsReady] = useState(false); // Nuevo estado

  const cultivoDataJson = cultivosData?.cultivos?.[cultivo];
  const cicloMensual = cultivoDataJson?.ciclo_fenologico?.ciclo_mensual_principal;
  const mesActual = new Date().toLocaleString('es-ES', { month: 'long' });
  const etapaActual = cicloMensual ? (cicloMensual[mesActual.charAt(0).toUpperCase() + mesActual.slice(1)] || 'Fuera de Ciclo') : 'N/A';

  // CARGA DE MODELO
  const tensorflow = useTensorflowModel(require('../assets/model/roslin_model.tflite'));

  useEffect(() => {
    cargarYFusionarDatos();
  }, [cultivo, modalVisible]);

  // --- CORRECCIÓN DE CARGA DE ETIQUETAS ---
  useEffect(() => {
    async function loadLabels() {
      try {
        // 1. Resolver el asset explícitamente
        const asset = Asset.fromModule(require('../assets/model/labels.txt'));
        
        // 2. Forzar descarga para asegurar que existe localmente
        await asset.downloadAsync();
        
        // 3. Leer usando la URI local segura
        const uri = asset.localUri || asset.uri;
        const text = await FileSystem.readAsStringAsync(uri);
        
        const lista = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        setLabels(lista);
        setAreLabelsReady(true);
      } catch (e) { 
        console.error("Error labels:", e); 
        // No alertar aquí para no bloquear la UI al inicio
      }
    }
    loadLabels();
  }, []);

  useEffect(() => {
    if (tensorflow.model) setIsModelReady(true);
  }, [tensorflow.model]);

  // ... (RESTO DE FUNCIONES IGUALES: cargarYFusionarDatos, plagaCritica, semaforo, gestionarImagenManual, guardarDetalles, abrirEditor, crearPlagaNueva)
  const cargarYFusionarDatos = async () => { try { const datosEstaticos = cultivoDataJson?.plagas_y_enfermedades || []; const rawCustom = await AsyncStorage.getItem(STORAGE_KEY_CUSTOM); const datosUsuario = rawCustom ? JSON.parse(rawCustom) : []; const rawDetails = await AsyncStorage.getItem(STORAGE_KEY_DETAILS); const detallesExtra = rawDetails ? JSON.parse(rawDetails) : {}; const baseCombinada = [...datosEstaticos, ...datosUsuario]; const listaFinal = baseCombinada.map(plaga => { const extras = detallesExtra[plaga.nombre] || {}; return { ...plaga, ...extras }; }); setListaCompleta(listaFinal); } catch (e) { console.log(e); } };
  const plagaCritica = listaCompleta.reduce((masCritica, plaga) => { const riesgoActual = getRiesgo(plaga.tipo); const riesgoCritico = getRiesgo(masCritica ? masCritica.tipo : null); return (riesgoActual.nivel.includes('Crítico') || riesgoActual.nivel.includes('Alto')) ? plaga : masCritica; }, null);
  const semaforo = plagaCritica ? getRiesgo(plagaCritica.tipo) : { color: '#4CAF50', nivel: 'Bajo Riesgo' };
  const gestionarImagenManual = async () => { Alert.alert("Subir Evidencia", "Fuente:", [ { text: "Cancelar", style: "cancel" }, { text: "📸 Cámara", onPress: () => lanzarPickerManual('camara') }, { text: "🖼️ Galería", onPress: () => lanzarPickerManual('galeria') }, ] ); };
  const lanzarPickerManual = async (modo) => { const { status } = await ImagePicker.requestCameraPermissionsAsync(); if (status !== 'granted') return Alert.alert("Permiso denegado"); let resultado; const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.6 }; if (modo === 'camara') resultado = await ImagePicker.launchCameraAsync(opts); else resultado = await ImagePicker.launchImageLibraryAsync(opts); if (!resultado.canceled) setEditFoto(resultado.assets[0].uri); };
  const guardarDetalles = async () => { if (!plagaEditando) return; try { const rawDetails = await AsyncStorage.getItem(STORAGE_KEY_DETAILS); const detallesActuales = rawDetails ? JSON.parse(rawDetails) : {}; detallesActuales[plagaEditando.nombre] = { userIngrediente: editIngrediente, userDosis: editDosis, userFoto: editFoto }; await AsyncStorage.setItem(STORAGE_KEY_DETAILS, JSON.stringify(detallesActuales)); setModalVisible(false); cargarYFusionarDatos(); Alert.alert("Guardado", "Información actualizada."); } catch (e) { Alert.alert("Error"); } };
  const abrirEditor = (plaga) => { setPlagaEditando(plaga); setEditIngrediente(plaga.userIngrediente || ''); setEditDosis(plaga.userDosis || ''); setEditFoto(plaga.userFoto || null); setModalVisible(true); };
  const crearPlagaNueva = async () => { if (!nuevoNombre.trim()) return Alert.alert("Falta Nombre"); const nueva = { id: Date.now().toString(), nombre: nuevoNombre, tipo: 'Plaga Registrada', descripcion: "Personalizado", control: { mecanismo: "Manual", productos_activos_mexico: [] }, esUsuario: true }; try { const rawCustom = await AsyncStorage.getItem(STORAGE_KEY_CUSTOM); const list = rawCustom ? JSON.parse(rawCustom) : []; await AsyncStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify([nueva, ...list])); setNuevoNombre(''); setMostrarFormularioNuevo(false); cargarYFusionarDatos(); setTimeout(() => abrirEditor(nueva), 500); } catch (e) { Alert.alert("Error"); } };

  // --- FUNCIONES IA ---
  const takePictureIA = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, skipProcessing: true });
        setImageIA(photo.uri);
      } catch (e) { Alert.alert("Error", "Fallo al tomar foto"); }
    }
  };

  const pickImageIA = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 1,
    });
    if (!res.canceled) setImageIA(res.assets[0].uri);
  };

  const classifyImage = async () => {
    if (!imageIA) return;
    
    // VALIDACIÓN ESTRICTA
    if (!isModelReady) {
        Alert.alert("Cargando IA...", "Espera unos segundos, el modelo se está iniciando."); return;
    }
    if (!areLabelsReady || labels.length === 0) {
        Alert.alert("Error Crítico", "No se pudo leer el archivo de etiquetas."); return;
    }

    setLoadingIA(true);
    try {
      const manip = await manipulateAsync(imageIA, [{ resize: { width: 224, height: 224 } }], { format: SaveFormat.JPEG });
      const imgB64 = await FileSystem.readAsStringAsync(manip.uri, { encoding: FileSystem.EncodingType.Base64 });
      const imgBuffer = Uint8Array.from(atob(imgB64), c => c.charCodeAt(0));
      const outputs = await tensorflow.model.run([imgBuffer]);
      const probabilities = outputs[0];

      let maxProb = 0; let maxIndex = 0;
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) { maxProb = probabilities[i]; maxIndex = i; }
      }

      if (maxProb < 0.40) {
          Alert.alert("No identificado", "No se detectó una plaga conocida con claridad.");
          setPrediction(null);
      } else {
          setPrediction({ label: labels[maxIndex] || "Desconocido", confidence: maxProb });
      }
    } catch (e) { Alert.alert("Error", "Fallo diagnóstico: " + e.message); } 
    finally { setLoadingIA(false); }
  };

  const resetStateIA = () => { setImageIA(null); setPrediction(null); setLoadingIA(false); };

  if (!permission) return <View />;
  if (!permission.granted && vistaIA) {
    return (
      <View style={styles.containerPermiso}>
        <Text style={{color:'#000', textAlign:'center', marginBottom:20}}>Permiso de cámara requerido para IA</Text>
        <TouchableOpacity style={styles.btnNuevo} onPress={requestPermission}><Text style={styles.btnText}>Dar Permiso</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnNuevo, {backgroundColor:'#999'}]} onPress={() => setVistaIA(false)}><Text style={styles.btnText}>Volver a Lista</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.titulo}>🛡️ {cultivo}</Text>
        <View style={styles.switchContainer}>
          <TouchableOpacity style={[styles.switchBtn, !vistaIA && styles.switchActive]} onPress={() => setVistaIA(false)}>
            <MaterialCommunityIcons name="format-list-bulleted" size={20} color={!vistaIA ? '#fff' : '#666'} />
            <Text style={[styles.switchText, !vistaIA && {color:'#fff'}]}> Lista</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.switchBtn, vistaIA && styles.switchActive]} onPress={() => setVistaIA(true)}>
            <MaterialCommunityIcons name="camera-iris" size={20} color={vistaIA ? '#fff' : '#666'} />
            <Text style={[styles.switchText, vistaIA && {color:'#fff'}]}> Diagnóstico IA</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!vistaIA ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
           <View style={[styles.semaforoCard, { borderColor: semaforo.color, backgroundColor: semaforo.color + '15' }]}>
               <Text style={styles.semaforoEtapa}>Fase Actual: <Text style={{fontWeight:'bold'}}>{etapaActual}</Text></Text>
               <View style={styles.semaforoRiesgoContainer}>
                   <View style={[styles.semaforoLuz, { backgroundColor: semaforo.color }]} />
                   <Text style={styles.semaforoRiesgoText}>Riesgo: {semaforo.nivel}</Text>
               </View>
               {plagaCritica && <Text style={styles.semaforoAlerta}>⚠️ Alerta: {plagaCritica.nombre}</Text>}
           </View>

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
        </ScrollView>
      ) : (
        <View style={{flex:1, backgroundColor:'#000'}}>
             <CameraView style={{flex:1}} ref={cameraRef}>
                <View style={styles.cameraControls}>
                    <TouchableOpacity style={styles.captureButton} onPress={takePictureIA}><View style={styles.captureInner}/></TouchableOpacity>
                    <TouchableOpacity style={styles.galleryButton} onPress={pickImageIA}><Text style={styles.galleryText}>Galería</Text></TouchableOpacity>
                </View>
             </CameraView>
        </View>
      )}

      <Modal visible={!!imageIA} animationType="slide">
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <Image source={{ uri: imageIA }} style={styles.previewImage} />
          <View style={styles.actionButtons}>
            {!prediction && (
                <TouchableOpacity 
                    style={[styles.buttonModal, styles.analyzeButton, (!isModelReady || !areLabelsReady || loadingIA) && {opacity:0.5}]} 
                    onPress={classifyImage}
                    disabled={!isModelReady || !areLabelsReady || loadingIA}
                >
                    {loadingIA ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>{isModelReady && areLabelsReady ? "🔍 Diagnosticar" : "Cargando IA..."}</Text>}
                </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.buttonModal, styles.closeButton]} onPress={resetStateIA}>
              <Text style={styles.buttonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
          {prediction && (
            <View style={styles.resultContainer}>
              <Text style={styles.confidenceText}>Confianza: {(prediction.confidence * 100).toFixed(1)}%</Text>
              <TreatmentCard predictionClass={prediction.label} />
            </View>
          )}
        </ScrollView>
      </Modal>

      <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📝 {plagaEditando?.nombre}</Text>
            <Text style={styles.label}>Producto / Ingrediente:</Text>
            <TextInput style={styles.input} value={editIngrediente} onChangeText={setEditIngrediente} placeholder="Ej. Cipermetrina" />
            <Text style={styles.label}>Dosis:</Text>
            <TextInput style={styles.input} value={editDosis} onChangeText={setEditDosis} placeholder="Ej. 10 ml/L" />
            <TouchableOpacity style={styles.btnCamaraModal} onPress={gestionarImagenManual}>
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
  containerPermiso: { flex:1, justifyContent:'center', alignItems:'center', padding:20 },
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
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginTop: 5, backgroundColor: '#FAFAFA' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 1, borderLeftWidth: 4, borderLeftColor: '#8BC34A' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom:5 },
  nombrePlaga: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  text: { fontSize: 15, marginBottom: 4, color:'#444', lineHeight:22 },
  foto: { width: '100%', height: 180, borderRadius: 8, marginVertical: 10 },
  datosContainer: { backgroundColor: '#F9F9F9', padding: 10, borderRadius: 8, marginTop:5 },
  textoUser: { fontSize: 15, color: '#2E7D32' },
  textoRef: { fontSize: 13, color: '#777', marginLeft: 10, marginBottom:2 },
  cameraControls: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 40, backgroundColor: 'rgba(0,0,0,0.3)', paddingTop: 20, position:'absolute', bottom:0, width:'100%' },
  captureButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  galleryButton: { padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 5, alignSelf: 'center' },
  galleryText: { color: '#fff', fontSize: 16 },
  modalScroll: { flexGrow: 1, backgroundColor: '#f5f5f5', alignItems: 'center', paddingVertical: 40 },
  previewImage: { width: 300, height: 300, borderRadius: 15, marginBottom: 20, borderWidth: 2, borderColor: '#ddd' },
  actionButtons: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  buttonModal: { paddingVertical: 12, paddingHorizontal: 25, borderRadius: 8, elevation: 3 },
  analyzeButton: { backgroundColor: '#2E7D32' },
  closeButton: { backgroundColor: '#D32F2F' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  resultContainer: { width: '100%', alignItems: 'center' },
  confidenceText: { fontSize: 14, color: '#666', marginBottom: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#1B5E20' },
  label: { fontWeight: 'bold', color: '#666', marginTop: 10 },
  btnCamaraModal: { flexDirection: 'row', backgroundColor: '#FF9800', padding: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 15 },
  previewFoto: { width: 100, height: 100, alignSelf: 'center', marginTop: 10, borderRadius: 8 },
  modalBotones: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  btnModal: { padding: 12, borderRadius: 8, width: '48%', alignItems: 'center' }
});