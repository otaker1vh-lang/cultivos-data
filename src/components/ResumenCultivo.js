import React, { useEffect, useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, 
  ActivityIndicator, TextInput, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // Asegúrate de tener expo-icons o vector-icons
import { supabase } from '../services/supabaseClient';

// Lista estática de Estados para el filtro (igual que en el SIAP)
const ESTADOS = [
  "Todos", "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", 
  "Coahuila", "Colima", "Chiapas", "Chihuahua", "Ciudad de México", 
  "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", 
  "México", "Michoacán", "Morelos", "Nayarit", "Nuevo León", 
  "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", 
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", 
  "Veracruz", "Yucatán", "Zacatecas"
];

export default function ResumenCultivo({ cultivoInicial = "" }) {
  // --- ESTADOS ---
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);
  
  // Filtros
  const [filtroCultivo, setFiltroCultivo] = useState(cultivoInicial);
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  
  // Control del Modal de Estados
  const [modalVisible, setModalVisible] = useState(false);

  // Efecto: Si cambia el cultivo desde afuera (HomeScreen), actualizamos
  useEffect(() => {
    if(cultivoInicial) {
        setFiltroCultivo(cultivoInicial);
        consultarDatos(cultivoInicial, filtroEstado);
    }
  }, [cultivoInicial]);

  // --- FUNCIÓN PRINCIPAL DE CONSULTA (EL CEREBRO) ---
  const consultarDatos = async (cultivo, estado) => {
    if (!cultivo || cultivo.trim() === "") return;

    try {
      setCargando(true);
      
      // 1. Construimos la consulta base
      let query = supabase
        .from('produccion_agricola')
        .select('nomestado, nommunicipio, nomcultivo, volumenproduccion, rendimiento')
        .ilike('nomcultivo', `%${cultivo}%`) // Busca coincidencias (ej: Limón persa)
        .order('volumenproduccion', { ascending: false });

      // 2. Aplicamos filtro de estado SOLO si no es "Todos"
      if (estado && estado !== "Todos") {
        query = query.eq('nomestado', estado);
      }

      // 3. Limitamos resultados para no saturar la pantalla
      query = query.limit(20);

      const { data, error } = await query;

      if (error) throw error;
      setDatos(data || []);
      
    } catch (error) {
      console.log('Error consulta:', error.message);
      Alert.alert("Error", "No se pudo conectar con la base de datos agrícola.");
    } finally {
      setCargando(false);
    }
  };

  // Handler para el botón de búsqueda manual dentro del componente
  const handleBuscarInterno = () => {
    consultarDatos(filtroCultivo, filtroEstado);
  };

  return (
    <View style={styles.card}>
      
      {/* --- ENCABEZADO Y FILTROS (TIPO MENÚ WEB) --- */}
      <View style={styles.filtrosContainer}>
        <Text style={styles.tituloSeccion}>Filtros de Producción</Text>
        
        <View style={styles.rowFiltros}>
            {/* Input Cultivo */}
            <View style={styles.inputContainer}>
                <Text style={styles.label}>Cultivo:</Text>
                <TextInput 
                    style={styles.input}
                    value={filtroCultivo}
                    onChangeText={setFiltroCultivo}
                    placeholder="Ej. Maíz"
                />
            </View>

            {/* Selector Estado (Abre Modal) */}
            <TouchableOpacity 
                style={styles.selectorEstado} 
                onPress={() => setModalVisible(true)}
            >
                <Text style={styles.label}>Estado:</Text>
                <Text style={styles.textoEstado} numberOfLines={1}>
                    {filtroEstado} ▼
                </Text>
            </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.botonConsultar} onPress={handleBuscarInterno}>
            <Text style={styles.textoBoton}>Actualizar Tabla</Text>
        </TouchableOpacity>
      </View>

      {/* --- TABLA DE RESULTADOS --- */}
      <View style={styles.tablaContainer}>
        {cargando ? (
            <ActivityIndicator size="large" color="#2E7D32" style={{margin: 20}} />
        ) : (
            <>
                <View style={styles.headerTabla}>
                    <Text style={[styles.col, {flex: 2}]}>Municipio / Estado</Text>
                    <Text style={[styles.col, {flex: 1, textAlign: 'right'}]}>Ton</Text>
                </View>
                
                {datos.length === 0 ? (
                    <Text style={styles.sinDatos}>
                        {filtroCultivo ? "No hay resultados con estos filtros." : "Selecciona un cultivo para comenzar."}
                    </Text>
                ) : (
                    // Usamos .map para evitar el error de VirtualizedList anidada
                    datos.map((item, index) => (
                        <View key={index} style={styles.fila}>
                            <View style={{flex: 2}}>
                                <Text style={styles.textoMunicipio}>{item.nommunicipio}</Text>
                                <Text style={styles.textoSubEstado}>{item.nomestado} • {item.nomcultivo}</Text>
                            </View>
                            <Text style={styles.textoVolumen}>
                                {item.volumenproduccion ? item.volumenproduccion.toLocaleString() : "0"}
                            </Text>
                        </View>
                    ))
                )}
            </>
        )}
      </View>

      {/* --- MODAL PARA SELECCIONAR ESTADO --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.tituloModal}>Selecciona un Estado</Text>
                <ScrollView style={{maxHeight: 300}}>
                    {ESTADOS.map((edo) => (
                        <TouchableOpacity 
                            key={edo} 
                            style={styles.opcionModal}
                            onPress={() => {
                                setFiltroEstado(edo);
                                setModalVisible(false);
                            }}
                        >
                            <Text style={[
                                styles.textoOpcion, 
                                filtroEstado === edo && styles.opcionActiva
                            ]}>
                                {edo}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <TouchableOpacity 
                    style={styles.botonCerrarModal} 
                    onPress={() => setModalVisible(false)}
                >
                    <Text style={{color: 'white', fontWeight: 'bold'}}>Cancelar</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 20 },
  
  // Estilos Filtros
  filtrosContainer: { marginBottom: 15, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 15 },
  tituloSeccion: { fontSize: 16, fontWeight: 'bold', color: '#2E7D32', marginBottom: 10 },
  rowFiltros: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  inputContainer: { flex: 1, marginRight: 10 },
  label: { fontSize: 12, color: '#666', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, height: 40, color: '#333' },
  selectorEstado: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, height: 40, justifyContent: 'center' },
  textoEstado: { color: '#333', fontWeight: '600' },
  
  botonConsultar: { backgroundColor: '#F9A825', borderRadius: 8, padding: 10, alignItems: 'center' },
  textoBoton: { color: '#fff', fontWeight: 'bold' },

  // Estilos Tabla
  tablaContainer: { minHeight: 100 },
  headerTabla: { flexDirection: 'row', borderBottomWidth: 2, borderColor: '#2E7D32', paddingBottom: 5, marginBottom: 5 },
  col: { fontWeight: 'bold', color: '#2E7D32', fontSize: 14 },
  
  fila: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f0f0f0', alignItems: 'center' },
  textoMunicipio: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  textoSubEstado: { fontSize: 12, color: '#777' },
  textoVolumen: { flex: 1, textAlign: 'right', fontWeight: 'bold', color: '#333', fontSize: 15 },
  sinDatos: { textAlign: 'center', color: '#999', marginTop: 20, fontStyle: 'italic' },

  // Estilos Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5 },
  tituloModal: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  opcionModal: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' },
  textoOpcion: { fontSize: 16, color: '#333' },
  opcionActiva: { color: '#2E7D32', fontWeight: 'bold' },
  botonCerrarModal: { marginTop: 15, backgroundColor: '#d32f2f', padding: 10, borderRadius: 8, alignItems: 'center' }
});