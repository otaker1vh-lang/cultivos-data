import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Modal, Keyboard } from 'react-native';
import * as Speech from 'expo-speech';
import Voice from '@react-native-voice/voice'; // Importamos la librería de voz
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { supabase } from '../src/services/supabaseClient'; 

// RECOMENDACIÓN: Mueve esto a variables de entorno (.env) lo antes posible
const GEMINI_API_KEY = 'AIzaSyBaXxNR0Zf105wyBaEDe4EQ8YWKC4PoHjU';

export default function AsistenteVoz({ cultivoActual }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [estado, setEstado] = useState('inactivo'); // inactivo, escuchando, pensando, hablando
  const [respuesta, setRespuesta] = useState('');

  useEffect(() => {
    // Configurar los listeners del reconocimiento de voz
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;

    return () => {
      // Limpiar listeners al desmontar el componente
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  // Handlers del Reconocimiento de Voz
  const onSpeechStart = () => {
    setEstado('escuchando');
  };

  const onSpeechEnd = () => {
    setEstado('inactivo');
  };

  const onSpeechResults = (e) => {
    if (e.value && e.value.length > 0) {
      setPregunta(e.value[0]); // Toma la frase con mayor nivel de confianza
    }
  };

  const onSpeechError = (e) => {
    console.log("Error de reconocimiento de voz: ", e);
    setEstado('inactivo');
  };

  const iniciarEscucha = async () => {
    try {
      setPregunta('');
      setRespuesta('');
      Speech.stop(); // Detiene cualquier audio previo que esté hablando la app
      await Voice.start('es-MX'); // Forzar reconocimiento en Español de México
    } catch (e) {
      console.error("Error al iniciar Voice: ", e);
    }
  };

  const detenerEscucha = async () => {
    try {
      await Voice.stop();
      setEstado('inactivo');
    } catch (e) {
      console.error("Error al detener Voice: ", e);
    }
  };

  // 1. Convertir la pregunta a Vector Matemático
  const obtenerVectorPregunta = async (texto) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: texto }] }
      })
    });
    const datos = await res.json();
    return datos.embedding.values.slice(0, 768);
  };

  // 2. Procesar la respuesta con la IA
  const consultarIA = async (contexto, preguntaUsuario) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const promptSistema = `
      Eres el Asesor Agrícola Experto de Roslinapp. Estás orientando a un productor rural sobre el cultivo de ${cultivoActual || 'diversos cultivos'}.
      Tienes conocimiento integral sobre clima, nutrición, economía, plagas y buenas prácticas.
      
      Usa ÚNICAMENTE la siguiente información oficial extraída de la base de datos para responder:
      "${contexto}"
      
      Reglas de oro:
      1. Responde de forma directa, respetuosa ("Patrón" o "Productor") y en lenguaje de campo claro.
      2. No uses más de 50 palabras para no cansar al escuchar.
      3. Si te preguntan de precios, dales los datos económicos con claridad.
      4. Si la respuesta a lo que te preguntan no está en la información oficial provista arriba, di exactamente: "Ese dato no lo tengo a la mano, patrón. Le sugiero consultar con su técnico de confianza."
      
      Pregunta del productor: "${preguntaUsuario}"
    `;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptSistema }] }]
      })
    });
    const datos = await res.json();
    return datos.candidates[0].content.parts[0].text;
  };

  // 3. Flujo principal del proceso RAG
  const procesarPregunta = async () => {
    if (!pregunta.trim()) return;
    Keyboard.dismiss();
    setEstado('pensando');
    setRespuesta('');

    try {
      // Invocación directa a la Edge Function segura usando tu cliente configurado de Supabase
      const { data, error } = await supabase.functions.invoke('consultar-asistente', {
        body: { 
          pregunta: pregunta, 
          cultivoActual: cultivoActual || "sus cultivos" 
        }
      });

      if (error) throw error;

      // La respuesta viene pre-procesada directamente por el Backend intermediario
      const respuestaFinal = data.respuesta;
      
      setRespuesta(respuestaFinal);
      setEstado('hablando');

      Speech.speak(respuestaFinal, {
        language: 'es-MX',
        rate: 0.9,
        pitch: 1.0,
        onDone: () => setEstado('inactivo'),
        onStopped: () => setEstado('inactivo')
      });

    } catch (error) {
      console.error("Error en Asistente a través de Edge Function:", error);
      const errorMsg = "Hubo un problema con la señal del campo. Intente más tarde, patrón.";
      setRespuesta(errorMsg);
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

            {/* CONTROLES DE ENTRADA POR VOZ */}
            <View style={styles.voiceControlRow}>
              {estado === 'escuchando' ? (
                <TouchableOpacity style={[styles.micButton, styles.micListening]} onPress={detenerEscucha}>
                  <MaterialCommunityIcons name="microphone-off" size={24} color="#FFF" />
                  <Text style={styles.micButtonText}>Detener Escucha</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.micButton} onPress={iniciarEscucha}>
                  <MaterialCommunityIcons name="microphone" size={24} color="#FFF" />
                  <Text style={styles.micButtonText}>Dictar con Voz</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.inputGigante}
              placeholder="Ej: ¿En qué mes me pagan mejor la cosecha? o ¿Por qué las hojas están amarillas?"
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
  modalContent: { backgroundColor: '#F5F7FA', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, minHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  instruccion: { fontSize: 14, color: '#546E7A', marginBottom: 15 },
  inputGigante: { backgroundColor: '#FFF', borderRadius: 15, padding: 15, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#CFD8DC', fontSize: 16, marginBottom: 15 },
  botonAccion: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 15, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  textoBoton: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  cajaRespuesta: { backgroundColor: '#E8F5E9', borderRadius: 15, padding: 15, marginTop: 15, borderWidth: 1, borderColor: '#C8E6C9' },
  textoRespuesta: { fontSize: 15, color: '#1B5E20', lineHeight: 22, fontWeight: '500' },
  
  // Nuevos estilos para los botones de voz
  voiceControlRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
  micButton: { flexDirection: 'row', backgroundColor: '#0288D1', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25, alignItems: 'center', elevation: 2 },
  micListening: { backgroundColor: '#D32F2F' },
  micButtonText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8, fontSize: 14 }
});