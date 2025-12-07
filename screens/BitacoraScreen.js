import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Keyboard, ScrollView, Image, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker'; 
import * as Print from 'expo-print'; 
import * as Sharing from 'expo-sharing'; 
import * as FileSystem from 'expo-file-system'; // <--- IMPORTANTE: Necesario para leer imágenes en Base64
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
    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('es-ES', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    };

    const bitacorasContent = bitacoras.map(item => `
        <div class="card">
            <div class="card-header">
                <div>
                    <span class="etapa">${item.etapa}</span><br>
                    <span class="fecha">${formatDate(item.fecha)}</span>
                </div>
            </div>
            <p class="nota">${item.nota}</p>
            ${item.imagen ? `<img class="imagen-bitacora" src="${item.imagen}" alt="Evidencia"/>` : ''}
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
                    .card { 
                        border: 1px solid #ddd; 
                        border-radius: 8px; 
                        padding: 15px; 
                        margin-bottom: 15px; 
                        page-break-inside: avoid;
                    }
                    .card-header { 
                        border-bottom: 1px solid #eee; 
                        padding-bottom: 8px; 
                        margin-bottom: 8px;
                    }
                    .etapa { font-weight: bold; color: #2E7D32; font-size: 1.1em; }
                    .fecha { font-size: 0.85em; color: #777; }
                    .nota { font-size: 1em; color: #333; line-height: 1.4; white-space: pre-wrap; }
                    .imagen-bitacora { 
                        max-width: 100%; 
                        height: auto; 
                        max-height: 300px;
                        border-radius: 4px; 
                        margin-top: 10px;
                        border: 1px solid #eee;
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
  const STORAGE_KEY = `@bitacora_v3_fotos_${cultivo}`;

  // ESTADOS
  const [nota, setNota] = useState('');
  const [fecha, setFecha] = useState(new Date());
  const [selectedEtapa, setSelectedEtapa] = useState(etapasDisponibles[0]);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [modePicker, setModePicker] = useState('date');
  const [bitacoras, setBitacoras] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showBitacoras, setShowBitacoras] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // ----------------------------------------------------
  // --- 4. CARGA Y GUARDADO ---
  // ----------------------------------------------------

  useEffect(() => {
    cargarDatosGuardados();
  }, []);

  const cargarDatosGuardados = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data !== null) {
        setBitacoras(JSON.parse(data));
      }
    } catch (error) {
      console.error("Error carga:", error);
    } finally {
        setIsLoading(false);
    }
  };

  const guardarDatos = async (nuevasBitacoras) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nuevasBitacoras));
      setBitacoras(nuevasBitacoras);
    } catch (error) {
      Alert.alert("Error", "No se pudo guardar.");
    }
  };

  // ----------------------------------------------------
  // --- 5. FECHA Y HORA ---
  // ----------------------------------------------------
  
  const handleDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || fecha;
    setMostrarPicker(Platform.OS === 'ios'); 
    setFecha(currentDate);

    if (Platform.OS === 'android' && modePicker === 'date' && selectedDate) {
        setModePicker('time');
        setMostrarPicker(true);
    } else if (Platform.OS === 'android' && modePicker === 'time') {
        setMostrarPicker(false);
    }
  };

  const showDatePicker = () => {
    setModePicker('date');
    setMostrarPicker(true);
    Keyboard.dismiss();
  };

  // ----------------------------------------------------
  // --- 6. IMÁGENES ---
  // ----------------------------------------------------

  const verificarPermisos = async (tipo) => {
    if (Platform.OS === 'web') return true;
    const { status } = tipo === 'camara' 
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
        Alert.alert("Permiso requerido", "Habilita los permisos en ajustes.");
        return false;
    }
    return true;
  };
  
  const seleccionarImagen = async () => {
    if (!await verificarPermisos('galeria')) return;
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 3], quality: 0.5,
    });
    if (!result.canceled && result.assets) setSelectedImage(result.assets[0].uri);
  };

  const tomarFoto = async () => {
    if (!await verificarPermisos('camara')) return;
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 3], quality: 0.5,
    });
    if (!result.canceled && result.assets) setSelectedImage(result.assets[0].uri);
  };

  // ----------------------------------------------------
  // --- 7. NOTAS ---
  // ----------------------------------------------------

  const agregarNota = () => {
    if (!nota.trim()) {
      Alert.alert("Atención", "Escribe una nota primero.");
      return;
    }

    const nuevaNota = {
      id: Date.now().toString(),
      cultivo,
      etapa: selectedEtapa,
      nota: nota.trim(),
      fecha: fecha.getTime(),
      imagen: selectedImage,
    };

    const nuevasBitacoras = [nuevaNota, ...bitacoras];
    guardarDatos(nuevasBitacoras);

    setNota('');
    setFecha(new Date());
    setSelectedImage(null);
    Keyboard.dismiss();
    Alert.alert("Guardado", "Registro añadido.");
  };

  const eliminarNota = (id) => {
    Alert.alert("Eliminar", "¿Borrar este registro?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => {
          const nuevas = bitacoras.filter(item => item.id !== id);
          guardarDatos(nuevas);
      }},
    ]);
  };
  
  // ----------------------------------------------------
  // --- 8. PDF CON IMÁGENES CORREGIDAS ---
  // ----------------------------------------------------

  const generarPdf = async () => {
    if (bitacoras.length === 0) return Alert.alert("Vacío", "No hay registros.");
    
    try {
        // PROCESAR IMÁGENES A BASE64
        const bitacorasProcesadas = await Promise.all(bitacoras.map(async (item) => {
            if (item.imagen) {
                try {
                    const base64 = await FileSystem.readAsStringAsync(item.imagen, { encoding: FileSystem.EncodingType.Base64 });
                    return { ...item, imagen: `data:image/jpeg;base64,${base64}` };
                } catch (e) {
                    console.log("Error imagen PDF", e);
                    return item; // Retorna item sin cambios si falla (la imagen podría no verse)
                }
            }
            return item;
        }));

        const htmlContent = generateHtml(cultivo, bitacorasProcesadas);
        const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });

        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Bitácora ${cultivo}` });
        } else {
            Alert.alert("Error", "Compartir no disponible.");
        }
    } catch (error) {
        Alert.alert("Error PDF", "No se pudo generar el documento.");
    }
  };

  // ----------------------------------------------------
  // --- 9. RENDERIZADO Y ESTILOS ---
  // ----------------------------------------------------

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerInfo}>
            <Text style={styles.badgeText}>📍 {item.etapa}</Text>
            <Text style={styles.dateText}>
                {new Date(item.fecha).toLocaleDateString('es-ES', { 
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                })}
            </Text>
        </View>
        {/* BOTÓN DE ELIMINAR CORREGIDO: A la derecha, sin overlap */}
        <TouchableOpacity onPress={() => eliminarNota(item.id)} style={styles.deleteButton}>
           <MaterialCommunityIcons name="trash-can-outline" size={24} color="#D32F2F" />
        </TouchableOpacity>
      </View>
      
      <Text style={styles.cardText}>{item.nota}</Text>
      {item.imagen && <Image source={{ uri: item.imagen }} style={styles.cardImage} />}
    </View>
  );

  if (isLoading) return <View style={styles.loadingContainer}><Text>Cargando...</Text></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>📝 Bitácora de Campo</Text>
      <Text style={styles.subtituloCultivo}>Cultivo: {cultivo}</Text>
      
      <TouchableOpacity style={styles.toggleButton} onPress={() => setShowBitacoras(!showBitacoras)}>
        <Text style={styles.toggleText}>{showBitacoras ? "➕ Nuevo Registro" : "Ver Lista"}</Text>
      </TouchableOpacity>

      {/* FORMULARIO */}
      {!showBitacoras && (
        <ScrollView style={styles.formContainer} keyboardShouldPersistTaps='handled'>
            <Text style={styles.label}>Etapa Fenológica:</Text>
            <View style={styles.chipsContainer}>
                {etapasDisponibles.map((etapa) => (
                    <TouchableOpacity key={etapa} style={[styles.chip, selectedEtapa === etapa && styles.chipSelected]} onPress={() => setSelectedEtapa(etapa)}>
                        <Text style={[styles.chipText, selectedEtapa === etapa && styles.chipTextSelected]}>{etapa}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.label}>Fecha y Hora:</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={showDatePicker}>
                <MaterialCommunityIcons name="calendar-clock" size={24} color="#2E7D32" />
                <Text style={styles.dateText}>
                    {fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </Text>
            </TouchableOpacity>
            {mostrarPicker && <DateTimePicker value={fecha} mode={modePicker} is24Hour={true} display="default" onChange={handleDateChange} />}

            <Text style={styles.label}>Observaciones:</Text>
            <TextInput style={styles.inputArea} placeholder="Describe la actividad..." multiline numberOfLines={3} value={nota} onChangeText={setNota} />

            <View style={styles.camaraRow}>
                <TouchableOpacity style={styles.btnCamara} onPress={tomarFoto}>
                    <MaterialCommunityIcons name="camera" size={20} color="#fff" />
                    <Text style={styles.textoBotonSmall}>Foto</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnCamara, {backgroundColor: '#0288D1'}]} onPress={seleccionarImagen}>
                    <MaterialCommunityIcons name="image" size={20} color="#fff" />
                    <Text style={styles.textoBotonSmall}>Galería</Text>
                </TouchableOpacity>
                {selectedImage && <Image source={{ uri: selectedImage }} style={styles.miniPreview} />}
            </View>
            
            <TouchableOpacity style={styles.botonGuardar} onPress={agregarNota}>
                <Text style={styles.textoBoton}>Guardar Registro</Text>
            </TouchableOpacity>
            <View style={{height: 20}} />
        </ScrollView>
      )}

      {/* LISTA */}
      {showBitacoras && (
          <View style={styles.listContainer}>
            <TouchableOpacity style={styles.botonPdf} onPress={generarPdf}>
                <MaterialCommunityIcons name="file-pdf-box" size={20} color="#fff" style={{marginRight:5}}/>
                <Text style={styles.textoPdf}>Exportar PDF</Text>
            </TouchableOpacity>

            {bitacoras.length === 0 ? (
              <Text style={styles.emptyText}>Sin registros.</Text>
            ) : (
              <FlatList data={bitacoras} renderItem={renderItem} keyExtractor={item => item.id} contentContainerStyle={{ paddingBottom: 20 }} />
            )}
          </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: '#f4f4f4' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32', textAlign: 'center' },
  subtituloCultivo: { fontSize: 14, color: '#777', textAlign: 'center', marginBottom: 10 },
  
  toggleButton: { backgroundColor: '#4CAF50', padding: 8, borderRadius: 8, marginBottom: 10, alignItems: 'center' },
  toggleText: { color: '#fff', fontWeight: 'bold' },
  
  formContainer: { backgroundColor: '#fff', borderRadius: 10, padding: 15, flex: 1 },
  listContainer: { flex: 1 },
  
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 10, marginBottom: 5 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 5 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#eee', marginRight: 5, marginBottom: 5 },
  chipSelected: { backgroundColor: '#2E7D32' },
  chipText: { fontSize: 11, color: '#333' },
  chipTextSelected: { color: '#fff', fontWeight: 'bold' },
  
  dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 10, borderRadius: 8 },
  dateText: { marginLeft: 10, fontSize: 14, color: '#2E7D32', fontWeight: 'bold' },
  inputArea: { backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#eee', height: 80, textAlignVertical: 'top' },
  
  camaraRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, marginBottom: 15, gap: 10 },
  btnCamara: { flexDirection: 'row', backgroundColor: '#FF9800', padding: 8, borderRadius: 6, alignItems: 'center' },
  textoBotonSmall: { color: '#fff', marginLeft: 5, fontSize: 12, fontWeight: 'bold' },
  miniPreview: { width: 40, height: 40, borderRadius: 4, borderWidth: 1, borderColor: '#ccc' },
  
  botonGuardar: { backgroundColor: '#2E7D32', padding: 12, borderRadius: 8, alignItems: 'center' },
  textoBoton: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  botonPdf: { flexDirection:'row', justifyContent:'center', backgroundColor: '#D32F2F', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  textoPdf: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  
  // TARJETA Y DISEÑO CORREGIDO
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  cardHeader: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', // Separa info y botón
      alignItems: 'flex-start',
      marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', paddingBottom: 5 
  },
  headerInfo: { flex: 1, marginRight: 10 }, // Ocupa el espacio disponible menos el botón
  badgeText: { fontSize: 13, color: '#1B5E20', fontWeight: 'bold' },
  dateText: { fontSize: 11, color: '#888', marginTop: 2 },
  deleteButton: { padding: 5 }, // Botón fácil de tocar sin position absolute
  
  cardText: { fontSize: 14, color: '#333', lineHeight: 20 },
  cardImage: { width: '100%', height: 180, borderRadius: 8, marginTop: 10, resizeMode: 'cover' },
  emptyText: { textAlign: 'center', marginTop: 30, color: '#999' }
});