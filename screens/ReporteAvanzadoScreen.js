import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, 
  Alert, ActivityIndicator, Keyboard, Platform, FlatList
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system'; 
import { supabase } from '../src/services/supabaseClient'; 

// --- 1. DATOS ESTÁTICOS ---
const ESTADOS_MX = [
  "Nacional", // <- Opción Nacional Agregada
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

// --- 2. COMPONENTE AUTOCOMPLETE ---
// --- 2. COMPONENTE AUTOCOMPLETE ---
const FiltroAutocomplete = ({ 
    label, valor, setValor, opciones = [], zIndex = 1, 
    placeholder = "Seleccionar...", isMulti = false,
    openMenu, setOpenMenu, id 
}) => {
    const [busqueda, setBusqueda] = useState('');
    const isOpen = openMenu === id;

    // 🚨 FIX: Rendimiento - Eliminamos estado duplicado, usamos useMemo para búsqueda ultrarrápida
    const sugerencias = React.useMemo(() => {
        if (!busqueda) return opciones;
        const query = busqueda.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return opciones.filter(op => 
            op && op.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(query)
        );
    }, [busqueda, opciones]);

    const filtrar = (texto) => {
        setBusqueda(texto);
        setOpenMenu(id);
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
        <View style={[styles.filterWrapper, { zIndex: isOpen ? 1000 : zIndex }]}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputContainer}>
                <TextInput 
                    style={styles.input} 
                    value={isOpen ? busqueda : (isMulti ? valor.join(', ') : valor)} 
                    onChangeText={filtrar}
                    placeholder={placeholder}
                    placeholderTextColor="#999"
                    onFocus={() => setOpenMenu(id)}
                />
                {(isMulti ? valor.length > 0 : valor !== '') && (
                    <TouchableOpacity 
                        onPress={() => { setValor(isMulti ? [] : ''); setOpenMenu(null); }} 
                        style={styles.clearBtn}
                    >
                        <MaterialCommunityIcons name="close-circle" size={20} color="#ccc" />
                    </TouchableOpacity>
                )}
            </View>
            
            {isOpen && (
                <View style={styles.dropdownList}>
                    <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="always" style={{maxHeight: 280}}>
                        {sugerencias.length > 0 ? (
                            sugerencias.map((item, index) => (
                                <TouchableOpacity 
                                    key={index} 
                                    style={[styles.dropdownItem, isMulti && valor.includes(item) && {backgroundColor: '#e8f5e9'}]} 
                                    onPress={() => seleccionar(item)}
                                >
                                    <Text style={[styles.itemText, isMulti && valor.includes(item) && styles.itemTextActive]}>
                                        {item}
                                    </Text>
                                    {isMulti && valor.includes(item) && <MaterialCommunityIcons name="check" size={18} color="#2E7D32" />}
                                </TouchableOpacity>
                            ))
                        ) : (
                            <Text style={styles.noResults}>Sin resultados</Text>
                        )}
                    </ScrollView>
                    {isMulti && (
                        <TouchableOpacity style={styles.btnCloseMulti} onPress={() => setOpenMenu(null)}>
                            <Text style={styles.btnCloseText}>CONFIRMAR ({valor.length})</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
};

// --- 3. PANTALLA PRINCIPAL ---
export default function ReporteAvanzadoScreen() {
  const [openMenu, setOpenMenu] = useState(null);
  const [filtros, setFiltros] = useState({
    anio: ['2025'], 
    cultivo: [],
    estado: [], 
    municipio: [],
    ciclo: [], 
    modalidad: [], 
  });

  const [metricasSeleccionadas, setMetricasSeleccionadas] = useState(['valor', 'volumen', 'sembrada']);
  const [nivelDesglose, setNivelDesglose] = useState("Por Cultivo");
  
  // --- NUEVOS ESTADOS DE ORDENAMIENTO ---
  const [ordenCriterio, setOrdenCriterio] = useState('Entidad');
  const [ordenDireccion, setOrdenDireccion] = useState('Ascendente');

  const [listaCultivos, setListaCultivos] = useState([]);
  const [listaMunicipios, setListaMunicipios] = useState([]);
  const [resultados, setResultados] = useState([]); 
  const [resumenGeneral, setResumenGeneral] = useState({ val: 0, vol: 0, sem: 0, cos: 0 });
  const [variacionesMultiples, setVariacionesMultiples] = useState([]);
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
    const estadosFiltrados = filtros.estado.filter(e => e !== 'Nacional');
    if (estadosFiltrados.length > 0) {
        const fetchMunicipios = async () => {
            const { data } = await supabase.from('produccion_agricola').select('nommunicipio').in('nomestado', estadosFiltrados);
            if (data) setListaMunicipios([...new Set(data.map(item => item.nommunicipio))].sort());
        };
        fetchMunicipios();
    } else {
        setListaMunicipios([]);
        setFiltros(prev => ({ ...prev, municipio: [] }));
    }
  }, [filtros.estado]);

  const toggleMetrica = (id) => {
    setMetricasSeleccionadas(prev => {
        const isSelected = prev.includes(id);
        const newSelected = isSelected ? prev.filter(m => m !== id) : [...prev, id];
        
        // Resetear el ordenamiento si se deselecciona la métrica que estaba ordenando
        if (isSelected) {
            const metricaRemovida = METRICAS_DISPONIBLES.find(m => m.id === id);
            if (ordenCriterio === metricaRemovida.label) {
                setOrdenCriterio('Entidad');
            }
        }
        return newSelected;
    });
  };

  const consultarBaseDatos = async () => {
    if (metricasSeleccionadas.length === 0) return Alert.alert("Error", "Selecciona al menos una métrica.");
    setCargando(true);
    setMostrarTabla(false);
    setOpenMenu(null);

    try {
      const estadosReales = filtros.estado.filter(e => e !== 'Nacional');
      
      const promesasConsulta = filtros.anio.map(async (anioFiltro) => {
          let query = supabase.from('produccion_agricola').select('*');
          
          query = query.eq('anio', parseInt(anioFiltro));

          if (filtros.cultivo.length > 0) query = query.in('nomcultivo', filtros.cultivo);
          
          if (filtros.estado.length > 0 && !filtros.estado.includes('Nacional')) {
              query = query.in('nomestado', estadosReales);
          }

          if (filtros.municipio.length > 0) query = query.in('nommunicipio', filtros.municipio);
          if (filtros.ciclo.length > 0) query = query.in('nomcicloproductivo', filtros.ciclo);
          if (filtros.modalidad.length > 0) query = query.in('nommodalidad', filtros.modalidad);
          
          const { data, error } = await query.limit(50000); 
          if (error) throw error;
          return data || [];
      });

      const resultadosPorAnio = await Promise.all(promesasConsulta);
      const dataFinalCombinada = resultadosPorAnio.flat();

      if (!dataFinalCombinada || dataFinalCombinada.length === 0) {
        Alert.alert("Aviso", "No hay datos para esta consulta.");
        setCargando(false);
      } else {
        setTimeout(() => {
            try {
                procesarTodo(dataFinalCombinada);
            } catch (e) {
                Alert.alert("Error analítico", "Hubo un fallo procesando las métricas.");
            } finally {
                setCargando(false);
            }
        }, 100);
      }
    } catch (error) {
      Alert.alert("Error", error.message);
      setCargando(false);
    }
  };

  const procesarTodo = (data) => {
    const keyField = nivelDesglose === "Estatal" ? 'nomestado' : 
                     nivelDesglose === "Por Cultivo" ? 'nomcultivo' : 'nommunicipio';

    const totals = { val: 0, vol: 0, sem: 0, cos: 0 };
    const grouped = {};

    const initGroup = (id, entity, anio) => {
        grouped[id] = { 
            descripcion: entity,
            anio: anio,
            valorproduccion: 0, sembrada: 0, siniestrada: 0, 
            volumenproduccion: 0, cosechada: 0, sumPrecio: 0, 
            sumPrecioPonderado: 0, counter: 0 // <- Añadido para cálculo matemático real
        };
    };

    const addDataToId = (id, item) => {
        grouped[id].valorproduccion += (item.valorproduccion || 0);
        grouped[id].sembrada += (item.sembrada || 0);
        grouped[id].siniestrada += (item.siniestrada || 0);
        grouped[id].volumenproduccion += (item.volumenproduccion || 0);
        grouped[id].cosechada += (item.cosechada || 0);
        grouped[id].sumPrecio += (item.preciomediorural || 0);
        // <- Calculamos el peso del precio según el volumen aportado
        grouped[id].sumPrecioPonderado += ((item.preciomediorural || 0) * (item.volumenproduccion || 0));
        grouped[id].counter++;
    };

    data.forEach(item => {
        const year = item.anio;
        
        // <- Prevenir colisión de nombres de municipios entre diferentes estados
        let entity = item[keyField] || "N/A";
        if (nivelDesglose === "Municipal" && item.nommunicipio && item.nomestado) {
            entity = `${item.nommunicipio}, ${item.nomestado}`;
        }

        let renderNormalRow = true;
        const esNacionalVsEstatal = (nivelDesglose === "Estatal" && filtros.estado.includes("Nacional"));
        const estadosReales = filtros.estado.filter(e => e !== "Nacional");

        if (filtros.estado.length > 0) {
            if (esNacionalVsEstatal) {
                renderNormalRow = estadosReales.length > 0 && estadosReales.includes(item.nomestado);
            } else {
                if (filtros.estado.includes("Nacional")) {
                    renderNormalRow = true; 
                } else {
                    renderNormalRow = estadosReales.includes(item.nomestado);
                }
            }
        }

        if (renderNormalRow) {
            const id = `${entity}-${year}`;
            if (!grouped[id]) initGroup(id, entity, year);
            addDataToId(id, item);
        }

        if (esNacionalVsEstatal) {
            const idNac = `Nacional-${year}`;
            if (!grouped[idNac]) initGroup(idNac, "Nacional", year);
            addDataToId(idNac, item);
        }

        totals.val += item.valorproduccion || 0;
        totals.vol += item.volumenproduccion || 0;
        totals.sem += item.sembrada || 0;
        totals.cos += item.cosechada || 0;
    });

    let listaFinal = Object.values(grouped).map(i => ({
        ...i,
        rendimiento: i.cosechada > 0 ? (i.volumenproduccion / i.cosechada) : 0,
        // <- Ahora la tabla mostrará el precio rural ponderado correctamente para múltiples cultivos/estados
        preciomediorural: i.volumenproduccion > 0 ? (i.sumPrecioPonderado / i.volumenproduccion) : (i.sumPrecio / i.counter),
    }));
    
    // Orden temporal por entidad y año descendente para calcular las variaciones correctamente
    listaFinal.sort((a,b) => a.descripcion.localeCompare(b.descripcion) || b.anio - a.anio);

    listaFinal = listaFinal.map((curr, idx, arr) => {
        // En lugar de buscar "curr.anio - 1", buscamos el registro cronológicamente anterior 
        // disponible en la selección actual (item.anio < curr.anio).
        const prev = arr.find(item => item.descripcion === curr.descripcion && item.anio < curr.anio);
        
        const variaciones = {};
        
        metricasSeleccionadas.forEach(mId => {
            const mRef = METRICAS_DISPONIBLES.find(x => x.id === mId);
            const key = mRef.key;
            
            // Validamos que exista un dato previo y sea mayor a 0 para evitar divisiones por cero
            if (prev && prev[key] > 0) {
                variaciones[`var_${mId}`] = ((curr[key] - prev[key]) / prev[key]) * 100;
            } else {
                variaciones[`var_${mId}`] = null;
            }
        });
        return { ...curr, ...variaciones };
    });

    if (filtros.anio.length > 1) {
        const aniosS = [...filtros.anio].map(Number).sort((a, b) => a - b);
        const anioIni = aniosS[0];
        const anioFin = aniosS[aniosS.length - 1];
        
        const nuevasVariaciones = metricasSeleccionadas.map(mId => {
            const metricaRef = METRICAS_DISPONIBLES.find(x => x.id === mId);
            const getT = (anioBusqueda) => {
                const f = listaFinal.filter(d => 
                    d.anio === anioBusqueda && 
                    !(nivelDesglose === "Estatal" && d.descripcion === "Nacional")
                );
                
                return {
                    v: f.reduce((s, c) => s + (c[metricaRef.key] || 0), 0),
                    vol: f.reduce((s, c) => s + (c.volumenproduccion || 0), 0),
                    cos: f.reduce((s, c) => s + (c.cosechada || 0), 0),
                    // <- Necesitamos el precio total ponderado del año para comparar
                    sumPrecioPonderadoTotal: f.reduce((s, c) => s + ((c.preciomediorural || 0) * (c.volumenproduccion || 0)), 0)
                };
            };
            const t1 = getT(anioIni);
            const t2 = getT(anioFin);
            let v1, v2;
            
            if (mId === 'rendimiento') {
                v1 = t1.cos > 0 ? (t1.vol / t1.cos) : 0;
                v2 = t2.cos > 0 ? (t2.vol / t2.cos) : 0;
            } else if (mId === 'precio') {
                // <- Nueva lógica aislada para que la variación del Precio Rural global sea real
                v1 = t1.vol > 0 ? (t1.sumPrecioPonderadoTotal / t1.vol) : 0;
                v2 = t2.vol > 0 ? (t2.sumPrecioPonderadoTotal / t2.vol) : 0;
            } else {
                v1 = t1.v; 
                v2 = t2.v;
            }
            
            return { label: metricaRef.label, p: v1 > 0 ? ((v2 - v1) / v1) * 100 : 0, i: anioIni, f: anioFin };
        });
        setVariacionesMultiples(nuevasVariaciones);
    } else {
        setVariacionesMultiples([]);
    }

    setResumenGeneral(totals);
    setResultados(listaFinal);
    setMostrarTabla(true);
  };

  const formatMoney = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX');
  const formatNum = (n) => (n || 0).toLocaleString('es-MX', { maximumFractionDigits: 1 });

  // --- LÓGICA DE ORDENAMIENTO EN TIEMPO REAL ---
  const opcionesOrden = ['Entidad', 'Año', ...metricasSeleccionadas.map(m => METRICAS_DISPONIBLES.find(x => x.id === m).label)];
  
  const datosOrdenados = React.useMemo(() => {
    return [...resultados].sort((a, b) => {
        let valA, valB;
        if (ordenCriterio === 'Entidad') {
            valA = a.descripcion; valB = b.descripcion;
        } else if (ordenCriterio === 'Año') {
            valA = a.anio; valB = b.anio;
        } else {
            const metrica = METRICAS_DISPONIBLES.find(m => m.label === ordenCriterio);
            if (metrica) {
                valA = a[metrica.key]; valB = b[metrica.key];
            } else {
                valA = a.descripcion; valB = b.descripcion;
            }
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            return ordenDireccion === 'Ascendente' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        if (valA < valB) return ordenDireccion === 'Ascendente' ? -1 : 1;
        if (valA > valB) return ordenDireccion === 'Ascendente' ? 1 : -1;
        return 0;
    });
  }, [resultados, ordenCriterio, ordenDireccion]);

  const handlePDF = async () => {
    const html = `<html><body style="font-family:sans-serif; padding: 20px;">
      <h2 style="color:#2E7D32;">Reporte SIACON - Desglose ${nivelDesglose}</h2>
      <p>Periodo: ${filtros.anio.join(', ')}</p>
      <table style="width:100%; border-collapse:collapse; font-size:10px;">
        <tr style="background:#455A64; color:white;">
          <th style="padding:5px; border:1px solid #ccc;">${nivelDesglose}</th>
          <th style="padding:5px; border:1px solid #ccc;">Año</th>
          ${metricasSeleccionadas.map(m => `
            <th style="padding:5px; border:1px solid #ccc;">${METRICAS_DISPONIBLES.find(x=>x.id===m).label}</th>
            <th style="padding:5px; border:1px solid #ccc; color:#81C784;">Var %</th>
          `).join('')}
        </tr>
        ${datosOrdenados.map(r => `<tr>
          <td style="padding:5px; border:1px solid #ccc;">${r.descripcion}</td>
          <td style="padding:5px; border:1px solid #ccc;">${r.anio}</td>
          ${metricasSeleccionadas.map(m => {
              const key = METRICAS_DISPONIBLES.find(x=>x.id===m).key;
              const v = r[`var_${m}`];
              return `
                <td style="padding:5px; border:1px solid #ccc; text-align:right;">${formatNum(r[key])}</td>
                <td style="padding:5px; border:1px solid #ccc; text-align:right;">${v !== null ? v.toFixed(1)+'%' : '-'}</td>
              `;
          }).join('')}
        </tr>`).join('')}
      </table>
    </body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  const handleExcel = async () => {
    let csv = `${nivelDesglose},Año,${metricasSeleccionadas.map(m => `${METRICAS_DISPONIBLES.find(x=>x.id===m).label},Variación %`).join(',')}\n`;
    datosOrdenados.forEach(r => {
        let fila = `"${r.descripcion}",${r.anio}`;
        metricasSeleccionadas.forEach(m => {
            const key = METRICAS_DISPONIBLES.find(x=>x.id===m).key;
            const v = r[`var_${m}`];
            fila += `,${r[key]},${v !== null ? v.toFixed(2) : ''}`;
        });
        csv += fila + `\n`;
    });
    const uri = FileSystem.cacheDirectory + "Reporte_SIACON_BI.csv";
    await FileSystem.writeAsStringAsync(uri, csv, { encoding: 'utf8' });
    await Sharing.shareAsync(uri);
  };

  const renderCabeceraTabla = () => (
    <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.cellHeader, {width: 130}]}>{nivelDesglose}</Text>
        <Text style={[styles.cellHeader, {width: 50}]}>Año</Text>
        {metricasSeleccionadas.map(mId => (
            <React.Fragment key={mId}>
                <Text style={[styles.cellHeader, {width: 100, textAlign: 'right'}]}>
                  {METRICAS_DISPONIBLES.find(m => m.id === mId).label}
                </Text>
                <Text style={[styles.cellHeader, {width: 70, textAlign: 'right', color: '#81C784'}]}>Var %</Text>
            </React.Fragment>
        ))}
    </View>
  );

  const renderFilaTabla = ({ item, index }) => (
    <View style={[styles.tableRow, {backgroundColor: index % 2 === 0 ? '#fff' : '#f9f9f9'}]}>
        <Text style={[styles.cell, {width: 130}]} numberOfLines={1}>{item.descripcion}</Text>
        <Text style={[styles.cell, {width: 50}]}>{item.anio}</Text>
        {metricasSeleccionadas.map(mId => {
            const key = METRICAS_DISPONIBLES.find(m => m.id === mId).key;
            const varVal = item[`var_${mId}`];
            return (
                <React.Fragment key={mId}>
                    <Text style={[styles.cell, {width: 100, textAlign: 'right'}]}>
                        {mId === 'valor' || mId === 'precio' ? formatMoney(item[key]) : formatNum(item[key])}
                    </Text>
                    <Text style={[styles.cell, {width: 70, textAlign: 'right', fontWeight: 'bold', color: varVal >= 0 ? '#2E7D32' : '#D32F2F'}]}>
                        {varVal !== null ? `${varVal > 0 ? '+' : ''}${varVal.toFixed(1)}%` : '-'}
                    </Text>
                </React.Fragment>
            );
        })}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
            <MaterialCommunityIcons name="finance" size={40} color="#2E7D32" />
            <Text style={styles.title}>SIACON BI</Text>
            <Text style={styles.subtitle}>Análisis Multianual y Territorial</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Configuración de Análisis</Text>
          <View style={styles.tabContainer}>
              {NIVELES_DESGLOSE.map((tab) => (
                  <TouchableOpacity key={tab} style={[styles.tab, nivelDesglose === tab && styles.tabActive]} onPress={() => setNivelDesglose(tab)}>
                      <Text style={[styles.tabText, nivelDesglose === tab && styles.tabTextActive]}>{tab}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          <View style={styles.row}>
             <View style={{flex: 1, marginRight: 5}}>
                <FiltroAutocomplete id="anio" label="Años" valor={filtros.anio} setValor={(v) => setFiltros({...filtros, anio: v})} opciones={ANIOS} isMulti={true} zIndex={100} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
             <View style={{flex: 1.2, marginLeft: 5}}>
                <FiltroAutocomplete id="cultivo" label="Cultivo" valor={filtros.cultivo} setValor={(v) => setFiltros({...filtros, cultivo: v})} opciones={listaCultivos} isMulti={true} zIndex={100} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
          </View>

          <FiltroAutocomplete id="estado" label="Estado(s)" valor={filtros.estado} setValor={(v) => setFiltros({...filtros, estado: v})} opciones={ESTADOS_MX} isMulti={true} zIndex={90} openMenu={openMenu} setOpenMenu={setOpenMenu} />
          <FiltroAutocomplete id="municipio" label="Municipio(s)" valor={filtros.municipio} setValor={(t) => setFiltros({...filtros, municipio: t})} opciones={listaMunicipios} isMulti={true} zIndex={80} openMenu={openMenu} setOpenMenu={setOpenMenu} />
          
          <View style={styles.row}>
             <View style={{flex: 1, marginRight: 5}}>
                <FiltroAutocomplete id="ciclo" label="Ciclo" valor={filtros.ciclo} setValor={(v) => setFiltros({...filtros, ciclo: v})} opciones={CICLOS} isMulti={true} zIndex={70} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
             <View style={{flex: 1, marginLeft: 5}}>
                <FiltroAutocomplete id="modalidad" label="Modalidad" valor={filtros.modalidad} setValor={(v) => setFiltros({...filtros, modalidad: v})} opciones={MODALIDADES} isMulti={true} zIndex={70} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
          </View>

          <Text style={styles.sectionTitle}>2. Variables</Text>
          <View style={styles.metricsGrid}>
            {METRICAS_DISPONIBLES.map(m => (
                <TouchableOpacity key={m.id} style={[styles.metricChip, metricasSeleccionadas.includes(m.id) && styles.metricChipActive]} onPress={() => toggleMetrica(m.id)}>
                    <Text style={[styles.metricChipText, metricasSeleccionadas.includes(m.id) && styles.metricChipTextActive]}>{m.label}</Text>
                </TouchableOpacity>
            ))}
          </View>

          {/* MENÚS DE ORDENAMIENTO DE DATOS */}
          <Text style={styles.sectionTitle}>3. Ordenar Resultados</Text>
          <View style={styles.row}>
             <View style={{flex: 1, marginRight: 5}}>
                <FiltroAutocomplete id="ordenCriterio" label="Ordenar por" valor={ordenCriterio} setValor={setOrdenCriterio} opciones={opcionesOrden} zIndex={60} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
             <View style={{flex: 1, marginLeft: 5}}>
                <FiltroAutocomplete id="ordenDireccion" label="Dirección" valor={ordenDireccion} setValor={setOrdenDireccion} opciones={['Ascendente', 'Descendente']} zIndex={60} openMenu={openMenu} setOpenMenu={setOpenMenu} />
             </View>
          </View>
          <View style={{marginBottom: 15}}></View>

          <TouchableOpacity style={styles.btnConsultar} onPress={consultarBaseDatos} disabled={cargando}>
            {cargando ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>GENERAR REPORTE</Text>}
          </TouchableOpacity>
        </View>

        {mostrarTabla && (
            <View style={{ marginTop: 20 }}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Resumen Ejecutivo</Text>
                    
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>VALOR TOTAL</Text><Text style={styles.summaryValueMoney}>{formatMoney(resumenGeneral.val)}</Text></View>
                        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>SUP. SEMBRADA</Text><Text style={styles.summaryValue}>{formatNum(resumenGeneral.sem)} Ha</Text></View>
                    </View>

                    {variacionesMultiples.length > 0 && (
                        <View style={styles.multiVarContainer}>
                            <Text style={styles.multiVarTitle}>Variación Periodo ({variacionesMultiples[0].i}-{variacionesMultiples[0].f}):</Text>
                            <View style={styles.varGrid}>
                                {variacionesMultiples.map((v, idx) => (
                                    <View key={idx} style={styles.varChip}>
                                        <Text style={styles.varChipLabel}>{v.label}: </Text>
                                        <Text style={[styles.varChipValue, {color: v.p >= 0 ? '#81C784' : '#ff8a80'}]}>{v.p > 0 ? '+' : ''}{v.p.toFixed(1)}%</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </View>

                <View style={styles.exportRow}>
                    <TouchableOpacity style={[styles.btnExp, {backgroundColor:'#D32F2F'}]} onPress={handlePDF}>
                        <MaterialCommunityIcons name="file-pdf-box" size={20} color="#fff" />
                        <Text style={styles.btnExpText}>PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnExp, {backgroundColor:'#1b5e20'}]} onPress={handleExcel}>
                        <MaterialCommunityIcons name="microsoft-excel" size={20} color="#fff" />
                        <Text style={styles.btnExpText}>EXCEL</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView horizontal style={styles.tableScroll}>
                    <View>
                        {renderCabeceraTabla()}
                        <View style={{ maxHeight: 400 }}> 
                            <FlatList
                                data={datosOrdenados}
                                keyExtractor={(item, index) => `${item.descripcion}-${item.anio}-${index}`}
                                renderItem={renderFilaTabla}
                                nestedScrollEnabled={true}
                                initialNumToRender={15}
                                maxToRenderPerBatch={15}
                                windowSize={5}
                                removeClippedSubviews={Platform.OS === 'ios'}
                                ListEmptyComponent={<Text style={{padding: 20, textAlign: 'center'}}>No hay datos para mostrar</Text>}
                            />
                        </View>
                    </View>
                </ScrollView>

            </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eceff1' },
  scroll: { padding: 15, paddingBottom: 100 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2E7D32' },
  subtitle: { fontSize: 13, color: '#666' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 4, zIndex: 100 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#455A64', marginVertical: 12 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderRadius: 10, padding: 4, marginBottom: 15 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#fff', elevation: 2 },
  tabText: { fontSize: 11, color: '#90a4ae', fontWeight: 'bold' },
  tabTextActive: { color: '#2E7D32' },
  filterWrapper: { marginBottom: 15, position: 'relative' },
  label: { fontSize: 11, fontWeight: 'bold', color: '#546e7a', marginBottom: 5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafafa', borderRadius: 10, borderWidth: 1, borderColor: '#cfd8dc' },
  input: { flex: 1, paddingHorizontal: 15, height: 45, fontSize: 14, color: '#333' },
  clearBtn: { padding: 10 },
  dropdownList: { position: 'absolute', top: 70, left: 0, right: 0, backgroundColor: 'white', borderRadius: 10, elevation: 20, zIndex: 2000, borderWidth: 1, borderColor: '#cfd8dc' },
  dropdownItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', flexDirection: 'row', justifyContent: 'space-between' },
  itemText: { fontSize: 14 },
  itemTextActive: { color: '#2E7D32', fontWeight: 'bold' },
  noResults: { padding: 15, color: '#999', textAlign: 'center' },
  btnCloseMulti: { backgroundColor: '#2E7D32', padding: 12, margin: 8, borderRadius: 8 },
  btnCloseText: { color: '#fff', textAlign: 'center', fontWeight: 'bold' },
  row: { flexDirection: 'row' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 15 },
  metricChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#cfd8dc' },
  metricChipActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  metricChipText: { fontSize: 10, color: '#546e7a' },
  metricChipTextActive: { color: '#fff', fontWeight: 'bold' },
  btnConsultar: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  summaryCard: { backgroundColor: '#37474f', borderRadius: 15, padding: 18, marginBottom: 15 },
  summaryTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryItem: { flex: 1 },
  summaryLabel: { color: '#90a4ae', fontSize: 9, fontWeight: 'bold' },
  summaryValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  summaryValueMoney: { color: '#81C784', fontSize: 18, fontWeight: 'bold' },
  multiVarContainer: { marginTop: 15, paddingTop: 10, borderTopWidth: 0.5, borderColor: '#546e7a' },
  multiVarTitle: { color: '#cfd8dc', fontSize: 11, fontWeight: 'bold', marginBottom: 8 },
  varGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  varChip: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, flexDirection: 'row' },
  varChipLabel: { color: '#90a4ae', fontSize: 10 },
  varChipValue: { fontSize: 10, fontWeight: 'bold' },
  exportRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  btnExp: { flex: 0.48, flexDirection: 'row', padding: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  btnExpText: { color: '#fff', fontWeight: 'bold', marginLeft: 8, fontSize: 13 },
  tableScroll: { backgroundColor: '#fff', borderRadius: 12 },
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' },
  tableHeader: { backgroundColor: '#455A64' },
  cellHeader: { color: '#fff', fontWeight: 'bold', fontSize: 11, paddingHorizontal: 10 },
  cell: { fontSize: 11, color: '#37474f', paddingHorizontal: 10 }
});