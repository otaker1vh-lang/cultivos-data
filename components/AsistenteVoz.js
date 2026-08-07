import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Modal, Keyboard, Image, ScrollView } from 'react-native';
import * as Speech from 'expo-speech';
import * as ImagePicker from 'expo-image-picker';
import Voice from '@react-native-voice/voice'; 
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from "@react-native-community/netinfo";
import { buscarRespuestaOffline } from '../src/services/Database'; 

// Conexión segura con el cliente de Supabase
import { supabase } from '../src/services/supabaseClient'; 

export default function AsistenteVoz({ cultivoActual, climaActual }) {
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
      quality: 0.5, // Calidad optimizada para menor transferencia de datos
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
      
      // --- CORRECCIÓN CRÍTICA ---
      // Simplificamos la verificación: si hay interfaz de red activa, lo intentamos.
      // Eliminamos isInternetReachable porque falla frecuentemente en redes débiles y detiene la consulta.
      // Confiamos en el TIMEOUT existente más abajo para manejar las redes muy lentas.
      redConectada = !!red.isConnected;
    
      if (redConectada) {
        const mesActual = new Date().toLocaleString('es-MX', { month: 'long' });

        // --- SOLUCIÓN: Limpiamos y aseguramos los datos del clima antes de enviarlos
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
          contextoTemporal: {
            mes_actual: mesActual,
            clima_hoy: climaSeguro, // Usamos el objeto limpio y seguro
            etapa_fenologica: 'No registrada'
          }
        };
      
        if (imagenAdjunta) {
          bodyPayload.imagenBase64 = imagenAdjunta.base64;
        }

        // Promesa con Timeout de 8 segundos para evitar bloqueos en señal débil
        const invokePromise = supabase.functions.invoke('consultar-asistente', {
          body: bodyPayload
        });

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT_NUBE')), 30000)
        );

        const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
      
        if (error) throw error;
        
        if (data && data.respuesta) {
          respuestaFinal = data.respuesta;
          fueExitosoOnline = true;
        } else {
          throw new Error('RESPUESTA_INVALIDA');
        }
      }
    } catch (error) {
      console.warn("[Asistente Warning] Falló consulta en la nube o hubo timeout. Activando respaldo local:", error?.message || error);
    }

    // --- FALLBACK AUTOMÁTICO A MODO OFFLINE/LOCAL ---
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

    // --- REGISTRO DE TELEMETRÍA (Silencioso en segundo plano) ---
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
    
    // Lectura en voz alta
    // Limpieza estricta: borramos saltos de línea y markdown que rompen el motor de Android
    const textoLimpioParaVoz = respuestaFinal.replace(/[\n\r]/g, ' ').replace(/[*#_]/g, '');
    
    Speech.speak(textoLimpioParaVoz, {
      language: 'es-MX', 
      rate: 0.85, // Velocidad ligeramente reducida para facilitar la comprensión
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
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)} activeOpacity={0.8}>
        <MaterialCommunityIcons name="microphone" size={36} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={cerrarModal}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>

            {/* ENVUELVE EL CONTENIDO EN UN SCROLLVIEW */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>

              <View style={styles.header}>
                <Text style={styles.titulo}>Asesor Integral</Text>
                <TouchableOpacity onPress={cerrarModal} style={{ padding: 5 }}>
                  <MaterialCommunityIcons name="close-circle" size={40} color="#D32F2F" />
                </TouchableOpacity>
              </View>

            <Text style={styles.instruccion}>
              Pregúnteme sobre clima, precios, nutrición, plagas o envíeme una foto para diagnóstico:
            </Text>

            {imagenAdjunta && (
              <View style={styles.imagenPreviewContainer}>
                <Image source={{ uri: imagenAdjunta.uri }} style={styles.imagenPreview} />
                <TouchableOpacity style={styles.btnQuitarImagen} onPress={() => setImagenAdjunta(null)}>
                  <MaterialCommunityIcons name="close" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.filaAcciones}>
              <TouchableOpacity style={styles.btnIconoAccion} onPress={tomarFoto} activeOpacity={0.7}>
                <MaterialCommunityIcons name="camera" size={28} color="#FFF" />
              </TouchableOpacity>

              {estado === 'escuchando' ? (
                <TouchableOpacity style={[styles.btnVoz, styles.btnVozGrabando, {flex: 1}]} onPress={detenerDictado}>
                  <MaterialCommunityIcons name="microphone-off" size={26} color="#FFF" />
                  <Text style={styles.textoBtnVoz}>Detener Escucha</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.btnVoz, {flex: 1}]} onPress={iniciarDictado}>
                  <MaterialCommunityIcons name="microphone" size={26} color="#FFF" />
                  <Text style={styles.textoBtnVoz}>Dictar Mensaje</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.inputGigante}
              placeholder="Ej: ¿Cómo controlo gusano cogollero en maíz?"
              placeholderTextColor="#78909C"
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
              activeOpacity={0.8}
            >
              {estado === 'pensando' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator size="small" color="#FFF" />
                  <Text style={styles.textoBoton}>Consultando manual...</Text>
                </View>
              ) : (
                <Text style={styles.textoBoton}>Asesorar en Voz Alta</Text>
              )}
            </TouchableOpacity>

            {respuesta !== '' && (
          <View style={styles.cajaRespuesta}>
            <MaterialCommunityIcons name="bullhorn-outline" size={32} color="#2E7D32" style={{marginBottom: 8}}/>
            <Text style={styles.textoRespuesta}>{respuesta}</Text>
                
                {idInteraccionActual && !calificacionEnviada && estado === 'inactivo' && (
                  <View style={styles.contenedorFeedback}>
                    <Text style={styles.textoFeedback}>¿Le sirvió esta respuesta, patrón?</Text>
                    <View style={styles.filaBotonesFeedback}>
                      <TouchableOpacity style={[styles.btnFeedback, { backgroundColor: '#E8F5E9' }]} onPress={() => calificarRespuesta(1)}>
                        <MaterialCommunityIcons name="thumb-up-outline" size={28} color="#2E7D32" />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btnFeedback, { backgroundColor: '#FFEBEE' }]} onPress={() => calificarRespuesta(-1)}>
                        <MaterialCommunityIcons name="thumb-down-outline" size={28} color="#D32F2F" />
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
  fab: { position: 'absolute', bottom: 25, right: 20, width: 72, height: 72, borderRadius: 36, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 } },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#F5F7FA', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22, minHeight: '75%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  titulo: { fontSize: 26, fontWeight: 'bold', color: '#1B5E20' },
  instruccion: { fontSize: 16, color: '#37474F', marginBottom: 15, lineHeight: 22 },
  
  filaAcciones: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 12 },
  btnIconoAccion: { backgroundColor: '#455A64', padding: 14, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  btnVoz: { flexDirection: 'row', backgroundColor: '#0288D1', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 30, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  btnVozGrabando: { backgroundColor: '#D32F2F' },
  textoBtnVoz: { color: '#FFF', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },

  inputGigante: { backgroundColor: '#FFF', borderRadius: 15, padding: 16, height: 100, textAlignVertical: 'top', fontSize: 18, color: '#263238', marginBottom: 15, elevation: 2, borderWidth: 1, borderColor: '#CFD8DC' },
  imagenPreviewContainer: { position: 'relative', alignSelf: 'flex-start', marginBottom: 15 },
  imagenPreview: { width: 100, height: 100, borderRadius: 12, borderWidth: 1, borderColor: '#CFD8DC' },
  btnQuitarImagen: { position: 'absolute', top: -8, right: -8, backgroundColor: '#D32F2F', borderRadius: 14, padding: 4, elevation: 3 },
  botonAccion: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 15, alignItems: 'center', elevation: 2 },
  textoBoton: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  cajaRespuesta: { marginTop: 18, backgroundColor: '#E8F5E9', padding: 18, borderRadius: 15, borderWidth: 1, borderColor: '#C8E6C9' },
  textoRespuesta: { fontSize: 18, color: '#1B5E20', lineHeight: 26, fontWeight: '500' },
  contenedorFeedback: { marginTop: 15, borderTopWidth: 1, borderTopColor: '#C8E6C9', paddingTop: 15, alignItems: 'center' },
  textoFeedback: { fontSize: 16, color: '#37474F', marginBottom: 12, fontWeight: '500' },
  filaBotonesFeedback: { flexDirection: 'row', gap: 24 },
  btnFeedback: { padding: 14, borderRadius: 30, borderWidth: 1, borderColor: '#CFD8DC', width: 70, alignItems: 'center', elevation: 1 },
  textoAgradecimiento: { marginTop: 15, textAlign: 'center', color: '#2E7D32', fontStyle: 'italic', fontSize: 15, fontWeight: 'bold' }
});