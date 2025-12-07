import ClimaWidget from '../components/ClimaWidget';
import React, { useState, useMemo, useEffect } from "react";
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

const LOGO_SOURCE = require('../assets/logo_roslin.png'); 
const APP_NAME = "RoślinApp";

// MENÚS ACTUALIZADOS
const menus = [
    { titulo: '📊 Estadísticas', descripcion: 'Rendimiento y precios.', icono: 'chart-bar', ruta: 'Estadisticas' },
    { titulo: '📅 Ciclo Fenológico', descripcion: 'Etapas y calendario.', icono: 'calendar-clock', ruta: 'Fenologia' },
    { titulo: '🧑‍🌾 Labores Culturales', descripcion: 'Prácticas recomendadas.', icono: 'shovel', ruta: 'Labores' },
    { titulo: '🐛 Plagas y Enfermedades', descripcion: 'Control y síntomas.', icono: 'bug', ruta: 'Plagas' },
    { titulo: '🧮 Cálculo de Dosis', descripcion: 'Balanceo NPK.', icono: 'calculator-variant', ruta: 'Calculo' },
    { titulo: '📝 Bitácora de Campo', descripcion: 'Registro de actividades.', icono: 'notebook', ruta: 'Bitacora' },
    { titulo: '🔔 Programar Actividad', descripcion: 'Recordatorios y alertas.', icono: 'alarm-check', ruta: 'Recordatorios' },
    // 👇 NUEVA OPCIÓN AGREGADA
    { titulo: 'ℹ️ Acerca de', descripcion: 'Información y créditos.', icono: 'information', ruta: 'About' },
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
  const [mostrarLista, setMostrarLista] = useState(false);
  const [alertaAplicacion, setAlertaAplicacion] = useState(null); 

  useEffect(() => {
    if (route.params?.lastCultivo) {
      seleccionarCultivo(route.params.lastCultivo);
      navigation.setParams({ lastCultivo: undefined });
    }
  }, [route.params?.lastCultivo]);

  const cultivosFiltrados = useMemo(() => {
    if (busqueda.length === 0) return listaCultivos;
    return listaCultivos.filter(c => 
      c.toLowerCase().includes(busqueda.toLowerCase())
    );
  }, [busqueda, listaCultivos]);

  const seleccionarCultivo = (cultivo) => {
    setCultivoSeleccionado(cultivo);
    setBusqueda(cultivo); 
    setMostrarLista(false); 
    Keyboard.dismiss(); 
  };

  const limpiarSeleccion = () => {
    setBusqueda('');
    setCultivoSeleccionado(null);
    setMostrarLista(true); 
  };

  const alEscribir = (texto) => {
    setBusqueda(texto);
    setMostrarLista(true);
    if (cultivoSeleccionado) setCultivoSeleccionado(null);
  };

  const navegarA = (ruta) => {
      // Permitir entrar a "About" sin seleccionar cultivo
      if (ruta === 'About') {
          navigation.navigate(ruta);
          return;
      }

      if (!cultivoSeleccionado) {
          Alert.alert("Atención", "Primero busca y selecciona un cultivo.");
          return;
      }
      navigation.navigate(ruta, { 
        cultivo: cultivoSeleccionado, 
        lastCultivo: cultivoSeleccionado 
      }); 
  };

  const categoriaCultivo = useMemo(() => {
      if (!cultivoSeleccionado) return '';
      return cultivosData.cultivos[cultivoSeleccionado]?.categoria?.toUpperCase() || 'GENERAL';
  }, [cultivoSeleccionado]);

  const manejarCondicionesClimaticas = (esAdecuado) => {
      if (esAdecuado) {
          setAlertaAplicacion({
              tipo: 'bueno',
              texto: 'Condiciones ideales para realizar aplicaciones',
              icono: 'check-circle',
              color: '#2E7D32',
              bg: '#E8F5E9'
          });
      } else {
          setAlertaAplicacion({
              tipo: 'malo',
              texto: 'Se recomienda no realizar aplicaciones',
              icono: 'alert-octagon',
              color: '#D32F2F',
              bg: '#FFEBEE'
          });
      }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image source={LOGO_SOURCE} style={styles.logo} resizeMode="contain" />
        <Text style={styles.headerTitle}>{APP_NAME}</Text>
      </View>

      <View style={styles.content}>
        {/* WIDGET CLIMA */}
        <ClimaWidget onEvaluarCondiciones={manejarCondicionesClimaticas} />
        
        {alertaAplicacion && (
            <View style={[styles.alertaContainer, { backgroundColor: alertaAplicacion.bg, borderColor: alertaAplicacion.color }]}>
                <MaterialCommunityIcons name={alertaAplicacion.icono} size={24} color={alertaAplicacion.color} />
                <Text style={[styles.alertaTexto, { color: alertaAplicacion.color }]}>
                    {alertaAplicacion.texto}
                </Text>
            </View>
        )}

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
                        numColumns={2}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50, 
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#4CAF50',
    elevation: 4,
    shadowColor: '#000', 
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 }
  },
  logo: { width: 30, height: 30, marginRight: 10 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  alertaContainer: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 15, borderWidth: 1 },
  alertaTexto: { marginLeft: 10, fontWeight: 'bold', fontSize: 14, flex: 1 },
  searchSection: { marginBottom: 10 },
  label: { fontSize: 16, fontWeight: '600', color: '#444', marginBottom: 10, marginLeft: 5 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ddd', height: 50, elevation: 3 },
  input: { flex: 1, height: '100%', paddingHorizontal: 10, fontSize: 16, color: '#333' },
  listContainer: { flex: 1, marginTop: 5 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', borderRadius: 8, marginBottom: 5 },
  listItemText: { fontSize: 16, color: '#333' },
  emptyText: { textAlign: 'center', marginTop: 20, color: '#999', fontStyle: 'italic' },
  infoBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, padding: 10, backgroundColor: '#E3F2FD', borderRadius: 8, borderWidth: 1, borderColor: '#BBDEFB' },
  infoText: { fontSize: 16, color: '#0D47A1' },
  badge: { backgroundColor: '#1976D2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  menuCard: { width: '48%', backgroundColor: '#fff', borderRadius: 15, padding: 15, marginBottom: 15, alignItems: 'center', borderWidth: 1, borderColor: '#eee', elevation: 2 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  menuTitle: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', color: '#333', marginBottom: 4 },
  menuDesc: { fontSize: 11, textAlign: 'center', color: '#777' },
  welcomeContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.7 },
  welcomeText: { marginTop: 10, fontSize: 16, color: '#999' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: 'red', fontSize: 16 }
});