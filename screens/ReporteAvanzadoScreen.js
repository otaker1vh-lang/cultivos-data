import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, 
  Alert, ActivityIndicator, Keyboard, Share
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system'; 
import { supabase } from '../src/services/supabaseClient'; 

// --- CONSTANTES ---
const ESTADOS_MX = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", 
  "Coahuila", "Colima", "Chiapas", "Chihuahua", "Ciudad de México", 
  "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", 
  "México", "Michoacán", "Morelos", "Nayarit", "Nuevo León", 
  "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", 
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", 
  "Veracruz", "Yucatán", "Zacatecas"
];

const ANIOS = Array.from({length: 11}, (_, i) => (2025 - i).toString());
const CICLOS = ["Otoño-Invierno", "Primavera-Verano", "Perennes"];
const MODALIDADES = ["Riego", "Temporal"];
const NIVELES_DESGLOSE = ["Municipal", "Estatal", "Por Cultivo"];

const METRICAS_DISPONIBLES = [
    { id: 'sembrada', label: 'Sembrada (Ha)', key: 'sembrada' },
    { id: 'cosechada', label: 'Cosechada (Ha)', key: 'cosechada' },
    { id: 'siniestrada', label: 'Siniestrada (Ha)', key: 'siniestrada' },
    { id: 'volumen', label: 'Volumen (Ton)', key: 'volumenproduccion' },
    { id: 'rendimiento', label: 'Rendimiento', key: 'rendimiento' },
    { id: 'precio', label: 'Precio Rural', key: 'preciomediorural' },
    { id: 'valor', label: 'Valor Producción', key: 'valorproduccion' },
];

// --- COMPONENTE AUTOCOMPLETE ---
const FiltroAutocomplete = ({ 
    label, valor, setValor, opciones = [], zIndex = 1, 
    placeholder = "Seleccionar...", isMulti = false,
    openMenu, setOpenMenu, id 
}) => {
    const [sugerencias, setSugerencias] = useState([]);
    const isOpen = openMenu === id;

    const filtrar = (texto) => {
        const matches = opciones.filter(op => op && op.toString().toLowerCase().includes(texto.toLowerCase()));
        setSugerencias(matches);
        setOpenMenu(id);
        if (!isMulti) setValor(texto);
    };

    const seleccionar = (item) => {
        if (isMulti) {
            const nuevosValores = valor.includes(item) 
                ? valor.filter(v => v !== item) 
                : [...valor, item].sort();
            setValor(nuevosValores);
        } else {
            setValor(item);
            setOpenMenu(null);
            Keyboard.dismiss();
        }
    };

    return (
        <View style={{ marginBottom: 15, zIndex: isOpen ? 10000 : zIndex, position: 'relative' }}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputContainer}>
                <TextInput 
                    style={styles.input} 
                    value={isMulti ? valor.join(', ') : valor} 
                    onChangeText={filtrar}
                    placeholder={placeholder}
                    onFocus={() => {
                        setSugerencias(opciones);
                        setOpenMenu(id);
                    }}
                />
                {valor.length > 0 && (
                    <TouchableOpacity onPress={() => { setValor(isMulti ? [] : ''); setOpenMenu(null); }} style={styles.clearBtn}>
                        <MaterialCommunityIcons name="close-circle" size={20} color="#ccc" />
                    </TouchableOpacity>
                )}
            </View>
            {isOpen && sugerencias.length > 0 && (
                <View style={styles.dropdownList}>
                    <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="always" style={{maxHeight: 200}}>
                        {sugerencias.slice(0, 32).map((item, index) => (
                            <TouchableOpacity 
                                key={index} 
                                style={[styles.dropdownItem, isMulti && valor.includes(item) && {backgroundColor: '#e8f5e9'}]} 
                                onPress={() => seleccionar(item)}
                            >
                                <Text style={isMulti && valor.includes(item) ? {color: '#2E7D32', fontWeight: 'bold'} : {}}>{item}</Text>
                                {isMulti && valor.includes(item) && <MaterialCommunityIcons name="check" size={18} color="#2E7D32" />}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {isMulti && (
                        <TouchableOpacity style={styles.btnCloseMulti} onPress={() => setOpenMenu(null)}>
                            <Text style={{color: '#fff', textAlign: 'center', fontWeight: 'bold'}}>CONFIRMAR</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
};

export default function ReporteAvanzadoScreen() {
  const [openMenu, setOpenMenu] = useState(null);
  const [filtros, setFiltros] = useState({
    anio: ['2023'], 
    cultivo: '',
    estado: [], 
    municipio: '',
    ciclo: '',
    modalidad: '',
  });

  const [metricasSeleccionadas, setMetricasSeleccionadas] = useState(['valor', 'volumen', 'rendimiento']);
  const [nivelDesglose, setNivelDesglose] = useState("Por Cultivo");
  const [listaCultivos, setListaCultivos] = useState([]);
  const [listaMunicipios, setListaMunicipios] = useState([]);
  const [resultados, setResultados] = useState([]); 
  const [resumenGeneral, setResumenGeneral] = useState(null);
  const [variacionFinal, setVariacionFinal] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [mostrarTabla, setMostrarTabla] = useState(false);

  useEffect(() => {
    const fetchCultivos = async () => {
        const { data } = await supabase.from('produccion_agricola').select('nomcultivo');
        if (data) setListaCultivos([...new Set(data.map(item => item.nomcultivo))].sort());
    };
    fetchCultivos();
  }, []);

  useEffect(() => {
    if (filtros.estado.length > 0) {
        const fetchMunicipios = async () => {
            const { data } = await supabase.from('produccion_agricola').select('nommunicipio').in('nomestado', filtros.estado);
            if (data) setListaMunicipios([...new Set(data.map(item => item.nommunicipio))].sort());
        };
        fetchMunicipios();
    }
  }, [filtros.estado]);

  const toggleMetrica = (id) => {
    setMetricasSeleccionadas(prev => 
        prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const consultarBaseDatos = async () => {
    if (metricasSeleccionadas.length === 0) return Alert.alert("Error", "Selecciona al menos una métrica.");
    
    setCargando(true);
    setMostrarTabla(false);
    setOpenMenu(null);

    try {
      let query = supabase.from('produccion_agricola').select('*');
      if (filtros.anio.length > 0) query = query.in('anio', filtros.anio.map(a => parseInt(a)));
      if (filtros.cultivo) query = query.ilike('nomcultivo', `%${filtros.cultivo}%`);
      if (filtros.estado.length > 0) query = query.in('nomestado', filtros.estado);
      if (filtros.municipio) query = query.ilike('nommunicipio', `%${filtros.municipio}%`);
      if (filtros.ciclo) query = query.ilike('nomcicloproductivo', `%${filtros.ciclo}%`);
      if (filtros.modalidad) query = query.ilike('nommodalidad', `%${filtros.modalidad}%`);
      
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) {
        Alert.alert("Aviso", "No se encontraron datos con esos filtros.");
      } else {
        procesarDatos(data);
      }
    } catch (error) {
      Alert.alert("Error de conexión", error.message);
    } finally {
      setCargando(false);
    }
  };

  const procesarDatos = (data) => {
    const keyField = nivelDesglose === "Estatal" ? 'nomestado' : 
                     nivelDesglose === "Por Cultivo" ? 'nomcultivo' : 'nommunicipio';

    // Agrupación y Resumen
    const totals = { val: 0, vol: 0, sem: 0, cos: 0 };
    const grouped = data.reduce((acc, item) => {
        const id = `${item[keyField]}-${item.anio}`;
        if (!acc[id]) {
            acc[id] = { ...item, valorproduccion: 0, sembrada: 0, siniestrada: 0, volumenproduccion: 0, cosechada: 0, sumPrecio: 0, counter: 0 };
        }
        acc[id].valorproduccion += (item.valorproduccion || 0);
        acc[id].sembrada += (item.sembrada || 0);
        acc[id].siniestrada += (item.siniestrada || 0);
        acc[id].volumenproduccion += (item.volumenproduccion || 0);
        acc[id].cosechada += (item.cosechada || 0);
        acc[id].sumPrecio += (item.preciomediorural || 0);
        acc[id].counter++;

        totals.val += item.valorproduccion || 0;
        totals.vol += item.volumenproduccion || 0;
        totals.sem += item.sembrada || 0;
        totals.cos += item.cosechada || 0;
        return acc;
    }, {});

    const listaFinal = Object.values(grouped).map(i => ({
        ...i,
        rendimiento: i.cosechada > 0 ? (i.volumenproduccion / i.cosechada) : 0,
        preciomediorural: i.sumPrecio / i.counter
    })).sort((a,b) => b.anio - a.anio || b.valorproduccion - a.valorproduccion);

    // Variación interanual
    if (filtros.anio.length > 1) {
        const aniosSorted = [...filtros.anio].sort((a, b) => a - b);
        const a1 = aniosSorted[0];
        const a2 = aniosSorted[aniosSorted.length - 1];
        const v1 = data.filter(d => d.anio == a1).reduce((s, c) => s + c.valorproduccion, 0);
        const v2 = data.filter(d => d.anio == a2).reduce((s, c) => s + c.valorproduccion, 0);
        setVariacionFinal({ i: a1, f: a2, p: v1 > 0 ? ((v2 - v1) / v1) * 100 : 0 });
    } else {
        setVariacionFinal(null);
    }

    setResumenGeneral(totals);
    setResultados(listaFinal);
    setMostrarTabla(true);
  };

  const formatVal = (v, id) => {
    if (id === 'valor' || id === 'precio') return '$' + Math.round(v).toLocaleString();
    return v.toLocaleString(undefined, {maximumFractionDigits: 1});
  };

  // --- FUNCIONES DE EXPORTACIÓN (RESTAURADAS) ---
  const exportarPDF = async () => {
    const rows = resultados.map(r => `
      <tr>
        <td>${r.anio}</td>
        <td>${nivelDesglose === "Por Cultivo" ? r.nomcultivo : (r.nommunicipio || r.nomestado)}</td>
        ${metricasSeleccionadas.map(m => `<td>${formatVal(r[METRICAS_DISPONIBLES.find(x=>x.id===m).key], m)}</td>`).join('')}
      </tr>`).join('');

    const html = `
      <html>
        <style>table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ccc; padding: 8px; font-size: 10px; }</style>
        <body>
          <h2>Reporte SIACON - Desglose ${nivelDesglose}</h2>
          <table>
            <tr style="background: #f2f2f2">
              <th>Año</th><th>Nombre</th>
              ${metricasSeleccionadas.map(m => `<th>${METRICAS_DISPONIBLES.find(x=>x.id===m).label}</th>`).join('')}
            </tr>
            ${rows}
          </table>
        </body>
      </html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  const exportarExcel = async () => {
    let csv = `Año,Nombre,${metricasSeleccionadas.map(m => METRICAS_DISPONIBLES.find(x=>x.id===m).label).join(',')}\n`;
    resultados.forEach(r => {
        const nombre = nivelDesglose === "Por Cultivo" ? r.nomcultivo : (r.nommunicipio || r.nomestado);
        const vals = metricasSeleccionadas.map(m => r[METRICAS_DISPONIBLES.find(x=>x.id===m).key]);
        csv += `${r.anio},${nombre},${vals.join(',')}\n`;
    });
    const path = `${FileSystem.documentDirectory}Reporte_SIACON.csv`;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(path);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <MaterialCommunityIcons name="file-chart" size={40} color="#2E7D32" />
          <Text style={styles.title}>Reporte Detallado</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Nivel de Consulta</Text>
          <View style={styles.tabContainer}>
              {NIVELES_DESGLOSE.map((tab) => (
                  <TouchableOpacity key={tab} style={[styles.tab, nivelDesglose === tab && styles.tabActive]} onPress={() => setNivelDesglose(tab)}>
                      <Text style={[styles.tabText, nivelDesglose === tab && styles.tabTextActive]}>{tab}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          <View style={styles.row}>
             <View style={{flex: 1, marginRight: 5}}>
                <FiltroAutocomplete id="anio" label="Años" valor={filtros.anio} setValor={(v) => setFiltros({...filtros, anio: v})} opciones={ANIOS} isMulti openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
             <View style={{flex: 1.2, marginLeft: 5}}>
                <FiltroAutocomplete id="cultivo" label="Cultivo" valor={filtros.cultivo} setValor={(t) => setFiltros({...filtros, cultivo: t})} opciones={listaCultivos} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
          </View>

          <FiltroAutocomplete id="estado" label="Estados" valor={filtros.estado} setValor={(v) => setFiltros({...filtros, estado: v})} opciones={ESTADOS_MX} isMulti openMenu={openMenu} setOpenMenu={setOpenMenu} />
          
          <Text style={styles.sectionTitle}>Selecciona Datos a Visualizar</Text>
          <View style={styles.metricsGrid}>
            {METRICAS_DISPONIBLES.map(m => (
                <TouchableOpacity key={m.id} style={[styles.metricChip, metricasSeleccionadas.includes(m.id) && styles.metricChipActive]} onPress={() => toggleMetrica(m.id)}>
                    <Text style={[styles.metricChipText, metricasSeleccionadas.includes(m.id) && styles.metricChipTextActive]}>{m.label}</Text>
                </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.btnConsultar} onPress={consultarBaseDatos} disabled={cargando}>
            {cargando ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>GENERAR INFORME DETALLADO</Text>}
          </TouchableOpacity>
        </View>

        {mostrarTabla && (
            <View style={{ marginTop: 20 }}>
                {/* RESUMEN GENERAL (Restaurado) */}
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Resumen de Selección</Text>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>VALOR TOTAL</Text>
                            <Text style={styles.summaryValueMoney}>${Math.round(resumenGeneral.val/1000000).toLocaleString()}M</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>VOLUMEN</Text>
                            <Text style={styles.summaryValue}>{Math.round(resumenGeneral.vol).toLocaleString()} t</Text>
                        </View>
                    </View>
                    {variacionFinal && (
                        <View style={styles.variacionBox}>
                            <Text style={styles.variacionText}>Variación {variacionFinal.i}-{variacionFinal.f}: </Text>
                            <Text style={[styles.variacionText, {fontWeight: 'bold', color: variacionFinal.p >= 0 ? '#81C784' : '#ff8a80'}]}>
                                {variacionFinal.p > 0 ? '+' : ''}{variacionFinal.p.toFixed(1)}%
                            </Text>
                        </View>
                    )}
                </View>

                {/* BOTONES EXPORTACIÓN (Restaurado) */}
                <View style={styles.exportRow}>
                    <TouchableOpacity style={[styles.btnExp, {backgroundColor: '#d32f2f'}]} onPress={exportarPDF}>
                        <MaterialCommunityIcons name="file-pdf-box" size={18} color="#fff" />
                        <Text style={styles.btnExpText}>PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnExp, {backgroundColor: '#2e7d32'}]} onPress={exportarExcel}>
                        <MaterialCommunityIcons name="microsoft-excel" size={18} color="#fff" />
                        <Text style={styles.btnExpText}>EXCEL</Text>
                    </TouchableOpacity>
                </View>

                {/* TABLA DE DATOS */}
                <ScrollView horizontal style={styles.tableContainer}>
                    <View>
                        <View style={[styles.tableRow, styles.tableHeader]}>
                            <Text style={[styles.cellHeader, {width: 60}]}>Año</Text>
                            <Text style={[styles.cellHeader, {width: 140}]}>Descripción</Text>
                            {metricasSeleccionadas.map(mId => (
                                <Text key={mId} style={[styles.cellHeader, {width: 110, textAlign: 'right'}]}>
                                    {METRICAS_DISPONIBLES.find(m => m.id === mId).label}
                                </Text>
                            ))}
                        </View>
                        {resultados.map((item, idx) => (
                            <View key={idx} style={[styles.tableRow, {backgroundColor: idx % 2 === 0 ? '#fff' : '#fcfcfc'}]}>
                                <Text style={[styles.cell, {width: 60}]}>{item.anio}</Text>
                                <Text style={[styles.cell, {width: 140}]} numberOfLines={1}>
                                    {nivelDesglose === "Por Cultivo" ? item.nomcultivo : (item.nommunicipio || item.nomestado)}
                                </Text>
                                {metricasSeleccionadas.map(mId => (
                                    <Text key={mId} style={[styles.cell, {width: 110, textAlign: 'right'}]}>
                                        {formatVal(item[METRICAS_DISPONIBLES.find(m => m.id === mId).key], mId)}
                                    </Text>
                                ))}
                            </View>
                        ))}
                    </View>
                </ScrollView>
            </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f8' },
  scroll: { padding: 15, paddingBottom: 60 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1b5e20' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 3, zIndex: 100 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#455A64', marginVertical: 10 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 10, padding: 4, marginBottom: 15 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#fff', elevation: 2 },
  tabText: { fontSize: 11, color: '#90a4ae', fontWeight: 'bold' },
  tabTextActive: { color: '#2E7D32' },
  row: { flexDirection: 'row' },
  label: { fontSize: 11, fontWeight: 'bold', color: '#546e7a', marginBottom: 4 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafafa', borderRadius: 8, borderWidth: 1, borderColor: '#cfd8dc' },
  input: { flex: 1, paddingHorizontal: 12, height: 40, fontSize: 13 },
  clearBtn: { padding: 8 },
  dropdownList: { position: 'absolute', top: 65, left: 0, right: 0, backgroundColor: 'white', borderRadius: 10, elevation: 20, zIndex: 10000, borderWidth: 1, borderColor: '#cfd8dc' },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', flexDirection: 'row', justifyContent: 'space-between' },
  btnCloseMulti: { backgroundColor: '#2E7D32', padding: 10, margin: 5, borderRadius: 8 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 15 },
  metricChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15, borderWidth: 1, borderColor: '#cfd8dc' },
  metricChipActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  metricChipText: { fontSize: 10, color: '#546e7a' },
  metricChipTextActive: { color: '#fff', fontWeight: 'bold' },
  btnConsultar: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  summaryCard: { backgroundColor: '#37474f', borderRadius: 15, padding: 15, marginBottom: 15 },
  summaryTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1 },
  summaryLabel: { color: '#b0bec5', fontSize: 9, fontWeight: 'bold' },
  summaryValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  summaryValueMoney: { color: '#81C784', fontSize: 18, fontWeight: 'bold' },
  variacionBox: { marginTop: 10, flexDirection: 'row', borderTopWidth: 0.5, borderColor: '#546e7a', paddingTop: 8 },
  variacionText: { color: '#cfd8dc', fontSize: 11 },
  exportRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  btnExp: { flex: 0.48, flexDirection: 'row', padding: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  btnExpText: { color: '#fff', fontWeight: 'bold', marginLeft: 8, fontSize: 12 },
  tableContainer: { backgroundColor: '#fff', borderRadius: 12, elevation: 2 },
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' },
  tableHeader: { backgroundColor: '#455A64' },
  cellHeader: { color: '#fff', fontWeight: 'bold', fontSize: 11, paddingHorizontal: 10 },
  cell: { fontSize: 11, color: '#37474f', paddingHorizontal: 10 }
});