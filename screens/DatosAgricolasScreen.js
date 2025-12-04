import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker'; 
import { LineChart } from 'react-native-chart-kit'; 

// 🛑 IMPORTANTE: Elimina la línea de importación del JSON local.
// Ya NO necesitamos: import todosLosDatosAgricolas from '../data/datos_agricolas_integrados.json'; 

// Importación de las funciones de Firebase (Asegúrate de que tu app de Firebase esté inicializada)
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';

// --- CONFIGURACIÓN GLOBAL ---
const screenWidth = Dimensions.get("window").width;
const CHART_CONFIG = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 2, 
    color: (opacity = 1) => `rgba(0, 123, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: "4", strokeWidth: "2", stroke: "#007bff" }
};

const METRICS_MAP = {
    Sembrada: { label: 'Sembrada (ha)', unit: 'ha' },
    Cosechada: { label: 'Cosechada (ha)', unit: 'ha' },
    VolumenProducción: { label: 'Volumen Producción (t/ha)', unit: 't' },
    Rendimiento: { label: 'Rendimiento (t/ha)', unit: 't/ha' },
    PrecioMedioRural: { label: 'Precio Medio Rural (MXN)', unit: 'MXN' },
    ValorProducción: { label: 'Valor Producción (MXN)', unit: 'MXN' },
};

// --- Lista de todos los cultivos ---
// ⚠️ ESTA LISTA DEBE OBTENERSE DE MANERA ASÍNCRONA O HARDCODEARSE.
// Por ahora, asumimos que tienes una lista de todos los nombres de cultivos:
const todosLosCultivos = [
    'Maíz grano', 'Frijol', 'Trigo grano', 'Avena forrajera en verde', 
    'Aguacate', 'Caña de azúcar', 'Mango', 'Papa', // etc.
];

// Inicializa la base de datos de Firestore
const db = getFirestore();

// ------------------------------------
// --- COMPONENTE PRINCIPAL ---
// ------------------------------------

export default function DatosAgricolasScreen({ route }) {
    
    // --- ESTADOS DE DATOS ---
    const [isLoading, setIsLoading] = useState(false);
    // Almacena todas las entradas del cultivo seleccionado. { entradas: [...] }
    const [datosCultivoActual, setDatosCultivoActual] = useState({ entradas: [] }); 

    // --- ESTADOS DE FILTROS ---
    const [cultivoFiltro, setCultivoFiltro] = useState(todosLosCultivos[0] || '');
    const [estadoFiltro, setEstadoFiltro] = useState('TODOS');
    const [cicloFiltro, setCicloFiltro] = useState('TODOS');
    const [anioFiltro, setAnioFiltro] = useState('TODOS');
    const [metricaFiltro, setMetricaFiltro] = useState('Rendimiento');

    // ----------------------------------------------------
    // ⬇️ FUNCIÓN CRÍTICA DE CARGA DESDE FIRESTORE ⬇️
    // ----------------------------------------------------
    const loadCultivoData = async (cultivoName) => {
        if (!cultivoName) return;
        setIsLoading(true);
        setDatosCultivoActual({ entradas: [] }); // Limpiar datos al cargar

        try {
            const docRef = doc(db, "datos_agricolas", cultivoName);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();

                if (data._division_strategy) { 
                    // 1. ES CULTIVO GRANDE: Dividido por Estado
                    const subCollectionRef = collection(db, "datos_agricolas", cultivoName, "detalles");
                    const subDocsSnap = await getDocs(subCollectionRef);
                    
                    let combinedEntradas = [];
                    
                    // 2. Iteramos sobre los documentos de Estado
                    for (const subDoc of subDocsSnap.docs) {
                        const subData = subDoc.data();
                        
                        if (subData._division_strategy === "Subcolección /años") {
                             // 3. Sub-estrategia: Estado dividido por año
                            const anioCollectionRef = collection(db, "datos_agricolas", cultivoName, "detalles", subDoc.id, "años");
                            const anioDocsSnap = await getDocs(anioCollectionRef);
                            
                            anioDocsSnap.forEach(anioDoc => {
                                combinedEntradas = combinedEntradas.concat(anioDoc.data().entradas);
                            });
                            
                        } else {
                            // Estrategia: Documento de estado normal (incluye subData.entradas si existe)
                            combinedEntradas = combinedEntradas.concat(subData.entradas || []);
                        }
                    }
                    
                    setDatosCultivoActual({ entradas: combinedEntradas });

                } else {
                    // ESTRATEGIA PEQUEÑA: Documento Único (Cultivo < 1MB)
                    setDatosCultivoActual(data);
                }
            } else {
                setDatosCultivoActual({ entradas: [] });
                Alert.alert("Error", `No se encontraron datos para el cultivo: ${cultivoName}.`);
            }
        } catch (e) {
            console.error(`Error al cargar datos del cultivo ${cultivoName}:`, e);
            Alert.alert("Error de Conexión", "No se pudieron cargar los datos de Firebase. Revisa tu conexión y permisos.");
            setDatosCultivoActual({ entradas: [] });
        } finally {
            setIsLoading(false);
        }
    };
    // ----------------------------------------------------
    // ⬆️ FUNCIÓN CRÍTICA DE CARGA DESDE FIRESTORE ⬆️
    // ----------------------------------------------------
    
    // ------------------------------------
    // --- EFECTO Y FILTROS MEMORIZADOS ---
    // ------------------------------------
    
    // Cargar datos cuando cambia el filtro de cultivo
    useEffect(() => {
        loadCultivoData(cultivoFiltro);
        // Reiniciar filtros de estado/ciclo/año al cambiar de cultivo
        setEstadoFiltro('TODOS');
        setCicloFiltro('TODOS');
        setAnioFiltro('TODOS');
    }, [cultivoFiltro]);

    const entradas = datosCultivoActual.entradas || [];

    // Generar opciones de filtro y datos filtrados
    const { estados, ciclos, anios, datosFiltrados } = useMemo(() => {
        if (entradas.length === 0) {
            return { estados: [], ciclos: [], anios: [], datosFiltrados: [] };
        }

        const uniqueStates = new Set(['TODOS']);
        const uniqueCycles = new Set(['TODOS']);
        const uniqueYears = new Set(['TODOS']);
        
        // 1. Generar opciones de filtros
        entradas.forEach(e => {
            uniqueStates.add(e.state);
            uniqueCycles.add(e.cycle);
            uniqueYears.add(String(e.year));
        });

        // 2. Aplicar filtros
        const filteredData = entradas.filter(e => {
            const matchesEstado = estadoFiltro === 'TODOS' || e.state === estadoFiltro;
            const matchesCiclo = cicloFiltro === 'TODOS' || e.cycle === cicloFiltro;
            const matchesAnio = anioFiltro === 'TODOS' || String(e.year) === anioFiltro;
            return matchesEstado && matchesCiclo && matchesAnio;
        });

        return {
            estados: Array.from(uniqueStates).sort(),
            ciclos: Array.from(uniqueCycles).sort(),
            anios: Array.from(uniqueYears).sort((a, b) => Number(b) - Number(a)), // Orden descendente
            datosFiltrados: filteredData,
        };
    }, [entradas, estadoFiltro, cicloFiltro, anioFiltro]);


    // ------------------------------------
    // --- GRÁFICA DE TENDENCIA POR AÑO ---
    // ------------------------------------

    const chartData = useMemo(() => {
        if (datosFiltrados.length === 0) return null;

        const dataByYear = {};

        // 1. Sumar la métrica por año
        datosFiltrados.forEach(entry => {
            const year = String(entry.year);
            const metricValue = entry.metrics[metricaFiltro] || 0;

            if (!dataByYear[year]) {
                dataByYear[year] = { sum: 0, count: 0 };
            }
            dataByYear[year].sum += metricValue;
            dataByYear[year].count += 1;
        });

        // 2. Calcular el promedio o valor total según la métrica
        const years = Object.keys(dataByYear).sort((a, b) => Number(a) - Number(b));
        const dataPoints = years.map(year => {
             // Si es Rendimiento, calcular el promedio. Si son métricas de superficie/valor, usar el total.
            if (metricaFiltro === 'Rendimiento' || metricaFiltro === 'PrecioMedioRural') {
                return dataByYear[year].sum / dataByYear[year].count;
            }
            return dataByYear[year].sum;
        });

        // Asegurar que haya suficientes puntos para graficar (mínimo 2)
        if (years.length < 2) return null;

        return {
            labels: years,
            datasets: [{
                data: dataPoints
            }]
        };

    }, [datosFiltrados, metricaFiltro]);

    const chartLabel = METRICS_MAP[metricaFiltro] ? METRICS_MAP[metricaFiltro].label : metricaFiltro;


    // ------------------------------------
    // --- RENDERIZADO ---
    // ------------------------------------

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={{ marginTop: 10 }}>Cargando datos de {cultivoFiltro}...</Text>
            </View>
        );
    }
    
    return (
        <ScrollView style={styles.container}>
            <Text style={styles.titulo}>Datos Históricos de Producción</Text>
            <Text style={styles.subtitulo}>Cultivo: {cultivoFiltro}</Text>

            {/* --- BLOQUE DE FILTROS --- */}
            <View style={styles.filterCard}>
                <Text style={styles.subtituloFilter}>Filtros de Datos</Text>

                <View style={styles.filterGroupRow}>
                    {/* Filtro de Cultivo (Principal) */}
                    <View style={[styles.filterItem, { flex: 1.5 }]}>
                        <Text style={styles.label}>Cultivo:</Text>
                        <View style={styles.pickerWrapperCultivo}>
                            <Picker
                                selectedValue={cultivoFiltro}
                                onValueChange={(itemValue) => setCultivoFiltro(itemValue)}
                                style={styles.picker}
                            >
                                {todosLosCultivos.map(c => (
                                    <Picker.Item key={c} label={c} value={c} />
                                ))}
                            </Picker>
                        </View>
                    </View>
                    
                    {/* Filtro de Estado */}
                    <View style={styles.filterItem}>
                        <Text style={styles.label}>Estado:</Text>
                        <View style={styles.pickerWrapper}>
                            <Picker
                                selectedValue={estadoFiltro}
                                onValueChange={(itemValue) => setEstadoFiltro(itemValue)}
                                style={styles.picker}
                            >
                                {estados.map(e => (
                                    <Picker.Item key={e} label={e} value={e} />
                                ))}
                            </Picker>
                        </View>
                    </View>
                </View>

                <View style={styles.filterGroupRow}>
                    {/* Filtro de Ciclo */}
                    <View style={styles.filterItem}>
                        <Text style={styles.label}>Ciclo:</Text>
                        <View style={styles.pickerWrapper}>
                            <Picker
                                selectedValue={cicloFiltro}
                                onValueChange={(itemValue) => setCicloFiltro(itemValue)}
                                style={styles.picker}
                            >
                                {ciclos.map(c => (
                                    <Picker.Item key={c} label={c} value={c} />
                                ))}
                            </Picker>
                        </View>
                    </View>

                    {/* Filtro de Año */}
                    <View style={styles.filterItem}>
                        <Text style={styles.label}>Año:</Text>
                        <View style={styles.pickerWrapper}>
                            <Picker
                                selectedValue={anioFiltro}
                                onValueChange={(itemValue) => setAnioFiltro(itemValue)}
                                style={styles.picker}
                            >
                                {anios.map(a => (
                                    <Picker.Item key={a} label={a} value={a} />
                                ))}
                            </Picker>
                        </View>
                    </View>
                </View>
                
                {/* Filtro de Métrica para Gráfica */}
                <View style={[styles.filterItem, { width: '100%', marginTop: 5 }]}>
                    <Text style={styles.label}>Métrica para Gráfica de Tendencia (Promedio/Total anual):</Text>
                    <View style={styles.pickerWrapperCultivo}>
                        <Picker
                            selectedValue={metricaFiltro}
                            onValueChange={(itemValue) => setMetricaFiltro(itemValue)}
                            style={styles.picker}
                        >
                            {Object.keys(METRICS_MAP).map(k => (
                                <Picker.Item key={k} label={METRICS_MAP[k].label} value={k} />
                            ))}
                        </Picker>
                    </View>
                </View>
            </View>

            {/* --- BLOQUE DE GRÁFICAS --- */}
            {chartData && (
                <View style={styles.chartWrapper}>
                    <Text style={styles.chartTitle}>Tendencia Anual de {chartLabel}</Text>
                    <LineChart
                        data={chartData}
                        width={screenWidth - 40} // Ajuste de ancho
                        height={250}
                        chartConfig={CHART_CONFIG}
                        bezier // Curva suave
                        style={styles.chart}
                    />
                </View>
            )}
            
            {/* --- BLOQUE DE RESULTADOS DETALLADOS --- */}
            <Text style={styles.subtitulo}>Resultados Detallados ({datosFiltrados.length} entradas)</Text>

            {datosFiltrados.length > 0 ? (
                datosFiltrados.slice(0, 50).map((item, index) => (
                    <View key={index} style={styles.resultCard}>
                        <Text style={styles.cardHeader}>{item.state} - {item.municipality} ({item.year})</Text>
                        <Text style={styles.subCardHeader}>Ciclo: {item.cycle} | Modalidad: {item.modality} | Unidad: {item.unit}</Text>
                        
                        {Object.keys(item.metrics).map(key => (
                            <View key={key} style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{METRICS_MAP[key] ? METRICS_MAP[key].label : key}:</Text>
                                <Text style={styles.metricValue}>{item.metrics[key].toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</Text>
                            </View>
                        ))}
                    </View>
                ))
            ) : (
                !isLoading && <Text style={styles.emptyText}>No hay datos que coincidan con los filtros.</Text>
            )}
            
            {datosFiltrados.length > 50 && (
                 <Text style={[styles.emptyText, { color: '#D32F2F', fontWeight: 'bold' }]}>
                    Mostrando solo las primeras 50 entradas. Ajusta los filtros para una vista más específica.
                </Text>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#F9F9F9' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 50 },
    titulo: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
    subtitulo: { fontSize: 18, fontWeight: 'bold', marginTop: 10, marginBottom: 10, color: '#2E7D32' },
    subtituloFilter: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: '#004aad' },
    // Filtros
    filterCard: { backgroundColor: '#F0F4C3', padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#C5E1A5' },
    filterGroupRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    filterItem: { flex: 1, marginRight: 5, marginLeft: 5 },
    label: { fontSize: 12, fontWeight: '500', marginBottom: 3 },
    pickerWrapperCultivo: { borderWidth: 2, borderColor: '#004aad', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
    pickerWrapper: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff' },
    picker: { height: 40 },
    // Gráficas
    chartWrapper: { alignItems: 'center', marginVertical: 10, backgroundColor: '#fff', borderRadius: 16, padding: 5, borderWidth: 1, borderColor: '#eee' },
    chartTitle: { fontSize: 15, fontWeight: 'bold', marginTop: 5 },
    chart: { marginVertical: 8, borderRadius: 16 },
    emptyText: { textAlign: 'center', color: '#999', padding: 10, fontSize: 14 },
    // Tabla Detallada
    resultCard: { backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#ddd' },
    cardHeader: { fontSize: 16, fontWeight: 'bold', color: '#004aad', marginBottom: 5 },
    subCardHeader: { fontSize: 12, color: '#666', marginBottom: 5, fontStyle: 'italic' },
    metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    metricLabel: { fontSize: 14, color: '#333' },
    metricValue: { fontSize: 14, fontWeight: '600', color: '#555' }
});