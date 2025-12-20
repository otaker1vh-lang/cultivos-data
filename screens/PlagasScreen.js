import React, { useState, useEffect, useLayoutEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Modal, 
  ScrollView, Alert, FlatList, TextInput, ActivityIndicator 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; 
import CultivoDataManager from '../utils/CultivoDataManager';

export default function PlagasScreen({ route, navigation }) {
  const { cultivo } = route.params || { cultivo: 'Maíz' };
  const STORAGE_KEY = `@notas_${cultivo}`;

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);
  
  // --- ESTADOS ---
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nivel, setNivel] = useState('basico');
  const [listaFusionada, setListaFusionada] = useState([]);
  const [plagaSeleccionada, setPlagaSeleccionada] = useState(null);
  
  // Filtros y búsqueda
  const [filtroTipo, setFiltroTipo] = useState('Todos'); // 'Todos', 'Plagas', 'Enfermedades'
  const [busqueda, setBusqueda] = useState('');
  
  // Modales
  const [modalEditarVisible, setModalEditarVisible] = useState(false);

  // --- ESTADOS PARA EDICIÓN ---
  const [misSintomas, setMisSintomas] = useState('');
  const [listaTratamientos, setListaTratamientos] = useState([]); 
  const [tempProducto, setTempProducto] = useState(''); 
  const [tempDosis, setTempDosis] = useState('');
  const [fechaAplicacion, setFechaAplicacion] = useState('');
  const [nivelSeveridad, setNivelSeveridad] = useState('Baja'); // Nueva: Baja, Media, Alta

  // ---------------------------------------------------------
  // CARGAR DATOS CON CultivoDataManager
  // ---------------------------------------------------------
  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  const cargarDatos = async () => {
    setLoading(true);
    
    try {
      const basicos = await CultivoDataManager.obtenerCultivo(cultivo, 'basico');
      setCultivoData(basicos);
      setNivel('basico');
      
      await fusionarConNotas(basicos);
      setLoading(false);
      
      try {
        const completos = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
        if (completos._nivel !== 'basico') {
          setCultivoData(completos);
          setNivel('completo');
          await fusionarConNotas(completos);
        }
      } catch (err) {
        console.log('Usando datos básicos para plagas');
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
      setLoading(false);
    }
  };

  const fusionarConNotas = async (datos) => {
    try {
      const datosOficiales = datos?.plagas_y_enfermedades || [];
      const jsonNotas = await AsyncStorage.getItem(STORAGE_KEY);
      const notasUsuario = jsonNotas ? JSON.parse(jsonNotas) : {};

      const listaFinal = datosOficiales.map(item => {
        const notas = notasUsuario[item.nombre] || {};
        return {
          ...item,
          ...notas,
          mis_tratamientos: Array.isArray(notas.mis_tratamientos) ? notas.mis_tratamientos : [],
          severidad: notas.severidad || 'Sin registrar',
          ultima_aplicacion: notas.ultima_aplicacion || null
        };
      });

      setListaFusionada(listaFinal);
    } catch (error) {
      console.error("Error fusionando notas:", error);
    }
  };

  // ---------------------------------------------------------
  // FILTRADO Y BÚSQUEDA
  // ---------------------------------------------------------
  const listaFiltrada = listaFusionada.filter(item => {
    const coincideBusqueda = item.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
                            item.descripcion?.toLowerCase().includes(busqueda.toLowerCase());
    
    if (filtroTipo === 'Todos') return coincideBusqueda;
    if (filtroTipo === 'Plagas') return item.tipo === 'Plaga' && coincideBusqueda;
    if (filtroTipo === 'Enfermedades') return item.tipo === 'Enfermedad' && coincideBusqueda;
    return true;
  });

  // ---------------------------------------------------------
  // ESTADÍSTICAS
  // ---------------------------------------------------------
  const estadisticas = {
    total: listaFusionada.length,
    plagas: listaFusionada.filter(i => i.tipo === 'Plaga').length,
    enfermedades: listaFusionada.filter(i => i.tipo === 'Enfermedad').length,
    conTratamiento: listaFusionada.filter(i => i.mis_tratamientos?.length > 0).length,
    severidadAlta: listaFusionada.filter(i => i.severidad === 'Alta').length
  };

  // ---------------------------------------------------------
  // LÓGICA DE EDICIÓN
  // ---------------------------------------------------------
  
  const abrirEditor = () => {
    setMisSintomas(plagaSeleccionada.mis_sintomas || '');
    setNivelSeveridad(plagaSeleccionada.severidad || 'Baja');
    let tratamientosRecuperados = plagaSeleccionada.mis_tratamientos || [];
    
    // Migración de datos viejos
    if (tratamientosRecuperados.length === 0 && plagaSeleccionada.mi_producto) {
        tratamientosRecuperados.push({
            id: Date.now(),
            producto: plagaSeleccionada.mi_producto,
            dosis: plagaSeleccionada.mi_dosis,
            fecha: plagaSeleccionada.ultima_aplicacion || 'No especificada'
        });
    }
    setListaTratamientos(tratamientosRecuperados);
    setTempProducto('');
    setTempDosis('');
    setFechaAplicacion('');
    setModalEditarVisible(true);
  };

  const agregarProductoALista = () => {
      if (!tempProducto.trim()) {
          Alert.alert("Falta información", "Escribe el nombre del producto.");
          return;
      }
      const hoy = new Date().toLocaleDateString('es-MX');
      const nuevoItem = {
          id: Date.now(),
          producto: tempProducto,
          dosis: tempDosis || 'S/D',
          fecha: fechaAplicacion || hoy
      };
      setListaTratamientos([...listaTratamientos, nuevoItem]);
      setTempProducto('');
      setTempDosis('');
      setFechaAplicacion('');
  };

  const eliminarProductoDeLista = (id) => {
      Alert.alert(
        "Confirmar", 
        "¿Eliminar este tratamiento?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Eliminar", style: "destructive", onPress: () => {
            const filtrada = listaTratamientos.filter(item => item.id !== id);
            setListaTratamientos(filtrada);
          }}
        ]
      );
  };

  const guardarCambios = async () => {
    if (!plagaSeleccionada) return;
    try {
      const jsonNotas = await AsyncStorage.getItem(STORAGE_KEY);
      let notasGlobales = jsonNotas ? JSON.parse(jsonNotas) : {};

      const ultimaFecha = listaTratamientos.length > 0 
        ? listaTratamientos[listaTratamientos.length - 1].fecha 
        : null;

      notasGlobales[plagaSeleccionada.nombre] = {
        mis_sintomas: misSintomas,
        mis_tratamientos: listaTratamientos,
        severidad: nivelSeveridad,
        ultima_aplicacion: ultimaFecha,
        mi_producto: null, 
        mi_dosis: null
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notasGlobales));
      await fusionarConNotas(cultivoData); 
      setModalEditarVisible(false);
      
      setPlagaSeleccionada(prev => ({ 
          ...prev, 
          mis_sintomas: misSintomas, 
          mis_tratamientos: listaTratamientos,
          severidad: nivelSeveridad,
          ultima_aplicacion: ultimaFecha
      }));
      Alert.alert("✓ Guardado", "Información actualizada correctamente.");
    } catch (error) {
      Alert.alert("Error", "No se pudo guardar la información.");
    }
  };

  // ---------------------------------------------------------
  // EXPORTAR HISTORIAL
  // ---------------------------------------------------------
  const exportarHistorial = () => {
    if (plagaSeleccionada?.mis_tratamientos?.length === 0) {
      Alert.alert("Sin datos", "No hay tratamientos registrados para exportar.");
      return;
    }
    
    let texto = `HISTORIAL DE TRATAMIENTOS\n`;
    texto += `Plaga/Enfermedad: ${plagaSeleccionada.nombre}\n`;
    texto += `Cultivo: ${cultivo}\n\n`;
    
    plagaSeleccionada.mis_tratamientos.forEach((t, i) => {
      texto += `${i+1}. ${t.producto}\n`;
      texto += `   Dosis: ${t.dosis}\n`;
      texto += `   Fecha: ${t.fecha}\n\n`;
    });
    
    Alert.alert("Historial", texto, [
      { text: "Cerrar" },
      { text: "Copiar", onPress: () => Alert.alert("Copiado", "Historial en portapapeles") }
    ]);
  };

  // ---------------------------------------------------------
  // LOADING STATE
  // ---------------------------------------------------------
  if (loading && !cultivoData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{padding:5}}>
            <Ionicons name="arrow-back" size={24} color="#2E7D32" />
          </TouchableOpacity>
          <View style={{flex:1, marginLeft: 10}}>
            <Text style={styles.headerTitle}>Sanidad Vegetal</Text>
          </View>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={styles.loadingText}>Cargando información de plagas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  const renderItem = ({ item }) => {
    const esEnfermedad = item.tipo === 'Enfermedad';
    const tieneNotas = item.mis_sintomas || (item.mis_tratamientos && item.mis_tratamientos.length > 0);
    
    const colorSeveridad = item.severidad === 'Alta' ? '#D32F2F' : 
                          item.severidad === 'Media' ? '#F57C00' : '#4CAF50';

    return (
      <TouchableOpacity style={styles.card} onPress={() => setPlagaSeleccionada(item)}>
        <View style={[styles.iconBox, { backgroundColor: esEnfermedad ? '#FFEBEE' : '#E8F5E9' }]}>
           <MaterialCommunityIcons 
              name={esEnfermedad ? "alert-decagram" : "bug"} 
              size={24} 
              color={esEnfermedad ? "#D32F2F" : "#2E7D32"} 
           />
        </View>
        <View style={{flex: 1}}>
           <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
             <Text style={styles.cardTitle}>{item.nombre}</Text>
             {item.severidad !== 'Sin registrar' && (
               <View style={[styles.severidadBadge, {backgroundColor: colorSeveridad}]}>
                 <Text style={styles.severidadText}>{item.severidad}</Text>
               </View>
             )}
           </View>
           <Text style={styles.cardSubtitle} numberOfLines={1}>
             {item.descripcion || "Ver ficha técnica"}
           </Text>
           {item.ultima_aplicacion && (
             <Text style={styles.ultimaAplicacion}>
               🕐 Última aplicación: {item.ultima_aplicacion}
             </Text>
           )}
           {tieneNotas && (
             <View style={styles.badgeEditado}>
               <Ionicons name="pencil" size={10} color="#1976D2" />
               <Text style={styles.badgeText}>
                 {item.mis_tratamientos?.length || 0} tratamiento(s)
               </Text>
             </View>
           )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </TouchableOpacity>
    );
  };

  const esDatosCompletos = nivel === 'completo';

  return (
    <SafeAreaView style={styles.container}>
      
      {/* HEADER */}
      <View style={styles.header}>
         <TouchableOpacity onPress={() => navigation.goBack()} style={{padding:5}}>
            <Ionicons name="arrow-back" size={24} color="#2E7D32" />
         </TouchableOpacity>
         <View style={{flex:1, marginLeft: 10}}>
            <Text style={styles.headerTitle}>Sanidad Vegetal</Text>
            <Text style={styles.headerSubtitle}>
              {cultivo} • {estadisticas.total} registros
            </Text>
         </View>
         <View style={[styles.badge, esDatosCompletos ? styles.badgeCompleto : styles.badgeBasico]}>
           <Text style={styles.badgeTextHeader}>
             {esDatosCompletos ? '✓' : '📶'}
           </Text>
         </View>
      </View>

      {/* ESTADÍSTICAS RÁPIDAS */}
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <MaterialCommunityIcons name="bug" size={20} color="#2E7D32" />
          <Text style={styles.statNumber}>{estadisticas.plagas}</Text>
          <Text style={styles.statLabel}>Plagas</Text>
        </View>
        <View style={styles.statBox}>
          <MaterialCommunityIcons name="alert-decagram" size={20} color="#D32F2F" />
          <Text style={styles.statNumber}>{estadisticas.enfermedades}</Text>
          <Text style={styles.statLabel}>Enfermedades</Text>
        </View>
        <View style={styles.statBox}>
          <MaterialCommunityIcons name="check-circle" size={20} color="#1976D2" />
          <Text style={styles.statNumber}>{estadisticas.conTratamiento}</Text>
          <Text style={styles.statLabel}>Tratados</Text>
        </View>
        {estadisticas.severidadAlta > 0 && (
          <View style={styles.statBox}>
            <MaterialCommunityIcons name="alert" size={20} color="#F57C00" />
            <Text style={styles.statNumber}>{estadisticas.severidadAlta}</Text>
            <Text style={styles.statLabel}>Alta severidad</Text>
          </View>
        )}
      </View>

      {/* BÚSQUEDA */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={{marginRight: 10}} />
        <TextInput 
          style={styles.searchInput}
          placeholder="Buscar plaga o enfermedad..."
          value={busqueda}
          onChangeText={setBusqueda}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* FILTROS */}
      <View style={styles.filtrosContainer}>
        {['Todos', 'Plagas', 'Enfermedades'].map(tipo => (
          <TouchableOpacity 
            key={tipo}
            style={[styles.filtroBtn, filtroTipo === tipo && styles.filtroBtnActivo]}
            onPress={() => setFiltroTipo(tipo)}
          >
            <Text style={[styles.filtroText, filtroTipo === tipo && styles.filtroTextActivo]}>
              {tipo}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* LISTA */}
      <FlatList 
         data={listaFiltrada}
         keyExtractor={(item, index) => index.toString()}
         renderItem={renderItem}
         contentContainerStyle={{ padding: 15, paddingBottom: 50 }}
         ListEmptyComponent={
            <View style={{alignItems:'center', marginTop: 50}}>
               <MaterialCommunityIcons name="magnify" size={50} color="#ccc" />
               <Text style={{color:'#999', marginTop:10}}>
                 {busqueda ? 'No se encontraron resultados' : 'No hay plagas registradas'}
               </Text>
            </View>
         }
      />

      {/* MODAL DETALLE */}
      {plagaSeleccionada && (
         <Modal visible={true} transparent={true} animationType="fade" onRequestClose={() => setPlagaSeleccionada(null)}>
            <View style={styles.modalOverlay}>
               <View style={styles.fichaCard}>
                  <View style={styles.fichaHeader}>
                      <View style={{flex:1}}>
                          <Text style={styles.fichaTitle}>{plagaSeleccionada.nombre}</Text>
                          <Text style={styles.fichaSubtitle}>
                            {plagaSeleccionada.tipo} • {cultivo}
                          </Text>
                      </View>
                      <TouchableOpacity onPress={() => setPlagaSeleccionada(null)}>
                          <Ionicons name="close-circle" size={32} color="#999"/>
                      </TouchableOpacity>
                  </View>
                  
                  <ScrollView showsVerticalScrollIndicator={false}>
                     {/* INFO OFICIAL */}
                     <View style={styles.sectionContainer}>
                        <Text style={styles.sectionHeader}>📖 Ficha Técnica Oficial</Text>
                        <Text style={styles.bodyText}>{plagaSeleccionada.descripcion}</Text>
                        
                        {plagaSeleccionada.control?.mecanismo && (
                          <>
                            <Text style={[styles.label, {marginTop:10}]}>Control Recomendado:</Text>
                            <Text style={styles.bodyText}>{plagaSeleccionada.control.mecanismo}</Text>
                          </>
                        )}
                        
                        {plagaSeleccionada.control?.productos_activos_mexico?.length > 0 && (
                          <>
                            <Text style={[styles.label, {marginTop:10}]}>Productos Registrados:</Text>
                            {plagaSeleccionada.control.productos_activos_mexico.map((prod, i) => (
                              <View key={i} style={styles.productoOficialRow}>
                                <MaterialCommunityIcons name="flask" size={16} color="#2E7D32" />
                                <Text style={styles.oficialText}>
                                  {prod.ingrediente} - {prod.dosis_tipo}
                                </Text>
                              </View>
                            ))}
                          </>
                        )}
                     </View>

                     {/* NOTAS USUARIO */}
                     <View style={[styles.sectionContainer, styles.userSection]}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                           <Text style={[styles.sectionHeader, {color:'#1565C0', marginBottom:0}]}>
                             📝 Mi Bitácora
                           </Text>
                           <TouchableOpacity onPress={abrirEditor} style={styles.btnEditar}>
                              <Ionicons name="create-outline" size={16} color="#1565C0" />
                              <Text style={{color:'#1565C0', fontWeight:'bold', fontSize:12, marginLeft: 4}}>
                                EDITAR
                              </Text>
                           </TouchableOpacity>
                        </View>

                        {/* Severidad */}
                        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
                          <Text style={styles.labelUser}>Nivel de severidad: </Text>
                          <View style={[styles.severidadBadgeLarge, {
                            backgroundColor: plagaSeleccionada.severidad === 'Alta' ? '#FFEBEE' : 
                                           plagaSeleccionada.severidad === 'Media' ? '#FFF3E0' : '#E8F5E9'
                          }]}>
                            <Text style={[styles.severidadTextLarge, {
                              color: plagaSeleccionada.severidad === 'Alta' ? '#D32F2F' : 
                                    plagaSeleccionada.severidad === 'Media' ? '#F57C00' : '#2E7D32'
                            }]}>
                              {plagaSeleccionada.severidad}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.labelUser}>Observaciones:</Text>
                        <Text style={styles.bodyTextUser}>
                           {plagaSeleccionada.mis_sintomas || "Sin observaciones registradas."}
                        </Text>

                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 5}}>
                          <Text style={styles.labelUser}>Historial de Tratamientos:</Text>
                          {plagaSeleccionada.mis_tratamientos?.length > 0 && (
                            <TouchableOpacity onPress={exportarHistorial}>
                              <MaterialCommunityIcons name="export" size={18} color="#1565C0" />
                            </TouchableOpacity>
                          )}
                        </View>
                        
                        {plagaSeleccionada.mis_tratamientos && plagaSeleccionada.mis_tratamientos.length > 0 ? (
                            plagaSeleccionada.mis_tratamientos.map((trat, index) => (
                                <View key={index} style={styles.tratamientoRow}>
                                    <View style={styles.tratNumero}>
                                      <Text style={styles.tratNumeroText}>{index + 1}</Text>
                                    </View>
                                    <View style={{flex:1}}>
                                        <Text style={styles.tratProducto}>{trat.producto}</Text>
                                        <Text style={styles.tratDosis}>Dosis: {trat.dosis}</Text>
                                        {trat.fecha && (
                                          <Text style={styles.tratFecha}>📅 {trat.fecha}</Text>
                                        )}
                                    </View>
                                </View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                              <MaterialCommunityIcons name="flask-empty-outline" size={32} color="#ccc" />
                              <Text style={styles.emptyText}>No has registrado aplicaciones</Text>
                            </View>
                        )}
                     </View>
                  </ScrollView>
               </View>
            </View>
         </Modal>
      )}

      {/* MODAL EDITOR */}
      <Modal visible={modalEditarVisible} animationType="slide" transparent={true} onRequestClose={()=>setModalEditarVisible(false)}>
         <View style={styles.modalOverlay}>
            <View style={styles.modalForm}>
               <Text style={styles.modalTitle}>📋 Bitácora de Aplicación</Text>
               <Text style={{color:'#666', fontSize:12, marginBottom:15}}>
                 Para: <Text style={{fontWeight:'bold'}}>{plagaSeleccionada?.nombre}</Text>
               </Text>

               <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Nivel de Severidad */}
                  <Text style={styles.label}>Nivel de Severidad:</Text>
                  <View style={styles.severidadSelector}>
                    {['Baja', 'Media', 'Alta'].map(sev => (
                      <TouchableOpacity 
                        key={sev}
                        style={[styles.severidadOption, nivelSeveridad === sev && styles.severidadOptionActiva]}
                        onPress={() => setNivelSeveridad(sev)}
                      >
                        <Text style={[styles.severidadOptionText, nivelSeveridad === sev && styles.severidadOptionTextActiva]}>
                          {sev}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Observaciones */}
                  <Text style={styles.label}>Observaciones / Síntomas:</Text>
                  <TextInput 
                     style={[styles.input, {height:80, textAlignVertical:'top'}]} 
                     multiline 
                     value={misSintomas}
                     onChangeText={setMisSintomas}
                     placeholder="Ej: Hojas amarillas en el centro, presencia de larvas..."
                  />

                  <View style={styles.divider} />
                  
                  {/* Agregar Tratamiento */}
                  <Text style={styles.label}>➕ Agregar Tratamiento:</Text>
                  
                  <View style={styles.addBox}>
                      <TextInput 
                         style={[styles.input, {marginTop:0}]} 
                         value={tempProducto}
                         onChangeText={setTempProducto}
                         placeholder="Nombre del producto (Ej: Cipermetrina 20%)"
                      />
                      <View style={{flexDirection:'row', gap:10, marginTop:10}}>
                          <TextInput 
                             style={[styles.input, {flex:1, marginTop:0}]} 
                             value={tempDosis}
                             onChangeText={setTempDosis}
                             placeholder="Dosis (Ej: 1.5 L/ha)"
                          />
                          <TextInput 
                             style={[styles.input, {flex:1, marginTop:0}]} 
                             value={fechaAplicacion}
                             onChangeText={setFechaAplicacion}
                             placeholder="Fecha (DD/MM/AAAA)"
                          />
                      </View>
                      <TouchableOpacity style={styles.btnAddItem} onPress={agregarProductoALista}>
                          <Ionicons name="add-circle" size={20} color="white" />
                          <Text style={{color: 'white', marginLeft: 5, fontWeight: 'bold'}}>
                            Agregar a la lista
                          </Text>
                      </TouchableOpacity>
                  </View>

                  {/* Lista de Aplicaciones */}
                  <Text style={[styles.label, {marginTop:15}]}>
                    📋 Lista de Aplicación ({listaTratamientos.length}):
                  </Text>
                  {listaTratamientos.length > 0 ? (
                    listaTratamientos.map((item, idx) => (
                      <View key={item.id} style={styles.itemLista}>
                          <View style={styles.itemNumero}>
                            <Text style={styles.itemNumeroText}>{idx + 1}</Text>
                          </View>
                          <View style={{flex:1}}>
                              <Text style={{fontWeight:'bold', color:'#333', fontSize: 15}}>{item.producto}</Text>
                              <Text style={{fontSize:12, color:'#666'}}>Dosis: {item.dosis}</Text>
                              {item.fecha && (
                                <Text style={{fontSize:11, color:'#999'}}>📅 {item.fecha}</Text>
                              )}
                          </View>
                          <TouchableOpacity onPress={() => eliminarProductoDeLista(item.id)}>
                              <Ionicons name="trash-outline" size={22} color="#D32F2F" />
                          </TouchableOpacity>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>Sin tratamientos agregados</Text>
                    </View>
                  )}
               </ScrollView>

               <View style={styles.formButtons}>
                  <TouchableOpacity 
                    style={[styles.btnForm, {backgroundColor:'#E57373'}]} 
                    onPress={()=>setModalEditarVisible(false)}
                  >
                     <Text style={{color:'white', fontWeight: 'bold'}}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.btnForm, {backgroundColor:'#2E7D32'}]} 
                    onPress={guardarCambios}
                  >
                     <Ionicons name="checkmark-circle" size={18} color="white" />
                     <Text style={{color:'white', fontWeight:'bold', marginLeft: 5}}>
                       Guardar Todo
                     </Text>
                  </TouchableOpacity>
               </View>
            </View>
         </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, fontSize: 14, color: '#666', textAlign: 'center' },
  
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 20, paddingTop: 10, paddingBottom: 15, elevation: 3 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginLeft: 8 },
  badgeCompleto: { backgroundColor: '#4CAF50' },
  badgeBasico: { backgroundColor: '#FFA726' },
  badgeTextHeader: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  
  // Estadísticas
  statsContainer: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, marginBottom: 10, elevation: 2 },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 5 },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 5 },
  statLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  
  // Búsqueda
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 15, marginBottom: 10, padding: 12, borderRadius: 10, elevation: 2 },
  searchInput: { flex: 1, fontSize: 15, color: '#333' },
  
  // Filtros
  filtrosContainer: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 10, gap: 10 },
  filtroBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', elevation: 1 },
  filtroBtnActivo: { backgroundColor: '#2E7D32', elevation: 3 },
  filtroText: { fontSize: 13, color: '#666', fontWeight: '600' },
  filtroTextActivo: { color: '#fff' },
  
  // Cards
  card: { flexDirection: 'row', backgroundColor: '#fff', marginVertical: 5, marginHorizontal: 15, padding: 12, borderRadius: 12, alignItems: 'center', elevation: 2 },
  iconBox: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardTitle: { fontWeight: 'bold', fontSize: 16, color: '#333', marginBottom: 4 },
  cardSubtitle: { color: '#666', fontSize: 13, marginBottom: 4 },
  ultimaAplicacion: { fontSize: 11, color: '#999', fontStyle: 'italic', marginTop: 2 },
  badgeEditado: { flexDirection:'row', alignItems:'center', backgroundColor:'#E3F2FD', alignSelf:'flex-start', paddingHorizontal:8, paddingVertical:3, borderRadius:4, marginTop:5 },
  badgeText: { fontSize:10, color:'#1565C0', marginLeft:4, fontWeight:'600' },
  
  severidadBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  severidadText: { fontSize: 10, color: '#fff', fontWeight: 'bold' },
  severidadBadgeLarge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15 },
  severidadTextLarge: { fontSize: 13, fontWeight: 'bold' },
  
  // Modal Detalle
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  fichaCard: { width: '92%', maxHeight:'88%', backgroundColor: 'white', borderRadius: 20, padding: 20, elevation: 10 },
  fichaHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, borderBottomWidth: 2, borderColor: '#E8F5E9', paddingBottom: 12 },
  fichaTitle: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  fichaSubtitle: { fontSize: 14, color: '#777', fontStyle: 'italic', marginTop: 4 },
  
  sectionContainer: { marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  userSection: { backgroundColor: '#F9FAFB', padding: 15, borderRadius: 12, borderBottomWidth:0, borderWidth: 1, borderColor:'#E3F2FD' },
  sectionHeader: { fontSize: 17, fontWeight: 'bold', color: '#2E7D32', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#555', marginTop: 5 },
  bodyText: { fontSize: 14, color: '#444', lineHeight: 22, marginTop: 5 },
  
  productoOficialRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, padding: 8, backgroundColor: '#F1F8E9', borderRadius: 6 },
  oficialText: { fontSize: 13, color: '#555', marginLeft: 8, flex: 1 },
  
  labelUser: { fontSize: 13, fontWeight: 'bold', color: '#1565C0', marginTop: 8 },
  bodyTextUser: { fontSize: 14, color: '#333', fontStyle: 'italic', marginTop: 4, lineHeight: 20 },
  btnEditar: { flexDirection: 'row', alignItems: 'center', backgroundColor:'#E3F2FD', paddingHorizontal:12, paddingVertical:6, borderRadius:8 },
  
  tratamientoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, padding: 10, backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  tratNumero: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  tratNumeroText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  tratProducto: { fontWeight: 'bold', fontSize: 15, color: '#333', marginBottom: 3 },
  tratDosis: { fontSize: 13, color: '#666', marginBottom: 2 },
  tratFecha: { fontSize: 11, color: '#999', fontStyle: 'italic' },
  
  emptyState: { alignItems: 'center', paddingVertical: 20 },
  emptyText: { fontSize: 13, color: '#999', fontStyle: 'italic', marginTop: 8 },
  
  // Modal Editor
  modalForm: { width: '92%', backgroundColor: 'white', borderRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2E7D32', marginBottom: 5 },
  
  severidadSelector: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 15 },
  severidadOption: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F5F5F5', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  severidadOptionActiva: { backgroundColor: '#E8F5E9', borderColor: '#2E7D32' },
  severidadOptionText: { fontSize: 14, color: '#666', fontWeight: '600' },
  severidadOptionTextActiva: { color: '#2E7D32', fontWeight: 'bold' },
  
  input: { backgroundColor: '#F8F8F8', borderRadius: 10, padding: 12, marginTop: 8, fontSize: 14, borderWidth: 1, borderColor: '#E0E0E0' },
  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 20 },
  
  addBox: { backgroundColor: '#F5F7FA', padding: 15, borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  btnAddItem: { flexDirection: 'row', backgroundColor: '#1976D2', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  
  itemLista: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#F0F0F0', backgroundColor: '#FAFAFA', borderRadius: 8, marginBottom: 8 },
  itemNumero: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  itemNumeroText: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  
  formButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, gap: 10 },
  btnForm: { flex: 1, flexDirection: 'row', padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', elevation: 2 },
});