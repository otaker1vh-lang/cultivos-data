// src/hooks/usePlantClassifier.js
import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import { Buffer } from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from "@react-native-community/netinfo";
import { supabase } from '../services/supabaseClient'; 

const UMBRAL_CONFIANZA_LOCAL = 0.75; 

export const usePlantClassifier = (climaActual, alertasGDD, loteId, cultivoActual) => {
  const [labels, setLabels] = useState([]);
  const [loadingIA, setLoadingIA] = useState(false);
  const [prediction, setPrediction] = useState(null);

  // 1. CARGA DEL MODELO TFLITE
  const tflite = useTensorflowModel(require('../../assets/model/model.tflite'));
  const model = tflite?.model;

  // 2. CARGA DE ETIQUETAS JSON (MÁS RÁPIDO)
  useEffect(() => {
    try {
      // Importamos el JSON directamente (ajusta la ruta a tu class_indices.json)
      const classIndices = require('../../assets/model/class_indices.json');
      
      const labelsArray = [];
      // Convertimos el JSON {"Maiz_Roya": 0} a un arreglo donde index 0 = "Maiz Roya"
      Object.entries(classIndices).forEach(([plaga, index]) => {
        // Reemplazamos los guiones bajos por espacios para que sea legible
        labelsArray[index] = plaga.replace(/_/g, ' '); 
      });
      
      setLabels(labelsArray);
    } catch (e) {
      console.log("Error al cargar class_indices.json:", e);
    }
  }, []);

  // Motor 1: Inferencia Local (TFLite)
  const classifyOffline = async (base64) => {
    if (!model || labels.length === 0) return null;
    try {
      const rawImageData = jpeg.decode(Buffer.from(base64, 'base64'), { useTArray: true });
      const { data } = rawImageData;
      const floatInput = new Float32Array(224 * 224 * 3);
      let j = 0;
      
      // Normalización estándar (-1 a 1) para MobileNetV2
      for (let i = 0; i < data.length; i += 4) {
        floatInput[j++] = (data[i] / 127.5) - 1;     // R
        floatInput[j++] = (data[i + 1] / 127.5) - 1; // G
        floatInput[j++] = (data[i + 2] / 127.5) - 1; // B
      }
      
      const outputs = await model.run([floatInput]);
      const probs = outputs[0];
      let max = 0, index = 0;
      
      for (let i = 0; i < probs.length; i++) {
        if (probs[i] > max) { max = probs[i]; index = i; }
      }
      
      return { label: labels[index] || `Clase_Desconocida`, confidence: max, source: 'local' };
    } catch (e) { 
        console.error("Error en inferencia local:", e);
        return null; 
    }
  };

  // Motor 2: Inferencia en Nube (Gemini vía Supabase)
  const classifyOnline = async (base64) => {
    try {
      const bodyPayload = { 
          pregunta: "¿Diagnostica de forma muy breve y exacta qué problema fitosanitario tiene esta planta y dame su nombre científico?", 
          cultivoActual: cultivoActual || "General",
          loteId: loteId,
          imagenBase64: base64
      };

      const { data, error } = await supabase.functions.invoke('consultar-asistente', {
          body: bodyPayload
      });

      if (error) throw error;
      if (data && data.respuesta) {
          return { label: data.respuesta, confidence: 0.99, source: 'gemini' };
      }
      return null;
    } catch (e) { 
        console.error("Error consultando a Gemini:", e);
        return null; 
    }
  };

  // Guardado Diferido (Si no hay red ni seguridad local)
  const guardarParaDespues = async (imageUri) => {
      try {
          const idUnico = Date.now().toString();
          const diagnosticoPendiente = {
              id: idUnico,
              loteId: loteId,
              cultivo: cultivoActual,
              uri: imageUri,
              fecha: new Date().toISOString()
          };
          
          const strExistente = await AsyncStorage.getItem('@diagnosticos_pendientes');
          let pendientes = strExistente ? JSON.parse(strExistente) : [];
          pendientes.push(diagnosticoPendiente);
          await AsyncStorage.setItem('@diagnosticos_pendientes', JSON.stringify(pendientes));
          
          return { 
              label: "Diagnóstico guardado en el teléfono. Se analizará con IA en profundidad cuando detectemos conexión a internet.", 
              confidence: 1.0, 
              source: 'deferred' 
          };
      } catch(e) {
          return null;
      }
  };

  // El Orquestador Híbrido
  const classifyImage = async (imageUri) => {
    if (!imageUri) return;
    setLoadingIA(true);
    setPrediction(null);

    try {
      // 1. Reducir tamaño de la imagen para que no sature la RAM
      const result = await manipulateAsync(
          imageUri, 
          [{ resize: { width: 224, height: 224 } }], 
          { compress: 0.7, format: SaveFormat.JPEG, base64: true }
      );
      
      // 2. Intentar diagnóstico offline ultrarrápido
      let resLocal = await classifyOffline(result.base64);
      
      if (resLocal && resLocal.confidence >= UMBRAL_CONFIANZA_LOCAL) {
          // El modelo TFLite está muy seguro, damos la respuesta de inmediato
          setPrediction(resLocal);
      } else {
          // El TFLite dudó (es plaga nueva o foto borrosa), intentamos la Nube
          const networkState = await NetInfo.fetch();
          
          if (networkState.isConnected && networkState.isInternetReachable) {
              const resNube = await classifyOnline(result.base64);
              if (resNube) {
                  setPrediction(resNube);
              } else {
                  setPrediction({ label: "Imposible determinar con certeza. Quizá sea: " + (resLocal?.label || "Desconocido"), confidence: resLocal?.confidence || 0, source: 'error' });
              }
          } else {
              // Modelo dudó y NO hay red. Almacenamos para que SyncManager actúe después
              const resDiferido = await guardarParaDespues(imageUri);
              setPrediction(resDiferido);
          }
      }
    } catch (e) { 
        Alert.alert("Error IA", "Hubo un problema procesando la imagen."); 
    } finally { 
        setLoadingIA(false); 
    }
  };

  return { prediction, setPrediction, loadingIA, classifyImage };
};