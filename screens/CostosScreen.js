import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Keyboard 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PieChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';

const screenWidth = Dimensions.get("window").width;

export default function CostosScreen({ route }) {
  // Try to get crop name from route, otherwise generic
  const { cultivo } = route.params || { cultivo: 'Mi Cultivo' };
  const STORAGE_KEY = `@finanzas_user_${cultivo}`;

  // --- STATES ---
  const [hectareas, setHectareas] = useState('1');
  const [rendimiento, setRendimiento] = useState(''); // Ton/Ha
  const [precioVenta, setPrecioVenta] = useState(''); // $/Ton
  
  // Cost List
  const [conceptos, setConceptos] = useState([]);
  const [nuevoConcepto, setNuevoConcepto] = useState('');
  const [nuevoCosto, setNuevoCosto] = useState('');

  // Results
  const [resultados, setResultados] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    calcularResultados();
    guardarDatos();
  }, [hectareas, rendimiento, precioVenta, conceptos]);

  // --- PERSISTENCE ---
  const cargarDatos = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
      if (jsonValue != null) {
        const data = JSON.parse(jsonValue);
        setHectareas(data.hectareas || '1');
        setRendimiento(data.rendimiento || '');
        setPrecioVenta(data.precioVenta || '');
        setConceptos(data.conceptos || []);
      }
    } catch(e) { console.log(e); }
  };

  const guardarDatos = async () => {
    try {
      const data = { hectareas, rendimiento, precioVenta, conceptos };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { console.log(e); }
  };

  // --- LOGIC ---
  const agregarCosto = () => {
    if (!nuevoConcepto.trim() || !nuevoCosto.trim()) {
        Alert.alert("Error", "Ingresa nombre y monto.");
        return;
    }
    const nuevo = {
        id: Date.now().toString(),
        nombre: nuevoConcepto,
        monto: parseFloat(nuevoCosto) || 0,
        color: getRandomColor()
    };
    setConceptos([...conceptos, nuevo]);
    setNuevoConcepto('');
    setNuevoCosto('');
    Keyboard.dismiss();
  };

  const eliminarCosto = (id) => {
    setConceptos(conceptos.filter(c => c.id !== id));
  };

  const calcularResultados = () => {
    const ha = parseFloat(hectareas) || 1;
    const rend = parseFloat(rendimiento) || 0;
    const precio = parseFloat(precioVenta) || 0;

    // 1. Ingresos Esperados
    const produccionTotal = ha * rend;
    const ingresoTotal = produccionTotal * precio;

    // 2. Costos Totales
    // Sumamos los costos unitarios y multiplicamos por hectáreas (asumiendo input es por Ha)
    // O asumimos que el usuario mete el costo TOTAL del lote. 
    // *Diseño*: Asumiremos que el usuario mete Costo POR HECTÁREA para escalar fácil.
    const costoPorHa = conceptos.reduce((acc, item) => acc + item.monto, 0);
    const costoTotal = costoPorHa * ha;

    // 3. Utilidad
    const utilidad = ingresoTotal - costoTotal;

    // 4. ROI ((Utilidad / Inversión) * 100)
    const roi = costoTotal > 0 ? ((utilidad / costoTotal) * 100).toFixed(1) : 0;

    // 5. Punto de Equilibrio (En toneladas) = Costo Total / Precio Venta
    const puntoEquilibrio = precio > 0 ? (costoTotal / precio).toFixed(2) : 0;

    setResultados({
        ingresoTotal,
        costoTotal,
        utilidad,
        roi,
        puntoEquilibrio,
        produccionTotal
    });
  };

  const getRandomColor = () => {
    const colors = ['#E57373', '#F06292', '#BA68C8', '#9575CD', '#7986CB', '#64B5F6', '#4FC3F7', '#4DD0E1', '#4DB6AC', '#81C784', '#AED581', '#FFD54F', '#FFB74D', '#FF8A65'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // --- CHART DATA PREP ---
  const chartData = conceptos.map(c => ({
    name: c.nombre,
    population: c.monto,
    color: c.color,
    legendFontColor: "#7F7F7F",
    legendFontSize: 11
  }));

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>💰 Análisis Financiero</Text>
        <Text style={styles.subtitle}>{cultivo}</Text>
      </View>

      {/* 1. CONFIGURACIÓN DEL LOTE */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>1. Configuración Productiva</Text>
        <View style={styles.rowInput}>
            <View style={{flex:1, marginRight:5}}>
                <Text style={styles.label}>Superficie (Ha)</Text>
                <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    value={hectareas} 
                    onChangeText={setHectareas} 
                    placeholder="1"
                />
            </View>
            <View style={{flex:1, marginLeft:5, marginRight:5}}>
                <Text style={styles.label}>Rend. (Ton/Ha)</Text>
                <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    value={rendimiento} 
                    onChangeText={setRendimiento} 
                    placeholder="Ej. 10"
                />
            </View>
            <View style={{flex:1, marginLeft:5}}>
                <Text style={styles.label}>Precio ($/Ton)</Text>
                <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    value={precioVenta} 
                    onChangeText={setPrecioVenta} 
                    placeholder="Ej. 5000"
                />
            </View>
        </View>
      </View>

      {/* 2. REGISTRO DE COSTOS */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>2. Costos Directos (por Ha)</Text>
        <View style={styles.addRow}>
            <TextInput 
                style={[styles.input, {flex: 2, marginRight: 5}]} 
                placeholder="Concepto (ej. Semilla)" 
                value={nuevoConcepto}
                onChangeText={setNuevoConcepto}
            />
            <TextInput 
                style={[styles.input, {flex: 1, marginRight: 5}]} 
                placeholder="$ Costo" 
                keyboardType="numeric"
                value={nuevoCosto}
                onChangeText={setNuevoCosto}
            />
            <TouchableOpacity style={styles.addBtn} onPress={agregarCosto}>
                <MaterialCommunityIcons name="plus" size={24} color="#fff" />
            </TouchableOpacity>
        </View>

        {conceptos.length > 0 ? (
            <View style={styles.listContainer}>
                {conceptos.map((item) => (
                    <View key={item.id} style={styles.listItem}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <View style={[styles.dot, {backgroundColor: item.color}]} />
                            <Text style={styles.itemText}>{item.nombre}</Text>
                        </View>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <Text style={styles.itemCost}>${item.monto.toLocaleString()}</Text>
                            <TouchableOpacity onPress={() => eliminarCosto(item.id)} style={{marginLeft:10}}>
                                <MaterialCommunityIcons name="trash-can-outline" size={20} color="#EF5350" />
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Inversión/Ha:</Text>
                    <Text style={styles.totalValue}>
                        ${conceptos.reduce((a,b)=>a+b.monto,0).toLocaleString()}
                    </Text>
                </View>
            </View>
        ) : (
            <Text style={styles.emptyText}>Agrega tus costos (insumos, mano de obra, riego...).</Text>
        )}
      </View>

      {/* 3. RESULTADOS Y GRÁFICA */}
      {conceptos.length > 0 && resultados && (
          <>
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>3. Distribución de Gastos</Text>
                <PieChart
                    data={chartData}
                    width={screenWidth - 60}
                    height={200}
                    chartConfig={{
                        color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    }}
                    accessor={"population"}
                    backgroundColor={"transparent"}
                    paddingLeft={"15"}
                    absolute
                />
            </View>

            <View style={[styles.card, {borderLeftWidth:5, borderLeftColor: resultados.utilidad >= 0 ? '#4CAF50' : '#F44336'}]}>
                <Text style={styles.sectionTitle}>4. Indicadores Financieros (Total Lote)</Text>
                
                <View style={styles.resultRow}>
                    <Text style={styles.resLabel}>Ventas Totales ({resultados.produccionTotal.toFixed(1)} ton)</Text>
                    <Text style={[styles.resValue, {color: '#1976D2'}]}>${resultados.ingresoTotal.toLocaleString()}</Text>
                </View>
                
                <View style={styles.resultRow}>
                    <Text style={styles.resLabel}>Costo Total Producción</Text>
                    <Text style={[styles.resValue, {color: '#D32F2F'}]}>- ${resultados.costoTotal.toLocaleString()}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.resultRow}>
                    <Text style={[styles.resLabel, {fontWeight:'bold', fontSize:16}]}>Utilidad Neta</Text>
                    <Text style={[styles.resValue, {fontWeight:'bold', fontSize:18, color: resultados.utilidad >= 0 ? '#2E7D32' : '#C62828'}]}>
                        ${resultados.utilidad.toLocaleString()}
                    </Text>
                </View>

                <View style={styles.indicatorsRow}>
                    <View style={styles.indicatorBox}>
                        <Text style={styles.indLabel}>Rentabilidad (ROI)</Text>
                        <Text style={[styles.indValue, {color: resultados.roi > 0 ? '#2E7D32' : '#C62828'}]}>{resultados.roi}%</Text>
                    </View>
                    <View style={styles.indicatorBox}>
                        <Text style={styles.indLabel}>Punto Equilibrio</Text>
                        <Text style={styles.indValue}>{resultados.puntoEquilibrio} ton</Text>
                        <Text style={styles.indSub}>para no perder</Text>
                    </View>
                </View>
            </View>
          </>
      )}

      <View style={{height: 40}}/>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 15 },
  header: { marginBottom: 15, alignItems:'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  subtitle: { fontSize: 14, color: '#666' },
  
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#37474F', marginBottom: 12 },
  
  rowInput: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 12, color: '#546E7A', marginBottom: 5, fontWeight: '600' },
  input: { backgroundColor: '#ECEFF1', borderRadius: 8, padding: 10, fontSize: 14, borderWidth: 1, borderColor: '#CFD8DC', color: '#333' },
  
  addRow: { flexDirection: 'row', alignItems: 'center' },
  addBtn: { backgroundColor: '#2E7D32', padding: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  
  listContainer: { marginTop: 15 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  itemText: { fontSize: 14, color: '#333' },
  itemCost: { fontSize: 14, fontWeight: 'bold', color: '#455A64' },
  
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#CFD8DC' },
  totalLabel: { fontWeight: 'bold', color: '#333' },
  totalValue: { fontWeight: 'bold', color: '#D32F2F', fontSize: 16 },
  
  emptyText: { color: '#999', fontStyle: 'italic', marginTop: 10, textAlign:'center' },
  
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  resLabel: { fontSize: 14, color: '#555' },
  resValue: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 8 },
  
  indicatorsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, backgroundColor: '#F9FAFB', padding: 10, borderRadius: 8 },
  indicatorBox: { flex: 1, alignItems: 'center' },
  indLabel: { fontSize: 12, color: '#777', fontWeight: 'bold' },
  indValue: { fontSize: 18, fontWeight: 'bold', marginTop: 2 },
  indSub: { fontSize: 10, color: '#999' }
});