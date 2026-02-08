// ============================================================================
// CALCULADORA DE GRADOS-DÍA ACUMULADOS (GDD) - VERSIÓN REACT NATIVE
// ============================================================================

/**
 * Calcula Grados-Día (GDD) para un día usando el método simple
 */
export function calcularGDD_Simple(tmax, tmin, baseTermica, umbralSuperior = null) {
  if (umbralSuperior !== null) {
    if (tmax > umbralSuperior) tmax = umbralSuperior;
    if (tmin > umbralSuperior) tmin = umbralSuperior;
  }

  const tPromedio = (tmax + tmin) / 2;
  return Math.max(0, tPromedio - baseTermica);
}

/**
 * Calcula Grados-Día usando el método modificado (más preciso)
 */
export function calcularGDD_Modificado(tmax, tmin, baseTermica, umbralSuperior = null) {
  if (umbralSuperior !== null) {
    tmax = Math.min(tmax, umbralSuperior);
    tmin = Math.min(tmin, umbralSuperior);
  }

  // En el método modificado, si Tmax < Base, no hay acumulación.
  if (tmax < baseTermica) return 0;

  if (tmin < baseTermica) {
    tmin = baseTermica;
  }

  const tPromedio = (tmax + tmin) / 2;
  return Math.max(0, tPromedio - baseTermica);
}

/**
 * Ordena los riesgos por nivel de severidad
 */
export function ordenarRiesgosPorNivel(riesgos) {
  const prioridad = { 'alto': 3, 'medio': 2, 'bajo': 1, 'ninguno': 0 };
  return [...riesgos].sort((a, b) => {
    return prioridad[b.nivel] - prioridad[a.nivel];
  });
}

/**
 * Extrae la configuración de riesgos del JSON del cultivo desde Firebase
 * Ajustado para la estructura de riesgos_detallados
 */
export function cargarRiesgosDesdeJSON(cultivoData) {
  const riesgos = [];
  const riesgosDetallados = cultivoData.riesgos_detallados;

  if (!riesgosDetallados) return riesgos;

  Object.keys(riesgosDetallados).forEach(nombre => {
    const info = riesgosDetallados[nombre];
    // Accedemos a la estructura: info.ciclo_desarrollo.grados_dia_desarrollo
    const gddInfo = info.ciclo_desarrollo?.grados_dia_desarrollo;

    if (gddInfo && gddInfo.base_termica && gddInfo.base_termica !== "N/A") {
      const parseVal = (val) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string' && val.includes('-')) {
          const parts = val.split('-').map(p => parseFloat(p.trim()));
          return (parts[0] + (parts[1] || parts[0])) / 2; // Promedio del rango (ej. "350-500")
        }
        return parseFloat(val) || 0;
      };

      riesgos.push({
        nombre: nombre,
        nombre_cientifico: info.nombre_cientifico || "",
        tipo: info.tipo || "plaga",
        // Estructura aplanada para el calculador en HomeScreen.js
        ciclo_desarrollo: {
          grados_dia_desarrollo: {
            base_termica: parseVal(gddInfo.base_termica),
            umbral_superior: gddInfo.umbral_superior !== "N/A" ? parseVal(gddInfo.umbral_superior) : null,
            gdd_ciclo_completo: parseVal(gddInfo.gdd_ciclo_completo),
            metodo_calculo: gddInfo.metodo_calculo || "Método simple"
          }
        },
        fases_vulnerables: info.fases_vulnerables || []
      });
    }
  });

  return riesgos;
}