import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, 
  Alert, ActivityIndicator, Platform 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy'; // IMPORTANTE: Librería para crear el archivo CSV
import { supabase } from '../src/services/supabaseClient'; 

// DATOS ESTÁTICOS (Sin cambios)
const ESTADOS_MX = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", 
  "Coahuila", "Colima", "Chiapas", "Chihuahua", "Ciudad de México", 
  "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", 
  "México", "Michoacán", "Morelos", "Nayarit", "Nuevo León", 
  "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", 
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", 
  "Veracruz", "Yucatán", "Zacatecas"
];

const CICLOS = ["Otoño-Invierno", "Primavera-Verano", "Perennes"];
const MODALIDADES = ["Riego", "Temporal"];

// --- COMPONENTE AUTOCOMPLETE (Sin cambios) ---
const FiltroAutocomplete = ({ label, valor, setValor, opciones = [], zIndex = 1, placeholder = "Seleccionar..." }) => {
    const [sugerencias, setSugerencias] = useState([]);
    const [showList, setShowList] = useState(false);

    const filtrar = (texto) => {
        setValor(texto);
        if (texto.length > 0 && opciones.length > 0) {
            const matches = opciones.filter(op => op && op.toLowerCase().includes(texto.toLowerCase()));
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

export default function ReporteAvanzadoScreen() {
  const [filtros, setFiltros] = useState({
    cultivo: '',
    estado: '',
    municipio: '',
    anio: '2024',
    ciclo: '',
    modalidad: '',
  });

  const [listaCultivos, setListaCultivos] = useState([]);
  const [listaMunicipios, setListaMunicipios] = useState([]);
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarTabla, setMostrarTabla] = useState(false);

  // --- NUEVO ESTADO: TOTALES ---
  const [totales, setTotales] = useState({
    valor: 0,
    volumen: 0,
    sembrada: 0,
    cosechada: 0
  });

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


  // --- LÓGICA DE BÚSQUEDA ---
  const consultarBaseDatos = async () => {
    setCargando(true);
    setMostrarTabla(false);
    try {
      let query = supabase.from('produccion_agricola').select('*');

      if (filtros.cultivo) query = query.ilike('nomcultivo', `%${filtros.cultivo}%`);
      if (filtros.estado) query = query.ilike('nomestado', `%${filtros.estado}%`);
      if (filtros.municipio) query = query.ilike('nommunicipio', `%${filtros.municipio}%`);
      if (filtros.anio) query = query.eq('anio', parseInt(filtros.anio)); 
      if (filtros.ciclo) query = query.ilike('nomcicloproductivo', `%${filtros.ciclo}%`);
      if (filtros.modalidad) query = query.ilike('nommodalidad', `%${filtros.modalidad}%`);
      
      // Aumentamos el límite un poco para asegurar totales más representativos
      query = query.order('valorproduccion', { ascending: false }).limit(1000);

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        Alert.alert("Sin resultados", "No se encontraron registros.");
        setResultados([]);
      } else {
        setResultados(data);
        
        // --- CALCULO DE TOTALES (NUEVO) ---
        const calcTotales = data.reduce((acc, item) => ({
            valor: acc.valor + (item.valorproduccion || 0),
            volumen: acc.volumen + (item.volumenproduccion || 0),
            sembrada: acc.sembrada + (item.sembrada || 0),
            cosechada: acc.cosechada + (item.cosechada || 0),
        }), { valor: 0, volumen: 0, sembrada: 0, cosechada: 0 });
        
        setTotales(calcTotales);
        setMostrarTabla(true);
      }
    } catch (error) {
      Alert.alert("Error", "Fallo de conexión: " + error.message);
    } finally {
      setCargando(false);
    }
  };

  const handleConsultar = async () => {
    const data = await consultarBaseDatos();
    if (data && data.length > 0) {
      setMostrarTabla(true);
    }
  };

  // --- FUNCION EXPORTAR CSV ---
  const handleCSV = async () => {
    if (!resultados || resultados.length === 0) {
        Alert.alert("Atención", "Primero realiza una consulta para obtener datos.");
        return;
    }

    try {
        // Usamos BOM (\uFEFF) para acentos en Excel
        let csvContent = "\uFEFFEstado,Municipio,Cultivo,Ciclo,Modalidad,Sembrada_Ha,Cosechada_Ha,Volumen_Ton,Precio_Medio,Valor_Produccion\n";

        resultados.forEach(item => {
            const row = [
                `"${item.nomcultivo}"`,
                `"${item.nomestado}"`,
                `"${item.nommunicipio}"`,
                `"${item.nomcicloproductivo}"`,
                `"${item.nommodalidad}"`,
                item.sembrada,
                item.cosechada,
                item.volumenproduccion,
                item.preciomediorural,
                item.valorproduccion
            ].join(",");
            csvContent += row + "\n";
        });

        // IMPORTANTE: Al usar la importación 'legacy', FileSystem.cacheDirectory funciona correctamente aquí
        const fileUri = FileSystem.cacheDirectory + "reporte_agricola.csv";
        
        // Mantenemos 'utf8' como texto simple
        await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });

        await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Descargar datos en Excel/CSV',
            UTI: 'public.comma-separated-values-text'
        });

    } catch (error) {
        console.error("Error CSV:", error);
        Alert.alert("Error Exportación", "No se pudo generar el archivo CSV.");
    }
  };
  
  const formatMoney = (amount) => {
    return amount ? '$' + amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$0.00';
  };

  const formatNumber = (num) => {
    return num ? num.toLocaleString('es-MX') : '0';
  };

  const handlePDF = async () => {
    let datosParaPDF = resultados;
    if (datosParaPDF.length === 0) return;
    generarPDF(datosParaPDF);
  };

  const generarPDF = async (datos) => {
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 10px; }
            h1 { color: #2E7D32; text-align: center; font-size: 18px; }
            .resumen { text-align: center; margin-bottom: 10px; font-size: 10px; color: #555; background: #f0f0f0; padding: 10px; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 8px; }
            th, td { border: 1px solid #ddd; padding: 4px; text-align: right; }
            th { background-color: #2E7D32; color: white; text-align: center; }
            td.text-left { text-align: left; }
            tr:nth-child(even) { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Reporte Agrícola Detallado</h1>
          <div class="resumen">
            <p><strong>Resumen Total de la Consulta</strong></p>
            <p>Valor Total: ${formatMoney(totales.valor)} | Volumen Total: ${formatNumber(totales.volumen)} Ton</p>
            <p>Sup. Sembrada: ${formatNumber(totales.sembrada)} Ha | Sup. Cosechada: ${formatNumber(totales.cosechada)} Ha</p>
          </div>
          <table>
            <tr>
              <th>Cultivo</th>
              <th>Estado</th>
              <th>Mpio</th>
              <th>Sembrada (Ha)</th>
              <th>Cosechada (Ha)</th>
              <th>Rend (t/Ha)</th>
              <th>Volumen (t)</th>
              <th>Precio Medio</th>
              <th>Valor Producción</th>
            </tr>
            ${datos.map(item => `
              <tr>
                <td class="text-left">${item.nomcultivo}</td>
                <td class="text-left">${item.nomestado}</td>
                <td class="text-left">${item.nommunicipio}</td>
                <td>${formatNumber(item.sembrada)}</td>
                <td>${formatNumber(item.cosechada)}</td>
                <td>${formatNumber(item.rendimiento)}</td>
                <td>${formatNumber(item.volumenproduccion)}</td>
                <td>${formatMoney(item.preciomediorural)}</td>
                <td>${formatMoney(item.valorproduccion)}</td>
              </tr>
            `).join('')}
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
        
        <View style={styles.header}>
          <MaterialCommunityIcons name="database-search" size={40} color="#2E7D32" />
          <Text style={styles.title}>Consulta Avanzada</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Filtros</Text>

          {/* CORRECCIÓN Z-INDEX: Cultivo debe ser el mayor (100) porque está arriba */}
          <FiltroAutocomplete 
             label="Cultivo" 
             valor={filtros.cultivo} 
             setValor={(t) => setFiltros({...filtros, cultivo: t})}
             opciones={listaCultivos}
             zIndex={100} 
             placeholder="Ej. Maíz grano, Aguacate..."
          />

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
              <TouchableOpacity style={styles.btnConsultar} onPress={handleConsultar} disabled={cargando}>
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
                {/* --- NUEVA TARJETA: RESUMEN DE TOTALES --- */}
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Resumen de Totales</Text>
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
                    </View>
                </View>

                {/* --- BOTONES DE EXPORTACIÓN --- */}
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

                <View style={styles.resultadosContainer}>
                    <Text style={styles.resTitle}>Resultados ({resultados.length})</Text>
                    <ScrollView horizontal persistentScrollbar={true}>
                        <View>
                            <View style={[styles.tableRow, styles.tableHeader]}>
                                <Text style={[styles.cell, {width: 100, color:'white'}]}>Estado</Text>
                                <Text style={[styles.cell, {width: 100, color:'white'}]}>Mpio</Text>
                                <Text style={[styles.cell, {width: 110, color:'white'}]}>Cultivo</Text>
                                <Text style={[styles.cell, {width: 80, color:'white', textAlign:'right'}]}>Sem(Ha)</Text>
                                <Text style={[styles.cell, {width: 80, color:'white', textAlign:'right'}]}>Cos(Ha)</Text>
                                <Text style={[styles.cell, {width: 60, color:'white', textAlign:'right'}]}>Rend</Text>
                                <Text style={[styles.cell, {width: 90, color:'white', textAlign:'right'}]}>Vol(Ton)</Text>
                                <Text style={[styles.cell, {width: 80, color:'white', textAlign:'right'}]}>$ Medio</Text>
                                <Text style={[styles.cell, {width: 110, color:'white', textAlign:'right'}]}>Valor ($)</Text>
                            </View>
                            {resultados.map((item, i) => (
                                <View key={i} style={styles.tableRow}>
                                    <Text style={[styles.cell, {width: 100}]}>{item.nomestado}</Text>
                                    <Text style={[styles.cell, {width: 100}]}>{item.nommunicipio}</Text>
                                    <Text style={[styles.cell, {width: 110}]}>{item.nomcultivo}</Text>
                                    <Text style={[styles.cell, {width: 80, textAlign:'right'}]}>{formatNumber(item.sembrada)}</Text>
                                    <Text style={[styles.cell, {width: 80, textAlign:'right'}]}>{formatNumber(item.cosechada)}</Text>
                                    <Text style={[styles.cell, {width: 60, textAlign:'right'}]}>{formatNumber(item.rendimiento)}</Text>
                                    <Text style={[styles.cell, {width: 90, textAlign:'right'}]}>{formatNumber(item.volumenproduccion)}</Text>
                                    <Text style={[styles.cell, {width: 80, textAlign:'right'}]}>{formatMoney(item.preciomediorural)}</Text>
                                    <Text style={[styles.cell, {width: 110, textAlign:'right'}]}>{formatMoney(item.valorproduccion)}</Text>
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
  
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, elevation: 3, zIndex: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#455A64', marginBottom: 15 },
  
  inputGroup: { marginBottom: 15, zIndex: 1 },
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
  
  // Modificado: Quitamos los botones de exportar de aquí y dejamos solo Consultar
  botonesRow: { marginTop: 20, zIndex: 0 },
  btnConsultar: { backgroundColor: '#1976D2', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 8 },
  
  // --- NUEVOS ESTILOS PARA LA TARJETA DE TOTALES Y BOTONES DE EXPORTAR ---
  summaryCard: {
    backgroundColor: '#263238', // Color oscuro para diferenciar
    borderRadius: 12,
    padding: 15,
    marginTop: 20,
    elevation: 4
  },
  summaryTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: '#546E7A', paddingBottom: 5, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryItem: { flex: 1 },
  summaryLabel: { color: '#B0BEC5', fontSize: 10 },
  summaryValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  summaryValueMoney: { color: '#81C784', fontSize: 18, fontWeight: 'bold' }, // Verde claro para dinero

  exportButtonsRow: { flexDirection: 'row', marginTop: 15, marginBottom: 5 },
  btnExport: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: 8 },
  // ------------------------------------------------------------------------

  btnText: { color: '#fff', fontWeight: 'bold' },

  resultadosContainer: { marginTop: 15, backgroundColor: 'white', borderRadius: 10, padding: 10, elevation: 2, zIndex: -1 },
  resTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: '#333' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 8 },
  tableHeader: { backgroundColor: '#2E7D32', borderRadius: 5 },
  cell: { fontSize: 11, paddingHorizontal: 5 }
});