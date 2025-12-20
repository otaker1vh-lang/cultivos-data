import React, { useState, useEffect } from "react";
import { 
  View, Text, StyleSheet, FlatList, TextInput, 
  TouchableOpacity, StatusBar 
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient'; // Asegúrate de tener instalado expo-linear-gradient
import datosBasicos from "../data/cultivos_basico.json";

// Importación de componentes locales
import ClimaWidget from '../components/ClimaWidget'; 

export default function HomeScreen({ navigation }) {
  const [busqueda, setBusqueda] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("Todos");
  const [cultivosFiltrados, setCultivosFiltrados] = useState([]);
  const [mostrarLista, setMostrarLista] = useState(false);

  const listaCultivos = datosBasicos?.cultivos 
    ? Object.keys(datosBasicos.cultivos).map(nombre => ({
        nombre,
        ...datosBasicos.cultivos[nombre]
      }))
    : [];

  useEffect(() => {
    const filtrarCultivos = () => {
      if (busqueda.trim() === "") {
        setCultivosFiltrados([]);
        setMostrarLista(false);
        return;
      }

      const query = busqueda.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let filtrados = listaCultivos.filter(item => {
        const nombreNorm = item.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return nombreNorm.includes(query);
      });

      if (categoriaSeleccionada !== "Todos") {
        filtrados = filtrados.filter(item => item.categoria === categoriaSeleccionada);
      }
      
      setCultivosFiltrados(filtrados);
      setMostrarLista(true);
    };
    filtrarCultivos();
  }, [busqueda, categoriaSeleccionada]);

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.cultivoCard}
      onPress={() => navigation.navigate("MenuDetalle", { cultivo: item.nombre })}
    >
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons name="sprout" size={26} color="#2E7D32" />
      </View>
      <View style={styles.infoContainer}>
        <Text style={styles.cultivoNombre}>{item.nombre}</Text>
        <Text style={styles.cultivoCategoria}>{item.categoria}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#ccc" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <FlatList
        data={mostrarLista ? cultivosFiltrados : []}
        keyExtractor={(item) => item.nombre}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.topHeader}>
              <View>
                <Text style={styles.saludo}>Bienvenido,</Text>
                <Text style={styles.titulo}>Portal Agro 2025</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('About')}>
                <Ionicons name="information-circle-outline" size={28} color="#2E7D32" />
              </TouchableOpacity>
            </View>

            <ClimaWidget />

            {/* BOTÓN IDENTIFICADOR DE PLAGAS IA */}
            <TouchableOpacity 
              style={styles.iaCard}
              onPress={() => navigation.navigate('Plagas', { modoIA: true })} 
            >
              <LinearGradient colors={['#4A7C59', '#2E7D32']} style={styles.iaGradient}>
                <MaterialCommunityIcons name="camera-iris" size={38} color="#fff" />
                <View style={{ marginLeft: 15 }}>
                  <Text style={styles.iaTitle}>Identificar Plaga</Text>
                  <Text style={styles.iaSub}>Escanea tu cultivo con inteligencia artificial</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.menuRapido}>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AgroControl')}>
                <View style={[styles.menuIcon, {backgroundColor: '#E8F5E9'}]}>
                  <MaterialCommunityIcons name="tune-variant" size={24} color="#2E7D32" />
                </View>
                <Text style={styles.menuText}>Control</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Noticias')}>
                <View style={[styles.menuIcon, {backgroundColor: '#E3F2FD'}]}>
                  <MaterialCommunityIcons name="newspaper-variant-outline" size={24} color="#1976D2" />
                </View>
                <Text style={styles.menuText}>Noticias</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Bitacora')}>
                <View style={[styles.menuIcon, {backgroundColor: '#FFF3E0'}]}>
                  <MaterialCommunityIcons name="notebook-outline" size={24} color="#F57C00" />
                </View>
                <Text style={styles.menuText}>Bitácora</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchSection}>
              <Ionicons name="search" size={20} color="#666" style={{marginRight: 10}} />
              <TextInput
                style={styles.input}
                placeholder="Escribe para buscar cultivo..."
                value={busqueda}
                onChangeText={setBusqueda}
                placeholderTextColor="#999"
              />
            </View>

            {mostrarLista && (
              <View style={styles.categoriasContainer}>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={["Todos", ...(datosBasicos?.categorias || [])]}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      style={[styles.categoriaBtn, categoriaSeleccionada === item && styles.categoriaBtnActivo]}
                      onPress={() => setCategoriaSeleccionada(item)}
                    >
                      <Text style={[styles.categoriaText, categoriaSeleccionada === item && styles.categoriaTextActivo]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  )}
                  keyExtractor={(item) => item}
                />
              </View>
            )}
          </View>
        }
        contentContainerStyle={styles.listaContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDFBF7" },
  headerContent: { paddingBottom: 10 },
  topHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  saludo: { fontSize: 16, color: "#666" },
  titulo: { fontSize: 24, fontWeight: "bold", color: "#1B5E20" },
  
  iaCard: { marginHorizontal: 20, marginVertical: 10, borderRadius: 15, overflow: 'hidden', elevation: 3 },
  iaGradient: { flexDirection: 'row', alignItems: 'center', padding: 18 },
  iaTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  iaSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },

  menuRapido: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 15, paddingHorizontal: 10 },
  menuItem: { alignItems: 'center' },
  menuIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  menuText: { fontSize: 12, fontWeight: '600', color: '#444' },

  searchSection: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 15, borderWidth: 1, borderColor: "#E0E0E0", marginBottom: 15, height: 50 },
  input: { flex: 1, fontSize: 16, color: "#333" },

  categoriasContainer: { marginBottom: 10, paddingLeft: 20 },
  categoriaBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff", marginRight: 10, borderWidth: 1, borderColor: "#E0E0E0" },
  categoriaBtnActivo: { backgroundColor: "#2E7D32", borderColor: "#2E7D32" },
  categoriaText: { color: "#666", fontWeight: "600" },
  categoriaTextActivo: { color: "#fff" },

  listaContent: { paddingBottom: 20 },
  cultivoCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 15, borderRadius: 16, marginBottom: 10, marginHorizontal: 20, elevation: 1, borderWidth: 1, borderColor: '#f0f0f0' },
  iconContainer: { width: 45, height: 45, borderRadius: 12, backgroundColor: "#E8F5E9", justifyContent: "center", alignItems: "center", marginRight: 15 },
  infoContainer: { flex: 1 },
  cultivoNombre: { fontSize: 17, fontWeight: "bold", color: "#333" },
  cultivoCategoria: { fontSize: 13, color: "#888" }
});