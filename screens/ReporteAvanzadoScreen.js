import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, 
  Alert, ActivityIndicator, Platform, Keyboard 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system'; 
import { supabase } from '../src/services/supabaseClient'; 

// --- 1. DATOS ESTÁTICOS ---
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
const NIVELES_DESGLOSE = ["Municipal (Detallado)", "Resumen por Estado", "Resumen por Cultivo"];

// --- 2. COMPONENTE AUTOCOMPLETE MEJORADO ---
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
                    <TouchableOpacity style={styles.btnCloseMulti} onPress={() => setOpenMenu(null)}>
                        <Text style={{color: '#fff', textAlign: 'center', fontWeight: 'bold'}}>CONFIRMAR</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

// --- 3. PANTALLA PRINCIPAL ---
export default function ReporteAvanzadoScreen() {
  const [openMenu, setOpenMenu] = useState(null);
  const [filtros, setFiltros] = useState({
    anio: ['2022'], 
    cultivo: '',
    estado: [], 
    municipio: '',
    ciclo: '',
    modalidad: '',
  });

  const [nivelDesglose, setNivelDesglose] = useState("Resumen por Cultivo");
  const [listaCultivos, setListaCultivos] = useState([]);
  const [listaMunicipios, setListaMunicipios] = useState([]);
  const [resultados, setResultados] = useState([]); 
  const [cargando, setCargando] = useState(false);
  const [mostrarTabla, setMostrarTabla] = useState(false);
  const [biData, setBiData] = useState({ proyeccion: null, ranking: [], alertas: [] });
  const [totales, setTotales] = useState({ valor: 0, volumen: 0, sembrada: 0, cosechada: 0, siniestrada: 0 });

  useEffect(() => {
    const fetchCultivos = async () => {
        const { data } = await supabase.from('produccion_agricola').select('nomcultivo');
        if (data) setListaCultivos([...new Set(data.map(item => item.nomcultivo))].sort());
    };
    fetchCultivos();
  }, []);

  useEffect(() => {
    if (filtros.estado.length === 1) {
        const fetchMunicipios = async () => {
            const { data } = await supabase.from('produccion_agricola').select('nommunicipio').ilike('nomestado', `%${filtros.estado[0]}%`);
            if (data) setListaMunicipios([...new Set(data.map(item => item.nommunicipio))].sort());
        };
        fetchMunicipios();
    }
  }, [filtros.estado]);

  const consultarBaseDatos = async () => {
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
      
      const { data, error } = await query.limit(4000);
      if (error) throw error;
      if (!data || data.length === 0) {
        Alert.alert("Aviso", "No se encontraron registros.");
      } else {
        procesarTodo(data);
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setCargando(false);
    }
  };

  const procesarTodo = (data) => {
    const keyField = nivelDesglose === "Resumen por Estado" ? 'nomestado' : 
                     nivelDesglose === "Resumen por Cultivo" ? 'nomcultivo' : 'nommunicipio';

    const grouped = data.reduce((acc, item) => {
        const id = nivelDesglose === "Municipal (Detallado)" ? `${item.id}` : `${item[keyField]}-${item.anio}`;
        if (!acc[id]) acc[id] = { ...item, valorproduccion: 0, sembrada: 0, siniestrada: 0, volumenproduccion: 0, cosechada: 0 };
        acc[id].valorproduccion += (item.valorproduccion || 0);
        acc[id].sembrada += (item.sembrada || 0);
        acc[id].siniestrada += (item.siniestrada || 0);
        acc[id].volumenproduccion += (item.volumenproduccion || 0);
        acc[id].cosechada += (item.cosechada || 0);
        return acc;
    }, {});

    const listaFinal = Object.values(grouped).map(i => ({
        ...i,
        rendimiento: i.cosechada > 0 ? (i.volumenproduccion / i.cosechada) : 0,
        percSiniestro: (i.siniestrada / i.sembrada) * 100 || 0
    })).sort((a,b) => b.anio - a.anio || b.valorproduccion - a.valorproduccion);

    // Lógica BI
    const aniosS = [...filtros.anio].sort();
    let proy = null;
    if (aniosS.length >= 2) {
        const vBase = data.filter(d => d.anio == aniosS[0]).reduce((s, c) => s + c.valorproduccion, 0);
        const vAct = data.filter(d => d.anio == aniosS[aniosS.length-1]).reduce((s, c) => s + c.valorproduccion, 0);
        if (vBase > 0) {
            const cagr = (Math.pow(vAct / vBase, 1 / (aniosS[aniosS.length-1] - aniosS[0])) - 1) * 100;
            proy = { estimado: vAct * (1 + (cagr/100)), cagr };
        }
    }
    const rank = Object.entries(data.reduce((acc, i) => {
        acc[i[keyField]] = (acc[i[keyField]] || 0) + i.valorproduccion;
        return acc;
    }, {})).map(([name, val]) => ({ name, val })).sort((a,b) => b.val - a.val).slice(0, 5);

    setTotales({
        valor: listaFinal.reduce((s, i) => s + i.valorproduccion, 0),
        volumen: listaFinal.reduce((s, i) => s + i.volumenproduccion, 0),
        sembrada: listaFinal.reduce((s, i) => s + i.sembrada, 0),
        cosechada: listaFinal.reduce((s, i) => s + i.cosechada, 0),
        siniestrada: listaFinal.reduce((s, i) => s + i.siniestrada, 0),
    });
    setBiData({ proyeccion: proy, ranking: rank, alertas: listaFinal.filter(i => i.percSiniestro > 20).slice(0,3) });
    setResultados(listaFinal);
    setMostrarTabla(true);
  };

  const formatMoney = (n) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const formatNum = (n) => (n || 0).toLocaleString('es-MX', { maximumFractionDigits: 1 });

  // --- 4. FUNCIONES DE EXPORTACIÓN (REINTEGRADAS) ---
  const handleCSV = async () => {
    if (!resultados.length) return Alert.alert("Error", "No hay datos para exportar.");
    try {
        let csv = "\uFEFFAño,Estado,Municipio,Cultivo,Sembrada,Cosechada,Siniestrada,Volumen,Valor\n";
        resultados.forEach(i => {
            csv += `${i.anio},${i.nomestado},${i.nommunicipio},${i.nomcultivo},${i.sembrada},${i.cosechada},${i.siniestrada},${i.volumenproduccion},${i.valorproduccion}\n`;
        });
        const uri = FileSystem.cacheDirectory + "reporte_siacon.csv";
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: 'utf8' });
        await Sharing.shareAsync(uri);
    } catch (e) { Alert.alert("Error CSV", e.message); }
  };

  const handlePDF = async () => {
    const html = `<html><body style="font-family:sans-serif;">
      <h1 style="color:#2E7D32;">Reporte SIACON BI</h1>
      <p>Filtros: ${filtros.anio.join(', ')} | ${filtros.estado.join(', ')}</p>
      <div style="background:#f4f4f4;padding:10px;border-radius:10px;">
        <h3>Resumen Ejecutivo</h3>
        <p>Valor Total: ${formatMoney(totales.valor)}</p>
        <p>Proyección 2025: ${biData.proyeccion ? formatMoney(biData.proyeccion.estimado) : 'N/A'}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:20px;">
        <tr style="background:#2E7D32;color:white;">
          <th>Año</th><th>Cultivo</th><th>Estado</th><th>Valor ($)</th>
        </tr>
        ${resultados.slice(0, 50).map(i => `<tr>
          <td>${i.anio}</td><td>${i.nomcultivo}</td><td>${i.nomestado}</td><td>${formatMoney(i.valorproduccion)}</td>
        </tr>`).join('')}
      </table>
    </body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <MaterialCommunityIcons name="finance" size={40} color="#2E7D32" />
          <Text style={styles.title}>SIACON BI Dashboard</Text>
          <Text style={styles.subtitle}>Análisis Multianual y Regional</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabContainer}>
              {NIVELES_DESGLOSE.map((tab) => (
                  <TouchableOpacity key={tab} style={[styles.tab, nivelDesglose === tab && styles.tabActive]} onPress={() => setNivelDesglose(tab)}>
                      <Text style={[styles.tabText, nivelDesglose === tab && styles.tabTextActive]}>{tab.split(" ")[0]}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          <View style={styles.row}>
             <View style={{flex: 1, marginRight: 5}}>
                <FiltroAutocomplete id="anio" label="Año(s)" valor={filtros.anio} setValor={(v) => setFiltros({...filtros, anio: v})} opciones={ANIOS} isMulti={true} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
             <View style={{flex: 1.2, marginLeft: 5}}>
                <FiltroAutocomplete id="cultivo" label="Cultivo" valor={filtros.cultivo} setValor={(t) => setFiltros({...filtros, cultivo: t})} opciones={listaCultivos} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
          </View>

          <FiltroAutocomplete id="estado" label="Estado(s)" valor={filtros.estado} setValor={(v) => setFiltros({...filtros, estado: v})} opciones={ESTADOS_MX} isMulti={true} openMenu={openMenu} setOpenMenu={setOpenMenu} />
          
          <FiltroAutocomplete id="municipio" label="Municipio" valor={filtros.municipio} setValor={(t) => setFiltros({...filtros, municipio: t})} opciones={listaMunicipios} openMenu={openMenu} setOpenMenu={setOpenMenu} />
          
          <View style={styles.row}>
             <View style={{flex:1, marginRight:5}}>
                <FiltroAutocomplete id="ciclo" label="Ciclo" valor={filtros.ciclo} setValor={(t) => setFiltros({...filtros, ciclo: t})} opciones={CICLOS} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
             <View style={{flex:1, marginLeft:5}}>
                <FiltroAutocomplete id="modalidad" label="Modalidad" valor={filtros.modalidad} setValor={(t) => setFiltros({...filtros, modalidad: t})} opciones={MODALIDADES} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
          </View>

          <TouchableOpacity style={styles.btnConsultar} onPress={consultarBaseDatos} disabled={cargando}>
            {cargando ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>ANALIZAR AHORA</Text>}
          </TouchableOpacity>
        </View>

        {mostrarTabla && (
            <View style={{ zIndex: -1 }}>
                <View style={styles.biContainer}>
                    {biData.proyeccion && (
                        <View style={styles.biCard}>
                            <Text style={styles.biLabel}>PROYECCIÓN 2025</Text>
                            <Text style={styles.biValue}>{formatMoney(biData.proyeccion.estimado)}</Text>
                            <Text style={[styles.biSub, {color: biData.proyeccion.cagr >= 0 ? '#43A047' : '#E53935'}]}>CAGR: {biData.proyeccion.cagr.toFixed(1)}%</Text>
                        </View>
                    )}
                    <View style={styles.biCard}>
                        <Text style={styles.biLabel}>TOP 5 POR VALOR</Text>
                        {biData.ranking.map((item, idx) => <Text key={idx} style={styles.rankText} numberOfLines={1}>{idx+1}. {item.name}</Text>)}
                    </View>
                </View>

                {biData.alertas.length > 0 && (
                    <View style={styles.alertCard}>
                        {/* CORRECCIÓN 1: Escapar el símbolo mayor que */}
                        <Text style={styles.alertTitle}>SINIESTRALIDAD CRÍTICA ({'>'}20%)</Text>
                        
                        {/* CORRECCIÓN 2: Usar sintaxis JSX {} en lugar de ${} para las variables */}
                        {biData.alertas.map((a, i) => (
                            <Text key={i} style={styles.alertMsg}>
                                • {a.nommunicipio || a.nomestado}: {a.percSiniestro.toFixed(1)}%
                            </Text>
                        ))}
                    </View>
                )}

                <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Resultados Consolidados</Text>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Valor Producción</Text><Text style={styles.summaryValueMoney}>{formatMoney(totales.valor)}</Text></View>
                        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Siniestrada</Text><Text style={[styles.summaryValue, {color: '#ff8a80'}]}>{formatNum(totales.siniestrada)} Ha</Text></View>
                    </View>
                </View>

                <View style={styles.exportRow}>
                    <TouchableOpacity style={[styles.btnExp, {backgroundColor:'#D32F2F'}]} onPress={handlePDF}><MaterialCommunityIcons name="file-pdf-box" size={20} color="#fff" /><Text style={styles.btnText}>PDF</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.btnExp, {backgroundColor:'#1E88E5'}]} onPress={handleCSV}><MaterialCommunityIcons name="file-excel" size={20} color="#fff" /><Text style={styles.btnText}>EXCEL</Text></TouchableOpacity>
                </View>

                <View style={styles.resultadosContainer}>
                    <ScrollView horizontal>
                        <View>
                            <View style={[styles.tableRow, styles.tableHeader]}>
                                <Text style={[styles.cell, {width: 45, color:'white'}]}>Año</Text>
                                <Text style={[styles.cell, {width: 100, color:'white'}]}>Ubicación</Text>
                                <Text style={[styles.cell, {width: 110, color:'white'}]}>Cultivo</Text>
                                <Text style={[styles.cell, {width: 60, color:'white', textAlign:'right'}]}>% Sin</Text>
                                <Text style={[styles.cell, {width: 110, color:'white', textAlign:'right'}]}>Valor ($)</Text>
                            </View>
                            {resultados.slice(0, 200).map((item, i) => (
                                <View key={i} style={[styles.tableRow, i % 2 === 0 && {backgroundColor: '#fcfcfc'}]}>
                                    <Text style={[styles.cell, {width: 45}]}>{item.anio}</Text>
                                    <Text style={[styles.cell, {width: 100}]}>{item.nomestado || item.nommunicipio}</Text>
                                    <Text style={[styles.cell, {width: 110}]}>{item.nomcultivo}</Text>
                                    <Text style={[styles.cell, {width: 60, textAlign:'right', color: item.percSiniestro > 20 ? 'red' : '#444'}]}>{item.percSiniestro.toFixed(1)}%</Text>
                                    <Text style={[styles.cell, {width: 110, textAlign:'right', color: '#1565C0', fontWeight:'600'}]}>{formatMoney(item.valorproduccion)}</Text>
                                </View>
                            ))}
                        </View>
                    </ScrollView>
                </View>
            </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eceff1' },
  scroll: { padding: 18, paddingBottom: 60 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  subtitle: { fontSize: 13, color: '#666' },
  card: { backgroundColor: '#fff', borderRadius: 15, padding: 20, elevation: 4, zIndex: 100 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderRadius: 10, padding: 4, marginBottom: 15 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#fff', elevation: 2 },
  tabText: { fontSize: 11, color: '#78909C', fontWeight: 'bold' },
  tabTextActive: { color: '#2E7D32' },
  label: { fontSize: 12, fontWeight: 'bold', color: '#546e7a', marginBottom: 5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafafa', borderRadius: 10, borderWidth: 1, borderColor: '#cfd8dc' },
  input: { flex: 1, paddingHorizontal: 15, height: 45, fontSize: 14 },
  clearBtn: { padding: 10 },
  dropdownList: { position: 'absolute', top: 75, left: 0, right: 0, backgroundColor: 'white', borderRadius: 10, elevation: 20, zIndex: 10000, borderWidth: 1, borderColor: '#eceff1' },
  dropdownItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', flexDirection: 'row', justifyContent: 'space-between' },
  btnCloseMulti: { backgroundColor: '#2E7D32', padding: 10, margin: 5, borderRadius: 8 },
  row: { flexDirection: 'row' },
  btnConsultar: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  biContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  biCard: { backgroundColor: '#fff', width: '48%', borderRadius: 12, padding: 12, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#2E7D32' },
  biLabel: { fontSize: 9, fontWeight: 'bold', color: '#90A4AE' },
  biValue: { fontSize: 13, fontWeight: 'bold', color: '#2E7D32', marginVertical: 3 },
  biSub: { fontSize: 9, fontWeight: 'bold' },
  rankText: { fontSize: 9, color: '#455A64', marginTop: 2 },
  alertCard: { backgroundColor: '#d32f2f', borderRadius: 10, padding: 12, marginTop: 15 },
  alertTitle: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  alertMsg: { color: '#fff', fontSize: 10, marginTop: 3 },
  summaryCard: { backgroundColor: '#37474f', borderRadius: 12, padding: 15, marginTop: 15 },
  summaryTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { color: '#B0BEC5', fontSize: 10 },
  summaryValue: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  summaryValueMoney: { color: '#81C784', fontSize: 16, fontWeight: 'bold' },
  exportRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  btnExp: { flex: 0.48, flexDirection: 'row', padding: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  resultadosContainer: { marginTop: 15, backgroundColor: 'white', borderRadius: 12, padding: 10 },
  resTitle: { fontWeight: 'bold', fontSize: 14, marginBottom: 10 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 10 },
  tableHeader: { backgroundColor: '#455A64', borderRadius: 5 },
  cell: { fontSize: 10, paddingHorizontal: 5 }
});