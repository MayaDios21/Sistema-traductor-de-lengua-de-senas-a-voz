// Catálogo de los 10 errores semánticos (sección 5 del documento), adaptados
// al alfabeto dactilológico, y su estrategia de recuperación.
//
// Recuperación:
//  - 'panico'     → modo pánico: se descarta el elemento problemático y se sigue.
//  - 'produccion' → producción de error: regla explícita que pide una acción
//                   (p. ej. "repite la seña") o corrige automáticamente.
//  - 'aviso'      → se acepta el elemento pero se informa (degradación controlada).

export const ERRORES = {
  1: { nombre: 'Seña no reconocida', recuperacion: 'panico',
       descripcion: 'Se detecta una mano, pero su forma no corresponde a ninguna letra del diccionario LSM.' },
  2: { nombre: 'Secuencia incompleta', recuperacion: 'panico',
       descripcion: 'Se intenta cerrar una palabra u oración que no contiene ninguna letra.' },
  3: { nombre: 'Ambigüedad de seña', recuperacion: 'produccion',
       descripcion: 'Dos letras tienen probabilidad casi igual (p. ej. M/N, U/V) y no se puede decidir cuál es.' },
  4: { nombre: 'Incompatibilidad de categoría', recuperacion: 'panico',
       descripcion: 'Un token de CONTROL (ESPACIO) aparece donde se esperaba una LETRA (inicio de oración o doble espacio).' },
  5: { nombre: 'Confianza insuficiente', recuperacion: 'produccion',
       descripcion: 'La probabilidad del modelo es menor al umbral_confianza (0.85); la seña no se acepta.' },
  6: { nombre: 'Redundancia semántica', recuperacion: 'panico',
       descripcion: 'La misma letra aparece 3 veces seguidas; en español no hay palabras así, se descarta la repetición.' },
  7: { nombre: 'Variable sin inicializar', recuperacion: 'produccion',
       descripcion: 'Se intenta usar una variable (modelo_reconocimiento u oracion_salida) antes de asignarle valor.' },
  8: { nombre: 'Desbordamiento del buffer', recuperacion: 'panico',
       descripcion: 'La palabra o la oración exceden el tamaño reservado en la tabla de direcciones (32 / 128 bytes).' },
  9: { nombre: 'Número de argumentos incorrecto', recuperacion: 'panico',
       descripcion: 'traducir_senia() recibe un vector que no tiene 21×3 = 63 valores válidos.' },
  10: { nombre: 'Orden gramatical inválido', recuperacion: 'aviso',
       descripcion: 'La palabra formada no existe en el diccionario del español; se conserva y se sugiere una corrección.' },
};

export class ErrorSemantico {
  constructor(codigo, detalle, posicion = null, sugerencia = null) {
    this.codigo = codigo;
    this.nombre = ERRORES[codigo].nombre;
    this.recuperacion = ERRORES[codigo].recuperacion;
    this.detalle = detalle;
    this.posicion = posicion;
    this.sugerencia = sugerencia;
    this.hora = new Date();
  }

  toString() {
    const pos = this.posicion !== null ? ` (posición ${this.posicion})` : '';
    return `Error semántico #${this.codigo} – ${this.nombre}${pos}: ${this.detalle}`;
  }
}

/** Registro de errores: los guarda y avisa a quien escuche (la UI). */
export class ManejadorErrores {
  constructor() {
    this.lista = [];
    this.oyentes = [];
    this.ultimo = {}; // evita repetir el mismo error en cada cuadro
  }

  alEmitir(fn) { this.oyentes.push(fn); }

  /** Detectar → reportar. 'decidir' lo hace quien llama según e.recuperacion. */
  emitir(codigo, detalle, posicion = null, sugerencia = null, enfriamientoMs = 1500) {
    const ahora = performance.now();
    if (this.ultimo[codigo] && ahora - this.ultimo[codigo] < enfriamientoMs) return null;
    this.ultimo[codigo] = ahora;
    const e = new ErrorSemantico(codigo, detalle, posicion, sugerencia);
    this.lista.push(e);
    if (this.lista.length > 100) this.lista.shift();
    this.oyentes.forEach(fn => fn(e));
    return e;
  }

  limpiar() {
    this.lista = [];
    this.ultimo = {};
  }
}
