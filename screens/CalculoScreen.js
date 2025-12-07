import React, { useState, useMemo, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch, LayoutAnimation, Platform, UIManager } from "react-native";
import { Picker } from '@react-native-picker/picker'; 
import cultivosData from "../data/cultivos.json";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Configuración para animaciones en Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

const NOMBRE_NUTRIENTE_BASE = {
    'N': 'Nitrógeno (N)',
    'P': 'Fósforo (P₂O₅)',
    'K': 'Potasio (K₂O)'
};

export default function CalculoScreen({ route }) {
  const { cultivo } = route.params || {};
  
  const cultivoData = cultivosData?.cultivos?.[cultivo];
  const dataFertilizacion = cultivoData?.calculo_fertilizacion || null;
  const datosDensidad = cultivoData?.ciclo_fenologico?.densidad_plantacion?.sistemas || [];

  // --- ESTADOS DE VISIBILIDAD (ACORDEONES) ---
  const [openDensidad, setOpenDensidad] = useState(true);
  const [openObjetivo, setOpenObjetivo] = useState(false);
  const [openExtra, setOpenExtra] = useState(false);
  const [openFuente, setOpenFuente] = useState(false);
  const [openCalculo, setOpenCalculo] = useState(true);
  const [openResultados, setOpenResultados] = useState(true);
  const [openAgro, setOpenAgro] = useState(false);
  const [openComentarios, setOpenComentarios] = useState(true); // Nuevo estado

  const toggleSection = (setter, value) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setter(!value);
  };

  // --- ESTADOS DE DENSIDAD ---
  const [sistemaSeleccionado, setSistemaSeleccionado] = useState(null);
  const [esManual, setEsManual] = useState(false);
  const [distanciaPlantas, setDistanciaPlantas] = useState('');
  const [distanciaSurcos, setDistanciaSurcos] = useState('');
  const [hectareas, setHectareas] = useState('1');
  const [totalPlantas, setTotalPlantas] = useState(0);
  
  const [esDobleHilera, setEsDobleHilera] = useState(false);
  const [esTresbolillo, setEsTresbolillo] = useState(false);

  // --- ESTADOS DE FERTILIZACIÓN ---
  const [aplicaciones, setAplicaciones] = useState([]);
  const [fertilizantesPersonalizados, setFertilizantesPersonalizados] = useState([]);
  const [nutrientesExtras, setNutrientesExtras] = useState([]); 
  const [mostrarFuentesLista, setMostrarFuentesLista] = useState(false);

  const [fertilizanteSeleccionado, setFertilizanteSeleccionado] = useState(FERTILIZANTES_BASE[0]);
  const [dosisNutrientePura, setDosisNutrientePura] = useState(''); 
  const [nutrienteAcalcular, setNutrienteAcalcular] = useState('N');

  const [nuevoNutrienteInput, setNuevoNutrienteInput] = useState({ simbolo: '', dosisMeta: '' });
  const [nuevaFuente, setNuevaFuente] = useState({ nombre: '' });
  
  // --- ESTADOS LÍQUIDOS (MODIFICADO) ---
  const [nombreProductoLiquido, setNombreProductoLiquido] = useState(''); // Nuevo Campo
  const [dosisAgroquimico, setDosisAgroquimico] = useState('');
  const [volumenTanque, setVolumenTanque] = useState('');
  const [dosisResultado, setDosisResultado] = useState(null);
  const [dosisPorPlantaLiquido, setDosisPorPlantaLiquido] = useState(null);

  // --- ESTADO COMENTARIOS (NUEVO) ---
  const [comentariosFinales, setComentariosFinales] = useState('');

  const COMPOSICION_QUIMICA = {};
  const REGLAS_QUIMICAS = [];
  const dosisRecomendada = dataFertilizacion?.recomendada || { N: 0, P: 0, K: 0 };
  const [dosisObjetivoPersonalizada, setDosisObjetivoPersonalizada] = useState(() => ({
      N: dosisRecomendada.N || 0,
      P: dosisRecomendada.P || 0,
      K: dosisRecomendada.K || 0,
  }));

  // --- EFECTOS ---
  useEffect(() => {
    if (datosDensidad.length > 0) {
        setSistemaSeleccionado(datosDensidad[0]);
    } else {
        setEsManual(true);
    }
  }, [cultivo]);

  useEffect(() => {
    const ha = parseFloat(hectareas) || 0;
    if (esManual) {
        const dp = parseFloat(distanciaPlantas);
        const ds = parseFloat(distanciaSurcos);
        if (dp > 0 && ds > 0) {
            let densidadCalculada = 10000 / (dp * ds);
            if (esTresbolillo) densidadCalculada = densidadCalculada * 1.1547;
            if (esDobleHilera) densidadCalculada = densidadCalculada * 2;
            setTotalPlantas(Math.round(ha * densidadCalculada));
        } else {
            setTotalPlantas(0);
        }
    } else {
        if (sistemaSeleccionado) {
            setTotalPlantas(Math.round(ha * sistemaSeleccionado.arboles_ha));
        }
    }
  }, [hectareas, sistemaSeleccionado, esManual, distanciaPlantas, distanciaSurcos, esDobleHilera, esTresbolillo]);

  const todosLosNutrientes = useMemo(() => [
        ...Object.keys(NOMBRE_NUTRIENTE_BASE), 
        ...nutrientesExtras
  ], [nutrientesExtras]);

  const todosLosFertilizantes = useMemo(() => [
      ...FERTILIZANTES_BASE, ...fertilizantesPersonalizados
  ], [fertilizantesPersonalizados]);

  const balance = useMemo(() => {
    const aportes = { ...dosisObjetivoPersonalizada }; 
    Object.keys(aportes).forEach(key => aportes[key] = 0); 

    aplicaciones.forEach(app => {
      const dosisComercial = app.dosisAplicada;
      Object.keys(dosisObjetivoPersonalizada).forEach(nutriente => {
          if (app[nutriente] !== undefined && app[nutriente] > 0) {
              aportes[nutriente] += dosisComercial * (app[nutriente] / 100);
          }
      });
    });

    const remanentes = {};
    Object.keys(dosisObjetivoPersonalizada).forEach(key => {
        remanentes[`remanente${key}`] = dosisObjetivoPersonalizada[key] - aportes[key];
    });

    return { aportes, remanentes, dosisMaximas: dosisObjetivoPersonalizada };
  }, [aplicaciones, dosisObjetivoPersonalizada]);

  // --- HANDLERS ---
  const agregarNutrienteExtra = () => {
    const { simbolo, dosisMeta } = nuevoNutrienteInput;
    const simbLimpio = simbolo.trim();
    if (!simbLimpio) { Alert.alert("Error", "Escribe un símbolo"); return; }
    if (todosLosNutrientes.includes(simbLimpio)) { Alert.alert("Error", "Ya existe"); return; }
    
    setNutrientesExtras([...nutrientesExtras, simbLimpio]);
    setDosisObjetivoPersonalizada({
        ...dosisObjetivoPersonalizada,
        [simbLimpio]: parseFloat(dosisMeta) || 0
    });
    setNuevoNutrienteInput({ simbolo: '', dosisMeta: '' });
  };

  const eliminarNutrienteExtra = (nutriente) => {
    Alert.alert("Eliminar", `¿Dejar de calcular ${nutriente}?`, [
      { text: "Cancelar" },
      { text: "Borrar", onPress: () => {
          setNutrientesExtras(nutrientesExtras.filter(n => n !== nutriente));
          const nuevosObjetivos = { ...dosisObjetivoPersonalizada };
          delete nuevosObjetivos[nutriente];
          setDosisObjetivoPersonalizada(nuevosObjetivos);
      }}
    ]);
  };

  const agregarFertilizantePersonalizado = () => {
    const { nombre, ...restoNutrientes } = nuevaFuente;
    if (!nombre) { Alert.alert("Error", "Falta el nombre"); return; }
    
    let aportaAlgo = false;
    const composicion = {};
    todosLosNutrientes.forEach(nut => {
        const valor = parseFloat(restoNutrientes[nut]) || 0;
        composicion[nut] = valor;
        if (valor > 0) aportaAlgo = true;
    });

    if (!aportaAlgo) { Alert.alert("Error", "Debe aportar algo"); return; }
    
    const nuevo = { nombre, ...composicion, simbolo: 'Mix' };
    setFertilizantesPersonalizados([...fertilizantesPersonalizados, nuevo]);
    setNuevaFuente({ nombre: '' });
    setMostrarFuentesLista(true);
    Alert.alert("Éxito", "Fuente agregada.");
  };

  const eliminarFuentePersonalizada = (index) => {
    Alert.alert("Eliminar", "¿Borrar esta fuente?", [
      { text: "Cancelar" },
      { text: "Borrar", onPress: () => {
          const nuevas = [...fertilizantesPersonalizados];
          nuevas.splice(index, 1);
          setFertilizantesPersonalizados(nuevas);
          if (fertilizanteSeleccionado === fertilizantesPersonalizados[index]) {
             setFertilizanteSeleccionado(FERTILIZANTES_BASE[0]);
          }
      }}
    ]);
  };

  const verificarIncompatibilidad = (nuevoFert) => {
    const nombreNuevo = nuevoFert.nombre;
    const componentesNuevo = COMPOSICION_QUIMICA[nombreNuevo] || [];
    for (let app of aplicaciones) {
        const nombreExistente = app.nombre;
        const componentesExistente = COMPOSICION_QUIMICA[nombreExistente] || [];
        for (let regla of REGLAS_QUIMICAS) {
            const nuevoTieneElem1 = componentesNuevo.some(c => c.includes(regla.elem1));
            const existTieneElem2 = componentesExistente.some(c => c.includes(regla.elem2));
            const nuevoTieneElem2 = componentesNuevo.some(c => c.includes(regla.elem2));
            const existTieneElem1 = componentesExistente.some(c => c.includes(regla.elem1));
            if ((nuevoTieneElem1 && existTieneElem2) || (nuevoTieneElem2 && existTieneElem1)) {
                return { a: nombreNuevo, b: nombreExistente, razon: `${regla.razon}\n\n(Conflicto: ${regla.elem1} + ${regla.elem2})` };
            }
        }
    }
    return null; 
  };

  const calcularYAgregarAplicacion = () => {
    const dosisPuraDeseada = parseFloat(dosisNutrientePura);
    if (!dosisPuraDeseada || dosisPuraDeseada <= 0) return;
    const conc = fertilizanteSeleccionado[nutrienteAcalcular];
    if (!conc || conc === 0) {
        Alert.alert("Error", `El fertilizante ${fertilizanteSeleccionado.nombre} no contiene ${nutrienteAcalcular}.`);
        return;
    }
    if (aplicaciones.some(app => app.nombre === fertilizanteSeleccionado.nombre)) {
        Alert.alert("Duplicado", "Ya has agregado este fertilizante.");
        return;
    }
    const conflicto = verificarIncompatibilidad(fertilizanteSeleccionado);
    if (conflicto) {
        Alert.alert("⚠️ ¡PELIGRO!", `${conflicto.razon}\n\n¿Continuar?`, [
                { text: "Cancelar", style: "cancel" },
                { text: "Sí", onPress: () => procesarAgregado(dosisPuraDeseada, conc) }
        ]);
    } else {
        procesarAgregado(dosisPuraDeseada, conc);
    }
  };

  const procesarAgregado = (dosisPuraDeseada, concentracion) => {
    const kgFertilizantePorHa = (dosisPuraDeseada / concentracion) * 100;
    const nutrientesAportados = {};
    let excedeLimite = false;
    let mensajeError = "";

    Object.keys(dosisObjetivoPersonalizada).forEach(nutriente => {
        const c = fertilizanteSeleccionado[nutriente] || 0;
        if (c > 0) {
            const aporte = kgFertilizantePorHa * (c / 100);
            nutrientesAportados[nutriente] = aporte;
            const acumulado = balance.aportes[nutriente] || 0;
            const meta = balance.dosisMaximas[nutriente] || 0;
            if (meta > 0 && (acumulado + aporte) > (meta + 0.5)) {
                excedeLimite = true;
                mensajeError = `El ${nutriente} excede la meta de ${meta} kg.`;
            }
        }
    });

    if (excedeLimite) { Alert.alert("⚠️ Límite Excedido", mensajeError); return; }

    setAplicaciones([...aplicaciones, { 
        ...fertilizanteSeleccionado, 
        dosisAplicada: kgFertilizantePorHa,
        dosisTotalLote: kgFertilizantePorHa * parseFloat(hectareas || 1),
        aportes: nutrientesAportados
    }]);
    setDosisNutrientePura('');
  };

  const eliminarAplicacion = (i) => setAplicaciones(aplicaciones.filter((_, idx) => idx !== i));

  const calcularLiquidos = () => {
    const d = parseFloat(dosisAgroquimico), v = parseFloat(volumenTanque);
    if(!d || !v) return;
    const totalMl = d * v;
    setDosisResultado(`Total Tanque: ${totalMl.toFixed(2)} ml (o gr)`);
    if (totalPlantas > 0) {
        const mlPorPlanta = totalMl / totalPlantas;
        setDosisPorPlantaLiquido(`${mlPorPlanta.toFixed(2)} ml / planta`);
    } else {
        setDosisPorPlantaLiquido(null);
    }
  };

  const exportarPDF = async () => {
    try {
      // Filas fertilizantes
      const filasHTML = aplicaciones.map(app => `
        <tr>
          <td style="padding:8px; border:1px solid #ddd;">${app.nombre}</td>
          <td style="padding:8px; border:1px solid #ddd;">${app.dosisAplicada.toFixed(1)} kg/ha</td>
          <td style="padding:8px; border:1px solid #ddd;">${app.dosisTotalLote.toFixed(1)} kg</td>
          <td style="padding:8px; border:1px solid #ddd; font-size: 10px;">
            ${Object.keys(app.aportes).map(k => `${k}: ${app.aportes[k].toFixed(1)}`).join(', ')}
          </td>
        </tr>
      `).join('');

      // Sección HTML Líquidos
      let htmlLiquidos = '';
      if (dosisResultado) {
          htmlLiquidos = `
            <h3>Aplicación Líquida (Foliar/Drench)</h3>
            <div style="background-color: #E3F2FD; padding: 10px; border-radius: 5px; border: 1px solid #BBDEFB;">
                <p><strong>Producto:</strong> ${nombreProductoLiquido || 'Sin nombre'}</p>
                <p><strong>Dosis:</strong> ${dosisAgroquimico} ml/L</p>
                <p><strong>Capacidad Tanque:</strong> ${volumenTanque} L</p>
                <hr style="border: 0; border-top: 1px solid #ccc;">
                <p style="color: #0D47A1; font-weight: bold; font-size: 14px;">${dosisResultado}</p>
                ${dosisPorPlantaLiquido ? `<p style="font-size: 12px;">Por planta: ${dosisPorPlantaLiquido}</p>` : ''}
            </div>
          `;
      }

      // HTML del reporte
      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: Helvetica, sans-serif; padding: 20px; }
              h1 { color: #2E7D32; text-align: center; }
              .header { background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th { background-color: #2E7D32; color: white; padding: 10px; text-align: left; }
              .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #666; }
              .comentarios-box { border: 1px solid #999; padding: 10px; min-height: 50px; border-radius: 4px; background-color: #fff; }
            </style>
          </head>
          <body>
            <h1>Plan de Fertilización: ${cultivo || 'Cultivo'}</h1>
            
            <div class="header">
              <p><strong>Superficie:</strong> ${hectareas} hectáreas</p>
              <p><strong>Densidad:</strong> ${totalPlantas.toLocaleString()} plantas</p>
              <p><strong>Sistema:</strong> ${esManual ? 'Manual' : (sistemaSeleccionado?.nombre || 'N/A')}</p>
            </div>

            <h3>Nutrición Edáfica (Suelo)</h3>
            <table>
              <tr>
                <th>Fuente</th>
                <th>Dosis/Ha</th>
                <th>Total sup</th>
                <th>Aportes</th>
              </tr>
              ${filasHTML || '<tr><td colspan="4">Sin aplicaciones registradas</td></tr>'}
            </table>

            <h3>Balance Nutricional (kg/ha)</h3>
            <ul>
              ${Object.keys(balance.aportes).map(nut => `
                <li><strong>${nut}:</strong> ${balance.aportes[nut].toFixed(1)} / Meta ${balance.dosisMaximas[nut]}</li>
              `).join('')}
            </ul>

            ${htmlLiquidos}

            <h3>Comentarios / Observaciones</h3>
            <div class="comentarios-box">
                ${comentariosFinales ? comentariosFinales.replace(/\n/g, '<br>') : 'Sin comentarios adicionales.'}
            </div>

            <div class="footer">
              Generado el ${new Date().toLocaleDateString()} por RóslinaApp
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });

    } catch (error) {
      Alert.alert("Error", "No se pudo generar el PDF.");
    }
  };

  const SectionHeader = ({ title, isOpen, toggle }) => (
    <TouchableOpacity onPress={toggle} style={styles.accordionHeader}>
      <Text style={styles.accordionTitle}>{isOpen ? "▼" : "▶"} {title}</Text>
    </TouchableOpacity>
  );
  
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.titulo}>🧮 Calculadora: {cultivo}</Text>

      {/* 1. DENSIDAD */}
      <View style={styles.cardContainer}>
        <SectionHeader title="1. Densidad y Plantas" isOpen={openDensidad} toggle={() => toggleSection(setOpenDensidad, openDensidad)} />
        {openDensidad && (
          <View style={styles.cardContent}>
            <View style={styles.pickerWrapper}>
                <Picker
                    selectedValue={esManual ? "manual" : sistemaSeleccionado}
                    style={{ color: '#000', height: 50, width: '100%' }}
                    onValueChange={(val) => {
                        if (val === "manual") { setEsManual(true); setSistemaSeleccionado(null); }
                        else { setEsManual(false); setSistemaSeleccionado(val); }
                    }}
                >
                    {datosDensidad.map((s, i) => <Picker.Item key={i} label={`${s.nombre} (${s.distancia_m}m)`} value={s} />)}
                    <Picker.Item label="🛠️ Manual / Personalizado" value="manual" />
                </Picker>
            </View>

            {esManual && (
                <View>
                    <View style={styles.manualInputsContainer}>
                        <View style={{flex: 1, marginRight: 5}}>
                            <Text style={styles.labelSmall}>Dist. Plantas (m)</Text>
                            <TextInput style={styles.inputWhite} keyboardType="numeric" placeholder="Ej. 3" value={distanciaPlantas} onChangeText={setDistanciaPlantas}/>
                        </View>
                        <View style={{flex: 1, marginLeft: 5}}>
                            <Text style={styles.labelSmall}>Dist. Surcos (m)</Text>
                            <TextInput style={styles.inputWhite} keyboardType="numeric" placeholder="Ej. 5" value={distanciaSurcos} onChangeText={setDistanciaSurcos}/>
                        </View>
                    </View>
                    <View style={styles.switchesContainer}>
                        <View style={styles.switchRow}>
                            <Text style={styles.labelSwitch}>🌱 Doble Hilera (x2)</Text>
                            <Switch value={esDobleHilera} onValueChange={setEsDobleHilera}/>
                        </View>
                        <View style={[styles.switchRow, {borderTopWidth: 1, borderColor: '#eee'}]}>
                            <Text style={styles.labelSwitch}>📐 Tresbolillo (+15%)</Text>
                            <Switch value={esTresbolillo} onValueChange={setEsTresbolillo}/>
                        </View>
                    </View>
                </View>
            )}

            <View style={[styles.row, {marginTop: 10}]}>
                <View style={{flex: 1, marginRight: 10}}>
                    <Text style={styles.label}>Área (Hectáreas):</Text>
                    <TextInput style={styles.inputWhite} keyboardType="numeric" value={hectareas} onChangeText={setHectareas}/>
                </View>
                <View style={{flex: 1}}>
                    <Text style={styles.label}>Total Plantas:</Text>
                    <Text style={styles.resultadoNumero}>{totalPlantas.toLocaleString()}</Text>
                </View>
            </View>
          </View>
        )}
      </View>

      {/* 2. OBJETIVO */}
      <View style={styles.cardContainer}>
        <SectionHeader title="2. Objetivo Nutricional" isOpen={openObjetivo} toggle={() => toggleSection(setOpenObjetivo, openObjetivo)} />
        {openObjetivo && (
          <View style={styles.cardContent}>
            <Text style={styles.nota}>Ajusta la meta según tu análisis de suelo (kg/ha).</Text>
            <View style={styles.npkContainer}>
              {Object.keys(balance.dosisMaximas).map(key => (
                <View key={key} style={styles.dosisMaxInputContainer}>
                  <Text style={styles.npkItemSmall}>{key}:</Text>
                  <TextInput
                    style={styles.dosisMaxInput}
                    keyboardType="numeric"
                    value={String(balance.dosisMaximas[key])}
                    onChangeText={(val) => setDosisObjetivoPersonalizada({...dosisObjetivoPersonalizada, [key]: parseFloat(val) || 0})}
                  />
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* 3. AGREGAR NUTRIENTE EXTRA */}
      <View style={styles.cardContainer}>
         <SectionHeader title="3. Agregar Nutriente Extra" isOpen={openExtra} toggle={() => toggleSection(setOpenExtra, openExtra)} />
         {openExtra && (
           <View style={styles.cardContent}>
             <View style={styles.addExtensionRow}>
                <TextInput style={[styles.inputExtension, {flex:1}]} placeholder="Símbolo (Ej. Ca)" value={nuevoNutrienteInput.simbolo} onChangeText={v=>setNuevoNutrienteInput({...nuevoNutrienteInput, simbolo: v})} />
                <TextInput style={[styles.inputExtension, {flex:1}]} placeholder="Meta (kg/ha)" keyboardType="numeric" value={nuevoNutrienteInput.dosisMeta} onChangeText={v=>setNuevoNutrienteInput({...nuevoNutrienteInput, dosisMeta: v})} />
                <TouchableOpacity style={styles.addBtn} onPress={agregarNutrienteExtra}><Text style={styles.addBtnText}>+</Text></TouchableOpacity>
             </View>
             <View style={{flexDirection: 'row', flexWrap: 'wrap', marginTop: 10}}>
                 {nutrientesExtras.map((nut) => (
                     <TouchableOpacity key={nut} onPress={() => eliminarNutrienteExtra(nut)} style={styles.chip}>
                         <Text style={styles.chipText}>{nut}  ⓧ</Text>
                     </TouchableOpacity>
                 ))}
             </View>
           </View>
         )}
      </View>
      
      {/* 4. FUENTES */}
      <View style={styles.cardContainer}>
         <SectionHeader title="4. Registrar Fuente Nueva" isOpen={openFuente} toggle={() => toggleSection(setOpenFuente, openFuente)} />
         {openFuente && (
           <View style={styles.cardContent}>
             <TextInput style={[styles.inputExtension, {marginBottom: 10, width: '100%'}]} placeholder="Nombre (ej. Nitrato de Calcio)" value={nuevaFuente.nombre} onChangeText={v=>setNuevaFuente({...nuevaFuente, nombre: v})} />
             <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
                {todosLosNutrientes.map((nut) => (
                    <View key={nut} style={{width: '33%', padding: 2}}>
                        <Text style={{fontSize: 10, color: '#555'}}>% {nut}</Text>
                        <TextInput style={styles.inputSmall} placeholder="0" keyboardType="numeric" value={nuevaFuente[nut] || ''} onChangeText={v => setNuevaFuente({...nuevaFuente, [nut]: v})} />
                    </View>
                ))}
             </View>
             <TouchableOpacity style={[styles.addBtn, {marginTop: 10, width: '100%'}]} onPress={agregarFertilizantePersonalizado}>
                <Text style={styles.addBtnText}>Guardar Fuente</Text>
             </TouchableOpacity>
             {fertilizantesPersonalizados.length > 0 && (
                 <View style={{marginTop: 15}}>
                     <TouchableOpacity onPress={() => setMostrarFuentesLista(!mostrarFuentesLista)} style={styles.dropdownHeader}>
                        <Text style={styles.dropdownTitle}>{mostrarFuentesLista ? "▼ Ocultar" : "▶ Ver"} Mis Fuentes ({fertilizantesPersonalizados.length})</Text>
                     </TouchableOpacity>
                     {mostrarFuentesLista && (
                         <View style={styles.listContainer}>
                             {fertilizantesPersonalizados.map((f, i) => (
                                 <View key={i} style={styles.rowFuenteCustom}>
                                     <Text style={{flex: 1, color: '#333'}}>{f.nombre}</Text>
                                     <TouchableOpacity onPress={() => eliminarFuentePersonalizada(i)} style={styles.deleteBtnSmall}>
                                         <Text style={{color: '#D32F2F', fontSize: 12, fontWeight: 'bold'}}>Eliminar</Text>
                                     </TouchableOpacity>
                                 </View>
                             ))}
                         </View>
                     )}
                 </View>
             )}
           </View>
         )}
      </View>

      {/* 5. CÁLCULO */}
      <View style={styles.cardContainer}>
        <SectionHeader title="5. Balanceo de Fuentes" isOpen={openCalculo} toggle={() => toggleSection(setOpenCalculo, openCalculo)} />
        {openCalculo && (
          <View style={styles.cardContent}>
            <View style={styles.row}>
                <View style={{flex: 1}}>
                     <Text style={styles.label}>Nutriente:</Text>
                     <View style={styles.pickerWrapper}>
                        <Picker selectedValue={nutrienteAcalcular} style={{ color: '#000', height: 50, width: '100%' }} onValueChange={setNutrienteAcalcular}>
                            {todosLosNutrientes.map(n => <Picker.Item key={n} label={n} value={n} />)}
                        </Picker>
                     </View>
                </View>
                <View style={{flex: 1}}>
                     <Text style={styles.label}>Kg Puros/Ha:</Text>
                     <TextInput style={styles.input} keyboardType="numeric" placeholder="Ej: 50" value={dosisNutrientePura} onChangeText={setDosisNutrientePura}/>
                </View>
            </View>
            <Text style={styles.remanenteText}>
                Faltan: {balance.remanentes[`remanente${nutrienteAcalcular}`]?.toFixed(1) || 0} kg/ha
            </Text>
            <Text style={styles.label}>Fertilizante Fuente:</Text>
            <View style={styles.pickerWrapper}>
                <Picker selectedValue={fertilizanteSeleccionado} style={{ color: '#000', height: 50, width: '100%' }} onValueChange={setFertilizanteSeleccionado}>
                  {todosLosFertilizantes.map((f, i) => (
                      <Picker.Item key={i} label={`${f.nombre} (${Object.keys(f).filter(k => todosLosNutrientes.includes(k) && f[k] > 0).map(k => `${f[k]}%${k}`).join(' ')})`} value={f} />
                  ))}
                </Picker>
            </View>
            <TouchableOpacity style={[styles.btn, {opacity: !dosisNutrientePura ? 0.6 : 1}]} onPress={calcularYAgregarAplicacion} disabled={!dosisNutrientePura}>
              <Text style={styles.btnText}>Agregar al Plan</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 6. RESULTADOS */}
      <View style={styles.cardContainer}>
        <SectionHeader title="6. Plan de Aplicación" isOpen={openResultados} toggle={() => toggleSection(setOpenResultados, openResultados)} />
        {openResultados && (
          <View style={styles.cardContent}>
            {aplicaciones.length === 0 ? (
              <Text style={styles.emptyText}>No hay aplicaciones registradas.</Text>
            ) : (
                aplicaciones.map((app, index) => {
                  const gramosPorPlanta = totalPlantas > 0 ? ((app.dosisTotalLote * 1000) / totalPlantas).toFixed(1) : 0;
                  const textoAportes = Object.keys(app.aportes || {}).map(k => `${app.aportes[k].toFixed(1)}kg ${k}`).join(', ');
                  return (
                    <View key={index} style={styles.aplicacionRow}>
                      <View style={{flex:1}}>
                          <Text style={styles.aplicacionTextBold}>{app.dosisAplicada.toFixed(1)} kg/ha de {app.nombre}</Text>
                          <Text style={styles.aplicacionSubtext}>Aporta: {textoAportes}</Text>
                          <Text style={styles.aplicacionSubtext}>Total sup: {app.dosisTotalLote.toFixed(1)} kg</Text>
                          {totalPlantas > 0 && <Text style={styles.aplicacionDosisPlanta}>🌱 Dosis/Planta: {gramosPorPlanta} gr</Text>}
                      </View>
                      <TouchableOpacity onPress={() => eliminarAplicacion(index)} style={styles.deleteBtn}><Text style={styles.deleteText}>X</Text></TouchableOpacity>
                    </View>
                  )
                })
            )}
          </View>
        )}
      </View>

      {/* 7. AGROQUÍMICOS */}
      <View style={styles.cardContainer}>
          <SectionHeader title="7. Dosis Líquidos" isOpen={openAgro} toggle={() => toggleSection(setOpenAgro, openAgro)} />
          {openAgro && (
            <View style={styles.cardContent}>
              <Text style={styles.label}>Producto / Ingrediente Activo:</Text>
              <TextInput 
                  style={[styles.inputWhite, {marginBottom: 10}]} 
                  placeholder="Ej. Insecticida X, Foliares..." 
                  value={nombreProductoLiquido} 
                  onChangeText={setNombreProductoLiquido}
              />

              <View style={styles.row}>
                  <TextInput style={[styles.inputWhite, {flex:1, marginRight:5}]} placeholder="Dosis ml/L" keyboardType="numeric" value={dosisAgroquimico} onChangeText={setDosisAgroquimico}/>
                  <TextInput style={[styles.inputWhite, {flex:1}]} placeholder="Litros Tanque" keyboardType="numeric" value={volumenTanque} onChangeText={setVolumenTanque}/>
              </View>
              <TouchableOpacity style={styles.btnSmall} onPress={calcularLiquidos}><Text style={styles.btnTextSmall}>Calcular</Text></TouchableOpacity>
              {dosisResultado && (
                  <View>
                      <Text style={styles.resultadoAporte}>{dosisResultado}</Text>
                      {dosisPorPlantaLiquido && <Text style={styles.resultadoAporteSmall}>🌱 {dosisPorPlantaLiquido}</Text>}
                  </View>
              )}
            </View>
          )}
      </View>

      {/* 8. COMENTARIOS (NUEVO SECCIÓN) */}
      <View style={styles.cardContainer}>
        <SectionHeader title="8. Notas / Comentarios" isOpen={openComentarios} toggle={() => toggleSection(setOpenComentarios, openComentarios)} />
        {openComentarios && (
            <View style={styles.cardContent}>
                <TextInput 
                    style={[styles.inputWhite, {height: 80, textAlignVertical: 'top'}]} 
                    multiline 
                    placeholder="Escribe aquí observaciones generales para el reporte..." 
                    value={comentariosFinales}
                    onChangeText={setComentariosFinales}
                />
            </View>
        )}
      </View>

      <View style={{height: 50}} />
      <TouchableOpacity 
        style={[styles.btn, { backgroundColor: '#D32F2F', marginTop: 20, marginBottom: 30 }]} 
        onPress={exportarPDF}
      >
        <Text style={styles.btnText}>📄 Exportar Reporte PDF</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#f4f4f4" },
  titulo: { fontSize: 24, fontWeight: "bold", marginBottom: 15, color: '#2E7D32', textAlign: 'center' },
  cardContainer: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 10, overflow: 'hidden', elevation: 2 },
  accordionHeader: { padding: 15, backgroundColor: '#E8F5E9', borderBottomWidth: 1, borderBottomColor: '#C8E6C9' },
  accordionTitle: { fontSize: 16, fontWeight: 'bold', color: '#2E7D32' },
  cardContent: { padding: 15 },
  row: { flexDirection: 'row', alignItems: 'center' },
  nota: { fontSize: 12, color: '#777', marginBottom: 10, fontStyle: 'italic' },
  pickerWrapper: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, marginBottom: 10, justifyContent: 'center', backgroundColor: '#fff' },
  inputWhite: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 8, height: 45 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 10, height: 45 },
  manualInputsContainer: { flexDirection: 'row', marginBottom: 10 },
  switchesContainer: { backgroundColor: '#FAFAFA', padding: 10, borderRadius: 5, marginTop: 5, borderWidth: 1, borderColor: '#eee' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  labelSwitch: { fontSize: 14, color: '#555', fontWeight: 'bold' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 5, color: '#555' },
  labelSmall: { fontSize: 12, color: '#666', marginBottom: 2 },
  remanenteText: { fontSize: 14, color: '#D32F2F', fontWeight: 'bold', marginBottom: 10, textAlign: 'right' },
  emptyText: { textAlign: 'center', fontStyle: 'italic', color: '#999', padding: 10 },
  resultadoNumero: { fontSize: 24, fontWeight: 'bold', color: '#E65100' },
  resultadoAporte: { marginTop: 10, fontSize: 16, fontWeight: 'bold', color: '#0D47A1', textAlign: 'center' },
  resultadoAporteSmall: { fontSize: 14, fontWeight: 'bold', color: '#1565C0', textAlign: 'center', marginTop: 5 },
  npkContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  dosisMaxInputContainer: { flexDirection: 'row', alignItems: 'center', width: '48%', marginBottom: 10, backgroundColor: '#FAFAFA', borderRadius: 5, padding: 5, borderWidth: 1, borderColor: '#eee' },
  npkItemSmall: { fontSize: 14, fontWeight: '600', marginRight: 5, color: '#2E7D32' },
  dosisMaxInput: { borderBottomWidth: 1, borderColor: '#aaa', width: 60, textAlign: 'center', fontSize: 16, fontWeight: 'bold' },
  aplicacionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FAFAFA', padding: 10, borderRadius: 5, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: '#2E7D32' },
  aplicacionTextBold: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  aplicacionSubtext: { fontSize: 12, color: '#666' },
  aplicacionDosisPlanta: { fontSize: 13, color: '#1B5E20', fontWeight: 'bold', marginTop: 2 },
  btn: { backgroundColor: "#2E7D32", padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  btnSmall: { backgroundColor: '#1976D2', padding: 10, borderRadius: 5, marginTop: 10, alignItems: 'center' },
  btnTextSmall: { color: '#fff', fontWeight: 'bold' },
  deleteBtn: { backgroundColor: '#FFEBEE', padding: 8, borderRadius: 5 },
  deleteText: { color: '#D32F2F', fontWeight: 'bold' },
  addExtensionRow: { flexDirection: 'row', marginTop: 5 },
  inputExtension: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 5, padding: 8, marginRight: 5 },
  inputSmall: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 5, padding: 5, height: 35, textAlign: 'center' },
  addBtn: { backgroundColor: '#555', padding: 10, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  chip: { backgroundColor: '#E0E0E0', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15, marginRight: 5, marginBottom: 5 },
  chipText: { color: '#333', fontSize: 12, fontWeight: 'bold' },
  dropdownHeader: { padding: 10, backgroundColor: '#eee', borderRadius: 5, marginBottom: 5 },
  dropdownTitle: { color: '#2E7D32', fontWeight: 'bold', textAlign: 'center' },
  listContainer: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', borderRadius: 5, padding: 5 },
  rowFuenteCustom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  deleteBtnSmall: { padding: 5, backgroundColor: '#FFEBEE', borderRadius: 4 },
});