import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useAssets } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// 1. IMPORTAR EL COMPONENTE DE TRATAMIENTOS
import { TreatmentCard } from '../components/TreatmentCard';

export default function PlagasScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [image, setImage] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);

  // Cargar modelo y etiquetas
  const [modelAssets] = useAssets([require('../assets/model/roslin_model.tflite')]);
  const [labels, setLabels] = useState([]);
  
  const model = useTensorflowModel(modelAssets ? modelAssets[0] : null);

  useEffect(() => {
    async function loadLabels() {
      try {
        // Asegúrate de que labels.txt esté en assets/model/
        const response = await fetch(require('../assets/model/labels.txt'));
        const text = await response.text();
        setLabels(text.split('\n').map(l => l.trim()).filter(l => l));
      } catch (error) {
        console.error("Error cargando etiquetas:", error);
        Alert.alert("Error", "No se pudo cargar la base de datos de plagas.");
      }
    }
    loadLabels();
  }, []);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', marginBottom: 20 }}>
          Necesitamos permiso para usar la cámara y detectar plagas.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Dar Permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync();
        setImage(photo.uri);
      } catch (error) {
        console.error("Error al tomar foto:", error);
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

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const classifyImage = async () => {
    if (!model.model || !image) return;

    setLoading(true);
    try {
      // 1. Redimensionar imagen a 224x224 (lo que espera MobileNet)
      const manipulated = await manipulateAsync(
        image,
        [{ resize: { width: 224, height: 224 } }],
        { format: SaveFormat.JPEG }
      );

      // 2. Leer bytes de la imagen
      const imgB64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const imgBuffer = Uint8Array.from(atob(imgB64), c => c.charCodeAt(0));

      // 3. Ejecutar el modelo
      const outputs = await model.model.run([imgBuffer]);
      const probabilities = outputs[0];

      // 4. Encontrar la clase con mayor probabilidad
      let maxProb = 0;
      let maxIndex = 0;
      
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIndex = i;
        }
      }

      setPrediction({
        label: labels[maxIndex] || "Desconocido",
        confidence: maxProb
      });

    } catch (error) {
      console.error("Error clasificando:", error);
      Alert.alert("Error", "No se pudo analizar la imagen.");
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setImage(null);
    setPrediction(null);
  };

  return (
    <View style={styles.container}>
      {/* CÁMARA */}
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

      {/* MODAL DE RESULTADOS */}
      <Modal visible={image !== null} animationType="slide">
        {/* 2. CAMBIADO A SCROLLVIEW PARA VER TODO EL TRATAMIENTO */}
        <ScrollView contentContainerStyle={styles.modalScroll}>
          
          <Image source={{ uri: image }} style={styles.previewImage} />
          
          {/* BOTONES DE ACCIÓN */}
          <View style={styles.actionButtons}>
            {!prediction && (
                <TouchableOpacity 
                    style={[styles.button, styles.analyzeButton]} 
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
              <Text style={styles.buttonText}>Cerrar / Otra Foto</Text>
            </TouchableOpacity>
          </View>

          {/* RESULTADO Y TRATAMIENTO */}
          {prediction && (
            <View style={styles.resultContainer}>
              <Text style={styles.confidenceText}>
                Confianza de la IA: {(prediction.confidence * 100).toFixed(1)}%
              </Text>
              
              {/* 3. AQUI SE INYECTA LA TARJETA INTELIGENTE */}
              <TreatmentCard predictionClass={prediction.label} />
              
            </View>
          )}

        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 40,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingTop: 20,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  galleryButton: {
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 5,
  },
  galleryText: {
    color: '#fff',
    fontSize: 16,
  },
  // Estilos del Modal
  modalScroll: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    paddingVertical: 40, // Espacio arriba y abajo para scrollear
  },
  previewImage: {
    width: 300,
    height: 300,
    borderRadius: 15,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 20,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    elevation: 3,
  },
  analyzeButton: {
    backgroundColor: '#2E7D32', // Verde agrícola
  },
  closeButton: {
    backgroundColor: '#D32F2F', // Rojo cancelar
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  resultContainer: {
    width: '100%',
    alignItems: 'center',
  },
  confidenceText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  }
});