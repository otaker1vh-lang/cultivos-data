import React, { useState, useMemo, useEffect } from "react";
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, 
  Alert, LayoutAnimation, Platform, UIManager, Modal, Switch 
} from "react-native";
import { Picker } from '@react-native-picker/picker'; 
import { MaterialCommunityIcons } from '@expo/vector-icons';
import cultivosData from "../data/cultivos.json"; 
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// --- CONSTANTES ---
const FERTILIZANTES_BASE = [
  { nombre: 'Urea', N: 46, P: 0, K: 0, simbolo: 'N' },
  { nombre: 'Sulfato de Amonio', N: 21, P: 0, K: 0, simbolo: 'N' },
  { nombre: 'Fosfato Diamónico (DAP)', N: 18, P: 46, K: 0, simbolo: 'P' },
  { nombre: 'Fosfato Monoamónico (MAP)', N: 11, P: 52, K: 0, simbolo: 'P' },
  { nombre: 'Cloruro de Potasio (KCl)', N: 0, P: 0, K: 60, simbolo: 'K' },
  { nombre: 'Nitrato de Potasio', N: 13, P: 0, K: 44, simbolo: 'K' },
  { nombre: 'Triple 17', N: 17, P: 17, K: 17, simbolo: 'Balanceado' },
];

const COLORS = {
  primary: '#2E7D32', 
  headerBg: '#37474F', 
  secondary: '#81C784', 
  accent: '#FF9800', 
  bg: '#F5F7FA',
  white: '#FFFFFF',
  text: '#263238',
  error: '#D32F2F',
  purple: '#8E24AA',
  gray: '#78909C'
};

// Función auxiliar para colores dinámicos
const getNutrientColor = (nutriente) => {
    switch(nutriente) {
        case 'N': return COLORS.primary;
        case 'P': return COLORS.accent;
        case 'K': return COLORS.purple;
        default: return COLORS.gray; 
    }
};

export default function FertilizanteScreen({ route, navigation }) {
  const { cultivo } = route.params || { cultivo: 'Cultivo General' };
  
  const cultivoData = cultivosData?.cultivos?.[cultivo];
  const dataFertilizacion = cultivoData?.calculo_fertilizacion || null;
  // NUEVO: Obtener sistemas de plantación del JSON
  const sistemasPlantacion = cultivoData?.ciclo_fenologico?.densidad_plantacion?.sistemas || [];

  // --- ESTADOS DE UI ---
  const [activeSection, setActiveSection] = useState('calculadora'); 

  // --- DENSIDAD (Lógica Avanzada Integrada) ---
  const [sistemaSeleccionado, setSistemaSeleccionado] = useState(sistemasPlantacion.length > 0 ? sistemasPlantacion[0] : null);
  const [esManual, setEsManual] = useState(sistemasPlantacion.length === 0);
  const [esDobleHilera, setEsDobleHilera] = useState(false);
  const [esTresbolillo, setEsTresbolillo] = useState(false);

  const [distanciaPlantas, setDistanciaPlantas] = useState('');
  const [distanciaSurcos, setDistanciaSurcos] = useState('');
  const [hectareas, setHectareas] = useState('1');
  const [totalPlantas, setTotalPlantas] = useState(0);

  // --- FERTILIZACIÓN ---
  const [aplicaciones, setAplicaciones] = useState([]);
  const [fertilizantesPersonalizados, setFertilizantesPersonalizados] = useState([]);
  
  // Estado para nutrientes extra (Ca, Mg, S...)
  const [nutrientesExtras, setNutrientesExtras] = useState([]); 
  const [nuevoNutrienteInput, setNuevoNutrienteInput] = useState('');

  const [fertilizanteSeleccionado, setFertilizanteSeleccionado] = useState(FERTILIZANTES_BASE[0]);
  const [dosisNutrientePura, setDosisNutrientePura] = useState(''); 
  const [nutrienteAcalcular, setNutrienteAcalcular] = useState('N');

  // Modales
  const [modalFuenteVisible, setModalFuenteVisible] = useState(false);
  const [nuevaFuente, setNuevaFuente] = useState({ nombre: '' });
  const [comentariosFinales, setComentariosFinales] = useState('');

  // Metas
  const dosisRecomendada = dataFertilizacion?.recomendada || { N: 100, P: 50, K: 50 };
  const [dosisObjetivoPersonalizada, setDosisObjetivoPersonalizada] = useState(() => ({
      N: dosisRecomendada.N || 0,
      P: dosisRecomendada.P || 0,
      K: dosisRecomendada.K || 0,
  }));

  // Listas Combinadas Dinámicas
  const todosLosNutrientes = useMemo(() => [ 'N', 'P', 'K', ...nutrientesExtras ], [nutrientesExtras]);
  const todosLosFertilizantes = useMemo(() => [ ...FERTILIZANTES_BASE, ...fertilizantesPersonalizados ], [fertilizantesPersonalizados]);

  // --- CALCULO AUTOMATICO DE PLANTAS (MEJORADO) ---
  useEffect(() => {
    const ha = parseFloat(hectareas) || 0;
    
    if (esManual) {
        // Cálculo Manual con modificadores
        const dp = parseFloat(distanciaPlantas);
        const ds = parseFloat(distanciaSurcos);
        
        if (ha > 0 && dp > 0 && ds > 0) {
            let densidad = 10000 / (dp * ds);
            
            // Aplicar modificadores
            if (esTresbolillo) densidad = densidad * 1.1547; // +15% aprox
            if (esDobleHilera) densidad = densidad * 2;      // x2
            
            setTotalPlantas(Math.round(ha * densidad));
        } else {
            setTotalPlantas(0);
        }
    } else {
        // Cálculo desde JSON
        if (sistemaSeleccionado) {
            setTotalPlantas(Math.round(ha * sistemaSeleccionado.arboles_ha));
        }
    }
  }, [hectareas, distanciaPlantas, distanciaSurcos, esManual, sistemaSeleccionado, esDobleHilera, esTresbolillo]);

  // Balance en tiempo real
  const balance = useMemo(() => {
    const aportes = {}; 
    todosLosNutrientes.forEach(key => aportes[key] = 0); 

    aplicaciones.forEach(app => {
      const dosisComercial = app.dosisAplicada;
      todosLosNutrientes.forEach(nutriente => {
          if (app[nutriente] !== undefined && app[nutriente] > 0) {
              aportes[nutriente] += dosisComercial * (app[nutriente] / 100);
          }
      });
    });

    return { aportes, metas: dosisObjetivoPersonalizada };
  }, [aplicaciones, dosisObjetivoPersonalizada, todosLosNutrientes]);

  // --- FUNCIONES LOGICAS ---
  const agregarNuevoElemento = () => {
      const nombre = nuevoNutrienteInput.trim();
      if (!nombre) return;
      if (todosLosNutrientes.includes(nombre)) {
          Alert.alert("Existente", "Este nutriente ya está en la lista.");
          return;
      }
      setNutrientesExtras([...nutrientesExtras, nombre]);
      setDosisObjetivoPersonalizada(prev => ({ ...prev, [nombre]: 0 }));
      setNuevoNutrienteInput('');
  };

  const agregarFertilizantePersonalizado = () => {
    const { nombre, ...restoNutrientes } = nuevaFuente;
    if (!nombre) { Alert.alert("Falta Nombre", "Asigna un nombre al fertilizante."); return; }
    
    const composicion = {};
    todosLosNutrientes.forEach(nut => {
        composicion[nut] = parseFloat(restoNutrientes[nut]) || 0;
    });
    
    const nuevo = { nombre, ...composicion, simbolo: 'Mix' };
    setFertilizantesPersonalizados([...fertilizantesPersonalizados, nuevo]);
    setNuevaFuente({ nombre: '' });
    setModalFuenteVisible(false);
  };

  const calcularYAgregarAplicacion = () => {
    const dosisPura = parseFloat(dosisNutrientePura);
    if (!dosisPura || dosisPura <= 0) { Alert.alert("Error", "Ingresa la cantidad de Kg requeridos."); return; }
    
    const conc = fertilizanteSeleccionado[nutrienteAcalcular];
    if (!conc || conc === 0) {
        Alert.alert("Incompatible", `El fertilizante ${fertilizanteSeleccionado.nombre} no contiene ${nutrienteAcalcular}.`);
        return;
    }

    const dosisComercial = (dosisPura / conc) * 100;
    const nutrientesAportados = {};
    
    todosLosNutrientes.forEach(nut => {
        const c = fertilizanteSeleccionado[nut] || 0;
        if (c > 0) nutrientesAportados[nut] = dosisComercial * (c / 100);
    });

    setAplicaciones([...aplicaciones, { 
        ...fertilizanteSeleccionado, 
        dosisAplicada: dosisComercial,
        dosisTotalLote: dosisComercial * parseFloat(hectareas || 1),
        aportes: nutrientesAportados
    }]);
    setDosisNutrientePura('');
  };

  const eliminarAplicacion = (i) => setAplicaciones(aplicaciones.filter((_, idx) => idx !== i));

  const editarAplicacion = (index) => {
    const item = aplicaciones[index];
    const original = todosLosFertilizantes.find(f => f.nombre === item.nombre);
    if (original) setFertilizanteSeleccionado(original);
    eliminarAplicacion(index);
    Alert.alert("Modificar Dosis", `Se ha cargado ${item.nombre}. Modifica y vuelve a agregar.`);
  };

  // --- PDF ---
  const exportarPDF = async () => {
    try {
      const headersNutrientes = todosLosNutrientes.map(n => `<th>${n}</th>`).join('');
      const filas = aplicaciones.map(app => {
          const celdasAportes = todosLosNutrientes.map(n => 
              `<td>${(app.aportes[n] || 0) > 0 ? (app.aportes[n]).toFixed(1) : '-'}</td>`
          ).join('');
          return `
            <tr>
              <td>${app.nombre}</td>
              <td>${app.dosisAplicada.toFixed(1)}</td>
              <td>${app.dosisTotalLote.toFixed(1)}</td>
              ${celdasAportes}
            </tr>`;
      }).join('');

      const html = `
        <html>
          <body style="font-family: sans-serif; padding: 20px;">
            <h1 style="color: #2E7D32; text-align: center;">Plan de Nutrición: ${cultivo}</h1>
            <div style="background:#E8F5E9; padding:15px; border-radius:10px; margin-bottom:20px;">
               <p><strong>Superficie:</strong> ${hectareas} ha</p>
               <p><strong>Población:</strong> ${totalPlantas.toLocaleString()} plantas</p>
               <p><strong>Sistema:</strong> ${esManual ? 'Manual / Personalizado' : (sistemaSeleccionado?.nombre || 'Estándar')}</p>
            </div>
            <table border="1" style="width:100%; border-collapse: collapse; text-align:center; font-size:12px;">
              <tr style="background:#2E7D32; color:white;">
                  <th>Fuente</th><th>Kg/Ha</th><th>Total (Kg)</th>${headersNutrientes}
              </tr>
              ${filas}
            </table>
            <p><strong>Notas:</strong> ${comentariosFinales}</p>
          </body>
        </html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) { Alert.alert("Error", "No se pudo generar PDF"); }
  };

  // --- COMPONENTES VISUALES ---
  const ProgressBar = ({ label, current, target, color }) => {
    const safeTarget = target || 0;
    const percent = safeTarget > 0 ? Math.min((current / safeTarget) * 100, 100) : (current > 0 ? 100 : 0);
    const faltante = Math.max(safeTarget - current, 0);
    return (
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
            <Text style={{ fontWeight: 'bold', color: '#555' }}>{label}</Text>
            <Text style={{ fontSize: 12, color: faltante > 0 ? '#D32F2F' : COLORS.primary }}>
                {safeTarget === 0 && current > 0 ? 'Extra Agregado' : (faltante > 0 ? `Faltan ${faltante.toFixed(0)} kg` : 'Cubierto ✅')}
            </Text>
        </View>
        <View style={{ height: 10, backgroundColor: '#E0E0E0', borderRadius: 5, overflow: 'hidden' }}>
            <View style={{ width: `${percent}%`, height: '100%', backgroundColor: color }} />
        </View>
        <Text style={{ fontSize: 10, color: '#999', textAlign: 'right', marginTop: 2 }}>
            {current.toFixed(0)} / {safeTarget} kg
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{flex: 1}}>
            <Text style={styles.headerTitle}>{cultivo}</Text>
            <Text style={styles.headerSubtitle}>Nutrición • {hectareas} Ha • {totalPlantas.toLocaleString()} Plantas</Text>
        </View>
        <TouchableOpacity onPress={() => setActiveSection(activeSection === 'config' ? 'calculadora' : 'config')} style={styles.settingsBtn}>
            <MaterialCommunityIcons name="cog" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        {/* SECCIÓN 1: CONFIGURACIÓN (Con selectores avanzados) */}
        {activeSection === 'config' && (
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>⚙️ Configuración del Lote</Text>
                
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Superficie (Hectáreas)</Text>
                    <TextInput style={styles.input} keyboardType="numeric" value={hectareas} onChangeText={setHectareas} />
                </View>

                {/* SELECTOR DE SISTEMA */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Sistema de Plantación</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={esManual ? "manual" : sistemaSeleccionado}
                            onValueChange={(val) => {
                                if (val === "manual") {
                                    setEsManual(true);
                                    setSistemaSeleccionado(null);
                                } else {
                                    setEsManual(false);
                                    setSistemaSeleccionado(val);
                                }
                            }}
                        >
                            {sistemasPlantacion.map((s, i) => (
                                <Picker.Item key={i} label={`${s.nombre} (${s.arboles_ha} pl/ha)`} value={s} />
                            ))}
                            <Picker.Item label="🛠️ Manual / Personalizado" value="manual" />
                        </Picker>
                    </View>
                </View>

                {/* INPUTS MANUALES */}
                {esManual && (
                    <View style={{backgroundColor: '#F5F5F5', padding: 10, borderRadius: 8, marginBottom: 15}}>
                        <View style={styles.row}>
                            <View style={{flex:1, marginRight:5}}>
                                 <Text style={styles.labelSmall}>Entre Plantas (m)</Text>
                                 <TextInput style={styles.input} placeholder="0.3" keyboardType="numeric" value={distanciaPlantas} onChangeText={setDistanciaPlantas}/>
                            </View>
                            <View style={{flex:1, marginLeft:5}}>
                                 <Text style={styles.labelSmall}>Entre Surcos (m)</Text>
                                 <TextInput style={styles.input} placeholder="0.8" keyboardType="numeric" value={distanciaSurcos} onChangeText={setDistanciaSurcos}/>
                            </View>
                        </View>

                        {/* Modificadores */}
                        <View style={{marginTop: 10}}>
                            <View style={[styles.row, {justifyContent:'space-between', alignItems:'center', marginBottom: 5}]}>
                                <Text style={{fontSize:12, color:'#555'}}>🌱 Doble Hilera (x2)</Text>
                                <Switch value={esDobleHilera} onValueChange={setEsDobleHilera} trackColor={{false: "#ddd", true: "#A5D6A7"}} thumbColor={esDobleHilera ? COLORS.primary : "#f4f3f4"} />
                            </View>
                            <View style={[styles.row, {justifyContent:'space-between', alignItems:'center'}]}>
                                <Text style={{fontSize:12, color:'#555'}}>📐 Tresbolillo (+15%)</Text>
                                <Switch value={esTresbolillo} onValueChange={setEsTresbolillo} trackColor={{false: "#ddd", true: "#A5D6A7"}} thumbColor={esTresbolillo ? COLORS.primary : "#f4f3f4"} />
                            </View>
                        </View>
                    </View>
                )}

                {/* SECCIÓN ELEMENTOS ADICIONALES */}
                <View style={{marginTop: 5, marginBottom: 15, padding: 10, backgroundColor: '#E0F7FA', borderRadius: 8}}>
                    <Text style={[styles.label, {color: '#006064'}]}>🧪 Elementos Adicionales</Text>
                    <View style={{flexDirection: 'row'}}>
                        <TextInput 
                            style={[styles.input, {flex: 1, marginRight: 10}]} 
                            placeholder="Ej. Ca, Mg, S, Zn" 
                            value={nuevoNutrienteInput}
                            onChangeText={setNuevoNutrienteInput}
                        />
                        <TouchableOpacity style={[styles.btnSecondary, {minWidth: 60, backgroundColor:'#006064', borderWidth:0}]} onPress={agregarNuevoElemento}>
                             <Text style={{color:'white', fontWeight:'bold'}}>Agregar</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Metas Dinámicas */}
                <Text style={[styles.sectionTitle, {marginTop: 5}]}>🎯 Metas (Kg/Ha)</Text>
                <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
                    {todosLosNutrientes.map(nut => (
                        <View key={nut} style={{width: '33%', padding: 5, alignItems: 'center'}}>
                            <Text style={{color: getNutrientColor(nut), fontWeight:'bold'}}>{nut}</Text>
                            <TextInput 
                                style={styles.inputSmall} 
                                keyboardType="numeric" 
                                value={String(dosisObjetivoPersonalizada[nut] || 0)} 
                                onChangeText={(v)=>setDosisObjetivoPersonalizada({...dosisObjetivoPersonalizada, [nut]: parseFloat(v)||0})}
                            />
                        </View>
                    ))}
                </View>

                <TouchableOpacity style={[styles.btnSecondary, {marginTop:20}]} onPress={() => setActiveSection('calculadora')}>
                    <Text style={{color: COLORS.primary, fontWeight:'bold'}}>Ocultar Configuración</Text>
                </TouchableOpacity>
            </View>
        )}

        {/* SECCIÓN 2: MONITOR DE PROGRESO */}
        <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>📊 Balance Nutricional</Text>
            {todosLosNutrientes.map(nut => (
                <ProgressBar 
                    key={nut}
                    label={`Elemento ${nut}`} 
                    current={balance.aportes[nut] || 0} 
                    target={balance.metas[nut] || 0} 
                    color={getNutrientColor(nut)} 
                />
            ))}
        </View>

        {/* SECCIÓN 3: CALCULADORA */}
        <View style={styles.sectionCard}>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                <Text style={styles.sectionTitle}>🧪 Agregar Fuente</Text>
                <TouchableOpacity onPress={() => setModalFuenteVisible(true)}>
                    <Text style={{color: COLORS.primary, fontSize:12, fontWeight:'bold'}}>+ Crear Nueva</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.calcRow}>
                <View style={{flex: 1}}>
                    <Text style={styles.labelSmall}>Necesito cubrir:</Text>
                    <View style={styles.pickerSmall}>
                        <Picker selectedValue={nutrienteAcalcular} onValueChange={setNutrienteAcalcular}>
                             {todosLosNutrientes.map(n => <Picker.Item key={n} label={n} value={n} />)}
                        </Picker>
                    </View>
                </View>
                <View style={{flex: 1, marginLeft: 10}}>
                    <Text style={styles.labelSmall}>Kg Puros requeridos:</Text>
                    <TextInput 
                        style={styles.input} 
                        keyboardType="numeric" 
                        placeholder="0" 
                        value={dosisNutrientePura} 
                        onChangeText={setDosisNutrientePura}
                    />
                </View>
            </View>

            <Text style={styles.labelSmall}>Usando Fuente:</Text>
            <View style={styles.pickerContainer}>
                <Picker selectedValue={fertilizanteSeleccionado} onValueChange={setFertilizanteSeleccionado}>
                     {todosLosFertilizantes.map((f, i) => <Picker.Item key={i} label={`${f.nombre} (${Object.keys(f).filter(k=> ['N','P','K'].includes(k) && f[k]>0).map(k=> `${k}${f[k]}`).join('-')})`} value={f} />)}
                </Picker>
            </View>

            <TouchableOpacity style={styles.btnPrimary} onPress={calcularYAgregarAplicacion}>
                <MaterialCommunityIcons name="plus-circle-outline" size={24} color="white" style={{marginRight: 10}} />
                <Text style={styles.btnText}>Calcular y Agregar</Text>
            </TouchableOpacity>
        </View>

        {/* SECCIÓN 4: LISTA */}
        {aplicaciones.length > 0 && (
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>📋 Mezcla Final</Text>
                {aplicaciones.map((app, index) => (
                    <View key={index} style={styles.itemRow}>
                        <View style={styles.iconBox}>
                            <MaterialCommunityIcons name="sack" size={24} color={COLORS.primary} />
                        </View>
                        <View style={{flex: 1, marginLeft: 10}}>
                            <Text style={styles.itemTitle}>{app.nombre}</Text>
                            <Text style={styles.itemSub}>Dosis: <Text style={{fontWeight:'bold'}}>{app.dosisAplicada.toFixed(1)} kg/ha</Text></Text>
                            <Text style={[styles.itemSub, {fontSize: 10, color:'#37474F'}]}>
                                Aporta: {Object.keys(app.aportes).filter(k => app.aportes[k] > 0.1).map(k => `${k}:${app.aportes[k].toFixed(0)}`).join(', ')}
                            </Text>
                        </View>
                        <View style={{flexDirection:'row'}}>
                            <TouchableOpacity onPress={() => editarAplicacion(index)} style={{padding:8, marginRight:5}}>
                                <MaterialCommunityIcons name="pencil" size={22} color={COLORS.headerBg} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => eliminarAplicacion(index)} style={{padding:8}}>
                                <MaterialCommunityIcons name="trash-can-outline" size={22} color={COLORS.error} />
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </View>
        )}

        {/* SECCIÓN 5: PDF */}
        <View style={styles.sectionCard}>
            <TextInput 
                style={[styles.input, {height: 60, textAlignVertical: 'top'}]} 
                multiline 
                placeholder="Notas para la bitácora..." 
                value={comentariosFinales}
                onChangeText={setComentariosFinales}
            />
            <TouchableOpacity style={[styles.btnPrimary, {backgroundColor: COLORS.headerBg, marginTop: 15}]} onPress={exportarPDF}>
                <MaterialCommunityIcons name="file-pdf-box" size={24} color="white" style={{marginRight: 10}} />
                <Text style={styles.btnText}>Generar Orden PDF</Text>
            </TouchableOpacity>
        </View>

      </ScrollView>

      {/* MODAL NUEVA FUENTE */}
      <Modal visible={modalFuenteVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.sectionTitle}>Nueva Fuente</Text>
                  <TextInput style={styles.input} placeholder="Nombre (Ej. Nitrato de Calcio)" value={nuevaFuente.nombre} onChangeText={v=>setNuevaFuente({...nuevaFuente, nombre:v})} />
                  <Text style={{marginTop:10, marginBottom:5}}>Porcentajes de Riqueza (%):</Text>
                  <View style={{flexDirection:'row', flexWrap:'wrap'}}>
                      {todosLosNutrientes.map(nut => (
                          <View key={nut} style={{width:'33%', padding:2}}>
                              <Text style={{fontSize:10, textAlign:'center', fontWeight:'bold'}}>{nut}</Text>
                              <TextInput 
                                style={styles.inputSmall} 
                                keyboardType="numeric" 
                                placeholder="0"
                                onChangeText={v => setNuevaFuente({...nuevaFuente, [nut]:v})}
                              />
                          </View>
                      ))}
                  </View>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:20}}>
                      <TouchableOpacity onPress={() => setModalFuenteVisible(false)} style={styles.btnSecondary}><Text>Cancelar</Text></TouchableOpacity>
                      <TouchableOpacity onPress={agregarFertilizantePersonalizado} style={[styles.btnSecondary, {backgroundColor: COLORS.primary}]}><Text style={{color:'white'}}>Guardar</Text></TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { 
      backgroundColor: COLORS.headerBg, 
      paddingVertical: 10, paddingTop: 45, paddingHorizontal: 20, 
      borderBottomLeftRadius: 20, borderBottomRightRadius: 20, 
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
      shadowColor: "#000", shadowOffset: {width:0, height:3}, shadowOpacity: 0.2, elevation: 4 
  },
  headerTitle: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { color: '#B0BEC5', fontSize: 12 },
  settingsBtn: { backgroundColor: 'rgba(255,255,255,0.1)', padding: 6, borderRadius: 10 },
  sectionCard: { backgroundColor: COLORS.white, marginHorizontal: 15, marginTop: 12, borderRadius: 12, padding: 15, shadowColor: "#000", shadowOffset: {width:0, height:1}, shadowOpacity: 0.05, elevation: 2 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 13, color: '#666', marginBottom: 4, fontWeight: '500' },
  labelSmall: { fontSize: 11, color: '#666', marginBottom: 2 },
  input: { backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#ECEFF1', borderRadius: 8, padding: 8, fontSize: 15, color: COLORS.text },
  inputSmall: { backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#ECEFF1', borderRadius: 8, padding: 4, fontSize: 15, textAlign: 'center', color: COLORS.text },
  pickerContainer: { borderWidth: 1, borderColor: '#ECEFF1', borderRadius: 8, backgroundColor: '#FAFAFA' },
  pickerSmall: { borderWidth: 1, borderColor: '#ECEFF1', borderRadius: 8, backgroundColor: '#FAFAFA', height: 45, justifyContent: 'center' },
  row: { flexDirection: 'row' },
  calcRow: { flexDirection: 'row', marginBottom: 15 },
  btnPrimary: { backgroundColor: COLORS.primary, padding: 12, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: COLORS.primary, shadowOffset: {width:0, height:2}, shadowOpacity: 0.3, elevation: 3 },
  btnSecondary: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC', alignItems: 'center', minWidth: 100 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9F9', padding: 10, borderRadius: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  iconBox: { width: 36, height: 36, backgroundColor: '#E8F5E9', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  itemTitle: { fontWeight: 'bold', fontSize: 14, color: COLORS.text },
  itemSub: { fontSize: 11, color: '#666' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: 'white', borderRadius: 16, padding: 20, elevation: 10 }
});