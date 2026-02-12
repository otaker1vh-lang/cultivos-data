import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, 
  Alert, ActivityIndicator, Keyboard 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '../src/services/supabaseClient'; 

// --- CONFIGURACIÓN DE DATOS ---
const ANIOS = Array.from({length: 11}, (_, i) => (2025 - i).toString());
const NIVELES_DESGLOSE = ["Municipal (Detallado)", "Resumen por Estado", "Resumen por Cultivo"];

const FiltroAutocomplete = ({ label, valor, setValor, opciones = [], zIndex = 1, isMulti = false }) => {
    const [sugerencias, setSugerencias] = useState([]);
    const [showList, setShowList] = useState(false);

    const filtrar = (texto) => {
        const matches = opciones.filter(op => op && op.toString().toLowerCase().includes(texto.toLowerCase()));
        setSugerencias(matches);
        setShowList(true);
        if (!isMulti) setValor(texto);
    };

    return (
        <View style={{ marginBottom: 15, zIndex: zIndex }}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputContainer}>
                <TextInput 
                    style={styles.input} 
                    value={isMulti ? valor.join(', ') : valor} 
                    onChangeText={filtrar}
                    placeholder="Seleccionar..."
                    onFocus={() => { setSugerencias(opciones); setShowList(true); }}
                />
                {valor.length > 0 && (
                    <TouchableOpacity onPress={() => { setValor(isMulti ? [] : ''); setShowList(false); }}>
                        <MaterialCommunityIcons name="close-circle" size={20} color="#ccc" />
                    </TouchableOpacity>
                )}
            </View>
            {showList && sugerencias.length > 0 && (
                <View style={styles.dropdownList}>
                    <ScrollView nestedScrollEnabled={true} style={{maxHeight: 150}}>
                        {sugerencias.slice(0, 30).map((item, index) => (
                            <TouchableOpacity 
                                key={index} 
                                style={[styles.dropdownItem, isMulti && valor.includes(item) && {backgroundColor: '#e8f5e9'}]} 
                                onPress={() => {
                                    if (isMulti) {
                                        const nuevos = valor.includes(item) ? valor.filter(v => v !== item) : [...valor, item];
                                        setValor(nuevos.sort((a,b) => b-a));
                                    } else {
                                        setValor(item);
                                        setShowList(false);
                                        Keyboard.dismiss();
                                    }
                                }}
                            >
                                <Text style={isMulti && valor.includes(item) ? {color: '#2E7D32', fontWeight: 'bold'} : {}}>{item}</Text>
                                {isMulti && valor.includes(item) && <MaterialCommunityIcons name="check" size={16} color="#2E7D32" />}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {isMulti && (
                        <TouchableOpacity style={styles.btnCloseDropdown} onPress={() => setShowList(false)}>
                            <Text style={styles.btnCloseText}>LISTO / CERRAR</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
};

export default function ReporteAvanzadoScreen() {
  const [filtros, setFiltros] = useState({ anio: ['2022'], cultivo: '', estado: '', municipio: '' });
  const [nivelDesglose, setNivelDesglose] = useState("Resumen por Cultivo");
  const [resultados, setResultados] = useState([]); 
  const [cargando, setCargando] = useState(false);
  const [biData, setBiData] = useState({ proyeccion: null, ranking: [], alertas: [] });
  const [totales, setTotales] = useState({ valor: 0, siniestrada: 0 });

  // Carga de cultivos única al inicio
  const [listaCultivos, setListaCultivos] = useState([]);
  useEffect(() => {
    (async () => {
        const { data } = await supabase.from('produccion_agricola').select('nomcultivo');
        if (data) setListaCultivos([...new Set(data.map(i => i.nomcultivo))].sort());
    })();
  }, []);

  const consultarBI = async () => {
    setCargando(true);
    Keyboard.dismiss();
    try {
      let query = supabase.from('produccion_agricola').select('*');
      
      // Ajuste para coincidir con la estructura del CSV (agri_2022)
      if (filtros.anio.length > 0) query = query.in('anio', filtros.anio.map(a => parseInt(a)));
      if (filtros.cultivo) query = query.ilike('nomcultivo', `%${filtros.cultivo}%`);
      if (filtros.estado) query = query.ilike('nomestado', `%${filtros.estado}%`);
      if (filtros.municipio) query = query.ilike('nommunicipio', `%${filtros.municipio}%`);

      const { data, error } = await query.limit(3000);
      if (error) throw error;
      if (!data || data.length === 0) return Alert.alert("Sin datos", "Intenta con otros filtros.");

      procesarBI(data);
    } catch (e) { Alert.alert("Error", e.message); }
    finally { setCargando(false); }
  };

  const procesarBI = (data) => {
    // 1. Agrupación por nivel de desglose
    const key = nivelDesglose === "Resumen por Estado" ? 'nomestado' : 'nomcultivo';
    const grouped = data.reduce((acc, item) => {
        const id = `${item[key]}-${item.anio}`;
        if (!acc[id]) acc[id] = { ...item, valorproduccion: 0, sembrada: 0, siniestrada: 0, volumenproduccion: 0 };
        acc[id].valorproduccion += (item.valorproduccion || 0);
        acc[id].sembrada += (item.sembrada || 0);
        acc[id].siniestrada += (item.siniestrada || 0);
        acc[id].volumenproduccion += (item.volumenproduccion || 0);
        return acc;
    }, {});

    const lista = Object.values(grouped).map(i => ({
        ...i,
        percSiniestro: (i.siniestrada / i.sembrada) * 100 || 0,
        rendimiento: i.cosechada > 0 ? (i.volumenproduccion / i.cosechada) : 0
    })).sort((a,b) => b.anio - a.anio || b.valorproduccion - a.valorproduccion);

    // 2. Cálculos de Inteligencia de Negocios
    const aniosS = [...filtros.anio].sort();
    let proy = null;
    if (aniosS.length >= 2) {
        const vBase = data.filter(i => i.anio == aniosS[0]).reduce((s, c) => s + c.valorproduccion, 0);
        const vAct = data.filter(i => i.anio == aniosS[aniosS.length-1]).reduce((s, c) => s + c.valorproduccion, 0);
        const cagr = (Math.pow(vAct / vBase, 1 / (aniosS[aniosS.length-1] - aniosS[0])) - 1) * 100;
        proy = { estimado: vAct * (1 + (cagr/100)), cagr };
    }

    const top5 = Object.values(lista.reduce((acc, i) => {
        acc[i[key]] = (acc[i[key]] || 0) + i.valorproduccion;
        return acc;
    }, {})).map((v, i, arr) => ({ name: Object.keys(arr)[i], val: v }))
       .sort((a,b) => b.val - a.val).slice(0, 5);

    setTotales({
        valor: lista.reduce((s, i) => s + i.valorproduccion, 0),
        siniestrada: lista.reduce((s, i) => s + i.siniestrada, 0)
    });
    setBiData({ proyeccion: proy, ranking: top5, alertas: lista.filter(i => i.percSiniestro > 20).slice(0,3) });
    setResultados(lista);
  };

  return (
    <View style={styles.container}>
      <ScrollView nestedScrollEnabled={true} contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.title}>SIACON - {nivelDesglose}</Text>
          
          <View style={styles.tabContainer}>
              {NIVELES_DESGLOSE.map(t => (
                  <TouchableOpacity key={t} style={[styles.tab, nivelDesglose===t && styles.tabActive]} onPress={() => setNivelDesglose(t)}>
                      <Text style={[styles.tabText, nivelDesglose===t && {color:'#2E7D32'}]}>{t.split(" ")[2] || "Mpal"}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          <FiltroAutocomplete label="Año(s)" valor={filtros.anio} setValor={v => setFiltros({...filtros, anio: v})} opciones={ANIOS} zIndex={5000} isMulti={true} />
          <FiltroAutocomplete label="Cultivo" valor={filtros.cultivo} setValor={v => setFiltros({...filtros, cultivo: v})} opciones={listaCultivos} zIndex={4000} />
          <FiltroAutocomplete label="Estado" valor={filtros.estado} setValor={v => setFiltros({...filtros, estado: v})} opciones={["Sinaloa", "Sonora", "Jalisco"]} zIndex={3000} />

          <TouchableOpacity style={styles.btnMain} onPress={consultarBI} disabled={cargando}>
              {cargando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ANALIZAR DATOS</Text>}
          </TouchableOpacity>
        </View>

        {resultados.length > 0 && (
            <View>
                {/* Panel de BI */}
                <View style={styles.rowBI}>
                    {biData.proyeccion && (
                        <View style={styles.biCard}>
                            <Text style={styles.biTitle}>PROYECCIÓN</Text>
                            <Text style={styles.biValue}>${(biData.proyeccion.estimado/1e6).toFixed(1)}M</Text>
                            <Text style={{fontSize:10, color: biData.proyeccion.cagr > 0 ? 'green' : 'red'}}>CAGR: {biData.proyeccion.cagr.toFixed(1)}%</Text>
                        </View>
                    )}
                    <View style={styles.biCard}>
                        <Text style={styles.biTitle}>VALOR TOTAL</Text>
                        <Text style={styles.biValue}>${(totales.valor/1e6).toFixed(1)}M</Text>
                    </View>
                </View>

                {/* Grid de Resultados */}
                <ScrollView horizontal style={styles.gridContainer}>
                    <View>
                        <View style={styles.tableHeader}>
                            <Text style={[styles.cell, {width:50, color:'#fff'}]}>Año</Text>
                            <Text style={[styles.cell, {width:120, color:'#fff'}]}>Nombre</Text>
                            <Text style={[styles.cell, {width:80, color:'#fff'}]}>Valor ($)</Text>
                            <Text style={[styles.cell, {width:60, color:'#fff'}]}>% Sin</Text>
                        </View>
                        {resultados.map((item, i) => (
                            <View key={i} style={styles.tableRow}>
                                <Text style={[styles.cell, {width:50}]}>{item.anio}</Text>
                                <Text style={[styles.cell, {width:120}]}>{item.nomcultivo || item.nomestado}</Text>
                                <Text style={[styles.cell, {width:80}]}>${(item.valorproduccion/1e6).toFixed(1)}M</Text>
                                <Text style={[styles.cell, {width:60, color: item.percSiniestro > 20 ? 'red' : '#333'}]}>{item.percSiniestro.toFixed(1)}%</Text>
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scroll: { padding: 15 },
  card: { backgroundColor: '#fff', borderRadius: 15, padding: 20, elevation: 4, zIndex: 10 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#2E7D32', marginBottom: 15, textAlign: 'center' },
  label: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', paddingRight: 10 },
  input: { flex: 1, padding: 12, fontSize: 14 },
  dropdownList: { position: 'absolute', top: 75, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 10, elevation: 10, zIndex: 10000, borderWidth: 1, borderColor: '#eee' },
  dropdownItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  btnCloseDropdown: { backgroundColor: '#2E7D32', padding: 10, alignItems: 'center', borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  btnCloseText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  tabContainer: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#eee', borderRadius: 10, padding: 3 },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#fff', elevation: 2 },
  tabText: { fontSize: 11, fontWeight: 'bold', color: '#888' },
  btnMain: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  rowBI: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  biCard: { backgroundColor: '#fff', width: '48%', borderRadius: 12, padding: 15, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#2E7D32' },
  biTitle: { fontSize: 10, color: '#888', fontWeight: 'bold' },
  biValue: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  gridContainer: { marginTop: 15, backgroundColor: '#fff', borderRadius: 12, padding: 10 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#333', padding: 10, borderRadius: 8 },
  tableRow: { flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  cell: { fontSize: 11 }
});