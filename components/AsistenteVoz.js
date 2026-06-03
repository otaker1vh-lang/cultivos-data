import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Modal, Keyboard } from 'react-native';
import * as Speech from 'expo-speech';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// IMPORTANTE: Ajusta esta ruta hacia donde tengas tu cliente de Supabase
import { supabase } from '../src/services/supabaseClient'; 

// Configura tu llave de Google AI Studio aquí
const GEMINI_API_KEY = 'AIzaSyBaXxNR0Zf105wyBaEDe4EQ8YWKC4PoHjU';

export default function AsistenteVoz({ cultivoActual }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [estado, setEstado] = useState('inactivo'); 
  const [respuesta, setRespuesta] = useState('');

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

  // 3. Flujo principal del botón
  const procesarPregunta = async () => {
    if (!pregunta.trim()) return;
    Keyboard.dismiss();
    setEstado('pensando');
    setRespuesta('');

    try {
      const vector = await obtenerVectorPregunta(pregunta);

      // Busca en Supabase usando la función que creamos en SQL
      const { data: documentos, error } = await supabase.rpc('buscar_conocimiento_agricola', {
        query_embedding: vector,
        match_threshold: 0.35, 
        match_count: 3
      });

      if (error) throw error;

      const contextoExtraido = documentos && documentos.length > 0 
        ? documentos.map(doc => doc.texto_busqueda).join(" ") 
        : "Sin datos específicos de este tema en la base de datos.";

      const respuestaFinal = await consultarIA(contextoExtraido, pregunta);
      
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
      console.error("Error en Asistente:", error);
      const errorMsg = "Hubo un problema con la señal del campo. Intente más tarde, patrón.";
      setRespuesta(errorMsg);
      Speech.speak(errorMsg, { language: 'es-MX' });
      setEstado('inactivo');
    }
  };

  const cerrarModal = () => {
    Speech.stop();
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
  
  // --- ESTILOS QUE FALTABAN ---
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#2E7D32' },
  instruccion: { fontSize: 16, color: '#546E7A', marginBottom: 20 },
  inputGigante: { backgroundColor: '#FFF', borderRadius: 15, padding: 15, height: 100, textAlignVertical: 'top', fontSize: 16, marginBottom: 20, elevation: 2 },
  botonAccion: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 15, alignItems: 'center' },
  textoBoton: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  cajaRespuesta: { marginTop: 20, backgroundColor: '#E8F5E9', padding: 15, borderRadius: 15 },
  textoRespuesta: { fontSize: 16, color: '#1B5E20' }
}); // <-- EL CIERRE QUE FALTABA