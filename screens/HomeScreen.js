import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import ClimaWidget from '../components/ClimaWidget'; 
import datosBasicos from "../data/cultivos_basico.json";

export default function HomeScreen({ navigation }) {
  const [busqueda, setBusqueda] = useState("");
  const [mostrarLista, setMostrarLista] = useState(false); // Nuevo estado para ocultar/mostrar
  const [cultivosFiltrados, setCultivosFiltrados] = useState([]);

  const listaCultivos = datosBasicos?.cultivos 
    ? Object.keys(datosBasicos.cultivos).map(nombre => ({ nombre, ...datosBasicos.cultivos[nombre] }))
    : [];

  useEffect(() => {
    if (busqueda.trim() === "") {
      setCultivosFiltrados([]);
      setMostrarLista(false);
    } else {
      const query = busqueda.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const filtrados = listaCultivos.filter(item => 
        item.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(query)
      );
      setCultivosFiltrados(filtrados);
      setMostrarLista(true);
    }
  }, [busqueda]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <FlatList
        data={mostrarLista ? cultivosFiltrados : []}
        keyExtractor={(item) => item.nombre}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.cultivoCard}
            onPress={() => navigation.navigate("MenuDetalle", { cultivo: item.nombre })}
          >
            <MaterialCommunityIcons name="sprout" size={24} color="#2E7D32" />
            <Text style={styles.cultivoNombre}>{item.nombre}</Text>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </TouchableOpacity>
        )}
        ListHeaderComponent={
          <View style={{ paddingBottom: 20 }}>
            <ClimaWidget />

            {/* BOTÓN IDENTIFICAR PLAGAS (Cámara IA) */}
            <TouchableOpacity 
              style={styles.iaCard}
              onPress={() => navigation.navigate('IdentificadorIA')} 
            >
              <LinearGradient colors={['#4A7C59', '#2E7D32']} style={styles.iaGradient}>
                <MaterialCommunityIcons name="camera-iris" size={40} color="#fff" />
                <View style={{ marginLeft: 15 }}>
                  <Text style={styles.iaTitle}>Identificar Plaga</Text>
                  <Text style={styles.iaSub}>Usa la IA para diagnosticar tu cultivo</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* MENÚ DE SECCIONES */}
            <View style={styles.menuGrid}>
              <MenuBtn nav={navigation} ruta="AgroControl" icon="tune-variant" label="Control" col="#E8F5E9" />
              <MenuBtn nav={navigation} ruta="Noticias" icon="newspaper" label="Noticias" col="#E3F2FD" />
              <MenuBtn nav={navigation} ruta="About" icon="information" label="Acerca" col="#F5F5F5" />
            </View>

            {/* BARRA DE BÚSQUEDA - Activa la lista */}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="Escribe el cultivo a buscar..."
                value={busqueda}
                onChangeText={setBusqueda}
                onFocus={() => setMostrarLista(busqueda.length > 0)}
              />
              {busqueda.length > 0 && (
                <TouchableOpacity onPress={() => setBusqueda("")}>
                  <Ionicons name="close-circle" size={20} color="#ccc" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        contentContainerStyle={styles.listaContent}
      />
    </SafeAreaView>
  );
}

// Componente pequeño para los botones del menú
const MenuBtn = ({ nav, ruta, icon, label, col }) => (
  <TouchableOpacity style={styles.menuItem} onPress={() => nav.navigate(ruta)}>
    <View style={[styles.menuIcon, { backgroundColor: col }]}>
      <MaterialCommunityIcons name={icon} size={26} color="#444" />
    </View>
    <Text style={styles.menuText}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDFBF7" },
  iaCard: { marginHorizontal: 20, marginVertical: 15, borderRadius: 15, overflow: 'hidden', elevation: 4 },
  iaGradient: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  iaTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  iaSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  menuGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  menuItem: { alignItems: 'center' },
  menuIcon: { width: 55, height: 55, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  menuText: { fontSize: 12, fontWeight: '600', color: '#555' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 20, paddingHorizontal: 15, borderRadius: 12, height: 55, borderWidth: 1, borderColor: '#E0E0E0' },
  input: { flex: 1, marginLeft: 10, fontSize: 16 },
  listaContent: { paddingBottom: 30 },
  cultivoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 20, padding: 15, borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: '#F0F0F0' },
  cultivoNombre: { flex: 1, marginLeft: 15, fontSize: 16, fontWeight: '600', color: '#333' }
});