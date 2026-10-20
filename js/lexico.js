// Analizador léxico: convierte el flujo de cuadros de video en tokens.
//
//   cuadro → buffer_captura[21][3] → traducir_senia() → {letra, confianza}
//          → estabilización (la misma letra N cuadros seguidos) → token LETRA
//   mano ausente > PAUSA_ESPACIO_MS después de letras → token ESPACIO
//
// Tokens:  { tipo: 'LETRA', lexema: 'A', confianza: 0.97, posicion: 3 }
//          { tipo: 'ESPACIO', lexema: '␣', posicion: 4 }

import { normalizar, TAM_VECTOR } from './preprocesamiento.js';
import { UMBRAL_CONFIANZA, TablaSimbolos } from './tablaSimbolos.js';

export const CUADROS_ESTABLES = 10;   // ~1/3 s a 30 fps
export const CUADROS_PARA_ERROR = 24; // estado dudoso sostenido ~0.8 s
export const PAUSA_ESPACIO_MS = 1200;
const MIN_RECONOCIDA = 0.5;           // por debajo: seña no reconocida
const MARGEN_AMBIGUEDAD = 0.2;        // top1 - top2 menor a esto: ambigua

export class AnalizadorLexico {
  constructor(tabla, errores) {
    this.tabla = tabla;
    this.errores = errores;
    this.reiniciar();
  }

  reiniciar() {
    this.candidato = null;
    this.cuenta = 0;
    this.bloqueada = null;        // última letra emitida, hasta que cambie la seña
    this.cuentaDudosa = 0;
    this.sinManoDesde = null;
    this.letrasDesdeEspacio = 0;
    this.posicion = 0;
  }

  /**
   * traducir_senia(vector): clasifica un vector de características.
   * Valida sus argumentos (error #9) y que el modelo exista (error #7).
   */
  traducir_senia(vector) {
    const modelo = this.tabla.leer('modelo_reconocimiento');
    if (!this.tabla.estaInicializada('modelo_reconocimiento')) {
      this.errores.emitir(7, 'modelo_reconocimiento no está inicializado: entrena o carga un modelo en entrenar.html.', null, null, 5000);
      return null;
    }
    if (!Array.isArray(vector) || vector.length !== TAM_VECTOR || vector.some(v => !Number.isFinite(v))) {
      this.errores.emitir(9, `se esperaban ${TAM_VECTOR} valores numéricos y se recibieron ${vector?.length ?? 0}.`);
      return null;
    }
    return modelo.predecir(vector);
  }

  /**
   * Procesa un cuadro. captura = salida de capturar_senia().
   * @returns {{ estado:string, top:object[], progreso:number, token:object|null }}
   */
  procesar(captura, ahoraMs) {
    // --- Sin mano: posible ESPACIO ---
    if (!captura.puntos) {
      this.candidato = null;
      this.cuenta = 0;
      this.cuentaDudosa = 0;
      this.bloqueada = null;
      this.tabla.asignar('buffer_captura', undefined);
      if (this.sinManoDesde === null) this.sinManoDesde = ahoraMs;
      if (this.letrasDesdeEspacio > 0 && ahoraMs - this.sinManoDesde > PAUSA_ESPACIO_MS) {
        this.letrasDesdeEspacio = 0;
        return { estado: 'sin-mano', top: [], progreso: 0, token: this.emitir({ tipo: 'ESPACIO', lexema: '␣' }) };
      }
      return { estado: 'sin-mano', top: [], progreso: 0, token: null };
    }
    this.sinManoDesde = null;
    this.tabla.asignar('buffer_captura', captura.puntos);

    const vector = normalizar(captura.puntos, captura.ancho, captura.alto);
    const top = this.traducir_senia(vector);
    if (!top) return { estado: 'error', top: [], progreso: 0, token: null };

    const [p1, p2] = top;
    let estado = 'ok';
    if (p1.confianza < MIN_RECONOCIDA) estado = 'desconocida';
    else if (p1.confianza < UMBRAL_CONFIANZA && p2 && p1.confianza - p2.confianza < MARGEN_AMBIGUEDAD) estado = 'ambigua';
    else if (p1.confianza < UMBRAL_CONFIANZA) estado = 'baja';

    if (estado !== 'ok') {
      this.cuenta = 0;
      this.candidato = null;
      if (estado !== this.estadoDudoso) { this.estadoDudoso = estado; this.cuentaDudosa = 0; }
      if (++this.cuentaDudosa % CUADROS_PARA_ERROR === 0) this.reportarDudosa(estado, p1, p2);
      return { estado, top, progreso: 0, token: null };
    }
    this.cuentaDudosa = 0;
    this.estadoDudoso = null;

    // --- Estabilización ---
    if (p1.letra !== this.candidato) {
      this.candidato = p1.letra;
      this.cuenta = 0;
      if (p1.letra !== this.bloqueada) this.bloqueada = null;
    }
    this.cuenta++;
    const progreso = Math.min(1, this.cuenta / CUADROS_ESTABLES);

    if (this.cuenta >= CUADROS_ESTABLES && this.bloqueada !== p1.letra) {
      this.bloqueada = p1.letra;
      if (!TablaSimbolos.buscarLetra(p1.letra)) {
        // Panic mode: el lexema no está en el alfabeto → se descarta
        this.errores.emitir(1, `"${p1.letra}" no está en el alfabeto LSM registrado.`, this.posicion);
        return { estado: 'desconocida', top, progreso, token: null };
      }
      this.letrasDesdeEspacio++;
      const token = this.emitir({ tipo: 'LETRA', lexema: p1.letra, confianza: p1.confianza });
      this.tabla.asignar('senia_actual', p1.letra);
      return { estado, top, progreso: 1, token };
    }
    return { estado: this.bloqueada === p1.letra ? 'emitida' : 'ok', top, progreso, token: null };
  }

  reportarDudosa(estado, p1, p2) {
    const pct = x => `${(x * 100).toFixed(0)} %`;
    if (estado === 'desconocida') {
      this.errores.emitir(1, `ninguna letra supera el ${pct(MIN_RECONOCIDA)} (mejor: ${p1.letra} ${pct(p1.confianza)}). Se descarta.`, this.posicion);
    } else if (estado === 'ambigua') {
      this.errores.emitir(3, `${p1.letra} (${pct(p1.confianza)}) vs ${p2.letra} (${pct(p2.confianza)}). Repite la seña con más claridad.`, this.posicion);
    } else {
      this.errores.emitir(5, `${p1.letra} con ${pct(p1.confianza)} < umbral ${pct(UMBRAL_CONFIANZA)}. Repite la seña.`, this.posicion);
    }
  }

  emitir(token) {
    token.posicion = this.posicion++;
    this.tabla.registrarToken(token);
    this.tabla.asignar('contador_senias', this.posicion);
    return token;
  }

  /** Token ESPACIO forzado desde la interfaz (botón / barra espaciadora). */
  espacioManual() {
    this.letrasDesdeEspacio = 0;
    return this.emitir({ tipo: 'ESPACIO', lexema: '␣' });
  }
}
