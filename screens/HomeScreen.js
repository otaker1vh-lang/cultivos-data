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
  Keyboard,
  StatusBar
} from "react-native";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import cultivosData from "../data/cultivos.json"; 

const LOGO_SOURCE = require('../assets/logo_roslin.png'); 
const APP_NAME = "RoślinApp";

// --- NUEVA PALETA DE COLORES (Identidad Visual) ---
const colors = {
  background: '#FDFBF7',    // Crema suave (Papel)
  primaryGreen: '#4A7C59',  // Verde hoja oscuro (Logo)
  secondaryBrown: '#8C6239', // Marrón tierra (Logo)
  accentLight: '#E9F2EB',   // Verde muy claro (Fondos de iconos)
  textDark: '#2C3E50',      // Texto principal
  textLight: '#FFFFFF',     // Texto sobre fondos oscuros
  textGray: '#7f8c8d',      // Textos secundarios
  border: '#E0E0E0',        // Bordes sutiles
  cardBg: '#FFFFFF',        // Fondo de tarjetas
  alertRed: '#D32F2F',      // Alertas negativas
  alertGreen: '#2E7D32',    // Alertas positivas
  infoBg: '#FFF8E1',        // Fondo barra info (amarillo pálido)
};

// MENÚS
const menus = [
    { titulo: '📊 Estadísticas', descripcion: 'Rendimiento y precios.', icono: 'chart-bar', ruta: 'Estadisticas' },
    { titulo: '📅 Ciclo Fenológico', descripcion: 'Etapas y calendario.', icono: 'calendar-clock', ruta: 'Fenologia' },
    { titulo: '🧑‍🌾 Labores Culturales', descripcion: 'Prácticas recomendadas.', icono: 'shovel', ruta: 'Labores' },
    { titulo: '🐛 Plagas y Enfermedades', descripcion: 'Control y síntomas.', icono: 'bug', ruta: 'Plagas' },
    { titulo: '🧮 Cálculo de Dosis', descripcion: 'Balanceo NPK.', icono: 'calculator-variant', ruta: 'Calculo' },
    { titulo: '📝 Bitácora de Campo', descripcion: 'Registro de actividades.', icono: 'notebook', ruta: 'Bitacora' },
    { titulo: '🔔 Programar Actividad', descripcion: 'Recordatorios y alertas.', icono: 'alarm-check', ruta: 'Recordatorios' },
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
              color: colors.alertGreen,
              bg: '#E8F5E9'
          });
      } else {
          setAlertaAplicacion({
              tipo: 'malo',
              texto: 'Se recomienda no realizar aplicaciones',
              icono: 'alert-octagon',
              color: colors.alertRed,
              bg: '#FFEBEE'
          });
      }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={colors.primaryGreen} barStyle="light-content" />
      
      {/* HEADER ACTUALIZADO */}
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
                <MaterialCommunityIcons name="magnify" size={24} color={colors.secondaryBrown} style={{marginLeft: 15}} />
                <TextInput
                    style={styles.input}
                    placeholder="Escribe para buscar (ej. Maíz)"
                    placeholderTextColor="#999"
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
                        <MaterialCommunityIcons name="arrow-top-left" size={20} color={colors.secondaryBrown} />
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <Text style={styles.emptyText}>No se encontró "{busqueda}"</Text>
                }
            />
        ) : (
            cultivoSeleccionado && (
                <View style={{flex: 1}}>
                    {/* INFO BAR ACTUALIZADA */}
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
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.menuCard}
                                onPress={() => navegarA(item.ruta)}
                            >
                                <View style={[styles.iconCircle, {backgroundColor: colors.accentLight}]}>
                                    <MaterialCommunityIcons name={item.icono} size={32} color={colors.primaryGreen} />
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
                 <MaterialCommunityIcons name="sprout" size={80} color={colors.secondaryBrown} style={{opacity: 0.3}} />
                 <Text style={styles.welcomeText}>Selecciona la lupa para buscar un cultivo</Text>
             </View>
        )}

      </View>
    </View>
  );
}

// --- NUEVOS ESTILOS (Look & Feel Orgánico) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50, 
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: colors.primaryGreen,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
    elevation: 6,
    shadowColor: '#2a402e', 
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
  },
  
  logo: { width: 35, height: 35, marginRight: 12 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: colors.textLight, letterSpacing: 0.5 },
  
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 15 },
  
  alertaContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 20, borderWidth: 1 },
  alertaTexto: { marginLeft: 10, fontWeight: 'bold', fontSize: 14, flex: 1 },
  
  searchSection: { marginBottom: 15 },
  label: { fontSize: 16, fontWeight: '700', color: colors.secondaryBrown, marginBottom: 10, marginLeft: 5 },
  
  searchBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    borderRadius: 25, 
    borderWidth: 1, 
    borderColor: colors.border, 
    height: 50, 
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 }
  },
  input: { flex: 1, height: '100%', paddingHorizontal: 15, fontSize: 16, color: colors.textDark },
  
  listContainer: { flex: 1, marginTop: 5 },
  listItem: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    padding: 16, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#f0f0f0', 
    borderRadius: 12, 
    marginBottom: 8 
  },
  listItemText: { fontSize: 16, color: colors.textDark },
  emptyText: { textAlign: 'center', marginTop: 20, color: '#999', fontStyle: 'italic' },
  
  infoBar: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 20, 
    padding: 15, 
    backgroundColor: colors.infoBg, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: colors.secondaryBrown,
    borderLeftWidth: 5, 
  },
  infoText: { fontSize: 16, color: colors.secondaryBrown, fontWeight: '600' },
  
  badge: { backgroundColor: colors.primaryGreen, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  
  menuCard: { 
    width: '48%', 
    backgroundColor: colors.cardBg, 
    borderRadius: 20, 
    padding: 15, 
    marginBottom: 15, 
    alignItems: 'center', 
    elevation: 3, 
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6
  },
  iconCircle: { width: 55, height: 55, borderRadius: 27.5, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  menuTitle: { fontSize: 15, fontWeight: 'bold', textAlign: 'center', color: colors.textDark, marginBottom: 4 },
  menuDesc: { fontSize: 12, textAlign: 'center', color: colors.textGray },
  
  welcomeContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.8 },
  welcomeText: { marginTop: 15, fontSize: 16, color: colors.secondaryBrown, fontWeight: '500' },
  
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: 'red', fontSize: 16 }
});