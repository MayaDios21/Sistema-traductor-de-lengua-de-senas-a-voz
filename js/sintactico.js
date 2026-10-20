// Analizador sintáctico: agrupa los tokens en palabras y construye el árbol
// de expresión (AST) de concatenación.
//
// Gramática (libre de contexto):
//   ORACION → PALABRA ( ESPACIO PALABRA )*
//   PALABRA → LETRA+
//
// AST (asociativo a la izquierda, como en el documento):
//            CONCAT
//           /      \
//       CONCAT     AGUA
//       /    \
//     YO    QUIERO
//
// Cada regla tiene una acción semántica (callback) que puede aceptar o
// rechazar el token antes de reducirlo; así el análisis semántico se hace
// durante el sintáctico (traducción dirigida por la sintaxis).

export class AnalizadorSintactico {
  /**
   * @param {object} acciones  { alLetra(token, palabraActual, oracion) → bool,
   *                             alEspacio(token, palabraActual, oracion) → bool }
   */
  constructor(acciones) {
    this.acciones = acciones;
    this.reiniciar();
  }

  reiniciar() {
    this.palabras = [];      // palabras cerradas: [{ letras: token[] }]
    this.actual = [];        // tokens LETRA de la palabra en construcción
    this.historial = [];     // tokens aceptados (para deshacer)
  }

  /** Recibe un token. Devuelve true si fue aceptado por la gramática. */
  agregar(token) {
    if (token.tipo === 'LETRA') {
      // PALABRA → LETRA+
      if (!this.acciones.alLetra(token, this.textoActual(), this)) return false;
      this.actual.push(token);
    } else if (token.tipo === 'ESPACIO') {
      // ORACION → ORACION ESPACIO PALABRA : cierra la palabra actual
      if (!this.acciones.alEspacio(token, this.textoActual(), this)) return false;
      this.palabras.push({ letras: this.actual });
      this.actual = [];
    } else {
      return false;
    }
    this.historial.push(token);
    return true;
  }

  deshacer() {
    const t = this.historial.pop();
    if (!t) return null;
    if (t.tipo === 'LETRA') {
      this.actual.pop();
    } else {
      this.actual = this.palabras.pop().letras;
    }
    return t;
  }

  textoActual() {
    return this.actual.map(t => t.lexema).join('');
  }

  /** Lista de palabras incluida la que está abierta (si tiene letras). */
  todasLasPalabras() {
    const lista = this.palabras.map(p => ({ letras: p.letras, abierta: false }));
    if (this.actual.length) lista.push({ letras: this.actual, abierta: true });
    return lista;
  }

  /** Construye el AST: hojas PALABRA unidas por nodos CONCAT a la izquierda. */
  construirArbol() {
    const hojas = this.todasLasPalabras().map(p => ({
      tipo: 'PALABRA',
      valor: p.letras.map(t => t.lexema).join(''),
      letras: p.letras,
      abierta: p.abierta,
    }));
    if (hojas.length === 0) return null;
    return hojas.slice(1).reduce((izq, der) => ({ tipo: 'CONCAT', izq, der }), hojas[0]);
  }
}
