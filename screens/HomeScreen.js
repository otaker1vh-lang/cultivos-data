import ClimaWidget from '../components/ClimaWidget'; // <--- Agrega esto arriba
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  TextInput, 
  Alert, 
  Image,
  FlatList,
  Keyboard
} from "react-native";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import cultivosData from "../data/cultivos.json"; 

// RUTA DEL LOGO
const LOGO_SOURCE = require('../assets/logo_roslin.png'); 
const APP_NAME = "Roślinapp";

// DEFINICIÓN DE LOS MENÚS
const menus = [
    { titulo: '📊 Estadísticas', descripcion: 'Rendimiento y precios.', icono: 'chart-bar', ruta: 'Estadisticas' },
    { titulo: '📅 Ciclo Fenológico', descripcion: 'Etapas y calendario.', icono: 'calendar-clock', ruta: 'Fenologia' },
    { titulo: '🧑‍🌾 Labores Culturales', descripcion: 'Prácticas recomendadas.', icono: 'shovel', ruta: 'Labores' },
    { titulo: '🐛 Plagas y Enfermedades', descripcion: 'Control y síntomas.', icono: 'bug', ruta: 'Plagas' },
    { titulo: '🧮 Cálculo de Dosis', descripcion: 'Balanceo NPK.', icono: 'calculator-variant', ruta: 'Calculo' },
    { titulo: '📝 Bitácora de Campo', descripcion: 'Registro de actividades.', icono: 'notebook', ruta: 'Bitacora' },
    { titulo: '🔔 Programar Actividad', descripcion: 'Recordatorios y alertas.', icono: 'alarm-check', ruta: 'Recordatorios' },
];

export default function HomeScreen({ navigation, route }) {
  
  // 1. CARGA DE DATOS
  if (!cultivosData || !cultivosData.cultivos) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>❌ Error: No se cargó cultivos.json</Text>
      </View>
    );
  }

  const cultivosDisponibles = cultivosData.cultivos; 
  const listaCultivos = useMemo(() => Object.keys(cultivosDisponibles).sort(), [cultivosDisponibles]);
  
  // 2. ESTADOS
  const [busqueda, setBusqueda] = useState('');
  const [cultivoSeleccionado, setCultivoSeleccionado] = useState(null);
  const [mostrarLista, setMostrarLista] = useState(false); // Controla si se ve la lista o el menú

  // Persistencia al volver de otra pantalla
  useEffect(() => {
    if (route.params?.lastCultivo) {
      seleccionarCultivo(route.params.lastCultivo);
      navigation.setParams({ lastCultivo: undefined });
    }
  }, [route.params?.lastCultivo]);

  // 3. LÓGICA DE FILTRADO
  const cultivosFiltrados = useMemo(() => {
    if (busqueda.length === 0) return listaCultivos;
    return listaCultivos.filter(c => 
      c.toLowerCase().includes(busqueda.toLowerCase())
    );
  }, [busqueda, listaCultivos]);

  // 4. FUNCIONES
  const seleccionarCultivo = (cultivo) => {
    setCultivoSeleccionado(cultivo);
    setBusqueda(cultivo); // Pone el nombre en la barra
    setMostrarLista(false); // Oculta la lista de sugerencias
    Keyboard.dismiss(); // Cierra el teclado
  };

  const limpiarSeleccion = () => {
    setBusqueda('');
    setCultivoSeleccionado(null);
    setMostrarLista(true); // Vuelve a mostrar la lista para buscar de nuevo
  };

  const alEscribir = (texto) => {
    setBusqueda(texto);
    setMostrarLista(true);
    if (cultivoSeleccionado) setCultivoSeleccionado(null); // Resetea si el usuario borra y escribe
  };

  const navegarA = (ruta) => {
      if (!cultivoSeleccionado) {
          Alert.alert("Atención", "Primero busca y selecciona un cultivo.");
          return;
      }
      navigation.navigate(ruta, { 
        cultivo: cultivoSeleccionado, 
        lastCultivo: cultivoSeleccionado 
      }); 
  };

  // Obtener categoría para mostrar
  const categoriaCultivo = useMemo(() => {
      if (!cultivoSeleccionado) return '';
      return cultivosData.cultivos[cultivoSeleccionado]?.categoria?.toUpperCase() || 'GENERAL';
  }, [cultivoSeleccionado]);


  return (
    <View style={styles.container}>
      
      {/* --- ENCABEZADO FIJO --- */}
      <View style={styles.header}>
        <Image source={LOGO_SOURCE} style={styles.logo} resizeMode="contain" />
        <Text style={styles.headerTitle}>{APP_NAME}</Text>
      </View>

      <View style={styles.content}>

        {/* 1. WIDGET DEL CLIMA (NUEVO) */}
        <ClimaWidget />
        
        {/* --- BARRA DE BÚSQUEDA UNIFICADA --- */}
        <View style={styles.searchSection}>
            <Text style={styles.label}>¿Qué cultivo vas a elegir hoy?</Text>
            <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={24} color="#666" style={{marginLeft: 10}} />
                <TextInput
                    style={styles.input}
                    placeholder="Escribe para buscar (ej. Maíz)"
                    value={busqueda}
                    onChangeText={alEscribir}
                    onFocus={() => setMostrarLista(true)}
                />
                {busqueda.length > 0 && (
                    <TouchableOpacity onPress={limpiarSeleccion} style={{padding: 10}}>
                        <MaterialCommunityIcons name="close-circle" size={20} color="#999" />
                    </TouchableOpacity>
                )}
            </View>
        </View>

        {/* --- CUERPO DINÁMICO --- */}
        
        {/* CASO A: MOSTRAR LISTA DE RESULTADOS (Buscando) */}
        {mostrarLista ? (
            <FlatList
                data={cultivosFiltrados}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                style={styles.listContainer}
                renderItem={({ item }) => (
                    <TouchableOpacity 
                        style={styles.listItem} 
                        onPress={() => seleccionarCultivo(item)}
                    >
                        <Text style={styles.listItemText}>{item}</Text>
                        <MaterialCommunityIcons name="arrow-top-left" size={20} color="#ccc" />
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <Text style={styles.emptyText}>No se encontró "{busqueda}"</Text>
                }
            />
        ) : (
            
        /* CASO B: CULTIVO SELECCIONADO (Mostrar Menú) */
            cultivoSeleccionado && (
                <View style={{flex: 1}}>
                    <View style={styles.infoBar}>
                        <Text style={styles.infoText}>🌱 Cultivo: <Text style={{fontWeight:'bold'}}>{cultivoSeleccionado}</Text></Text>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{categoriaCultivo}</Text>
                        </View>
                    </View>

                    <FlatList
                        data={menus}
                        keyExtractor={(item) => item.titulo}
                        numColumns={2} // Muestra en rejilla de 2 columnas
                        columnWrapperStyle={{justifyContent: 'space-between'}}
                        contentContainerStyle={{paddingTop: 10, paddingBottom: 20}}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.menuCard}
                                onPress={() => navegarA(item.ruta)}
                            >
                                <View style={[styles.iconCircle, {backgroundColor: '#E8F5E9'}]}>
                                    <MaterialCommunityIcons name={item.icono} size={32} color="#2E7D32" />
                                </View>
                                <Text style={styles.menuTitle}>{item.titulo}</Text>
                                <Text style={styles.menuDesc}>{item.descripcion}</Text>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )
        )}

        {/* MENSAJE INICIAL (Si no busca ni selecciona) */}
        {!mostrarLista && !cultivoSeleccionado && (
             <View style={styles.welcomeContainer}>
                 <MaterialCommunityIcons name="sprout" size={60} color="#ddd" />
                 <Text style={styles.welcomeText}>Selecciona la lupa para buscar un cultivo</Text>
             </View>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  
  // --- ENCABEZADO PERSONALIZADO (VERDE) ---
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    // Padding extra arriba para que no se encime con la hora/batería del celular
    paddingTop: 50, 
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#4CAF50', // 👈 FONDO VERDE
    elevation: 4, // Sombra en Android
    shadowColor: '#000', 
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 }
  },
  logo: { 
    width: 30, // 👈 AJUSTADO AL TAMAÑO DEL TEXTO
    height: 30, 
    marginRight: 10,
    // Si tu logo es negro y quieres que se vea mejor, podrías necesitar un borde o un logo blanco
    // tintColor: 'white' // Descomenta esto si tu imagen es un icono transparente y quieres pintarlo blanco
  },
  headerTitle: { 
    fontSize: 22, // Tamaño similar a la imagen
    fontWeight: 'bold', 
    color: '#fff' // 👈 LETRA BLANCA
  },

  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },

  // ... (El resto de estilos de búsqueda y lista se quedan igual)
  searchSection: { marginBottom: 10 },
  label: { fontSize: 16, fontWeight: '600', color: '#444', marginBottom: 10, marginLeft: 5 },
  searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#fff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#ddd',
      height: 50,
      elevation: 3,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowOffset: { width: 0, height: 2 }
  },
  input: { flex: 1, height: '100%', paddingHorizontal: 10, fontSize: 16, color: '#333' },
  listContainer: { flex: 1, marginTop: 5 },
  listItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 15,
      backgroundColor: '#fff',
      borderBottomWidth: 1,
      borderBottomColor: '#f0f0f0',
      borderRadius: 8,
      marginBottom: 5
  },
  listItemText: { fontSize: 16, color: '#333' },
  emptyText: { textAlign: 'center', marginTop: 20, color: '#999', fontStyle: 'italic' },
  infoBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 15,
      padding: 10,
      backgroundColor: '#E3F2FD',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#BBDEFB'
  },
  infoText: { fontSize: 16, color: '#0D47A1' },
  badge: { backgroundColor: '#1976D2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  menuCard: {
      width: '48%',
      backgroundColor: '#fff',
      borderRadius: 15,
      padding: 15,
      marginBottom: 15,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#eee',
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 2 }
  },
  iconCircle: {
      width: 50, height: 50,
      borderRadius: 25,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 10
  },
  menuTitle: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', color: '#333', marginBottom: 4 },
  menuDesc: { fontSize: 11, textAlign: 'center', color: '#777' },
  welcomeContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.7 },
  welcomeText: { marginTop: 10, fontSize: 16, color: '#999' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: 'red', fontSize: 16 }
});