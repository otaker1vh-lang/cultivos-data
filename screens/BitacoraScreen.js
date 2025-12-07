import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Keyboard, ScrollView, Image, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker'; 
import * as Print from 'expo-print'; // Importación para PDF
import * as Sharing from 'expo-sharing'; // Importación para compartir
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
    // Función para formatear la fecha
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

    // Generar el contenido de la bitácora
    const bitacorasContent = bitacoras.map(item => `
        <div class="card">
            <div class="card-header">
                <span class="etapa">${item.etapa}</span>
                <span class="fecha">${formatDate(item.fecha)}</span>
            </div>
            <p class="nota">${item.nota}</p>
            ${item.imagen ? `<img class="imagen-bitacora" src="${item.imagen}" alt="Imagen de la bitácora"/>` : ''}
        </div>
    `).join('');

    return `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0">
                <title>Bitácora de Campo - ${cultivo}</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; background-color: #f4f4f4; }
                    h1 { color: #2E7D32; text-align: center; border-bottom: 3px solid #E8F5E9; padding-bottom: 10px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .header p { color: #555; font-size: 1.1em; }
                    .card { 
                        background-color: #fff; 
                        border-radius: 8px; 
                        padding: 15px; 
                        margin-bottom: 20px; 
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
                        border-left: 5px solid #4CAF50;
                    }
                    .card-header { 
                        display: flex; 
                        justify-content: space-between; 
                        margin-bottom: 10px; 
                        padding-bottom: 5px; 
                        border-bottom: 1px dashed #eee;
                    }
                    .etapa { font-weight: bold; color: #1B5E20; }
                    .fecha { font-size: 0.9em; color: #757575; }
                    .nota { font-size: 1em; color: #333; line-height: 1.5; }
                    .imagen-bitacora { 
                        max-width: 100%; 
                        height: auto; 
                        border-radius: 4px; 
                        margin-top: 10px;
                    }
                    .no-data { text-align: center; color: #999; margin-top: 50px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📝 Bitácora de Campo: ${cultivo}</h1>
                    <p>Reporte generado el ${formatDate(Date.now())}</p>
                </div>
                ${bitacoras.length > 0 ? bitacorasContent : '<p class="no-data">Aún no hay registros en la bitácora.</p>'}
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
  // --- 4. ASYNC STORAGE (Carga y Guardado) ---
  // ----------------------------------------------------

  // Cargar datos guardados
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
      console.error("Error al cargar la bitácora:", error);
      Alert.alert("Error", "No se pudieron cargar los registros.");
    } finally {
        setIsLoading(false);
    }
  };

  // Guardar datos
  const guardarDatos = async (nuevasBitacoras) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nuevasBitacoras));
      setBitacoras(nuevasBitacoras);
    } catch (error) {
      console.error("Error al guardar la bitácora:", error);
      Alert.alert("Error", "No se pudieron guardar los registros.");
    }
  };

  // ----------------------------------------------------
  // --- 5. MANEJO DE FECHA/HORA ---
  // ----------------------------------------------------
  
  const handleDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || fecha;
    setMostrarPicker(Platform.OS === 'ios'); // En iOS se mantiene abierto, en Android se cierra automáticamente
    setFecha(currentDate);

    // Si es Android y se seleccionó la fecha, mostramos el picker de hora
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
  // --- 6. MANEJO DE IMAGEN ---
  // ----------------------------------------------------

  const verificarPermisosGaleria = async () => {
    if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert("Permiso requerido", "Necesitamos permiso para acceder a la galería.");
            return false;
        }
    }
    return true;
  };

  const verificarPermisosCamara = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
        Alert.alert("Permiso requerido", "Necesitamos permiso para acceder a la cámara.");
        return false;
    }
    return true;
  };
  
  const seleccionarImagen = async () => {
    if (!await verificarPermisosGaleria()) return;

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5, // Reducir calidad para ahorrar espacio en AsyncStorage
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const tomarFoto = async () => {
    if (!await verificarPermisosCamara()) return;

    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  // ----------------------------------------------------
  // --- 7. MANEJO DE NOTAS Y ELIMINACIÓN ---
  // ----------------------------------------------------

  const agregarNota = () => {
    if (!nota.trim()) {
      Alert.alert("Error", "La nota no puede estar vacía.");
      return;
    }

    const nuevaNota = {
      id: Date.now().toString(),
      cultivo,
      etapa: selectedEtapa,
      nota: nota.trim(),
      fecha: fecha.getTime(), // Guardamos el timestamp
      imagen: selectedImage, // URI de la imagen
    };

    // Agregar la nueva nota al inicio de la lista
    const nuevasBitacoras = [nuevaNota, ...bitacoras];
    guardarDatos(nuevasBitacoras);

    // Limpiar formulario
    setNota('');
    setFecha(new Date());
    setSelectedImage(null);
    Keyboard.dismiss();
    Alert.alert("Éxito", "Registro guardado en la bitácora.");
  };

  const eliminarNota = (id) => {
    Alert.alert(
      "Confirmar Eliminación",
      "¿Estás seguro de que quieres eliminar este registro de la bitácora?",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Eliminar", 
          style: "destructive", 
          onPress: () => {
            const nuevasBitacoras = bitacoras.filter(item => item.id !== id);
            guardarDatos(nuevasBitacoras);
          } 
        },
      ]
    );
  };
  
  // ----------------------------------------------------
  // --- 8. GENERACIÓN Y COMPARTICIÓN DE PDF ---
  // ----------------------------------------------------

  const generarPdf = async () => {
    if (bitacoras.length === 0) {
        Alert.alert("Bitácora Vacía", "No hay registros para generar el PDF.");
        return;
    }
    
    // 1. Generar el contenido HTML
    const htmlContent = generateHtml(cultivo, bitacoras);

    try {
        // 2. Crear el PDF
        const { uri } = await Print.printToFileAsync({
            html: htmlContent,
            base64: false,
        });

        // 3. Compartir el PDF
        if (Platform.OS === 'web') {
             Alert.alert("Función no disponible", "La generación de PDF no está soportada en la web.");
             return;
        }

        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { 
                mimeType: 'application/pdf', 
                dialogTitle: `Bitácora de Campo - ${cultivo}`,
                uti: 'com.adobe.pdf' // Para iOS
            });
        } else {
            Alert.alert("Error", "La función de compartir no está disponible en este dispositivo.");
        }
    } catch (error) {
        console.error('Error al generar o compartir PDF:', error);
        Alert.alert("Error", "Hubo un problema al generar el archivo PDF.");
    }
  };

  // ----------------------------------------------------
  // --- 9. RENDERIZADO ---
  // ----------------------------------------------------

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.badgeText}>📍 {item.etapa}</Text>
        <Text style={styles.dateText}>{new Date(item.fecha).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      <Text style={styles.cardText}>{item.nota}</Text>
      {item.imagen && <Image source={{ uri: item.imagen }} style={styles.cardImage} />}
      <TouchableOpacity 
        style={styles.deleteButton} 
        onPress={() => eliminarNota(item.id)}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={20} color="#D32F2F" />
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
        <View style={[styles.container, styles.loadingContainer]}>
            <Text style={styles.titulo}>Cargando Bitácora...</Text>
        </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>📝 Bitácora de Campo</Text>
      <Text style={styles.subtituloCultivo}>Cultivo: {cultivo}</Text>
      
      {/* Botón para ver/ocultar el formulario de nueva nota */}
      <TouchableOpacity 
        style={styles.toggleButton} 
        onPress={() => setShowBitacoras(!showBitacoras)}
      >
        <Text style={styles.toggleText}>
            {showBitacoras ? "Ocultar Formularios" : "➕ Nuevo Registro"}
        </Text>
      </TouchableOpacity>

      {/* Formulario de Nueva Nota */}
      {!showBitacoras && (
        <ScrollView style={styles.formContainer} keyboardShouldPersistTaps='handled'>
            
            {/* Selector de Etapa */}
            <Text style={styles.label}>Etapa Fenológica:</Text>
            <View style={styles.chipsContainer}>
                {etapasDisponibles.map((etapa) => (
                    <TouchableOpacity
                        key={etapa}
                        style={[styles.chip, selectedEtapa === etapa && styles.chipSelected]}
                        onPress={() => setSelectedEtapa(etapa)}
                    >
                        <Text style={[styles.chipText, selectedEtapa === etapa && styles.chipTextSelected]}>
                            {etapa}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Selector de Fecha/Hora */}
            <Text style={styles.label}>Fecha y Hora de la Nota:</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={showDatePicker}>
                <MaterialCommunityIcons name="calendar-clock" size={24} color="#2E7D32" />
                <Text style={styles.dateText}>
                    {fecha.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
            </TouchableOpacity>
            
            {/* Date Time Picker */}
            {mostrarPicker && (
                <DateTimePicker
                    testID="dateTimePicker"
                    value={fecha}
                    mode={modePicker}
                    is24Hour={true}
                    display="default"
                    onChange={handleDateChange}
                />
            )}

            {/* Campo de Nota */}
            <Text style={styles.label}>Observaciones / Labor:</Text>
            <TextInput
                style={styles.inputArea}
                placeholder="Ej: Se aplicó fertilizante foliar NPK 20-20-20..."
                multiline
                numberOfLines={3}
                value={nota}
                onChangeText={setNota}
            />

            {/* Botones de Cámara y Galería */}
            <View style={styles.camaraRow}>
                <TouchableOpacity 
                    style={styles.btnCamara} 
                    onPress={tomarFoto}
                >
                    <MaterialCommunityIcons name="camera" size={20} color="#fff" />
                    <Text style={[styles.textoBoton, {marginLeft: 5}]}>Tomar Foto</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.btnCamara, {marginLeft: 10, backgroundColor: '#00B0FF'}]} 
                    onPress={seleccionarImagen}
                >
                    <MaterialCommunityIcons name="image-multiple" size={20} color="#fff" />
                    <Text style={[styles.textoBoton, {marginLeft: 5}]}>Galería</Text>
                </TouchableOpacity>
                {selectedImage && (
                    <Image source={{ uri: selectedImage }} style={styles.miniPreview} />
                )}
            </View>
            
            {/* Botón Guardar */}
            <TouchableOpacity 
                style={styles.botonGuardar} 
                onPress={agregarNota}
            >
                <Text style={styles.textoBoton}>Guardar Registro</Text>
            </TouchableOpacity>

            <View style={{height: 30}} />
        </ScrollView>
      )}

      {/* Listado de Bitácoras */}
      <View style={styles.listContainer}>
        <Text style={styles.subtitulo}>Historial de Registros ({bitacoras.length})</Text>
        
        {/* Botón Generar PDF */}
        <TouchableOpacity 
            style={styles.botonPdf} 
            onPress={generarPdf}
        >
            <Text style={styles.textoPdf}>Generar y Compartir PDF</Text>
        </TouchableOpacity>

        {bitacoras.length === 0 ? (
          <Text style={styles.emptyText}>No hay registros en la bitácora aún. ¡Agrega el primero!</Text>
        ) : (
          <FlatList
            data={bitacoras}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        )}
      </View>
    </View>
  );
}

// ----------------------------------------------------
// --- 10. ESTILOS ---
// ----------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f4f4f4',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  titulo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E7D32',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitulo: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 10,
  },
  subtituloCultivo: {
    fontSize: 16,
    color: '#777',
    textAlign: 'center',
    marginBottom: 15,
  },
  toggleButton: {
    backgroundColor: '#4CAF50',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
    alignItems: 'center',
  },
  toggleText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
  },
  listContainer: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 10,
    marginBottom: 5,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  chip: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#eee',
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: '#4CAF50',
  },
  chipText: {
    fontSize: 12,
    color: '#555',
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
  },
  dateText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: 'bold',
  },
  inputArea: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#eee',
    height: 90,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  camaraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 15,
  },
  btnCamara: {
    flexDirection: 'row',
    backgroundColor: '#FF9800',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  miniPreview: {
    width: 50,
    height: 50,
    borderRadius: 5,
    marginLeft: 10,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  botonGuardar: {
    backgroundColor: '#2E7D32',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
  },
  textoBoton: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  botonPdf: { 
    backgroundColor: '#D32F2F', // Color de peligro/rojo
    padding: 10, 
    borderRadius: 8, 
    alignItems: 'center', 
    marginBottom: 15,
    marginTop: 5,
  },
  textoPdf: { 
    color: '#fff', 
    fontWeight: 'bold', 
    fontSize: 14 
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    borderLeftWidth: 5,
    borderLeftColor: '#4CAF50',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 5,
  },
  badgeText: {
    fontSize: 14,
    color: '#1B5E20',
    fontWeight: 'bold',
  },
  cardText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 10,
    marginTop: 5,
  },
  cardImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 10,
    resizeMode: 'cover',
  },
  deleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 5,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#999',
    fontStyle: 'italic',
  }
});