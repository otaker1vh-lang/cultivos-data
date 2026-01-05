import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform, UIManager } from "react-native";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function DosisScreen() {
  
  // --- PARÁMETROS DE APLICACIÓN ---
  const [superficie, setSuperficie] = useState('');     // Hectáreas
  const [densidadPlantas, setDensidadPlantas] = useState(''); // Plantas por Hectárea (NUEVO)
  const [gastoAgua, setGastoAgua] = useState('');       // Litros por Hectárea
  const [capacidadTanque, setCapacidadTanque] = useState(''); // Litros del tanque

  // --- LISTA DE PRODUCTOS ---
  const [productos, setProductos] = useState([]);
  
  // Inputs temporales para agregar producto
  const [tempNombre, setTempNombre] = useState('');
  const [tempDosis, setTempDosis] = useState(''); // ml o gr por Litro de agua

  // --- RESULTADOS ---
  const [resultados, setResultados] = useState(null);

  // --- FUNCIÓN AGREGAR PRODUCTO A LA LISTA ---
  const agregarProducto = () => {
    if (!tempNombre || !tempDosis) {
        Alert.alert("Datos incompletos", "Ingresa nombre y dosis del producto.");
        return;
    }
    const nuevoProducto = {
        id: Date.now().toString(),
        nombre: tempNombre,
        dosis: parseFloat(tempDosis)
    };
    setProductos([...productos, nuevoProducto]);
    setTempNombre('');
    setTempDosis('');
    setResultados(null);
  };

  const eliminarProducto = (id) => {
    setProductos(productos.filter(p => p.id !== id));
    setResultados(null);
  };

  // --- FUNCIÓN CALCULAR ---
  const calcular = () => {
    // Validaciones
    const sup = parseFloat(superficie);
    const dens = parseFloat(densidadPlantas);
    const gasto = parseFloat(gastoAgua);
    const capTanque = parseFloat(capacidadTanque);

    if (!sup || !gasto || !capTanque || !dens) {
        Alert.alert("Faltan datos", "Por favor ingresa Superficie, Densidad, Gasto de Agua y Capacidad del Tanque.");
        return;
    }
    if (productos.length === 0) {
        Alert.alert("Sin productos", "Agrega al menos un producto a la mezcla.");
        return;
    }

    // 1. Cálculos Generales
    const totalAguaRequerida = sup * gasto; // Litros totales
    const numeroTanques = totalAguaRequerida / capTanque; 
    const totalPlantas = sup * dens; // Total de plantas en el lote

    // 2. Cálculo por Producto
    const listaCalculada = productos.map(prod => {
        const porTanque = prod.dosis * capTanque; // Cuánto echar en un tanque lleno
        const totalNecesario = prod.dosis * totalAguaRequerida; // Cuánto se necesita para toda la superficie
        
        // Dosis por planta = Total Producto / Total Plantas
        const porPlanta = totalPlantas > 0 ? (totalNecesario / totalPlantas) : 0;

        return {
            ...prod,
            porTanque: porTanque,
            totalNecesario: totalNecesario,
            porPlanta: porPlanta
        };
    });

    setResultados({
        totalAgua: totalAguaRequerida,
        numTanques: numeroTanques,
        totalPlantas: totalPlantas,
        detalleProductos: listaCalculada
    });
  };

  const limpiar = () => {
    setSuperficie('');
    setDensidadPlantas('');
    setGastoAgua('');
    setCapacidadTanque('');
    setProductos([]);
    setResultados(null);
  };

  // --- EXPORTAR PDF ---
  const exportarPDF = async () => {
    if (!resultados) return;
    
    const filasTabla = resultados.detalleProductos.map(p => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${p.nombre}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${p.dosis} ml/L</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>${p.porPlanta.toFixed(2)} ml</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${p.porTanque.toFixed(1)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #D32F2F;"><strong>${p.totalNecesario.toFixed(1)}</strong></td>
        </tr>
    `).join('');

    try {
        const html = `
            <html>
            <head>
                <style>
                    body { font-family: Helvetica, sans-serif; padding: 20px; }
                    h1 { color: #1565C0; text-align: center;}
                    .box { background: #E3F2FD; padding: 15px; border-radius: 8px; border: 1px solid #BBDEFB; margin-bottom: 20px;}
                    .stat-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
                    .label { font-weight: bold; color: #555; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #1565C0; color: white; padding: 10px; text-align: left; font-size: 12px; }
                    td { font-size: 13px; }
                    .highlight { font-size: 18px; font-weight: bold; color: #000; }
                </style>
            </head>
            <body>
                <h1>Reporte de Aplicación</h1>
                
                <div class="box">
                    <h3>Datos del Lote</h3>
                    <div class="stat-row"><span class="label">Superficie:</span> <span>${superficie} Has</span></div>
                    <div class="stat-row"><span class="label">Densidad:</span> <span>${densidadPlantas} Plantas/Ha</span></div>
                    <div class="stat-row"><span class="label">Total Plantas:</span> <span>${resultados.totalPlantas.toLocaleString()}</span></div>
                    <hr/>
                    <div class="stat-row"><span class="label">Gasto Agua:</span> <span>${gastoAgua} L/Ha</span></div>
                    <div class="stat-row"><span class="label">Capacidad Tanque:</span> <span>${capacidadTanque} Litros</span></div>
                    <div class="stat-row"><span class="label">AGUA TOTAL:</span> <span class="highlight">${resultados.totalAgua.toFixed(1)} L</span></div>
                    <div class="stat-row"><span class="label">TANQUES:</span> <span class="highlight">${resultados.numTanques.toFixed(2)}</span></div>
                </div>

                <h3>Desglose de Productos</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th>Concen.</th>
                            <th>Por Planta</th>
                            <th>Por Tanque</th>
                            <th>Total Lote</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasTabla}
                    </tbody>
                </table>

                <p style="font-size: 10px; color: #999; margin-top: 50px; text-align: center;">Generado por RóslinaApp</p>
            </body>
            </html>
        `;
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) {
        Alert.alert("Error", "No se pudo crear el PDF");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{paddingBottom: 40}}>
      <Text style={styles.headerTitle}>🧪 Calculadora Agrícola</Text>

      {/* SECCIÓN 1: CONFIGURACIÓN GENERAL */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>1. Datos del Cultivo y Riego</Text>
        
        {/* FILA 1: Superficie y Densidad */}
        <View style={styles.row}>
            <View style={styles.inputContainer}>
                <Text style={styles.label}>Superficie (Has):</Text>
                <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    placeholder="Ej. 5" 
                    value={superficie} 
                    onChangeText={setSuperficie} 
                />
            </View>
            <View style={styles.inputContainer}>
                <Text style={styles.label}>Plantas por Ha:</Text>
                <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    placeholder="Ej. 50000" 
                    value={densidadPlantas} 
                    onChangeText={setDensidadPlantas} 
                />
            </View>
        </View>

        {/* FILA 2: Gasto y Tanque */}
        <View style={styles.row}>
            <View style={styles.inputContainer}>
                <Text style={styles.label}>Gasto Agua (L/Ha):</Text>
                <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    placeholder="Ej. 200" 
                    value={gastoAgua} 
                    onChangeText={setGastoAgua} 
                />
            </View>
            <View style={styles.inputContainer}>
                <Text style={styles.label}>Cap. Tanque (L):</Text>
                <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    placeholder="Ej. 200" 
                    value={capacidadTanque} 
                    onChangeText={setCapacidadTanque} 
                />
            </View>
        </View>
      </View>

      {/* SECCIÓN 2: AGREGAR PRODUCTOS */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>2. Composición de la Mezcla</Text>
        <Text style={styles.subLabel}>Productos a aplicar en el tanque.</Text>

        <View style={styles.row}>
            <View style={[styles.inputContainer, {flex: 2}]}>
                <TextInput 
                    style={styles.inputSmall} 
                    placeholder="Nombre (Ej. Fungicida)" 
                    value={tempNombre} 
                    onChangeText={setTempNombre} 
                />
            </View>
            <View style={[styles.inputContainer, {flex: 1}]}>
                <TextInput 
                    style={styles.inputSmall} 
                    keyboardType="numeric" 
                    placeholder="Dosis (ml/L)" 
                    value={tempDosis} 
                    onChangeText={setTempDosis} 
                />
            </View>
            <TouchableOpacity style={styles.btnAdd} onPress={agregarProducto}>
                <MaterialCommunityIcons name="plus" size={24} color="#FFF" />
            </TouchableOpacity>
        </View>

        {/* LISTA DE PRODUCTOS AGREGADOS */}
        {productos.length > 0 ? (
            <View style={styles.listContainer}>
                {productos.map((item, index) => (
                    <View key={item.id} style={styles.productRow}>
                        <View style={{flex: 1}}>
                             <Text style={styles.prodName}>{index + 1}. {item.nombre}</Text>
                             <Text style={styles.prodDosis}>CC: {item.dosis} ml/L agua</Text>
                        </View>
                        <TouchableOpacity onPress={() => eliminarProducto(item.id)}>
                            <MaterialCommunityIcons name="trash-can-outline" size={22} color="#D32F2F" />
                        </TouchableOpacity>
                    </View>
                ))}
            </View>
        ) : (
            <Text style={styles.emptyText}>No hay productos agregados.</Text>
        )}
      </View>

      {/* BOTONES DE ACCIÓN */}
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.btnOutline} onPress={limpiar}>
            <Text style={styles.btnOutlineText}>Borrar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={calcular}>
            <Text style={styles.btnText}>CALCULAR</Text>
        </TouchableOpacity>
      </View>

      {/* SECCIÓN 3: RESULTADOS */}
      {resultados && (
          <View style={[styles.card, styles.resultCard]}>
              <Text style={styles.resultTitle}>📊 Resultados</Text>
              
              {/* Resumen General */}
              <View style={styles.summaryBox}>
                  <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>Agua Total</Text>
                      <Text style={styles.summaryValue}>{resultados.totalAgua.toLocaleString()} L</Text>
                  </View>
                  <View style={styles.dividerVertical}/>
                  <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>Tanques</Text>
                      <Text style={[styles.summaryValue, {color: '#D32F2F'}]}>{resultados.numTanques.toFixed(2)}</Text>
                  </View>
              </View>
              
              <View style={{marginTop: 10, alignItems: 'center'}}>
                 <Text style={{fontSize: 12, color: '#666'}}>Total Plantas en Lote: <Text style={{fontWeight:'bold'}}>{resultados.totalPlantas.toLocaleString()}</Text></Text>
              </View>

              <Text style={[styles.sectionTitle, {marginTop: 15}]}>Detalle por Producto:</Text>
              
              {resultados.detalleProductos.map((prod) => (
                  <View key={prod.id} style={styles.resultItem}>
                      <Text style={styles.resultProdName}>{prod.nombre}</Text>
                      
                      {/* Dosis por Planta (DESTACADO) */}
                      <View style={{backgroundColor: '#E3F2FD', padding: 5, borderRadius: 5, marginBottom: 8, alignSelf: 'flex-start'}}>
                         <Text style={{color: '#1565C0', fontWeight: 'bold', fontSize: 13}}>
                            💊 {prod.porPlanta.toFixed(2)} ml / planta
                         </Text>
                      </View>

                      <View style={styles.resultDetailsRow}>
                          <Text style={styles.resultDetail}>
                              <Text style={{fontWeight:'bold'}}>Por Tanque:</Text> {prod.porTanque.toFixed(1)} ml
                          </Text>
                          <Text style={styles.resultDetail}>
                              <Text style={{fontWeight:'bold'}}>Total Lote:</Text> {prod.totalNecesario.toFixed(1)} ml
                          </Text>
                      </View>
                  </View>
              ))}

              <TouchableOpacity style={styles.btnPdf} onPress={exportarPDF}>
                  <MaterialCommunityIcons name="file-pdf-box" size={24} color="#FFF" style={{marginRight: 10}}/>
                  <Text style={styles.btnText}>Generar PDF</Text>
              </TouchableOpacity>
          </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#F5F7FA" },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#1B5E20", textAlign: "center", marginBottom: 15 },
  
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 15, marginBottom: 15, elevation: 2, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 3 },
  resultCard: { borderColor: '#1B5E20', borderWidth: 1, backgroundColor: '#E8F5E9' },
  
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#2E7D32", marginBottom: 10 },
  subLabel: { fontSize: 12, color: "#777", marginBottom: 10 },
  label: { fontSize: 13, fontWeight: "600", color: "#444", marginBottom: 5 },
  
  input: { backgroundColor: "#FAFAFA", borderWidth: 1, borderColor: "#E0E0E0", borderRadius: 8, padding: 10, fontSize: 16, color: "#333" },
  inputSmall: { backgroundColor: "#FAFAFA", borderWidth: 1, borderColor: "#E0E0E0", borderRadius: 8, padding: 10, fontSize: 14, color: "#333", height: 50 },
  
  row: { flexDirection: "row", gap: 10, alignItems: 'center', marginBottom: 10 },
  inputContainer: { flex: 1 },
  
  btnAdd: { backgroundColor: "#2E7D32", width: 50, height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 0 },
  
  listContainer: { marginTop: 10, backgroundColor: '#F9F9F9', borderRadius: 8, padding: 5 },
  productRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  prodName: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  prodDosis: { fontSize: 12, color: '#666' },
  emptyText: { textAlign: 'center', color: '#999', padding: 10, fontStyle: 'italic' },

  btnRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  btnPrimary: { flex: 1, backgroundColor: "#1565C0", padding: 15, borderRadius: 10, alignItems: "center", elevation: 3 },
  btnOutline: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#1565C0", padding: 15, borderRadius: 10, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  btnOutlineText: { color: "#1565C0", fontWeight: "bold", fontSize: 16 },

  resultTitle: { fontSize: 20, fontWeight: "bold", color: "#1B5E20", textAlign: 'center', marginBottom: 15 },
  summaryBox: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 10, padding: 15, justifyContent: 'space-around', elevation: 1 },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { fontSize: 12, color: '#777', textTransform: 'uppercase' },
  summaryValue: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  dividerVertical: { width: 1, backgroundColor: '#DDD', height: '100%' },

  resultItem: { backgroundColor: '#FFF', padding: 12, borderRadius: 8, marginTop: 8 },
  resultProdName: { fontWeight: 'bold', fontSize: 16, color: '#333', marginBottom: 4 },
  resultDetailsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  resultDetail: { fontSize: 13, color: '#555' },

  btnPdf: { flexDirection: 'row', backgroundColor: "#455A64", padding: 12, borderRadius: 8, alignItems: "center", justifyContent: 'center', marginTop: 20 },
});