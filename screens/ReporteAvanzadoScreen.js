import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, 
  Alert, ActivityIndicator, Platform 
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

// --- 2. COMPONENTE AUTOCOMPLETE ---
const FiltroAutocomplete = ({ label, valor, setValor, opciones = [], zIndex = 1, placeholder = "Seleccionar...", isMulti = false }) => {
    const [sugerencias, setSugerencias] = useState([]);
    const [showList, setShowList] = useState(false);

    const filtrar = (texto) => {
        if (isMulti) {
            const matches = opciones.filter(op => op && op.toString().toLowerCase().includes(texto.toLowerCase()));
            setSugerencias(matches);
            setShowList(true);
        } else {
            setValor(texto);
            if (texto.length > 0 && opciones.length > 0) {
                const matches = opciones.filter(op => op && op.toString().toLowerCase().includes(texto.toLowerCase()));
                setSugerencias([...new Set(matches)]);
                setShowList(true);
            } else {
                setShowList(false);
            }
        }
    };

    const seleccionar = (item) => {
        if (isMulti) {
            const nuevosValores = valor.includes(item) 
                ? valor.filter(v => v !== item) 
                : [...valor, item].sort((a,b) => b-a);
            setValor(nuevosValores);
        } else {
            setValor(item);
            setShowList(false);
        }
    };

    return (
        <View style={{ marginBottom: 15, zIndex: zIndex, position: 'relative' }}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputContainer}>
                <TextInput 
                    style={styles.input} 
                    value={isMulti ? valor.join(', ') : valor} 
                    onChangeText={filtrar}
                    placeholder={placeholder}
                    onFocus={() => { if(isMulti) { setSugerencias(opciones); setShowList(true); }}}
                />
                {valor.length > 0 && (
                    <TouchableOpacity onPress={() => { setValor(isMulti ? [] : ''); setShowList(false); }} style={styles.clearBtn}>
                        <MaterialCommunityIcons name="close-circle" size={20} color="#ccc" />
                    </TouchableOpacity>
                )}
            </View>
            {showList && sugerencias.length > 0 && (
                <View style={styles.dropdownList}>
                    <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="always" style={{maxHeight: 180}}>
                        {sugerencias.slice(0, 20).map((item, index) => (
                            <TouchableOpacity 
                                key={index} 
                                style={[styles.dropdownItem, isMulti && valor.includes(item) && {backgroundColor: '#e8f5e9'}]} 
                                onPress={() => seleccionar(item)}
                            >
                                <Text style={isMulti && valor.includes(item) ? {color: '#2E7D32', fontWeight: 'bold'} : {}}>{item}</Text>
                                {isMulti && valor.includes(item) && <MaterialCommunityIcons name="check" size={16} color="#2E7D32" />}
                            </TouchableOpacity>
                        ))}
                        {isMulti && (
                            <TouchableOpacity style={styles.btnCloseMulti} onPress={() => setShowList(false)}>
                                <Text style={{color: '#fff', textAlign: 'center', fontWeight: 'bold'}}>Confirmar Selección</Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

// --- 3. PANTALLA PRINCIPAL ---
export default function ReporteAvanzadoScreen() {
  const [filtros, setFiltros] = useState({ anio: ['2024'], cultivo: '', estado: '', municipio: '', ciclo: '', modalidad: '' });
  const [nivelDesglose, setNivelDesglose] = useState("Resumen por Cultivo");
  const [listaCultivos, setListaCultivos] = useState([]);
  const [listaMunicipios, setListaMunicipios] = useState([]);
  const [rawData, setRawData] = useState([]); 
  const [resultados, setResultados] = useState([]); 
  const [comparativa, setComparativa] = useState(null);
  const [proyeccion, setProyeccion] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarTabla, setMostrarTabla] = useState(false);
  const [alertasSiniestro, setAlertasSiniestro] = useState([]);

  const [totales, setTotales] = useState({ valor: 0, volumen: 0, sembrada: 0, cosechada: 0, siniestrada: 0 });

  useEffect(() => {
    const fetchCultivos = async () => {
        try {
            const { data, error } = await supabase.from('produccion_agricola').select('nomcultivo');
            if (!error && data) setListaCultivos([...new Set(data.map(item => item.nomcultivo))].sort());
        } catch (e) { console.log("Error cultivos", e); }
    };
    fetchCultivos();
  }, []);

  useEffect(() => {
    if (filtros.estado) {
        const fetchMunicipios = async () => {
            try {
                const { data, error } = await supabase.from('produccion_agricola').select('nommunicipio').ilike('nomestado', `%${filtros.estado}%`);
                if (!error && data) setListaMunicipios([...new Set(data.map(item => item.nommunicipio))].sort());
            } catch (e) { console.log("Error municipios", e); }
        };
        fetchMunicipios();
    }
  }, [filtros.estado]);

  const consultarBaseDatos = async () => {
    setCargando(true);
    setMostrarTabla(false);
    try {
      let query = supabase.from('produccion_agricola').select('*');
      if (filtros.anio.length > 0) query = query.in('anio', filtros.anio.map(a => parseInt(a)));
      if (filtros.cultivo) query = query.ilike('nomcultivo', `%${filtros.cultivo}%`);
      if (filtros.estado) query = query.ilike('nomestado', `%${filtros.estado}%`);
      if (filtros.municipio) query = query.ilike('nommunicipio', `%${filtros.municipio}%`);
      if (filtros.ciclo) query = query.ilike('nomcicloproductivo', `%${filtros.ciclo}%`);
      if (filtros.modalidad) query = query.ilike('nommodalidad', `%${filtros.modalidad}%`);
      
      const { data, error } = await query.limit(4000);
      if (error) throw error;

      if (!data || data.length === 0) {
        Alert.alert("Sin resultados", "No hay datos para esta selección.");
      } else {
        setRawData(data);
        procesarDatos(data, nivelDesglose);
        analizarBI(data);
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setCargando(false);
    }
  };

  const analizarBI = (data) => {
      const aniosS = [...filtros.anio].sort((a, b) => parseInt(a) - parseInt(b));
      const anioBase = parseInt(aniosS[0]);
      const anioActual = parseInt(aniosS[aniosS.length - 1]);
      const nAnios = aniosS.length;

      // 1. Lógica de Variación y Proyección Simple
      const getSum = (a) => data.filter(i => i.anio === a).reduce((ac, cv) => ({
          v: ac.v + (cv.valorproduccion || 0),
          s: ac.s + (cv.sembrada || 0)
      }), {v:0, s:0});

      const base = getSum(anioBase);
      const actual = getSum(anioActual);

      if (nAnios >= 2 && base.v > 0) {
          const cagr = (Math.pow(actual.v / base.v, 1 / (anioActual - anioBase)) - 1) * 100;
          setProyeccion({
              cagr: cagr,
              estimado: actual.v * (1 + (cagr / 100)),
              anioSiguiente: 2025
          });
          setComparativa({
              titulo: `Tendencia ${anioBase}-${anioActual}`,
              valor: ((actual.v - base.v) / base.v) * 100
          });
      }

      // 2. Ranking Top 5 (por Valor)
      const field = nivelDesglose.includes("Estado") ? 'nomestado' : 'nomcultivo';
      const groupedRanking = data.reduce((acc, item) => {
          const key = item[field];
          acc[key] = (acc[key] || 0) + item.valorproduccion;
          return acc;
      }, {});
      const sortedRanking = Object.entries(groupedRanking)
          .map(([name, val]) => ({ name, val }))
          .sort((a,b) => b.val - a.val)
          .slice(0, 5);
      setRanking(sortedRanking);

      // 3. Alertas de Siniestralidad Crítica (>20%)
      const siniestros = data.filter(i => (i.siniestrada / i.sembrada) > 0.2)
          .map(i => `${i.nommunicipio || i.nomestado}: ${((i.siniestrada/i.sembrada)*100).toFixed(1)}% daño`);
      setAlertasSiniestro(siniestros.slice(0, 3));
  };

  const procesarDatos = (data, nivel) => {
      const keyField = nivel === "Resumen por Estado" ? 'nomestado' : nivel === "Resumen por Cultivo" ? 'nomcultivo' : 'nommunicipio';
      const grouped = data.reduce((acc, item) => {
          const key = nivel === "Municipal (Detallado)" ? `${item.nommunicipio}-${item.anio}` : `${item[keyField]}-${item.anio}`;
          if (!acc[key]) {
              acc[key] = { ...item, sembrada: 0, cosechada: 0, siniestrada: 0, volumenproduccion: 0, valorproduccion: 0 };
          }
          acc[key].sembrada += (item.sembrada || 0);
          acc[key].cosechada += (item.cosechada || 0);
          acc[key].siniestrada += (item.siniestrada || 0);
          acc[key].volumenproduccion += (item.volumenproduccion || 0);
          acc[key].valorproduccion += (item.valorproduccion || 0);
          return acc;
      }, {});

      const final = Object.values(grouped).map(obj => ({
          ...obj,
          rendimiento: obj.cosechada > 0 ? (obj.volumenproduccion / obj.cosechada) : 0,
          percSiniestro: (obj.siniestrada / obj.sembrada) * 100
      })).sort((a, b) => b.anio - a.anio || b.valorproduccion - a.valorproduccion);

      setTotales(final.reduce((acc, item) => ({
          valor: acc.valor + item.valorproduccion,
          volumen: acc.volumen + item.volumenproduccion,
          sembrada: acc.sembrada + item.sembrada,
          siniestrada: acc.siniestrada + item.siniestrada
      }), { valor: 0, volumen: 0, sembrada: 0, siniestrada: 0 }));

      setResultados(final);
      setMostrarTabla(true);
  };

  const formatMoney = (a) => '$' + (a || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const formatNum = (n) => (n || 0).toLocaleString('es-MX', { maximumFractionDigits: 1 });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
        
        <View style={styles.header}>
          <MaterialCommunityIcons name="chart-areaspline" size={40} color="#2E7D32" />
          <Text style={styles.title}>SIACON Advanced BI</Text>
          <Text style={styles.subtitle}>Análisis de Tendencias y Proyecciones</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabContainer}>
              {NIVELES_DESGLOSE.map((tab) => (
                  <TouchableOpacity key={tab} style={[styles.tab, nivelDesglose === tab && styles.tabActive]} onPress={() => setNivelDesglose(tab)}>
                      <Text style={[styles.tabText, nivelDesglose === tab && styles.tabTextActive]}>{tab.split(" ")[0]}</Text>
                  </TouchableOpacity>
              ))}
          </View>
          
          <View style={[styles.row, { zIndex: 5000 }]}>
             <View style={{flex: 1, marginRight: 5}}><FiltroAutocomplete label="Años" valor={filtros.anio} setValor={(v) => setFiltros({...filtros, anio: v})} opciones={ANIOS} zIndex={5000} isMulti={true} /></View>
             <View style={{flex: 1, marginLeft: 5}}><FiltroAutocomplete label="Cultivo" valor={filtros.cultivo} setValor={(t) => setFiltros({...filtros, cultivo: t})} opciones={listaCultivos} zIndex={5000} placeholder="Todos" /></View>
          </View>

          <FiltroAutocomplete label="Estado" valor={filtros.estado} setValor={(t) => setFiltros({...filtros, estado: t})} opciones={ESTADOS_MX} zIndex={4000} />
          
          <TouchableOpacity style={styles.btnConsultar} onPress={consultarBaseDatos} disabled={cargando}>
            {cargando ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>EJECUTAR CONSULTA INTELIGENTE</Text>}
          </TouchableOpacity>
        </View>

        {mostrarTabla && (
            <View style={{ zIndex: -1 }}>
                
                {/* --- SECCIÓN BI: PROYECCIÓN Y RANKING --- */}
                <View style={styles.biContainer}>
                    {proyeccion && (
                        <View style={styles.biCard}>
                            <Text style={styles.biLabel}>PROYECCIÓN ESTIMADA {proyeccion.anioSiguiente}</Text>
                            <Text style={styles.biValue}>{formatMoney(proyeccion.estimado)}</Text>
                            <Text style={[styles.biSub, {color: proyeccion.cagr >= 0 ? '#4caf50' : '#f44336'}]}>
                                Tasa Crecimiento (CAGR): {proyeccion.cagr.toFixed(2)}%
                            </Text>
                        </View>
                    )}
                    {ranking.length > 0 && (
                        <View style={styles.biCard}>
                            <Text style={styles.biLabel}>TOP 5 POR VALOR</Text>
                            {ranking.map((item, idx) => (
                                <Text key={idx} style={styles.rankText} numberOfLines={1}>{idx+1}. {item.name} ({formatMoney(item.val)})</Text>
                            ))}
                        </View>
                    )}
                </View>

                {/* --- ALERTAS DE SINIESTRALIDAD --- */}
                {alertasSiniestro.length > 0 && (
                    <View style={styles.alertCard}>
                        <View style={styles.row}>
                            <MaterialCommunityIcons name="alert-decagram" size={20} color="#fff" />
                            <Text style={styles.alertTitle}>SINIESTRALIDAD CRÍTICA DETECTADA (+20%)</Text>
                        </View>
                        {alertasSiniestro.map((msg, i) => <Text key={i} style={styles.alertMsg}>• {msg}</Text>)}
                    </View>
                )}

                <View style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Valor Total</Text><Text style={styles.summaryValueMoney}>{formatMoney(totales.valor)}</Text></View>
                        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Superficie Siniestrada</Text><Text style={[styles.summaryValue, {color: '#ef5350'}]}>{formatNum(totales.siniestrada)} Ha</Text></View>
                    </View>
                </View>

                <View style={styles.resultadosContainer}>
                    <Text style={styles.resTitle}>GRID DE DATOS ANALÍTICOS</Text>
                    <ScrollView horizontal>
                        <View>
                            <View style={[styles.tableRow, styles.tableHeader]}>
                                <Text style={[styles.cell, {width: 45, color:'white'}]}>Año</Text>
                                <Text style={[styles.cell, {width: 100, color:'white'}]}>Entidad/Mpio</Text>
                                <Text style={[styles.cell, {width: 100, color:'white'}]}>Cultivo</Text>
                                <Text style={[styles.cell, {width: 70, color:'white', textAlign:'right'}]}>Sem(Ha)</Text>
                                <Text style={[styles.cell, {width: 60, color:'white', textAlign:'right'}]}>% Sin</Text>
                                <Text style={[styles.cell, {width: 80, color:'white', textAlign:'right'}]}>Vol(t)</Text>
                                <Text style={[styles.cell, {width: 100, color:'white', textAlign:'right'}]}>Valor ($)</Text>
                            </View>
                            {resultados.map((item, i) => (
                                <View key={i} style={[styles.tableRow, i % 2 === 0 ? {backgroundColor: '#f8f9fa'} : {}]}>
                                    <Text style={[styles.cell, {width: 45, fontWeight:'bold'}]}>{item.anio}</Text>
                                    <Text style={[styles.cell, {width: 100}]}>{item.nomestado || item.nommunicipio}</Text>
                                    <Text style={[styles.cell, {width: 100}]}>{item.nomcultivo}</Text>
                                    <Text style={[styles.cell, {width: 70, textAlign:'right'}]}>{formatNum(item.sembrada)}</Text>
                                    <Text style={[styles.cell, {width: 60, textAlign:'right', fontWeight:'bold', color: item.percSiniestro > 20 ? '#d32f2f' : '#333'}]}>
                                        {item.percSiniestro.toFixed(1)}%
                                    </Text>
                                    <Text style={[styles.cell, {width: 80, textAlign:'right'}]}>{formatNum(item.volumenproduccion)}</Text>
                                    <Text style={[styles.cell, {width: 100, textAlign:'right', color: '#1976D2', fontWeight:'600'}]}>{formatMoney(item.valorproduccion)}</Text>
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
  container: { flex: 1, backgroundColor: '#f0f4f7' },
  scroll: { padding: 15, paddingBottom: 60 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '900', color: '#1b5e20' },
  subtitle: { fontSize: 13, color: '#666' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, elevation: 5, zIndex: 10 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#eee', borderRadius: 12, padding: 4, marginBottom: 15 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#fff', elevation: 2 },
  tabText: { fontSize: 11, color: '#666', fontWeight: 'bold' },
  tabTextActive: { color: '#2E7D32' },
  label: { fontSize: 11, fontWeight: 'bold', color: '#444', marginBottom: 5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 10, borderWidth: 1, borderColor: '#ddd' },
  input: { flex: 1, paddingHorizontal: 12, height: 45, fontSize: 13 },
  clearBtn: { padding: 8 },
  dropdownList: { position: 'absolute', top: 75, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 12, elevation: 20, zIndex: 10000, borderWidth: 1, borderColor: '#ddd' },
  dropdownItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  btnCloseMulti: { backgroundColor: '#2E7D32', padding: 12, margin: 10, borderRadius: 10 },
  btnConsultar: { backgroundColor: '#1b5e20', padding: 16, borderRadius: 12, marginTop: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', letterSpacing: 1 },
  biContainer: { flexDirection: 'row', marginTop: 20, justifyContent: 'space-between' },
  biCard: { backgroundColor: '#fff', width: '48%', borderRadius: 15, padding: 12, elevation: 3, borderLeftWidth: 4, borderLeftColor: '#2E7D32' },
  biLabel: { fontSize: 9, fontWeight: 'bold', color: '#777', marginBottom: 5 },
  biValue: { fontSize: 14, fontWeight: 'bold', color: '#1b5e20' },
  biSub: { fontSize: 9, fontWeight: 'bold', marginTop: 4 },
  rankText: { fontSize: 10, color: '#444', marginTop: 3 },
  alertCard: { backgroundColor: '#d32f2f', borderRadius: 15, padding: 15, marginTop: 15, elevation: 4 },
  alertTitle: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 8 },
  alertMsg: { color: '#fff', fontSize: 10, marginTop: 4, marginLeft: 25 },
  summaryCard: { backgroundColor: '#263238', borderRadius: 15, padding: 15, marginTop: 15 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { color: '#90a4ae', fontSize: 10 },
  summaryValue: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  summaryValueMoney: { color: '#81C784', fontSize: 16, fontWeight: 'bold' },
  resultadosContainer: { marginTop: 15, backgroundColor: '#fff', borderRadius: 15, padding: 15 },
  resTitle: { fontWeight: 'bold', fontSize: 14, marginBottom: 10, color: '#333' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 12 },
  tableHeader: { backgroundColor: '#37474f', borderRadius: 8 },
  cell: { fontSize: 10.5, paddingHorizontal: 6, color: '#333' }
});