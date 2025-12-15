import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Image, Modal, 
  ScrollView, Alert, FlatList, TextInput, ActivityIndicator 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; 
import { useTensorflowModel } from 'react-native-fast-tflite';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

// IMPORTACIÓN DE DATOS
import cultivosDataJSON from '../data/cultivos.json'; 
import { TreatmentCard } from '../components/TreatmentCard';

export default function PlagasScreen({ route, navigation }) {
  // 1. RECIBIR CULTIVO (Por defecto Maíz si falla)
  const { cultivo } = route.params || { cultivo: 'Maíz' };
  const STORAGE_KEY = `@notas_v2_${cultivo}`; // Clave para guardar datos

  // --- ESTADOS ---
  const [listaFusionada, setListaFusionada] = useState([]); 
  const [plagaSeleccionada, setPlagaSeleccionada] = useState(null);
  
  // Modales
  const [modalEditarVisible, setModalEditarVisible] = useState(false);
  const [modalCameraVisible, setModalCameraVisible] = useState(false);

  // --- ESTADOS PARA EDICIÓN (Bitácora) ---
  const [misSintomas, setMisSintomas] = useState('');
  const [listaTratamientos, setListaTratamientos] = useState([]); // Lista dinámica
  
  // Inputs temporales para agregar a la lista
  const [tempProducto, setTempProducto] = useState(''); 
  const [tempDosis, setTempDosis] = useState('');

  // --- ESTADOS IA ---
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [image, setImage] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loadingIA, setLoadingIA] = useState(false);
  const [labels, setLabels] = useState([]);
  
  const tflite = useTensorflowModel(require('../assets/model/roslin_model.tflite'));
  const model = tflite.model;

  // Carga Etiquetas IA
  useEffect(() => {
    async function loadLabels() {
      try {
        const labelsAsset = Asset.fromModule(require('../assets/model/labels.txt'));
        await labelsAsset.downloadAsync();
        const uri = labelsAsset.localUri || labelsAsset.uri;
        const text = await FileSystem.readAsStringAsync(uri);
        setLabels(text.split('\n').map(l => l.trim()).filter(l => l.length > 0));
      } catch (e) { console.log("Nota: Etiquetas IA pendientes"); }
    }
    loadLabels();
  }, []);

  // ---------------------------------------------------------
  // 2. CARGAR DATOS (JSON + ASYNC STORAGE)
  // ---------------------------------------------------------
  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  const cargarDatos = async () => {
    try {
      // A. Obtener datos oficiales del JSON para el cultivo actual
      // Ruta: cultivos -> [NombreCultivo] -> plagas_y_enfermedades
      const datosOficiales = cultivosDataJSON?.cultivos?.[cultivo]?.plagas_y_enfermedades || [];

      // B. Obtener notas guardadas del usuario
      const jsonNotas = await AsyncStorage.getItem(STORAGE_KEY);
      const notasUsuario = jsonNotas ? JSON.parse(jsonNotas) : {};

      // C. Fusionar: A cada plaga oficial le pegamos sus notas personales
      const listaFinal = datosOficiales.map(item => {
        const misNotas = notasUsuario[item.nombre] || {};
        return {
          ...item,
          ...misNotas,
          // Aseguramos que mis_tratamientos sea un array
          mis_tratamientos: Array.isArray(misNotas.mis_tratamientos) ? misNotas.mis_tratamientos : []
        };
      });

      setListaFusionada(listaFinal);
    } catch (error) {
      console.error("Error cargando datos:", error);
    }
  };

  // ---------------------------------------------------------
  // 3. LÓGICA DE EDICIÓN MÚLTIPLE
  // ---------------------------------------------------------
  
  const abrirEditor = () => {
    setMisSintomas(plagaSeleccionada.mis_sintomas || '');
    
    // Recuperar tratamientos previos
    let tratamientosPrevios = plagaSeleccionada.mis_tratamientos || [];
    
    // Migración: Si tenías datos viejos (formato anterior de 1 solo producto), los convertimos
    if (tratamientosPrevios.length === 0 && plagaSeleccionada.mi_producto) {
        tratamientosPrevios.push({
            id: Date.now(),
            producto: plagaSeleccionada.mi_producto,
            dosis: plagaSeleccionada.mi_dosis || 'N/A'
        });
    }
    
    setListaTratamientos(tratamientosPrevios);
    setTempProducto('');
    setTempDosis('');
    setModalEditarVisible(true);
  };

  const agregarProductoALista = () => {
      if (!tempProducto.trim()) {
          Alert.alert("Falta información", "Escribe el nombre del producto.");
          return;
      }
      const nuevoItem = {
          id: Date.now().toString(), // ID único simple
          producto: tempProducto,
          dosis: tempDosis || 'Según etiqueta'
      };
      setListaTratamientos([...listaTratamientos, nuevoItem]);
      setTempProducto('');
      setTempDosis('');
  };

  const eliminarProductoDeLista = (id) => {
      const filtrada = listaTratamientos.filter(item => item.id !== id);
      setListaTratamientos(filtrada);
  };

  const guardarCambios = async () => {
    if (!plagaSeleccionada) return;

    try {
      const jsonNotas = await AsyncStorage.getItem(STORAGE_KEY);
      let notasGlobales = jsonNotas ? JSON.parse(jsonNotas) : {};

      // Guardamos bajo el nombre de la plaga
      notasGlobales[plagaSeleccionada.nombre] = {
        mis_sintomas: misSintomas,
        mis_tratamientos: listaTratamientos,
        // Limpieza de campos viejos para evitar conflictos
        mi_producto: null,
        mi_dosis: null
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notasGlobales));
      await cargarDatos(); // Recargar lista principal
      
      // Actualizar visualmente la plaga seleccionada para ver cambios al instante
      setPlagaSeleccionada(prev => ({ 
          ...prev, 
          mis_sintomas: misSintomas, 
          mis_tratamientos: listaTratamientos 
      }));
      
      setModalEditarVisible(false);
      Alert.alert("Bitácora Actualizada", "Tus notas y tratamientos se han guardado.");

    } catch (error) {
      Alert.alert("Error", "No se pudo guardar la información.");
    }
  };

  // ---------------------------------------------------------
  // 4. LÓGICA IA (CÁMARA)
  // ---------------------------------------------------------
  const abrirCamara = () => { if (!permission?.granted) requestPermission(); else setModalCameraVisible(true); };
  const cerrarCamara = () => { setImage(null); setPrediction(null); setModalCameraVisible(false); };
  const takePicture = async () => { if (cameraRef.current) { const p = await cameraRef.current.takePictureAsync(); setImage(p.uri); }};
  const pickImage = async () => { let r = await ImagePicker.launchImageLibraryAsync({mediaTypes:ImagePicker.MediaTypeOptions.Images, allowsEditing:true, aspect:[1,1], quality:1}); if(!r.canceled) setImage(r.assets[0].uri); };
  
  const classifyImage = async () => {
    if (!model || !image) return;
    setLoadingIA(true);
    try {
      const manipulated = await manipulateAsync(image, [{ resize: { width: 224, height: 224 } }], { format: SaveFormat.JPEG });
      const imgB64 = await FileSystem.readAsStringAsync(manipulated.uri, { encoding: FileSystem.EncodingType.Base64 });
      const imgBuffer = Uint8Array.from(atob(imgB64), c => c.charCodeAt(0));
      const outputs = await model.run([imgBuffer]);
      const probabilities = outputs[0];
      let maxProb = 0; let maxIndex = 0;
      for (let i = 0; i < probabilities.length; i++) { if (probabilities[i] > maxProb) { maxProb = probabilities[i]; maxIndex = i; } }
      setPrediction({ label: labels[maxIndex] || "Desconocido", confidence: maxProb });
    } catch (error) { Alert.alert("Error", "No se pudo analizar."); } finally { setLoadingIA(false); }
  };

  // ---------------------------------------------------------
  // RENDER ITEM (LISTA PRINCIPAL)
  // ---------------------------------------------------------
  const renderItem = ({ item }) => {
    const esEnfermedad = item.tipo === 'Enfermedad';
    // Icono de lápiz si ya tiene notas
    const tieneNotas = item.mis_sintomas || (item.mis_tratamientos && item.mis_tratamientos.length > 0);

    return (
      <TouchableOpacity style={styles.card} onPress={() => setPlagaSeleccionada(item)}>
        <View style={[styles.iconBox, { backgroundColor: esEnfermedad ? '#FFEBEE' : '#E8F5E9' }]}>
           <MaterialCommunityIcons 
              name={esEnfermedad ? "alert-decagram" : "bug"} 
              size={24} 
              color={esEnfermedad ? "#D32F2F" : "#2E7D32"} 
           />
        </View>
        <View style={{flex: 1}}>
           <Text style={styles.cardTitle}>{item.nombre}</Text>
           <Text style={styles.cardSubtitle} numberOfLines={1}>
             {item.descripcion || "Ver ficha técnica..."}
           </Text>
           {tieneNotas && (
             <View style={styles.badgeEditado}>
               <Ionicons name="pencil" size={10} color="#1565C0" />
               <Text style={styles.badgeText}>Con notas</Text>
             </View>
           )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* HEADER */}
      <View style={styles.header}>
         <View style={{flex:1, marginLeft: 10}}>
            <Text style={styles.headerTitle}>Sanidad Vegetal</Text>
            <Text style={styles.headerSubtitle}>Cultivo: <Text style={{fontWeight:'bold', color:'#2E7D32'}}>{cultivo}</Text></Text>
         </View>
      </View>

      {/* LISTA */}
      <FlatList 
         data={listaFusionada}
         keyExtractor={(item, index) => index.toString()}
         renderItem={renderItem}
         contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
         ListEmptyComponent={
            <View style={{alignItems:'center', marginTop: 50}}>
               <MaterialCommunityIcons name="sprout-outline" size={50} color="#ccc" />
               <Text style={{color:'#999', marginTop:10}}>No hay plagas registradas para {cultivo}.</Text>
            </View>
         }
      />

      {/* FAB IA */}
      <TouchableOpacity style={styles.fab} onPress={abrirCamara}>
         <Ionicons name="scan-circle" size={44} color="white" />
         <Text style={styles.fabText}>Diagnóstico IA</Text>
      </TouchableOpacity>

      {/* ================================================= */}
      {/* MODAL DETALLE DE PLAGA (LECTURA)                  */}
      {/* ================================================= */}
      {plagaSeleccionada && (
         <Modal visible={true} transparent={true} animationType="fade" onRequestClose={() => setPlagaSeleccionada(null)}>
            <View style={styles.modalOverlay}>
               <View style={styles.fichaCard}>
                  {/* Header Ficha */}
                  <View style={styles.fichaHeader}>
                      <View style={{flex:1}}>
                          <Text style={styles.fichaTitle}>{plagaSeleccionada.nombre}</Text>
                          <Text style={styles.fichaSubtitle}>{plagaSeleccionada.tipo}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setPlagaSeleccionada(null)}>
                          <Ionicons name="close-circle" size={32} color="#999"/>
                      </TouchableOpacity>
                  </View>
                  
                  <ScrollView>
                     {/* 1. INFORMACIÓN OFICIAL */}
                     <View style={styles.sectionContainer}>
                        <Text style={styles.sectionHeader}>📖 Información Técnica</Text>
                        <Text style={styles.bodyText}>{plagaSeleccionada.descripcion}</Text>
                        
                        <Text style={[styles.label, {marginTop:10}]}>Control Recomendado:</Text>
                        <Text style={styles.bodyText}>
                           {plagaSeleccionada.control?.mecanismo || "No especificado"}
                        </Text>
                        
                        {plagaSeleccionada.control?.productos_activos_mexico?.map((prod, i) => (
                           <Text key={i} style={styles.oficialText}>• {prod.ingrediente} ({prod.dosis_tipo})</Text>
                        ))}
                     </View>

                     {/* 2. INFORMACIÓN DEL USUARIO (BITÁCORA) */}
                     <View style={[styles.sectionContainer, styles.userSection]}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                           <Text style={[styles.sectionHeader, {color:'#1565C0', marginBottom:0}]}>📝 Mi Bitácora</Text>
                           <TouchableOpacity onPress={abrirEditor} style={{backgroundColor:'#E3F2FD', paddingHorizontal:10, paddingVertical:5, borderRadius:5}}>
                              <Text style={{color:'#1565C0', fontWeight:'bold', fontSize:12}}>EDITAR</Text>
                           </TouchableOpacity>
                        </View>

                        <Text style={styles.labelUser}>Mis Observaciones:</Text>
                        <Text style={styles.bodyTextUser}>
                           {plagaSeleccionada.mis_sintomas || "Sin observaciones registradas."}
                        </Text>

                        <Text style={[styles.labelUser, {marginTop:10}]}>Aplicaciones Realizadas:</Text>
                        {plagaSeleccionada.mis_tratamientos && plagaSeleccionada.mis_tratamientos.length > 0 ? (
                            plagaSeleccionada.mis_tratamientos.map((trat, index) => (
                                <View key={index} style={styles.tratamientoRow}>
                                    <View style={styles.dot} />
                                    <View style={{flex:1}}>
                                        <Text style={styles.tratProducto}>{trat.producto}</Text>
                                        <Text style={styles.tratDosis}>Dosis: {trat.dosis}</Text>
                                    </View>
                                </View>
                            ))
                        ) : (
                            <Text style={{color:'#999', fontSize:13, fontStyle:'italic'}}>No has registrado productos.</Text>
                        )}
                     </View>
                  </ScrollView>
               </View>
            </View>
         </Modal>
      )}

      {/* ================================================= */}
      {/* MODAL EDITOR (AGREGAR MÚLTIPLES PRODUCTOS)        */}
      {/* ================================================= */}
      <Modal visible={modalEditarVisible} animationType="slide" transparent={true} onRequestClose={()=>setModalEditarVisible(false)}>
         <View style={styles.modalOverlay}>
            <View style={styles.modalForm}>
               <Text style={styles.modalTitle}>Editar Bitácora</Text>
               <Text style={{color:'#666', fontSize:12, marginBottom:10}}>Plaga: {plagaSeleccionada?.nombre}</Text>

               <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.label}>Observaciones de Campo:</Text>
                  <TextInput 
                     style={[styles.input, {height:60, textAlignVertical:'top'}]} 
                     multiline 
                     value={misSintomas}
                     onChangeText={setMisSintomas}
                     placeholder="Ej: Hojas amarillas, presencia de larvas..."
                  />

                  <View style={styles.divider} />
                  <Text style={styles.label}>Agregar Producto Aplicado:</Text>
                  
                  {/* MINI FORMULARIO PARA AGREGAR A LA LISTA */}
                  <View style={styles.addBox}>
                      <TextInput 
                         style={[styles.input, {marginTop:0}]} 
                         value={tempProducto}
                         onChangeText={setTempProducto}
                         placeholder="Producto (Ej: Cipermetrina)"
                      />
                      <View style={{flexDirection:'row', gap:10, marginTop:10}}>
                          <TextInput 
                             style={[styles.input, {flex:1, marginTop:0}]} 
                             value={tempDosis}
                             onChangeText={setTempDosis}
                             placeholder="Dosis (Ej: 10ml)"
                          />
                          <TouchableOpacity style={styles.btnAddItem} onPress={agregarProductoALista}>
                              <Ionicons name="add" size={24} color="white" />
                          </TouchableOpacity>
                      </View>
                  </View>

                  {/* LISTA TEMPORAL */}
                  <Text style={[styles.label, {marginTop:15}]}>Lista a Guardar:</Text>
                  {listaTratamientos.length === 0 && <Text style={{color:'#ccc', fontSize:12}}>Lista vacía.</Text>}
                  
                  {listaTratamientos.map((item) => (
                      <View key={item.id} style={styles.itemLista}>
                          <View style={{flex:1}}>
                              <Text style={{fontWeight:'bold', color:'#333'}}>{item.producto}</Text>
                              <Text style={{fontSize:12, color:'#666'}}>Dosis: {item.dosis}</Text>
                          </View>
                          <TouchableOpacity onPress={() => eliminarProductoDeLista(item.id)}>
                              <Ionicons name="trash-outline" size={20} color="#D32F2F" />
                          </TouchableOpacity>
                      </View>
                  ))}
               </ScrollView>

               <View style={styles.formButtons}>
                  <TouchableOpacity style={[styles.btnForm, {backgroundColor:'#E57373'}]} onPress={()=>setModalEditarVisible(false)}>
                     <Text style={{color:'white'}}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnForm, {backgroundColor:'#2E7D32'}]} onPress={guardarCambios}>
                     <Text style={{color:'white', fontWeight:'bold'}}>Guardar Todo</Text>
                  </TouchableOpacity>
               </View>
            </View>
         </View>
      </Modal>

      {/* ================================================= */}
      {/* MODAL CÁMARA IA                                   */}
      {/* ================================================= */}
      <Modal visible={modalCameraVisible} animationType="slide" onRequestClose={cerrarCamara}>
         <View style={{flex: 1, backgroundColor: 'black'}}>
             <View style={{flex: 1}}>
                <CameraView style={{flex: 1}} ref={cameraRef} />
                
                {/* Header sobrepuesto */}
                <View style={styles.cameraHeader}>
                    <TouchableOpacity onPress={cerrarCamara}><Ionicons name="close" size={30} color="white" /></TouchableOpacity>
                    <Text style={{color:'white', fontSize:18, fontWeight:'bold'}}>Diagnóstico IA</Text>
                    <View style={{width:30}}/>
                </View>

                {/* Footer controles */}
                <View style={styles.cameraFooter}>
                   <TouchableOpacity style={styles.iconBtn} onPress={pickImage}>
                       <Ionicons name="images" size={28} color="white"/>
                   </TouchableOpacity>
                   <TouchableOpacity style={styles.captureOuter} onPress={takePicture}>
                       <View style={styles.captureInner}/>
                   </TouchableOpacity>
                   <View style={{width:50}}/>
                </View>
             </View>

             {/* VISTA PREVIA SI HAY FOTO */}
             {image && (
                 <View style={[StyleSheet.absoluteFill, {backgroundColor:'#f5f5f5', zIndex:20}]}>
                    <ScrollView contentContainerStyle={{alignItems:'center', padding:20}}>
                       <Image source={{ uri: image }} style={styles.previewImage} />
                       {!prediction ? (
                          <TouchableOpacity style={[styles.btnAction, {backgroundColor:'#2E7D32'}]} onPress={classifyImage}>
                             {loadingIA ? <ActivityIndicator color="white"/> : <Text style={styles.btnText}>🔍 Analizar</Text>}
                          </TouchableOpacity>
                       ) : (
                          <View style={{width:'100%', alignItems:'center'}}>
                             <TreatmentCard predictionClass={prediction.label} />
                             <TouchableOpacity style={[styles.btnAction, {backgroundColor:'#2E7D32', marginTop:15}]} onPress={() => setImage(null)}>
                                <Text style={styles.btnText}>Nueva Foto</Text>
                             </TouchableOpacity>
                          </View>
                       )}
                       <TouchableOpacity style={[styles.btnAction, {backgroundColor:'#999', marginTop:10}]} onPress={() => setImage(null)}>
                          <Text style={styles.btnText}>Cancelar</Text>
                       </TouchableOpacity>
                    </ScrollView>
                 </View>
             )}
         </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 20, paddingTop: 10, paddingBottom: 15, elevation: 2 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  headerSubtitle: { fontSize: 13, color: '#666' },
  
  card: { flexDirection: 'row', backgroundColor: '#fff', marginVertical: 5, marginHorizontal: 15, padding: 12, borderRadius: 10, alignItems: 'center', elevation: 2 },
  iconBox: { width: 45, height: 45, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardTitle: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  cardSubtitle: { color: '#666', fontSize: 13, maxWidth: '90%' },
  badgeEditado: { flexDirection:'row', alignItems:'center', backgroundColor:'#E3F2FD', alignSelf:'flex-start', paddingHorizontal:6, borderRadius:4, marginTop:4 },
  badgeText: { fontSize:10, color:'#1565C0', marginLeft:4, fontWeight:'bold' },

  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#2E7D32', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, elevation: 6 },
  fabText: { color: 'white', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },

  // Modales
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  fichaCard: { width: '90%', maxHeight:'85%', backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 10 },
  fichaHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 10 },
  fichaTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  fichaSubtitle: { fontSize: 14, color: '#777', fontStyle: 'italic' },
  
  sectionContainer: { marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  userSection: { backgroundColor: '#F9FAFB', padding: 10, borderRadius: 8, borderBottomWidth:0, borderWidth:1, borderColor:'#E3F2FD' },
  
  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#2E7D32', marginBottom: 5 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#555' },
  bodyText: { fontSize: 14, color: '#444', lineHeight: 20, marginBottom: 5 },
  oficialText: { fontSize: 13, color: '#555', marginLeft: 10, marginBottom: 2 },

  labelUser: { fontSize: 12, fontWeight: 'bold', color: '#1565C0', marginTop: 5 },
  bodyTextUser: { fontSize: 14, color: '#333', fontStyle: 'italic' },
  
  // Lista de tratamientos en Ficha
  tratamientoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, padding: 5, backgroundColor: 'white', borderRadius: 5, borderBottomWidth:1, borderColor:'#eee' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2E7D32', marginRight: 10 },
  tratProducto: { fontWeight: 'bold', fontSize: 14, color: '#333' },
  tratDosis: { fontSize: 12, color: '#666' },

  // Formulario Múltiple
  modalForm: { width: '90%', backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  input: { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 10, marginTop: 5, fontSize: 14, borderWidth: 1, borderColor: '#eee' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
  addBox: { backgroundColor: '#F5F5F5', padding: 10, borderRadius: 8, marginTop: 5 },
  btnAddItem: { backgroundColor: '#1976D2', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 15, borderRadius: 8 },
  itemLista: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderColor: '#eee' },
  
  formButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  btnForm: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },

  // Cámara
  cameraHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 40, backgroundColor: 'rgba(0,0,0,0.5)', position:'absolute', top:0, width:'100%', zIndex:10 },
  cameraFooter: { position: 'absolute', bottom: 30, width: '100%', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', zIndex:10 },
  captureOuter: { width: 75, height: 75, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.4)', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'white' },
  iconBtn: { padding: 10 },
  previewImage: { width: '100%', height: 350, resizeMode: 'contain', marginBottom: 20 },
  btnAction: { padding: 15, borderRadius: 10, width: '100%', alignItems: 'center' },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});