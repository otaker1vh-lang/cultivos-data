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

// --- 1. DATOS ESTÁTICOS (Originales + Años Agregados) ---
const ESTADOS_MX = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", 
  "Coahuila", "Colima", "Chiapas", "Chihuahua", "Ciudad de México", 
  "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", 
  "México", "Michoacán", "Morelos", "Nayarit", "Nuevo León", 
  "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", 
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", 
  "Veracruz", "Yucatán", "Zacatecas"
];

// Generador de años (2015 - 2025)
const ANIOS = Array.from({length: 11}, (_, i) => (2025 - i).toString());

const CICLOS = ["Otoño-Invierno", "Primavera-Verano", "Perennes"];
const MODALIDADES = ["Riego", "Temporal"];
const NIVELES_DESGLOSE = ["Municipal (Detallado)", "Resumen por Estado", "Resumen por Cultivo"];

// --- 2. COMPONENTE AUTOCOMPLETE (Conservado Original) ---
const FiltroAutocomplete = ({ label, valor, setValor, opciones = [], zIndex = 1, placeholder = "Seleccionar..." }) => {
    const [sugerencias, setSugerencias] = useState([]);
    const [showList, setShowList] = useState(false);

    const filtrar = (texto) => {
        setValor(texto);
        if (texto.length > 0 && opciones.length > 0) {
            // ToString para manejar años numéricos si vienen mezclados
            const matches = opciones.filter(op => op && op.toString().toLowerCase().includes(texto.toLowerCase()));
            const uniqueMatches = [...new Set(matches)];
            setSugerencias(uniqueMatches);
            setShowList(true);
        } else {
            setShowList(false);
        }
    };

    const seleccionar = (item) => {
        setValor(item);
        setShowList(false);
    };

    const onFocus = () => {
        if (!valor && opciones.length > 0) {
            setSugerencias(opciones.slice(0, 10));
            setShowList(true);
        }
    };

    return (
        <View style={{ marginBottom: 15, zIndex: zIndex, position: 'relative' }}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputContainer}>
                <TextInput 
                    style={styles.input} 
                    value={valor} 
                    onChangeText={filtrar}
                    onFocus={onFocus}
                    placeholder={placeholder}
                    keyboardType={opciones === ANIOS ? 'numeric' : 'default'} 
                />
                {valor.length > 0 && (
                    <TouchableOpacity onPress={() => { setValor(''); setShowList(false); }} style={styles.clearBtn}>
                        <MaterialCommunityIcons name="close-circle" size={20} color="#ccc" />
                    </TouchableOpacity>
                )}
            </View>
            {showList && sugerencias.length > 0 && (
                <View style={styles.dropdownList}>
                    <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled" style={{maxHeight: 150}}>
                        {sugerencias.slice(0, 20).map((item, index) => (
                            <TouchableOpacity key={index} style={styles.dropdownItem} onPress={() => seleccionar(item)}>
                                <Text>{item}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

// --- 3. PANTALLA PRINCIPAL ---
export default function ReporteAvanzadoScreen() {
  // Estado de Filtros
  const [filtros, setFiltros] = useState({
    anio: '2024',
    cultivo: '',
    estado: '',
    municipio: '',
    ciclo: '',
    modalidad: '',
  });

  // Estado SIACON (Nivel de Agrupación)
  const [nivelDesglose, setNivelDesglose] = useState("Municipal (Detallado)");

  // Listas Dinámicas
  const [listaCultivos, setListaCultivos] = useState([]);
  const [listaMunicipios, setListaMunicipios] = useState([]);
  
  // Datos y Control
  const [rawData, setRawData] = useState([]); // Datos originales de la BD
  const [resultados, setResultados] = useState([]); // Datos procesados para mostrar
  const [cargando, setCargando] = useState(false);
  const [mostrarTabla, setMostrarTabla] = useState(false);

  // Totales Generales
  const [totales, setTotales] = useState({
    valor: 0,
    volumen: 0,
    sembrada: 0,
    cosechada: 0,
    siniestrada: 0
  });

  // --- EFECTOS (Carga inicial) ---
  
  // 1. Cargar lista de cultivos al iniciar
  useEffect(() => {
    const fetchCultivos = async () => {
        try {
            const { data, error } = await supabase.from('produccion_agricola').select('nomcultivo');
            if (!error && data) {
                const unicos = [...new Set(data.map(item => item.nomcultivo))].sort();
                setListaCultivos(unicos);
            }
        } catch (e) { console.log("Error cargando cultivos", e); }
    };
    fetchCultivos();
  }, []);

  // 2. Cargar municipios cuando cambia el Estado
  useEffect(() => {
    if (filtros.estado) {
        const fetchMunicipios = async () => {
            try {
                const { data, error } = await supabase
                    .from('produccion_agricola')
                    .select('nommunicipio')
                    .ilike('nomestado', `%${filtros.estado}%`);
                if (!error && data) {
                    const unicos = [...new Set(data.map(item => item.nommunicipio))].sort();
                    setListaMunicipios(unicos);
                }
            } catch (e) { console.log("Error cargando municipios", e); }
        };
        fetchMunicipios();
    } else {
        setListaMunicipios([]);
    }
    setFiltros(prev => ({ ...prev, municipio: '' }));
  }, [filtros.estado]);


  // --- LÓGICA DE BÚSQUEDA Y PROCESAMIENTO ---

  const consultarBaseDatos = async () => {
    setCargando(true);
    setMostrarTabla(false);
    try {
      let query = supabase.from('produccion_agricola').select('*');

      // Aplicación de filtros (Igual al original pero optimizado)
      if (filtros.anio) query = query.eq('anio', parseInt(filtros.anio)); 
      if (filtros.cultivo) query = query.ilike('nomcultivo', `%${filtros.cultivo}%`);
      if (filtros.estado) query = query.ilike('nomestado', `%${filtros.estado}%`);
      if (filtros.municipio) query = query.ilike('nommunicipio', `%${filtros.municipio}%`);
      if (filtros.ciclo) query = query.ilike('nomcicloproductivo', `%${filtros.ciclo}%`);
      if (filtros.modalidad) query = query.ilike('nommodalidad', `%${filtros.modalidad}%`);
      
      // Límite de seguridad
      const { data, error } = await query.limit(4000);

      if (error) throw error;

      if (!data || data.length === 0) {
        Alert.alert("Sin resultados", "No se encontraron registros con esos filtros.");
        setResultados([]);
        setRawData([]);
      } else {
        setRawData(data); // Guardamos la data cruda para poder reagrupar sin volver a consultar
        procesarDatos(data, nivelDesglose); // Procesamos la vista
      }
    } catch (error) {
      Alert.alert("Error", "Fallo de conexión: " + error.message);
    } finally {
      setCargando(false);
    }
  };

  // Función "SIACON" para agrupar datos
  const procesarDatos = (data, nivel) => {
      let datosProcesados = [];

      if (nivel === "Municipal (Detallado)") {
          datosProcesados = data;
      } else {
          // Lógica de agrupación (Agrega valores, pondera promedios)
          const keyField = nivel === "Resumen por Estado" ? 'nomestado' : 'nomcultivo';
          
          const grouped = data.reduce((acc, item) => {
              const key = item[keyField] || 'Desconocido';
              if (!acc[key]) {
                  acc[key] = {
                      // Datos descriptivos para la tabla
                      nomestado: nivel === "Resumen por Estado" ? key : 'Varios',
                      nommunicipio: 'Agrupado',
                      nomcultivo: nivel === "Resumen por Cultivo" ? key : 'Varios',
                      nomcicloproductivo: filtros.ciclo || 'Todos',
                      nommodalidad: filtros.modalidad || 'Todas',
                      anio: item.anio,
                      // Acumuladores
                      sembrada: 0,
                      cosechada: 0,
                      siniestrada: 0,
                      volumenproduccion: 0,
                      valorproduccion: 0
                  };
              }
              acc[key].sembrada += (item.sembrada || 0);
              acc[key].cosechada += (item.cosechada || 0);
              acc[key].siniestrada += (item.siniestrada || 0);
              acc[key].volumenproduccion += (item.volumenproduccion || 0);
              acc[key].valorproduccion += (item.valorproduccion || 0);
              return acc;
          }, {});

          datosProcesados = Object.values(grouped).map(obj => ({
              ...obj,
              // Recalculo de Rendimiento y Precio Medio
              rendimiento: obj.cosechada > 0 ? (obj.volumenproduccion / obj.cosechada) : 0,
              preciomediorural: obj.volumenproduccion > 0 ? (obj.valorproduccion / obj.volumenproduccion) : 0
          }));
      }

      // Ordenar por Valor de Producción (Descendente)
      datosProcesados.sort((a, b) => b.valorproduccion - a.valorproduccion);

      // Calcular Totales Generales de la vista actual
      const calcTotales = datosProcesados.reduce((acc, item) => ({
        valor: acc.valor + (item.valorproduccion || 0),
        volumen: acc.volumen + (item.volumenproduccion || 0),
        sembrada: acc.sembrada + (item.sembrada || 0),
        cosechada: acc.cosechada + (item.cosechada || 0),
        siniestrada: acc.siniestrada + (item.siniestrada || 0),
      }), { valor: 0, volumen: 0, sembrada: 0, cosechada: 0, siniestrada: 0 });

      setTotales(calcTotales);
      setResultados(datosProcesados);
      setMostrarTabla(true);
  };

  // Efecto para reagrupar si el usuario cambia el tab de desglose
  useEffect(() => {
      if (rawData.length > 0) {
          procesarDatos(rawData, nivelDesglose);
      }
  }, [nivelDesglose]);


  // --- FORMATTERS ---
  const formatMoney = (amount) => {
    return amount ? '$' + amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$0.00';
  };

  const formatNumber = (num) => {
    return num ? num.toLocaleString('es-MX', { maximumFractionDigits: 1 }) : '0';
  };

  // --- EXPORTAR CSV ---
  const handleCSV = async () => {
    if (!resultados || resultados.length === 0) {
        Alert.alert("Atención", "Primero realiza una consulta para obtener datos.");
        return;
    }

    try {
        let csvContent = "\uFEFFAño,Nivel,Estado,Municipio,Cultivo,Ciclo,Modalidad,Sembrada_Ha,Cosechada_Ha,Siniestrada_Ha,Volumen_Ton,Rendimiento,Precio_Medio,Valor_Produccion\n";

        resultados.forEach(item => {
            const row = [
                item.anio,
                `"${nivelDesglose}"`,
                `"${item.nomestado}"`,
                `"${item.nommunicipio}"`,
                `"${item.nomcultivo}"`,
                `"${item.nomcicloproductivo}"`,
                `"${item.nommodalidad}"`,
                item.sembrada,
                item.cosechada,
                item.siniestrada, // Nueva columna
                item.volumenproduccion,
                item.rendimiento, // Nueva columna
                item.preciomediorural,
                item.valorproduccion
            ].join(",");
            csvContent += row + "\n";
        });

        const fileUri = FileSystem.cacheDirectory + "reporte_agricola_siacon.csv";
        await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });

        await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Descargar datos SIACON',
            UTI: 'public.comma-separated-values-text'
        });

    } catch (error) {
        console.error("Error CSV:", error);
        Alert.alert("Error Exportación", "No se pudo generar el archivo CSV.");
    }
  };

  // --- EXPORTAR PDF ---
  const handlePDF = async () => {
    if (resultados.length === 0) return;
    
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 10px; }
            h1 { color: #2E7D32; text-align: center; font-size: 16px; }
            .meta { font-size: 10px; color: #666; text-align: center; margin-bottom: 10px; }
            .resumen { text-align: center; margin-bottom: 10px; font-size: 9px; color: #333; background: #e8f5e9; padding: 8px; border-radius: 4px; border: 1px solid #c8e6c9; }
            table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 7px; }
            th, td { border: 1px solid #ddd; padding: 3px; text-align: right; }
            th { background-color: #2E7D32; color: white; text-align: center; }
            td.text-left { text-align: left; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .total-row { font-weight: bold; background-color: #e0e0e0; }
          </style>
        </head>
        <body>
          <h1>Reporte SIACON - ${nivelDesglose}</h1>
          <div class="meta">
            Año: ${filtros.anio || 'Varios'} | Generado: ${new Date().toLocaleDateString()}
          </div>
          <div class="resumen">
            <p><strong>Totales Generales</strong></p>
            <p>Valor: ${formatMoney(totales.valor)} | Volumen: ${formatNumber(totales.volumen)} Ton</p>
            <p>Sembrada: ${formatNumber(totales.sembrada)} Ha | Cosechada: ${formatNumber(totales.cosechada)} Ha | Siniestrada: ${formatNumber(totales.siniestrada)} Ha</p>
          </div>
          <table>
            <thead>
                <tr>
                <th>Entidad</th>
                <th>Mpio/Agrup</th>
                <th>Cultivo</th>
                <th>Sem(Ha)</th>
                <th>Cos(Ha)</th>
                <th>Sin(Ha)</th>
                <th>Vol(Ton)</th>
                <th>Rend</th>
                <th>$ Medio</th>
                <th>Valor ($)</th>
                </tr>
            </thead>
            <tbody>
            ${resultados.map(item => `
              <tr>
                <td class="text-left">${item.nomestado}</td>
                <td class="text-left">${item.nommunicipio}</td>
                <td class="text-left">${item.nomcultivo}</td>
                <td>${formatNumber(item.sembrada)}</td>
                <td>${formatNumber(item.cosechada)}</td>
                <td>${formatNumber(item.siniestrada)}</td>
                <td>${formatNumber(item.volumenproduccion)}</td>
                <td>${formatNumber(item.rendimiento)}</td>
                <td>${formatMoney(item.preciomediorural)}</td>
                <td>${formatMoney(item.valorproduccion)}</td>
              </tr>
            `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (error) {
      Alert.alert("Error PDF", "No se pudo generar.");
    }
  };

  // --- RENDERIZADO ---
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
        
        <View style={styles.header}>
          <MaterialCommunityIcons name="database-search" size={40} color="#2E7D32" />
          <Text style={styles.title}>Consulta SIACON</Text>
          <Text style={styles.subtitle}>Histórico 2015 - 2024</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Filtros de Búsqueda</Text>

          {/* SELECTOR DE NIVEL (SIACON) */}
          <Text style={styles.label}>Nivel de Desglose:</Text>
          <View style={styles.tabContainer}>
              {NIVELES_DESGLOSE.map((tab) => (
                  <TouchableOpacity 
                    key={tab} 
                    style={[styles.tab, nivelDesglose === tab && styles.tabActive]}
                    onPress={() => setNivelDesglose(tab)}
                  >
                      <Text style={[styles.tabText, nivelDesglose === tab && styles.tabTextActive]}>
                          {tab.replace("Resumen por ", "")}
                      </Text>
                  </TouchableOpacity>
              ))}
          </View>
          
          <View style={{height: 10}} />

          {/* FILTRO AÑO (Nuevo) Y CULTIVO */}
          <View style={styles.row}>
             <View style={{flex: 0.6, marginRight: 5, zIndex: 110}}>
                <FiltroAutocomplete 
                    label="Año" 
                    valor={filtros.anio} 
                    setValor={(t) => setFiltros({...filtros, anio: t})}
                    opciones={ANIOS}
                    zIndex={110} 
                    placeholder="2024"
                />
             </View>
             <View style={{flex: 1.4, marginLeft: 5, zIndex: 110}}>
                <FiltroAutocomplete 
                    label="Cultivo" 
                    valor={filtros.cultivo} 
                    setValor={(t) => setFiltros({...filtros, cultivo: t})}
                    opciones={listaCultivos}
                    zIndex={110} 
                    placeholder="Ej. Maíz grano"
                />
             </View>
          </View>

          <FiltroAutocomplete 
             label="Estado" 
             valor={filtros.estado} 
             setValor={(t) => setFiltros({...filtros, estado: t})}
             opciones={ESTADOS_MX}
             zIndex={90}
             placeholder="Ej. Sinaloa"
          />

          <FiltroAutocomplete 
             label="Municipio" 
             valor={filtros.municipio} 
             setValor={(t) => setFiltros({...filtros, municipio: t})}
             opciones={listaMunicipios}
             zIndex={80}
             placeholder={filtros.estado ? "Selecciona municipio..." : "Primero selecciona un Estado"}
          />
          
          <View style={styles.row}>
             <View style={{flex:1, marginRight:5, zIndex: 70}}>
                <FiltroAutocomplete 
                    label="Ciclo" 
                    valor={filtros.ciclo} 
                    setValor={(t) => setFiltros({...filtros, ciclo: t})}
                    opciones={CICLOS}
                    zIndex={70}
                />
             </View>
             <View style={{flex:1, marginLeft:5, zIndex: 70}}>
                <FiltroAutocomplete 
                    label="Modalidad" 
                    valor={filtros.modalidad} 
                    setValor={(t) => setFiltros({...filtros, modalidad: t})}
                    opciones={MODALIDADES}
                    zIndex={70}
                />
             </View>
          </View>

          <View style={styles.botonesRow}>
              <TouchableOpacity style={styles.btnConsultar} onPress={consultarBaseDatos} disabled={cargando}>
                {cargando ? <ActivityIndicator color="#fff"/> : (
                    <>
                    <MaterialCommunityIcons name="table-search" size={24} color="#fff" style={{marginRight:5}}/>
                    <Text style={styles.btnText}>Consultar</Text>
                    </>
                )}
              </TouchableOpacity>
          </View>
        </View>

        {mostrarTabla && (
            <View>
                {/* TARJETA RESUMEN DE TOTALES */}
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Resumen de Totales ({nivelDesglose})</Text>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Valor Producción</Text>
                            <Text style={styles.summaryValueMoney}>{formatMoney(totales.valor)}</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Volumen (Ton)</Text>
                            <Text style={styles.summaryValue}>{formatNumber(totales.volumen)}</Text>
                        </View>
                    </View>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Sembrada (Ha)</Text>
                            <Text style={styles.summaryValue}>{formatNumber(totales.sembrada)}</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Cosechada (Ha)</Text>
                            <Text style={styles.summaryValue}>{formatNumber(totales.cosechada)}</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryLabel}>Siniestrada (Ha)</Text>
                            <Text style={[styles.summaryValue, {color: '#ef5350'}]}>{formatNumber(totales.siniestrada)}</Text>
                        </View>
                    </View>
                </View>

                {/* BOTONES DE EXPORTACIÓN */}
                <View style={styles.exportButtonsRow}>
                    <TouchableOpacity style={[styles.btnExport, { backgroundColor: '#D32F2F', marginRight: 5 }]} onPress={handlePDF}>
                        <MaterialCommunityIcons name="file-pdf-box" size={20} color="#fff" style={{marginRight:5}}/>
                        <Text style={styles.btnText}>PDF</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.btnExport, { backgroundColor: '#1E88E5', marginLeft: 5 }]} onPress={handleCSV}>
                        <MaterialCommunityIcons name="file-excel" size={20} color="#fff" style={{marginRight:5}}/>
                        <Text style={styles.btnText}>Excel / CSV</Text>
                    </TouchableOpacity>
                </View>

                {/* TABLA DE RESULTADOS */}
                <View style={styles.resultadosContainer}>
                    <Text style={styles.resTitle}>Resultados ({resultados.length})</Text>
                    <ScrollView horizontal persistentScrollbar={true}>
                        <View>
                            <View style={[styles.tableRow, styles.tableHeader]}>
                                <Text style={[styles.cell, {width: 100, color:'white'}]}>Entidad</Text>
                                <Text style={[styles.cell, {width: 100, color:'white'}]}>Mpio/Agrup</Text>
                                <Text style={[styles.cell, {width: 110, color:'white'}]}>Cultivo</Text>
                                <Text style={[styles.cell, {width: 70, color:'white', textAlign:'right'}]}>Sem</Text>
                                <Text style={[styles.cell, {width: 70, color:'white', textAlign:'right'}]}>Cos</Text>
                                <Text style={[styles.cell, {width: 60, color:'white', textAlign:'right'}]}>Sin</Text>
                                <Text style={[styles.cell, {width: 80, color:'white', textAlign:'right'}]}>Vol(t)</Text>
                                <Text style={[styles.cell, {width: 50, color:'white', textAlign:'right'}]}>Rend</Text>
                                <Text style={[styles.cell, {width: 70, color:'white', textAlign:'right'}]}>$Medio</Text>
                                <Text style={[styles.cell, {width: 100, color:'white', textAlign:'right'}]}>Valor ($)</Text>
                            </View>
                            {resultados.map((item, i) => (
                                <View key={i} style={styles.tableRow}>
                                    <Text style={[styles.cell, {width: 100}]}>{item.nomestado}</Text>
                                    <Text style={[styles.cell, {width: 100}]}>{item.nommunicipio}</Text>
                                    <Text style={[styles.cell, {width: 110}]}>{item.nomcultivo}</Text>
                                    <Text style={[styles.cell, {width: 70, textAlign:'right'}]}>{formatNumber(item.sembrada)}</Text>
                                    <Text style={[styles.cell, {width: 70, textAlign:'right'}]}>{formatNumber(item.cosechada)}</Text>
                                    <Text style={[styles.cell, {width: 60, textAlign:'right', color: item.siniestrada > 0 ? '#d32f2f' : '#333'}]}>
                                        {formatNumber(item.siniestrada)}
                                    </Text>
                                    <Text style={[styles.cell, {width: 80, textAlign:'right'}]}>{formatNumber(item.volumenproduccion)}</Text>
                                    <Text style={[styles.cell, {width: 50, textAlign:'right'}]}>{formatNumber(item.rendimiento)}</Text>
                                    <Text style={[styles.cell, {width: 70, textAlign:'right'}]}>{formatMoney(item.preciomediorural)}</Text>
                                    <Text style={[styles.cell, {width: 100, textAlign:'right'}]}>{formatMoney(item.valorproduccion)}</Text>
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
  scroll: { padding: 20, paddingBottom: 50 },
  header: { alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  subtitle: { fontSize: 12, color: '#666', marginBottom: 5 },
  
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, elevation: 3, zIndex: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#455A64', marginBottom: 15 },
  
  // Tabs Estilo SIACON
  tabContainer: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderRadius: 8, padding: 4, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2 },
  tabText: { fontSize: 11, color: '#666' },
  tabTextActive: { color: '#2E7D32', fontWeight: 'bold' },

  label: { fontSize: 12, fontWeight: 'bold', color: '#546e7a', marginBottom: 5 },
  
  inputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#f5f5f5', 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#cfd8dc' 
  },
  input: { 
    flex: 1,
    paddingHorizontal: 15, 
    height: 45, 
    color: '#333'
  },
  clearBtn: { padding: 10 },
  
  dropdownList: { 
    position: 'absolute', 
    top: 75, 
    left: 0, 
    right: 0, 
    backgroundColor: 'white', 
    borderRadius: 5, 
    elevation: 8, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderWidth: 1, 
    borderColor: '#ddd', 
    maxHeight: 150 
  },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },

  row: { flexDirection: 'row', zIndex: 1 },
  
  botonesRow: { marginTop: 20, zIndex: 0 },
  btnConsultar: { backgroundColor: '#1976D2', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 8 },
  
  summaryCard: {
    backgroundColor: '#263238', 
    borderRadius: 12,
    padding: 15,
    marginTop: 20,
    elevation: 4
  },
  summaryTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: '#546E7A', paddingBottom: 5, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryItem: { flex: 1, alignItems: 'center' }, // Centrado para mejor vista
  summaryLabel: { color: '#B0BEC5', fontSize: 10 },
  summaryValue: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  summaryValueMoney: { color: '#81C784', fontSize: 17, fontWeight: 'bold' },

  exportButtonsRow: { flexDirection: 'row', marginTop: 15, marginBottom: 5 },
  btnExport: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: 8 },

  btnText: { color: '#fff', fontWeight: 'bold' },

  resultadosContainer: { marginTop: 15, backgroundColor: 'white', borderRadius: 10, padding: 10, elevation: 2, zIndex: -1 },
  resTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: '#333' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 8 },
  tableHeader: { backgroundColor: '#2E7D32', borderRadius: 5 },
  cell: { fontSize: 10, paddingHorizontal: 4 }
});