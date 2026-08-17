import * as Notifications from 'expo-notifications';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Modal, Keyboard, Image, ScrollView } from 'react-native';
import * as Speech from 'expo-speech';
import * as ImagePicker from 'expo-image-picker';
import Voice from '@react-native-voice/voice'; 
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from '@react-native-async-storage/async-storage'; // <-- IMPORTANTE: Importación añadida
import { buscarRespuestaOffline } from '../src/services/Database'; 

// Conexión segura con el cliente de Supabase
import { supabase } from '../src/services/supabaseClient'; 

export default function AsistenteVoz({ cultivoActual, loteId, climaActual }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [estado, setEstado] = useState('inactivo'); 
  const [respuesta, setRespuesta] = useState('');

  const [imagenAdjunta, setImagenAdjunta] = useState(null);
  
  const [idInteraccionActual, setIdInteraccionActual] = useState(null);
  const [calificacionEnviada, setCalificacionEnviada] = useState(false);

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Se necesitan permisos de cámara para identificar las plagas, patrón.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5, 
      base64: true, 
    });

    if (!result.canceled) {
      setImagenAdjunta({
        uri: result.assets[0].uri,
        base64: result.assets[0].base64
      });
    }
  };

  const seleccionarDeGaleria = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Se necesitan permisos de galería para subir sus fotos, patrón.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5, 
      base64: true, 
    });

    if (!result.canceled) {
      setImagenAdjunta({
        uri: result.assets[0].uri,
        base64: result.assets[0].base64
      });
    }
  };

  useEffect(() => {
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;

    return () => {
      Voice.destroy().then(() => Voice.removeAllListeners());
    };
  }, []);

  const onSpeechStart = () => setEstado('escuchando');
  const onSpeechEnd = () => setEstado('inactivo');
  const onSpeechResults = (e) => {
    if (e.value && e.value.length > 0) {
      // Corrección para evitar duplicados al dictar rápido
      setPregunta(e.value[0]); 
    }
  };
  const onSpeechError = (e) => {
    console.log("Error en reconocimiento de voz: ", e);
    setEstado('inactivo');
  };

  const iniciarDictado = async () => {
    try {
      setPregunta('');
      setRespuesta('');
      Speech.stop(); 
      await Voice.start('es-MX'); 
    } catch (e) {
      console.error("No se pudo iniciar el micrófono: ", e);
    }
  };

  const detenerDictado = async () => {
    try {
      await Voice.stop();
      setEstado('inactivo');
    } catch (e) {
      console.error("No se pudo detener el micrófono: ", e);
    }
  };

  const procesarPregunta = async () => {
    if (!pregunta.trim() && !imagenAdjunta) return; 
    Keyboard.dismiss();
    setEstado('pensando');
    setRespuesta('');
    
    let respuestaFinal = "";
    let fueExitosoOnline = false;
    let redConectada = false;

    try {
      const red = await NetInfo.fetch();
      redConectada = !!red.isConnected;
    
      if (redConectada) {
        const mesActual = new Date().toLocaleString('es-MX', { month: 'long' });

        let climaSeguro = null;
        if (climaActual && typeof climaActual === 'object') {
           climaSeguro = {
             temp_max: climaActual.temp_max || climaActual.max || 'N/A',
             temp_min: climaActual.temp_min || climaActual.min || 'N/A',
             humedad_relativa: climaActual.humedad_relativa || climaActual.humidity || 'N/A'
           };
        }

        const bodyPayload = { 
          pregunta: pregunta.trim() !== '' ? pregunta : "¿Qué plaga se observa?", 
          cultivoActual: cultivoActual || "General",
          loteId: loteId, // <-- AÑADIDO: Ahora la IA sabrá el historial exacto 
          contextoTemporal: {
            mes_actual: mesActual,
            clima_hoy: climaSeguro,
            etapa_fenologica: 'No registrada'
          }
        };
      
        if (imagenAdjunta) {
          bodyPayload.imagenBase64 = imagenAdjunta.base64;
        }

        const invokePromise = supabase.functions.invoke('consultar-asistente', {
          body: bodyPayload
        });

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT_NUBE')), 30000)
        );

        const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
      
        if (error) throw error;

        // --- LÓGICA DE CLASIFICACIÓN DE INTENCIÓN ---
        if (data && data.accion === 'registro_bitacora') {
           respuestaFinal = data.respuesta; 
           fueExitosoOnline = true;
           
           try {
               // 1. Cargar registros anteriores del cultivo actual
               const STORAGE_KEY = `@bitacora_v4_fotos_${cultivoActual || 'General'}`;
               const dataAnterior = await AsyncStorage.getItem(STORAGE_KEY);
               let bitacorasAnteriores = dataAnterior ? JSON.parse(dataAnterior) : [];
               
               // 2. Construir la nota (concatenando dosis y producto si existen)
               let notaTexto = data.datos.nota;
               if (data.datos.producto || data.datos.dosis) {
                   const dosisExtra = data.datos.dosis ? ` (${data.datos.dosis})` : '';
                   const productoExtra = data.datos.producto ? ` con ${data.datos.producto}` : '';
                   // Solo se añade si no vienen explícitamente en la nota
                   if (!notaTexto.toLowerCase().includes(data.datos.producto?.toLowerCase() || 'xyz')) {
                       notaTexto += `${productoExtra}${dosisExtra}`;
                   }
               }

               // --- NUEVA LÓGICA: GESTIÓN DE RECORDATORIOS (ALARMAS LOCALES) ---
               let alertaProgramada = false;
               if (data.datos.programar_recordatorio && data.datos.dias_para_recordatorio > 0) {
                   const dias = data.datos.dias_para_recordatorio;
                   const tituloRem = data.datos.titulo_recordatorio || "Actividad programada";
                   
                   // Calculamos la fecha objetivo (ej. dentro de 3 días a las 8:00 AM)
                   const fechaObjetivo = new Date();
                   fechaObjetivo.setDate(fechaObjetivo.getDate() + dias);
                   fechaObjetivo.setHours(8, 0, 0, 0); 
                   
                   try {
                       await Notifications.scheduleNotificationAsync({
                           content: {
                               title: `🌱 Recordatorio: ${cultivoActual || 'Campo'}`,
                               body: tituloRem,
                               sound: 'default',
                               data: { pantalla: 'HomeScreen' }
                           },
                           trigger: fechaObjetivo,
                       });
                       alertaProgramada = true;
                       console.log(`⏰ Alarma programada para dentro de ${dias} días.`);
                       
                       // Adjuntamos visualmente la confirmación a la nota de bitácora
                       notaTexto += `\n[⏰ Alarma programada para el ${fechaObjetivo.toLocaleDateString()}]`;
                   } catch (err) {
                       console.error("Error programando notificación local:", err);
                   }
               }

               // 3. Crear el nuevo registro de bitácora (incluyendo marca de alarma si aplica)
               const nuevaBitacora = {
                  id: Date.now().toString(),
                  cultivo: cultivoActual || 'General',
                  etapa: data.datos.etapa && data.datos.etapa !== 'General' ? data.datos.etapa : 'General',
                  nota: notaTexto,
                  fecha: new Date().getTime(),
                  imagen: imagenAdjunta ? imagenAdjunta.uri : null,
                  completada: false,
                  sincronizado: false, // Obligatorio para el SyncManager
                  tiene_alarma: alertaProgramada
                };
                
                // 4. Guardar en Storage (Offline First)
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([nuevaBitacora, ...bitacorasAnteriores]));
                console.log("✅ Bitácora y comandos guardados automáticamente:", nuevaBitacora);

           } catch (e) {
               console.error("Error guardando bitácora automática:", e);
           }
            
        } else if (data && data.respuesta) {
          // Es una asesoría normal
          respuestaFinal = data.respuesta;
          fueExitosoOnline = true;
        } else {
          throw new Error('RESPUESTA_INVALIDA');
        }
      }
    } catch (error) {
      console.warn("[Asistente Warning] Falló consulta en la nube o hubo timeout:", error?.message || error);
    }

    // --- RESPALDO OFFLINE Y ERROR ---
    if (!fueExitosoOnline) {
      if (imagenAdjunta) {
        respuestaFinal = "Patrón, no logramos conectar bien con el servidor para revisar la foto. Pero dígame su duda en texto o voz y la buscamos en el manual guardado en su celular.";
      } else {
        const respuestaLocal = buscarRespuestaOffline(pregunta, cultivoActual);
        respuestaFinal = respuestaLocal || "Patrón, no encontré esa información en el manual del celular. En cuanto tenga mejor señal volveremos a consultar al servidor.";
      }
    }

    setRespuesta(respuestaFinal);
    setEstado('hablando');
    setCalificacionEnviada(false); 
    setIdInteraccionActual(null);

    // --- TELEMETRÍA (Guarda todo tipo de interacciones) ---
    try {
      const faltaInfo = respuestaFinal.includes("Ese dato no lo tengo") || !fueExitosoOnline;
      const origenRespuesta = fueExitosoOnline ? 'online' : 'offline';

      const { data: logData } = await supabase
        .from('interacciones_ia')
        .insert([{
          pregunta: pregunta.trim() || "¿Qué plaga se observa?",
          respuesta: respuestaFinal,
          cultivo: cultivoActual || 'General',
          origen: origenRespuesta,
          vacio_conocimiento: faltaInfo
        }])
        .select('id')
        .single();

      if (logData) {
        setIdInteraccionActual(logData.id);
      }
    } catch (logErr) {
      console.log("Telemetría no registrada (modo local o sin red):", logErr);
    }
    
    // --- TEXT TO SPEECH ---
    const textoLimpioParaVoz = respuestaFinal.replace(/[\n\r]/g, ' ').replace(/[*#_]/g, '');
    Speech.speak(textoLimpioParaVoz, {
      language: 'es-MX', 
      rate: 0.85, 
      pitch: 1.0,
      onDone: () => setEstado('inactivo'),
      onStopped: () => setEstado('inactivo'),
      onError: () => setEstado('inactivo')
    });
  };

  const cerrarModal = () => {
    Speech.stop();
    Voice.destroy().then(() => Voice.removeAllListeners());
    setModalVisible(false);
    setEstado('inactivo');
    setPregunta('');
    setRespuesta('');
    setImagenAdjunta(null); 
  };

  const calificarRespuesta = async (valor) => {
    if (!idInteraccionActual) return;
    setCalificacionEnviada(true); 
    
    try {
      await supabase
        .from('interacciones_ia')
        .update({ calificacion: valor })
        .eq('id', idInteraccionActual);
    } catch (error) {
      console.error("Error al guardar calificación:", error);
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
        <MaterialCommunityIcons name="microphone-outline" size={34} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={cerrarModal}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>

              {/* Indicador superior estilo iOS */}
              <View style={styles.dragIndicator} />

              <View style={styles.header}>
                <Text style={styles.titulo}>Asesor Integral</Text>
                <TouchableOpacity onPress={cerrarModal} style={styles.btnClose}>
                  <MaterialCommunityIcons name="close" size={24} color="#546E7A" />
                </TouchableOpacity>
              </View>

              <Text style={styles.instruccion}>
                Pregúnteme dudas o dícteme actividades para guardar en su bitácora:
              </Text>

              {imagenAdjunta && (
                <View style={styles.imagenPreviewContainer}>
                  <Image source={{ uri: imagenAdjunta.uri }} style={styles.imagenPreview} />
                  <TouchableOpacity style={styles.btnQuitarImagen} onPress={() => setImagenAdjunta(null)}>
                    <MaterialCommunityIcons name="close" size={16} color="#FFF" />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.filaAcciones}>
                <TouchableOpacity style={styles.btnIconoAccion} onPress={tomarFoto} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="camera-outline" size={26} color="#455A64" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.btnIconoAccion} onPress={seleccionarDeGaleria} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="image-outline" size={26} color="#455A64" />
                </TouchableOpacity>

                {estado === 'escuchando' ? (
                  <TouchableOpacity style={[styles.btnVoz, styles.btnVozGrabando, {flex: 1}]} onPress={detenerDictado} activeOpacity={0.8}>
                    <ActivityIndicator size="small" color="#FFF" style={{marginRight: 8}} />
                    <Text style={styles.textoBtnVoz}>Escuchando...</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.btnVoz, {flex: 1}]} onPress={iniciarDictado} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="microphone-outline" size={24} color="#FFF" />
                    <Text style={styles.textoBtnVoz}>Dictar</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={styles.inputGigante}
                placeholder="Ej: Anotar que apliqué 1L de fungicida ayer"
                placeholderTextColor="#90A4AE"
                value={pregunta}
                onChangeText={setPregunta}
                multiline
              />

              <TouchableOpacity 
                style={[
                  styles.botonAccion, 
                  (!pregunta && !imagenAdjunta) && { backgroundColor: '#A5D6A7' }
                ]} 
                onPress={procesarPregunta}
                disabled={(!pregunta && !imagenAdjunta) || estado === 'pensando'}
                activeOpacity={0.85}
              >
                {estado === 'pensando' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text style={styles.textoBoton}>Procesando...</Text>
                  </View>
                ) : (
                  <Text style={styles.textoBoton}>Enviar al Asistente</Text>
                )}
              </TouchableOpacity>

              {respuesta !== '' && (
                <View style={styles.cajaRespuesta}>
                  <View style={styles.encabezadoRespuesta}>
                    <MaterialCommunityIcons name="leaf-circle-outline" size={24} color="#2E7D32" />
                    <Text style={styles.tituloRespuesta}>Diagnóstico IA</Text>
                  </View>
                  <Text style={styles.textoRespuesta}>{respuesta}</Text>
                  
                  {idInteraccionActual && !calificacionEnviada && estado === 'inactivo' && (
                    <View style={styles.contenedorFeedback}>
                      <Text style={styles.textoFeedback}>¿La respuesta fue útil?</Text>
                      <View style={styles.filaBotonesFeedback}>
                        <TouchableOpacity style={[styles.btnFeedback, { backgroundColor: '#F1F8E9' }]} onPress={() => calificarRespuesta(1)}>
                          <MaterialCommunityIcons name="thumb-up-outline" size={22} color="#2E7D32" />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btnFeedback, { backgroundColor: '#FFEBEE' }]} onPress={() => calificarRespuesta(-1)}>
                          <MaterialCommunityIcons name="thumb-down-outline" size={22} color="#D32F2F" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {calificacionEnviada && (
                    <Text style={styles.textoAgradecimiento}>¡Gracias por ayudarnos a mejorar!</Text>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', bottom: 25, right: 20, width: 68, height: 68, borderRadius: 34, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 5 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(15, 30, 20, 0.65)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, minHeight: '75%', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 10 },
  dragIndicator: { width: 40, height: 5, backgroundColor: '#CFD8DC', borderRadius: 5, alignSelf: 'center', marginBottom: 15 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  titulo: { fontSize: 24, fontWeight: '800', color: '#1B5E20', letterSpacing: 0.2 },
  btnClose: { backgroundColor: '#F5F7FA', padding: 8, borderRadius: 20 },
  instruccion: { fontSize: 15, color: '#546E7A', marginBottom: 20, lineHeight: 22, fontWeight: '400' },
  
  filaAcciones: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  btnIconoAccion: { backgroundColor: '#F0F4F8', padding: 14, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  btnVoz: { flexDirection: 'row', backgroundColor: '#0277BD', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#0277BD', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  btnVozGrabando: { backgroundColor: '#D32F2F', shadowColor: '#D32F2F' },
  textoBtnVoz: { color: '#FFF', fontWeight: 'bold', marginLeft: 6, fontSize: 15 },

  inputGigante: { backgroundColor: '#F8FAFC', borderRadius: 20, padding: 18, height: 110, textAlignVertical: 'top', fontSize: 16, color: '#263238', marginBottom: 20 },
  imagenPreviewContainer: { position: 'relative', alignSelf: 'flex-start', marginBottom: 20 },
  imagenPreview: { width: 110, height: 110, borderRadius: 16 },
  btnQuitarImagen: { position: 'absolute', top: -10, right: -10, backgroundColor: '#D32F2F', borderRadius: 15, width: 30, height: 30, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  
  botonAccion: { backgroundColor: '#2E7D32', padding: 18, borderRadius: 20, alignItems: 'center', elevation: 3, shadowColor: '#2E7D32', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 3 }, shadowRadius: 5 },
  textoBoton: { color: '#FFF', fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },
  
  cajaRespuesta: { marginTop: 24, backgroundColor: '#F5FAF6', padding: 20, borderRadius: 24 },
  encabezadoRespuesta: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tituloRespuesta: { fontSize: 16, fontWeight: '700', color: '#2E7D32', marginLeft: 8 },
  textoRespuesta: { fontSize: 16, color: '#263238', lineHeight: 26, fontWeight: '400' },
  
  contenedorFeedback: { marginTop: 20, borderTopWidth: 1, borderTopColor: '#E8F5E9', paddingTop: 20, alignItems: 'center' },
  textoFeedback: { fontSize: 15, color: '#546E7A', marginBottom: 12, fontWeight: '500' },
  filaBotonesFeedback: { flexDirection: 'row', gap: 20 },
  btnFeedback: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, alignItems: 'center' },
  textoAgradecimiento: { marginTop: 15, textAlign: 'center', color: '#2E7D32', fontStyle: 'italic', fontSize: 14, fontWeight: '600' }
});