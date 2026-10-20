// Analizador semántico.
//  1. Acciones semánticas de cada regla de la gramática (se llaman desde el
//     sintáctico antes de reducir): verifican categoría, redundancia y tamaño.
//  2. Recorrido del AST: evalúa CONCAT(izq, der) → "izq der" y anota cada
//     PALABRA con su verificación contra el diccionario LSM.

import { TablaSimbolos, LIMITE_PALABRA, LIMITE_ORACION } from './tablaSimbolos.js';

export class AnalizadorSemantico {
  constructor(tabla, errores) {
    this.tabla = tabla;
    this.errores = errores;
  }

  /** Acciones semánticas que se le pasan al analizador sintáctico. */
  acciones() {
    return {
      alLetra: (token, palabra, sint) => this.alLetra(token, palabra, sint),
      alEspacio: (token, palabra, sint) => this.alEspacio(token, palabra, sint),
    };
  }

  alLetra(token, palabra, sint) {
    // #6 Redundancia: tres letras iguales seguidas no existen en español
    if (palabra.length >= 2 && palabra.endsWith(token.lexema + token.lexema)) {
      this.errores.emitir(6, `"${palabra}${token.lexema}": se descarta la tercera "${token.lexema}" repetida.`, token.posicion, null, 0);
      return false;
    }
    // #8 Desbordamiento: palabra_traducida (32 bytes) u oracion_salida (128 bytes)
    if (palabra.length + 1 > LIMITE_PALABRA) {
      this.errores.emitir(8, `la palabra supera ${LIMITE_PALABRA} caracteres (palabra_traducida). Se descarta la letra.`, token.posicion, null, 0);
      return false;
    }
    if (this.longitudOracion(sint) + 1 > LIMITE_ORACION) {
      this.errores.emitir(8, `la oración supera ${LIMITE_ORACION} caracteres (oracion_salida). Borra o finaliza la oración.`, token.posicion, null, 0);
      return false;
    }
    return true;
  }

  alEspacio(token, palabra, sint) {
    // #4 Incompatibilidad de categoría: se esperaba LETRA y llegó CONTROL
    if (palabra.length === 0) {
      const donde = sint.palabras.length === 0 ? 'al inicio de la oración' : 'después de otro ESPACIO';
      this.errores.emitir(4, `ESPACIO ${donde}: la gramática espera una LETRA. Se ignora.`, token.posicion, null, 0);
      return false;
    }
    // #10 La palabra que se cierra no existe en el diccionario → aviso + sugerencia
    this.verificarPalabra(palabra, token.posicion);
    return true;
  }

  verificarPalabra(palabra, posicion = null) {
    if (TablaSimbolos.existePalabra(palabra)) return { existe: true, sugerencia: null };
    const sugerencia = TablaSimbolos.sugerir(palabra);
    this.errores.emitir(10,
      `"${palabra}" no está en el diccionario del español.` + (sugerencia ? ` ¿Quisiste decir "${sugerencia}"?` : ''),
      posicion, sugerencia, 0);
    return { existe: false, sugerencia };
  }

  longitudOracion(sint) {
    return sint.todasLasPalabras().reduce((n, p) => n + p.letras.length + 1, 0);
  }

  /**
   * Recorre el AST en postorden y genera el texto de salida.
   * Anota cada hoja PALABRA con { existe, sugerencia } (sin emitir errores:
   * esos ya se reportaron al cerrar cada palabra).
   */
  evaluar(nodo) {
    if (!nodo) return '';
    if (nodo.tipo === 'PALABRA') {
      nodo.existe = TablaSimbolos.existePalabra(nodo.valor);
      nodo.sugerencia = nodo.existe || nodo.abierta ? null : TablaSimbolos.sugerir(nodo.valor);
      return nodo.valor.toLowerCase();
    }
    // CONCAT(izq, der)
    nodo.valor = `${this.evaluar(nodo.izq)} ${this.evaluar(nodo.der)}`;
    return nodo.valor;
  }

  /** Traduce el AST completo y actualiza la tabla de símbolos. */
  traducir(ast, palabraAbierta) {
    const texto = this.evaluar(ast);
    const oracion = texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : undefined;
    this.tabla.asignar('palabra_traducida', palabraAbierta || undefined);
    this.tabla.asignar('oracion_salida', oracion);
    return oracion || '';
  }
}
