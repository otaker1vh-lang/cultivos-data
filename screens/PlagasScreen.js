import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Image, Modal, Alert, ActivityIndicator, ScrollView, Platform 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useAssets } from 'expo-asset'; 
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { TreatmentCard } from '../components/TreatmentCard';

export default function PlagasScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [image, setImage] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState([]);

  // 1. CARGA SEGURA DE ASSETS (Modelo + Etiquetas)
  const [assets, error] = useAssets([
    require('../assets/model/roslin_model.tflite'),
    require('../assets/model/labels.txt')
  ]);

  // Hook del modelo
  const model = useTensorflowModel(assets ? assets[0] : null);

  // 2. LECTURA DE ETIQUETAS
  useEffect(() => {
    async function loadLabels() {
      if (assets && assets[1]) {
        try {
          const text = await FileSystem.readAsStringAsync(assets[1].localUri || assets[1].uri);
          const lista = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          setLabels(lista);
          console.log("Etiquetas cargadas:", lista.length);
        } catch (error) {
          console.error("Error leyendo etiquetas:", error);
          Alert.alert("Error", "No se pudo leer el archivo de etiquetas.");
        }
      }
    }
    loadLabels();
  }, [assets]);

  // --- PERMISOS DE CÁMARA ---
  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', marginBottom: 20, color:'#fff' }}>
          Necesitamos permiso para usar la cámara.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Dar Permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- FUNCIONES DE CÁMARA ---
  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
            quality: 0.5, // Reducir calidad para procesar más rápido
            skipProcessing: true // En Android ayuda a la velocidad
        });
        setImage(photo.uri);
      } catch (error) {
        console.error("Error al tomar foto:", error);
        Alert.alert("Error", "No se pudo capturar la foto.");
      }
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  // --- LÓGICA DE CLASIFICACIÓN (CORREGIDA) ---
  const classifyImage = async () => {
    // 1. Validaciones previas
    if (!image) return;
    
    if (!model.model) {
        Alert.alert("Espera", "El modelo de IA aún se está cargando. Intenta en unos segundos.");
        return;
    }
    if (labels.length === 0) {
        Alert.alert("Error", "No se cargaron las etiquetas (labels.txt). Revisa los assets.");
        return;
    }

    setLoading(true);

    try {
      console.log("Iniciando procesamiento de imagen...");
      
      // 2. Redimensionar a 224x224 (Estándar MobileNet)
      const manipulated = await manipulateAsync(
        image,
        [{ resize: { width: 224, height: 224 } }],
        { format: SaveFormat.JPEG }
      );

      // 3. Convertir a ArrayBuffer para el modelo
      const imgB64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const imgBuffer = Uint8Array.from(atob(imgB64), c => c.charCodeAt(0));

      // 4. Ejecutar el modelo
      console.log("Ejecutando modelo...");
      const outputs = await model.model.run([imgBuffer]);
      const probabilities = outputs[0];

      // 5. Buscar la clase con mayor probabilidad
      let maxProb = 0;
      let maxIndex = -1;
      
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIndex = i;
        }
      }

      console.log(`Resultado: Índice ${maxIndex} con confianza ${(maxProb * 100).toFixed(2)}%`);

      // 6. --- VALIDACIÓN DE UMBRAL (AQUÍ ESTÁ LA MAGIA) ---
      // Si la confianza es menor al 40%, decimos que no se identificó
      if (maxProb < 0.40) {
          Alert.alert(
              "No identificado 🤷‍♂️", 
              "No se detectó ninguna plaga conocida con suficiente claridad.\n\nIntenta tomar la foto más cerca o con mejor iluminación."
          );
          // No guardamos predicción para que no salga la tarjeta errónea
          setPrediction(null);
      } else {
          // Si pasa el umbral, mostramos el resultado
          const labelEncontrado = labels[maxIndex] || "Desconocido";
          setPrediction({
            label: labelEncontrado,
            confidence: maxProb
          });
      }

    } catch (error) {
      console.error("Error clasificando:", error);
      Alert.alert("Error Técnico", "Fallo al analizar la imagen: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setImage(null);
    setPrediction(null);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef}>
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
            <Text style={styles.galleryText}>Galería</Text>
          </TouchableOpacity>
        </View>
      </CameraView>

      <Modal visible={image !== null} animationType="slide">
        <ScrollView contentContainerStyle={styles.modalScroll}>
          
          <Image source={{ uri: image }} style={styles.previewImage} />
          
          <View style={styles.actionButtons}>
            {/* Si NO hay predicción, mostramos botón de Diagnosticar */}
            {!prediction && (
                <TouchableOpacity 
                    style={[styles.button, styles.analyzeButton, loading && styles.disabledBtn]} 
                    onPress={classifyImage}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>🔍 Diagnosticar</Text>
                    )}
                </TouchableOpacity>
            )}
            
            <TouchableOpacity style={[styles.button, styles.closeButton]} onPress={resetState}>
              <Text style={styles.buttonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          {/* Resultado solo si existe y tiene alta confianza */}
          {prediction && (
            <View style={styles.resultContainer}>
              <Text style={styles.confidenceText}>
                Confianza IA: {(prediction.confidence * 100).toFixed(1)}%
              </Text>
              <TreatmentCard predictionClass={prediction.label} />
            </View>
          )}

        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1, justifyContent: 'flex-end' },
  cameraControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 40, backgroundColor: 'rgba(0,0,0,0.3)', paddingTop: 20 },
  captureButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  galleryButton: { padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 5 },
  galleryText: { color: '#fff', fontSize: 16 },
  
  modalScroll: { flexGrow: 1, backgroundColor: '#f5f5f5', alignItems: 'center', paddingVertical: 40 },
  previewImage: { width: 300, height: 300, borderRadius: 15, marginBottom: 20, borderWidth: 2, borderColor: '#ddd' },
  
  actionButtons: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  button: { paddingVertical: 12, paddingHorizontal: 25, borderRadius: 8, elevation: 3 },
  analyzeButton: { backgroundColor: '#2E7D32' },
  closeButton: { backgroundColor: '#D32F2F' },
  disabledBtn: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  resultContainer: { width: '100%', alignItems: 'center' },
  confidenceText: { fontSize: 14, color: '#666', marginBottom: 5 }
});