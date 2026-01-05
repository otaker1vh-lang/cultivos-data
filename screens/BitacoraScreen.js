import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Keyboard,
  ScrollView, Image, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system'; // Necesario para Base64
import { MaterialCommunityIcons } from '@expo/vector-icons';

// ----------------------------------------------------
// --- 1. CONSTANTES Y CONFIGURACIÓN ---
// ----------------------------------------------------
const CATALOGO_ETAPAS = {
  "Maiz": ["Siembra", "Germinación", "V1-V3 (Plántula)", "V4-V10 (Crecimiento)", "VT (Floración)", "R1-R5 (Llenado)", "Madurez", "Cosecha"],
  "Frijol": ["Siembra", "Emergencia", "Vegetativo", "Floración", "Vainas", "Madurez", "Cosecha"],
  "General": ["Preparación", "Siembra", "Desarrollo", "Floración", "Fructificación", "Cosecha"]
};

// ----------------------------------------------------
// --- 2. GENERADOR DE HTML PARA PDF ---
// ----------------------------------------------------

const generateHtml = (cultivo, bitacoras) => {
  // --- MODIFICACIÓN AQUÍ: Se eliminaron 'hour' y 'minute' ---
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const bitacorasContent = bitacoras.map(item => `
        <div class="card ${item.completada ? 'completada' : ''}">
            <div class="card-header">
                <div>
                    <span class="etapa">${item.completada ? '✅ ' : '⬜ '}${item.etapa}</span><br>
                    <span class="fecha">${formatDate(item.fecha)}</span>
                </div>
            </div>
            <p class="nota" style="${item.completada ? 'text-decoration: line-through; color: #888;' : ''}">${item.nota}</p>
            
            ${item.imagen ? `
              <div class="img-container">
                 <img src="${item.imagen}" class="imagen-bitacora" />
              </div>
            ` : ''}
        </div>
    `).join('');

  return `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Bitácora - ${cultivo}</title>
                <style>
                    body { font-family: Helvetica, sans-serif; padding: 20px; background-color: #fff; }
                    h1 { color: #2E7D32; text-align: center; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
                    .header { text-align: center; margin-bottom: 20px; color: #555; font-size: 0.9em; }
                    .card { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 15px; page-break-inside: avoid; }
                    .completada { background-color: #f9f9f9; border-color: #eee; }
                    .card-header { border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px; }
                    .etapa { font-weight: bold; color: #2E7D32; font-size: 1.1em; }
                    .fecha { font-size: 0.85em; color: #777; }
                    .nota { font-size: 1em; color: #333; line-height: 1.4; white-space: pre-wrap; }
                    
                    /* ESTILOS CLAVE PARA VER LA IMAGEN */
                    .img-container { 
                        text-align: center; 
                        margin-top: 10px; 
                        width: 100%;
                    }
                    .imagen-bitacora { 
                        width: 90%; 
                        max-width: 400px; 
                        height: auto; 
                        border-radius: 4px; 
                        border: 1px solid #eee; 
                        display: block;
                        margin: 0 auto;
                    }
                    .no-data { text-align: center; color: #999; margin-top: 50px; }
                </style>
            </head>
            <body>
                <h1>📝 Bitácora: ${cultivo}</h1>
                <div class="header">Generado el ${formatDate(Date.now())}</div>
                ${bitacoras.length > 0 ? bitacorasContent : '<p class="no-data">Sin registros.</p>'}
            </body>
        </html>
    `;
};

// ----------------------------------------------------
// --- 3. COMPONENTE PRINCIPAL ---
// ----------------------------------------------------
export default function BitacoraScreen({ route }) {
  const { cultivo } = route.params || { cultivo: 'General' };
  const etapasDisponibles = CATALOGO_ETAPAS[cultivo] || CATALOGO_ETAPAS["General"];
  const STORAGE_KEY = `@bitacora_v4_fotos_${cultivo}`;

  const [nota, setNota] = useState('');
  const [fecha, setFecha] = useState(new Date());
  const [selectedEtapa, setSelectedEtapa] = useState(etapasDisponibles[0]);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [modePicker, setModePicker] = useState('date');
  const [bitacoras, setBitacoras] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showBitacoras, setShowBitacoras] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    cargarDatosGuardados();
  }, []);

  const cargarDatosGuardados = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data !== null) setBitacoras(JSON.parse(data));
    } catch { }
    finally { setIsLoading(false); }
  };

  const guardarDatos = async (nuevasBitacoras) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nuevasBitacoras));
      setBitacoras(nuevasBitacoras);
    } catch {
      Alert.alert("Error", "No se pudo guardar.");
    }
  };

  // ----------------------
  // FOTOS + PERMISOS
  // ----------------------

  const verificarPermisos = async (tipo) => {
    if (Platform.OS === 'web') return true;
    const { status } = tipo === 'camara'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert("Permiso requerido", "Habilita permisos para fotos.");
      return false;
    }
    return true;
  };

  const seleccionarImagen = async () => {
    if (!await verificarPermisos('galeria')) return;
    let r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5, // Calidad media para no saturar memoria
    });
    if (!r.canceled && r.assets) setSelectedImage(r.assets[0].uri);
  };

  const tomarFoto = async () => {
    if (!await verificarPermisos('camara')) return;
    let r = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5, // Calidad media
    });
    if (!r.canceled && r.assets) setSelectedImage(r.assets[0].uri);
  };

  // ----------------------
  // CONVERTIR IMAGEN A BASE64 (CORREGIDO V2)
  // ----------------------
  const convertirImagenBase64 = async (uri) => {
    try {
      if (!uri) return null;

      let uriParaLeer = uri;

      // 1. Manejo especial para Android (Content URI a File URI)
      if (Platform.OS === 'android' && uri.startsWith('content://')) {
        const nombreArchivo = uri.split('/').pop();
        const destino = FileSystem.cacheDirectory + 'temp_' + nombreArchivo;
        try {
            await FileSystem.copyAsync({ from: uri, to: destino });
            uriParaLeer = destino;
        } catch (copyError) {
            console.log("Error copiando archivo temporal:", copyError);
            return null; // Si falla la copia, no podemos seguir
        }
      } 
      else if (Platform.OS === 'android' && !uri.includes('://')) {
        uriParaLeer = `file://${uri}`;
      }

      // 2. LEER EL ARCHIVO
      const base64 = await FileSystem.readAsStringAsync(uriParaLeer, {
        encoding: 'base64', 
      });

      return `data:image/jpeg;base64,${base64}`;

    } catch (e) {
      console.log("Error detallado convirtiendo a Base64:", e);
      return null;
    }
  };

  // ----------------------
  // GUARDAR NOTA
  // ----------------------

  const agregarNota = async () => {
    if (!nota.trim()) return Alert.alert("Atención", "Escribe una nota.");

    let imagenFinal = null;
    if (selectedImage) imagenFinal = selectedImage;

    const nueva = {
      id: Date.now().toString(),
      cultivo,
      etapa: selectedEtapa,
      nota: nota.trim(),
      fecha: fecha.getTime(),
      imagen: imagenFinal,
      completada: false,
    };

    guardarDatos([nueva, ...bitacoras]);

    setNota('');
    setSelectedImage(null);
    setFecha(new Date());
    Keyboard.dismiss();

    Alert.alert("Éxito", "Tarea guardada.");
  };

  const eliminarNota = (id) => {
    Alert.alert("Eliminar", "¿Eliminar registro?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar", style: "destructive", onPress: () => {
          guardarDatos(bitacoras.filter(i => i.id !== id));
        }
      }
    ]);
  };

  const toggleCompletada = (id) => {
    guardarDatos(
      bitacoras.map(i => i.id === id ? { ...i, completada: !i.completada } : i)
    );
  };

  // ----------------------
  // DATE PICKER
  // ----------------------

  const handleDateChange = (event, selectedDate) => {
    if (!selectedDate) return;

    if (Platform.OS === 'android') {
      if (modePicker === 'date') {
        setFecha(selectedDate);
        setModePicker('time');
        setMostrarPicker(true);
      } else {
        setFecha(selectedDate);
        setMostrarPicker(false);
      }
    } else {
      setFecha(selectedDate);
    }
  };

  const showDatePicker = () => {
    setModePicker('date');
    setMostrarPicker(true);
    Keyboard.dismiss();
  };

  // ----------------------
  // PDF (CONVERSIÓN BASE64 SEGURA)
  // ----------------------

  const generarPdf = async () => {
    if (bitacoras.length === 0) return Alert.alert("Vacío", "No hay registros.");
    
    setIsGeneratingPdf(true); 

    try {
      console.log("Iniciando generación PDF con Base64...");

      // 1. Procesar todas las imágenes a Base64
      const procesadas = await Promise.all(
        bitacoras.map(async (item) => {
          if (item.imagen) {
            const base64 = await convertirImagenBase64(item.imagen);
            return { ...item, imagen: base64 || null };
          }
          return item;
        })
      );

      // 2. Generar HTML
      const html = generateHtml(cultivo, procesadas);

      // 3. Crear PDF
      const { uri } = await Print.printToFileAsync({ 
          html: html,
          base64: false 
      });

      console.log("PDF Generado OK:", uri);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: `Bitácora ${cultivo}`,
        });
      }

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Error al generar PDF: " + e.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // ----------------------
  // LISTA Y UI
  // ----------------------

  function renderItem({ item }) {
    return (
      <View style={[styles.card, item.completada && styles.cardCompletada]}>
        <View style={styles.cardContentRow}>
          <TouchableOpacity style={styles.checkboxContainer} onPress={() => toggleCompletada(item.id)}>
            <MaterialCommunityIcons
              name={item.completada ? "checkbox-marked" : "checkbox-blank-outline"}
              size={32}
              color={item.completada ? "#4CAF50" : "#757575"}
            />
          </TouchableOpacity>

          <View style={styles.cardInfoContainer}>
            <View style={styles.cardHeader}>
              <View style={styles.headerInfo}>
                <Text style={[styles.badgeText, item.completada && styles.textStrikethrough]}>
                  📍 {item.etapa}
                </Text>
                <Text style={styles.dateText}>
                  {new Date(item.fecha).toLocaleDateString('es-ES', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </Text>
              </View>

              <TouchableOpacity onPress={() => eliminarNota(item.id)} style={styles.deleteButton}>
                <MaterialCommunityIcons name="trash-can-outline" size={22} color="#D32F2F" />
              </TouchableOpacity>
            </View>

            <Text style={[styles.cardText, item.completada && styles.textGray]}>{item.nota}</Text>

            {item.imagen && (
              <Image
                source={{ uri: item.imagen }}
                style={[styles.cardImage, item.completada && { opacity: 0.6 }]} />
            )}
          </View>
        </View>
      </View>
    );
  }

  if (isLoading) return <View style={styles.loadingContainer}><Text>Cargando datos...</Text></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>📝 Bitácora de {cultivo}</Text>

      <TouchableOpacity style={styles.toggleButton} onPress={() => setShowBitacoras(!showBitacoras)}>
        <Text style={styles.toggleText}>{showBitacoras ? "➕ Nuevo Registro" : "📋 Ver Lista"}</Text>
      </TouchableOpacity>

      {!showBitacoras && (
        <ScrollView style={styles.formContainer}>

          <Text style={styles.label}>Etapa Fenológica:</Text>
          <View style={styles.chipsContainer}>
            {etapasDisponibles.map((e) => (
              <TouchableOpacity
                key={e}
                style={[styles.chip, selectedEtapa === e && styles.chipSelected]}
                onPress={() => setSelectedEtapa(e)}>
                <Text style={[styles.chipText, selectedEtapa === e && styles.chipTextSelected]}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Fecha y Hora:</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={showDatePicker}>
            <MaterialCommunityIcons name="calendar-clock" size={24} color="#2E7D32" />
            <Text style={styles.dateText}>{fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</Text>
          </TouchableOpacity>

          {mostrarPicker && (
            <DateTimePicker value={fecha} mode={modePicker} is24Hour={true} display="default" onChange={handleDateChange} />
          )}

          <Text style={styles.label}>Actividad / Observación:</Text>
          <TextInput style={styles.inputArea} multiline value={nota} onChangeText={setNota} />

          <View style={styles.camaraRow}>
            <TouchableOpacity style={styles.btnCamara} onPress={tomarFoto}>
              <MaterialCommunityIcons name="camera" size={20} color="#fff" />
              <Text style={styles.textoBotonSmall}>Foto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btnCamara, { backgroundColor: '#0288D1' }]} onPress={seleccionarImagen}>
              <MaterialCommunityIcons name="image" size={20} color="#fff" />
              <Text style={styles.textoBotonSmall}>Galería</Text>
            </TouchableOpacity>

            {selectedImage && <Image source={{ uri: selectedImage }} style={styles.miniPreview} />}
          </View>

          <TouchableOpacity style={styles.botonGuardar} onPress={agregarNota}>
            <Text style={styles.textoBoton}>Guardar Tarea</Text>
          </TouchableOpacity>

        </ScrollView>
      )}

      {showBitacoras && (
        <View style={styles.listContainer}>
          <TouchableOpacity 
            style={[styles.botonPdf, isGeneratingPdf && { backgroundColor: '#888' }]} 
            onPress={generarPdf}
            disabled={isGeneratingPdf}
          >
            <MaterialCommunityIcons name="file-pdf-box" size={20} color="#fff" style={{ marginRight: 5 }} />
            <Text style={styles.textoPdf}>{isGeneratingPdf ? "Generando..." : "Exportar Reporte PDF"}</Text>
          </TouchableOpacity>

          {bitacoras.length === 0 ? (
            <Text style={styles.emptyText}>No hay actividades registradas.</Text>
          ) : (
            <FlatList data={bitacoras} renderItem={renderItem} keyExtractor={i => i.id} />
          )}
        </View>
      )}

    </View>
  );
}

// ----------------------------------------------------
// ESTILOS
// ----------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: '#f4f4f4' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32', textAlign: 'center', marginBottom: 10 },

  toggleButton: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 8, marginBottom: 15, alignItems: 'center' },
  toggleText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  formContainer: { backgroundColor: '#fff', borderRadius: 10, padding: 15, flex: 1 },
  listContainer: { flex: 1 },

  label: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 10 },

  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 5 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#eee', marginRight: 5, marginBottom: 5 },
  chipSelected: { backgroundColor: '#2E7D32' },
  chipText: { fontSize: 11, color: '#333' },
  chipTextSelected: { color: '#fff', fontWeight: 'bold' },

  dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 10, borderRadius: 8 },
  dateText: { marginLeft: 10, fontSize: 14, color: '#2E7D32', fontWeight: 'bold' },

  inputArea: { backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#eee', minHeight: 80, textAlignVertical: 'top' },

  camaraRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, marginBottom: 15, gap: 10 },
  btnCamara: { flexDirection: 'row', backgroundColor: '#FF9800', padding: 8, borderRadius: 6, alignItems: 'center' },
  textoBotonSmall: { color: '#fff', marginLeft: 5, fontSize: 12, fontWeight: 'bold' },
  miniPreview: { width: 40, height: 40, borderRadius: 4, borderWidth: 1, borderColor: '#ccc' },

  botonGuardar: { backgroundColor: '#2E7D32', padding: 12, borderRadius: 8, alignItems: 'center' },
  textoBoton: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  botonPdf: { flexDirection: 'row', justifyContent: 'center', backgroundColor: '#D32F2F', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  textoPdf: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  emptyText: { textAlign: 'center', marginTop: 30, color: '#999' },

  card: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 10, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#9E9E9E', overflow: 'hidden' },
  cardCompletada: { backgroundColor: '#F1F8E9', borderLeftColor: '#4CAF50' },
  cardContentRow: { flexDirection: 'row', padding: 10 },
  checkboxContainer: { justifyContent: 'center', alignItems: 'center', paddingRight: 10, borderRightWidth: 1, borderRightColor: '#f0f0f0', marginRight: 10, width: 50 },
  cardInfoContainer: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  headerInfo: { flex: 1 },
  badgeText: { fontSize: 13, color: '#1B5E20', fontWeight: 'bold' },
  textStrikethrough: { textDecorationLine: 'line-through', color: '#888' },
  textGray: { color: '#999' },
  cardText: { fontSize: 14, color: '#333' },
  cardImage: { width: '100%', height: 150, borderRadius: 8, marginTop: 8, resizeMode: 'cover' },
  deleteButton: { paddingLeft: 10 },
});