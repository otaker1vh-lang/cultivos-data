import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import { Buffer } from 'buffer'; // Requiere: npm install buffer

export const usePlantClassifier = (isOnline, climaActual, alertasGDD) => {
  const [labels, setLabels] = useState([]);
  const [loadingIA, setLoadingIA] = useState(false);
  const [prediction, setPrediction] = useState(null);

  const tflite = useTensorflowModel(require('../../assets/model/plant_disease_model.tflite'));
  const model = tflite?.model;

  useEffect(() => {
    let isMounted = true;
    async function loadLabels() {
      try {
        const labelsAsset = Asset.fromModule(require('../../assets/model/labels.txt'));
        await labelsAsset.downloadAsync();
        const text = await FileSystem.readAsStringAsync(labelsAsset.localUri || labelsAsset.uri);
        if (isMounted) {
          setLabels(text.split('\n').map(l => l.trim()).filter(l => l.length > 0));
        }
      } catch (e) { console.log("Error al cargar etiquetas"); }
    }
    loadLabels();
    return () => { isMounted = false; };
  }, []);

  const applyExpertDiagnosis = (base) => {
    if (!base) return null;
    let score = base.confidence;
    if (climaActual?.humidity > 70 && base.label.toLowerCase().includes("fung")) score += 0.15;
    if (alertasGDD?.some(a => a.nivel === "ALTO")) score += 0.05;
    return { ...base, confidence: Math.min(score, 0.98), expertAdjusted: true };
  };

  const classifyOffline = async (base64) => {
    if (!model) return null;
    try {
      const rawImageData = jpeg.decode(Buffer.from(base64, 'base64'), { useTArray: true });
      const { data } = rawImageData;
      const floatInput = new Float32Array(224 * 224 * 3);
      let j = 0;
      for (let i = 0; i < data.length; i += 4) {
        floatInput[j++] = (data[i] / 127.5) - 1;
        floatInput[j++] = (data[i + 1] / 127.5) - 1;
        floatInput[j++] = (data[i + 2] / 127.5) - 1;
      }
      const outputs = await model.run([floatInput]);
      const probs = outputs[0];
      let max = 0, index = 0;
      for (let i = 0; i < probs.length; i++) {
        if (probs[i] > max) { max = probs[i]; index = i; }
      }
      return { label: labels[index] || `Clase_${index}`, confidence: max };
    } catch (e) { return null; }
  };

  const classifyOnline = async (base64) => {
    try {
      const response = await fetch("https://api-inference.huggingface.co/models/linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: base64 })
      });
      const result = await response.json();
      return (Array.isArray(result) && result.length > 0) ? { label: result[0].label, confidence: result[0].score } : null;
    } catch (e) { return null; }
  };

  const classifyImage = async (imageUri) => {
    if (!imageUri) return;
    setLoadingIA(true);
    try {
      const result = await manipulateAsync(imageUri, [{ resize: { width: 224, height: 224 } }], { compress: 1, format: SaveFormat.JPEG, base64: true });
      let res = isOnline ? await classifyOnline(result.base64) : null;
      if (!res) res = await classifyOffline(result.base64);
      setPrediction(applyExpertDiagnosis(res));
    } catch (e) { Alert.alert("Error IA"); } finally { setLoadingIA(false); }
  };

  return { prediction, setPrediction, loadingIA, classifyImage };
};