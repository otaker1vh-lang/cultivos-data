import ClimaWidget from '../components/ClimaWidget';
import React, { useState, useMemo, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Image, FlatList, Keyboard, StatusBar, ScrollView } from "react-native";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import cultivosData from "../data/cultivos.json"; 

const LOGO_SOURCE = require('../assets/logo_roslin.png'); 
const APP_NAME = "RoślinApp";

const colors = {
  background: '#FDFBF7', primaryGreen: '#4A7C59', secondaryBrown: '#8C6239', accentLight: '#E9F2EB',
  textDark: '#2C3E50', textLight: '#FFFFFF', textGray: '#7f8c8d', border: '#E0E0E0',
  cardBg: '#FFFFFF', alertRed: '#D32F2F', alertGreen: '#2E7D32', infoBg: '#FFF8E1',
};

// 1. MENÚS DEL CULTIVO (Solo aparecen si eliges algo)
const menusCultivo = [
    { titulo: '📊 Estadísticas', descripcion: 'Rendimiento/precios.', icono: 'chart-bar', ruta: 'Estadisticas' },
    { titulo: '📅 Ciclo Fenológico', descripcion: 'Etapas del cultivo.', icono: 'calendar-clock', ruta: 'Fenologia' },
    { titulo: '🧑‍🌾 Labores', descripcion: 'Prácticas de campo.', icono: 'shovel', ruta: 'Labores' },
    { titulo: '🐛 Plagas', descripcion: 'Control y síntomas.', icono: 'bug', ruta: 'Plagas' },
    { titulo: '🧮 Dosis', descripcion: 'Balanceo NPK.', icono: 'calculator-variant', ruta: 'Calculo' },
    { titulo: '📝 Bitácora', descripcion: 'Registro diario.', icono: 'notebook', ruta: 'Bitacora' },
    { titulo: '🔔 Agenda', descripcion: 'Recordatorios.', icono: 'alarm-check', ruta: 'Recordatorios' },
];

// 2. MENÚS GLOBALES (Siempre visibles)
const menusGlobales = [
    { titulo: '📰 Noticias', descripcion: 'Actualidad.', icono: 'newspaper', ruta: 'Noticias' },
    { titulo: '🚜 AgroControl', descripcion: 'Monitoreo IoT.', icono: 'remote', ruta: 'AgroControl' },
    { titulo: 'ℹ️ Acerca de', descripcion: 'Información.', icono: 'information', ruta: 'About' },
];

export default function HomeScreen({ navigation, route }) {
  if (!cultivosData || !cultivosData.cultivos) return (<View style={styles.center}><Text>Error cargando datos</Text></View>);

  const cultivosDisponibles = cultivosData.cultivos; 
  const listaCultivos = useMemo(() => Object.keys(cultivosDisponibles).sort(), [cultivosDisponibles]);
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
    return listaCultivos.filter(c => c.toLowerCase().includes(busqueda.toLowerCase()));
  }, [busqueda, listaCultivos]);

  const seleccionarCultivo = (cultivo) => {
    setCultivoSeleccionado(cultivo); setBusqueda(cultivo); setMostrarLista(false); Keyboard.dismiss(); 
  };
  const limpiarSeleccion = () => { setBusqueda(''); setCultivoSeleccionado(null); setMostrarLista(true); };
  const alEscribir = (texto) => { setBusqueda(texto); setMostrarLista(true); if (cultivoSeleccionado) setCultivoSeleccionado(null); };

  const navegarA = (ruta) => {
      // Si es global, pasa directo
      if (['About', 'Noticias', 'AgroControl'].includes(ruta)) {
          navigation.navigate(ruta); return;
      }
      // Si es de cultivo, valida
      if (!cultivoSeleccionado) { Alert.alert("Atención", "Selecciona un cultivo primero."); return; }
      navigation.navigate(ruta, { cultivo: cultivoSeleccionado }); 
  };

  const manejarCondicionesClimaticas = (esAdecuado) => {
      if (esAdecuado) setAlertaAplicacion({ tipo: 'bueno', texto: 'Condiciones ideales', icono: 'check-circle', color: colors.alertGreen, bg: '#E8F5E9' });
      else setAlertaAplicacion({ tipo: 'malo', texto: 'No realizar aplicaciones', icono: 'alert-octagon', color: colors.alertRed, bg: '#FFEBEE' });
  };

  // Renderizado de tarjeta de menú
  const renderCard = (item) => (
    <TouchableOpacity key={item.titulo} style={styles.menuCard} onPress={() => navegarA(item.ruta)}>
        <View style={[styles.iconCircle, {backgroundColor: colors.accentLight}]}>
            <MaterialCommunityIcons name={item.icono} size={28} color={colors.primaryGreen} />
        </View>
        <Text style={styles.menuTitle}>{item.titulo}</Text>
        <Text style={styles.menuDesc}>{item.descripcion}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={colors.primaryGreen} barStyle="light-content" />
      <View style={styles.header}>
        <Image source={LOGO_SOURCE} style={styles.logo} resizeMode="contain" />
        <Text style={styles.headerTitle}>{APP_NAME}</Text>
      </View>
      
      <View style={styles.content}>
        <ClimaWidget onEvaluarCondiciones={manejarCondicionesClimaticas} />
        
        {alertaAplicacion && (
            <View style={[styles.alertaContainer, { backgroundColor: alertaAplicacion.bg, borderColor: alertaAplicacion.color }]}>
                <MaterialCommunityIcons name={alertaAplicacion.icono} size={24} color={alertaAplicacion.color} />
                <Text style={[styles.alertaTexto, { color: alertaAplicacion.color }]}>{alertaAplicacion.texto}</Text>
            </View>
        )}

        {/* --- BUSCADOR --- */}
        <View style={styles.searchSection}>
            <Text style={styles.label}>
                {cultivoSeleccionado ? "Cultivo seleccionado:" : "¿Qué cultivo vas a trabajar?"}
            </Text>
            <View style={[styles.searchBar, cultivoSeleccionado && {borderColor: colors.primaryGreen, borderWidth: 2}]}>
                <MaterialCommunityIcons name={cultivoSeleccionado ? "sprout" : "magnify"} size={24} color={colors.secondaryBrown} style={{marginLeft: 15}} />
                <TextInput 
                    style={[styles.input, cultivoSeleccionado && {fontWeight:'bold', color: colors.primaryGreen}]} 
                    placeholder="Buscar cultivo (ej. Maíz)" 
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

        {/* --- LÓGICA DE VISUALIZACIÓN --- */}
        {mostrarLista ? (
            // 1. LISTA DESPLEGABLE (Cuando buscas)
            <FlatList data={cultivosFiltrados} keyExtractor={(item) => item} keyboardShouldPersistTaps="handled" style={styles.listContainer} renderItem={({ item }) => (
                    <TouchableOpacity style={styles.listItem} onPress={() => seleccionarCultivo(item)}>
                        <Text style={styles.listItemText}>{item}</Text>
                        <MaterialCommunityIcons name="arrow-top-left" size={20} color={colors.secondaryBrown} />
                    </TouchableOpacity>
                )} ListEmptyComponent={<Text style={styles.emptyText}>No encontrado</Text>} />
        ) : (
            // 2. GRILLA DE MENÚS (Normal)
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 20}}>
                
                {/* A. SECCIÓN CULTIVO (Solo si hay selección) */}
                {cultivoSeleccionado && (
                    <View>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Herramientas para {cultivoSeleccionado}</Text>
                            <View style={{height:1, backgroundColor: colors.border, flex:1, marginLeft: 10}}/>
                        </View>
                        <View style={styles.grid}>
                            {menusCultivo.map(renderCard)}
                        </View>
                    </View>
                )}

                {/* B. SECCIÓN GLOBAL (Siempre visible) */}
                <View style={{marginTop: 10}}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Aplicaciones Generales</Text>
                        <View style={{height:1, backgroundColor: colors.border, flex:1, marginLeft: 10}}/>
                    </View>
                    <View style={styles.grid}>
                        {menusGlobales.map(renderCard)}
                    </View>
                </View>

            </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20, backgroundColor: colors.primaryGreen, borderBottomRightRadius: 25, borderBottomLeftRadius: 25, elevation: 6 },
  logo: { width: 35, height: 35, marginRight: 12 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: colors.textLight },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 15 },
  alertaContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 20, borderWidth: 1 },
  alertaTexto: { marginLeft: 10, fontWeight: 'bold', fontSize: 14, flex: 1 },
  searchSection: { marginBottom: 10 },
  label: { fontSize: 16, fontWeight: '700', color: colors.secondaryBrown, marginBottom: 10, marginLeft: 5 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 25, borderWidth: 1, borderColor: colors.border, height: 50, elevation: 2 },
  input: { flex: 1, height: '100%', paddingHorizontal: 15, fontSize: 16, color: colors.textDark },
  listContainer: { flex: 1, marginTop: 5 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', borderRadius: 12, marginBottom: 8 },
  listItemText: { fontSize: 16, color: colors.textDark },
  emptyText: { textAlign: 'center', marginTop: 20, color: '#999' },
  
  // Estilos de Grilla y Secciones
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 10 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: colors.textGray, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  menuCard: { width: '48%', backgroundColor: colors.cardBg, borderRadius: 16, padding: 12, marginBottom: 12, alignItems: 'center', elevation: 2, borderWidth: 1, borderColor: '#f0f0f0' },
  iconCircle: { width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  menuTitle: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', color: colors.textDark, marginBottom: 2 },
  menuDesc: { fontSize: 11, textAlign: 'center', color: colors.textGray },
});