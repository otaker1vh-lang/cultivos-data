import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Modal, Keyboard, Image } from 'react-native';
import * as Speech from 'expo-speech';
import * as ImagePicker from 'expo-image-picker';
import Voice from '@react-native-voice/voice'; 
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Conexión segura con el cliente de Supabase
import { supabase } from '../src/services/supabaseClient'; 

export default function AsistenteVoz({ cultivoActual }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [estado, setEstado] = useState('inactivo'); // inactivo, escuchando, pensando, hablando
  const [respuesta, setRespuesta] = useState('');

  const [imagenAdjunta, setImagenAdjunta] = useState(null);

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Se necesitan permisos de cámara para identificar las plagas, patrón.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6, // Comprimido para agilizar el envío a Supabase
      base64: true, // Crucial para la IA
    });

    if (!result.canceled) {
      setImagenAdjunta({
        uri: result.assets[0].uri,
        base64: result.assets[0].base64
      });
    }
  };

  useEffect(() => {
    // Configuración de los listeners de reconocimiento de voz nativo
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;

    return () => {
      // Limpieza de memoria al cerrar el asistente
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  // Controladores de estado del Micrófono
  const onSpeechStart = () => setEstado('escuchando');
  const onSpeechEnd = () => setEstado('inactivo');
  const onSpeechResults = (e) => {
    if (e.value && e.value.length > 0) {
      setPregunta(e.value[0]); // Captura la interpretación con mayor nivel de confianza
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
      Speech.stop(); // Si la app estaba hablando, la silencia
      await Voice.start('es-MX'); // Forzar dictado en Español mexicano
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
    if (!pregunta.trim() && !imagenAdjunta) return; // Permite enviar solo una imagen sin texto
    Keyboard.dismiss();
    setEstado('pensando');
    setRespuesta('');

    try {
      // Configuramos el payload. Si mandó foto sin texto, le damos un texto por defecto
      const bodyPayload = { 
        pregunta: pregunta.trim() !== '' ? pregunta : "¿Qué plaga, enfermedad o deficiencia se observa en esta imagen?", 
        cultivoActual: cultivoActual || "", 
        cultivoContexto: cultivoActual || "" 
      };

      if (imagenAdjunta) {
        bodyPayload.imagenBase64 = imagenAdjunta.base64;
      }

      const { data, error } = await supabase.functions.invoke('consultar-asistente', {
        body: bodyPayload
      });

      if (error) throw error;
      if (!data || typeof data.respuesta === 'undefined') {
        throw new Error("El servidor respondió pero no incluyó la propiedad 'respuesta'.");
      }

      const respuestaFinal = data.respuesta;
      setRespuesta(respuestaFinal);
      setEstado('hablando');

      Speech.speak(respuestaFinal, {
        language: 'es-MX', rate: 0.9, pitch: 1.0,
        onDone: () => setEstado('inactivo'),
        onStopped: () => setEstado('inactivo')
      });

    } catch (error) {
      console.error("[Asistente Error] Detalle:", error);
      const errorMsg = "Hubo un problema con la señal del campo o el análisis de la imagen. Intente más tarde, patrón.";
      setRespuesta(`${errorMsg}\n\n(Nota técnica: ${error.message || JSON.stringify(error)})`);
      Speech.speak(errorMsg, { language: 'es-MX' });
      setEstado('inactivo');
    }
  };

  const cerrarModal = () => {
    Speech.stop();
    Voice.destroy().then(Voice.removeAllListeners);
    setModalVisible(false);
    setEstado('inactivo');
    setPregunta('');
    setRespuesta('');
    setImagenAdjunta(null); // Limpiar la imagen de la memoria
  };

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <MaterialCommunityIcons name="microphone" size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            
            <View style={styles.header}>
              <Text style={styles.titulo}>Asesor Integral</Text>
              <TouchableOpacity onPress={cerrarModal}>
                <MaterialCommunityIcons name="close-circle" size={36} color="#D32F2F" />
              </TouchableOpacity>
            </View>

            <Text style={styles.instruccion}>
              Pregúnteme sobre clima, precios, nutrición o plagas para {cultivoActual || "sus cultivos"}:
            </Text>

            {/* Fila de controles para activación por voz */}
            {/* Previsualización de la imagen si se tomó una foto */}
            {imagenAdjunta && (
              <View style={styles.imagenPreviewContainer}>
                <Image source={{ uri: imagenAdjunta.uri }} style={styles.imagenPreview} />
                <TouchableOpacity style={styles.btnQuitarImagen} onPress={() => setImagenAdjunta(null)}>
                  <MaterialCommunityIcons name="close" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}

            {/* Fila de controles para activación por voz y cámara */}
            <View style={styles.filaAcciones}>
              <TouchableOpacity style={styles.btnIconoAccion} onPress={tomarFoto}>
                <MaterialCommunityIcons name="camera" size={24} color="#FFF" />
              </TouchableOpacity>

              {estado === 'escuchando' ? (
                <TouchableOpacity style={[styles.btnVoz, styles.btnVozGrabando, {flex: 1}]} onPress={detenerDictado}>
                  <MaterialCommunityIcons name="microphone-off" size={22} color="#FFF" />
                  <Text style={styles.textoBtnVoz}>Detener Escucha</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.btnVoz, {flex: 1}]} onPress={iniciarDictado}>
                  <MaterialCommunityIcons name="microphone" size={22} color="#FFF" />
                  <Text style={styles.textoBtnVoz}>Dictar Mensaje</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.inputGigante}
              placeholder="Ej: ¿Que es esta plaga? o ¿A qué precio se vende el café?"
              value={pregunta}
              onChangeText={setPregunta}
              multiline
            />

            <TouchableOpacity 
              style={[styles.botonAccion, !pregunta && { backgroundColor: '#A5D6A7' }]} 
              onPress={procesarPregunta}
              disabled={!pregunta || estado === 'pensando'}
            >
              {estado === 'pensando' ? (
                <ActivityIndicator size="large" color="#FFF" />
              ) : (
                <Text style={styles.textoBoton}>Asesorar en Voz Alta</Text>
              )}
            </TouchableOpacity>

            {respuesta !== '' && (
              <View style={styles.cajaRespuesta}>
                <MaterialCommunityIcons name="bullhorn-outline" size={28} color="#2E7D32" style={{marginBottom: 10}}/>
                <Text style={styles.textoRespuesta}>{respuesta}</Text>
              </View>
            )}

          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', bottom: 20, right: 20, width: 70, height: 70, borderRadius: 35, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 } },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#F5F7FA', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, minHeight: '72%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#2E7D32' },
  instruccion: { fontSize: 16, color: '#546E7A', marginBottom: 15 },
  
  filaAcciones: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 },
  btnIconoAccion: { backgroundColor: '#455A64', padding: 12, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  btnVoz: { flexDirection: 'row', backgroundColor: '#0288D1', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 25, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  btnVozGrabando: { backgroundColor: '#D32F2F' },
  textoBtnVoz: { color: '#FFF', fontWeight: 'bold', marginLeft: 8, fontSize: 14 },

  inputGigante: { backgroundColor: '#FFF', borderRadius: 15, padding: 15, height: 100, textAlignVertical: 'top', fontSize: 16, marginBottom: 20, elevation: 2, borderWidth: 1, borderColor: '#CFD8DC' },
  imagenPreviewContainer: { position: 'relative', alignSelf: 'flex-start', marginBottom: 15 },
  imagenPreview: { width: 90, height: 90, borderRadius: 12, borderWidth: 1, borderColor: '#CFD8DC' },
  btnQuitarImagen: { position: 'absolute', top: -8, right: -8, backgroundColor: '#D32F2F', borderRadius: 12, padding: 4, elevation: 3 },
  botonAccion: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 15, alignItems: 'center', elevation: 2 },
  textoBoton: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  cajaRespuesta: { marginTop: 20, backgroundColor: '#E8F5E9', padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#C8E6C9' },
  textoRespuesta: { fontSize: 16, color: '#1B5E20', lineHeight: 22, fontWeight: '500' }
});