// Orquestador del traductor:
//   captura → léxico → sintáctico (+ acciones semánticas) → semántico → salida

import { TablaSimbolos } from './tablaSimbolos.js';
import { ManejadorErrores } from './errores.js';
import { AnalizadorLexico } from './lexico.js';
import { AnalizadorSintactico } from './sintactico.js';
import { AnalizadorSemantico } from './semantico.js';

export class Traductor {
  constructor() {
    this.tabla = new TablaSimbolos();
    this.errores = new ManejadorErrores();
    this.lexico = new AnalizadorLexico(this.tabla, this.errores);
    this.semantico = new AnalizadorSemantico(this.tabla, this.errores);
    this.sintactico = new AnalizadorSintactico(this.semantico.acciones());
    this.oraciones = [];  // oraciones finalizadas
    this.ast = null;
    this.salida = '';
  }

  cargarModelo(clasificador) {
    this.tabla.asignar('modelo_reconocimiento', clasificador);
  }

  /** Procesa un cuadro de video ya capturado. */
  procesarCuadro(captura, ahoraMs) {
    const r = this.lexico.procesar(captura, ahoraMs);
    if (r.token) r.aceptado = this.recibirToken(r.token);
    return r;
  }

  recibirToken(token) {
    const ok = this.sintactico.agregar(token);
    token.aceptado = ok;
    this.actualizar();
    return ok;
  }

  espacio() {
    return this.recibirToken(this.lexico.espacioManual());
  }

  deshacer() {
    this.sintactico.deshacer();
    this.actualizar();
  }

  borrar() {
    this.sintactico.reiniciar();
    this.lexico.reiniciar();
    this.actualizar();
  }

  /** Cierra la oración actual y la pasa al historial. */
  finalizar() {
    const palabras = this.sintactico.todasLasPalabras();
    if (palabras.length === 0) {
      this.errores.emitir(2, 'no hay ninguna palabra que traducir: la oración está vacía.', null, null, 0);
      return null;
    }
    const abierta = this.sintactico.textoActual();
    if (abierta) this.semantico.verificarPalabra(abierta);
    const texto = this.salida + '.';
    this.oraciones.push(texto);
    this.sintactico.reiniciar();
    this.lexico.letrasDesdeEspacio = 0;
    this.actualizar();
    return texto;
  }

  /** Usa oracion_salida (copiar / leer en voz alta) verificando que exista. */
  usarOracion() {
    if (!this.tabla.estaInicializada('oracion_salida')) {
      const ultima = this.oraciones.at(-1);
      if (ultima) return ultima;
      this.errores.emitir(7, 'oracion_salida no tiene valor todavía: deletrea al menos una palabra.', null, null, 0);
      return null;
    }
    return this.tabla.leer('oracion_salida');
  }

  actualizar() {
    this.ast = this.sintactico.construirArbol();
    this.salida = this.semantico.traducir(this.ast, this.sintactico.textoActual());
  }
}

export { TablaSimbolos };
