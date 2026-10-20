// Clasificador (modelo_reconocimiento): red neuronal MLP con TensorFlow.js.
// Entrada: vector de 63 valores normalizados. Salida: probabilidad por letra.
// Se guarda como JSON propio (arquitectura + pesos) en modelo/modelo.json.
/* global tf */

import { TAM_VECTOR } from './preprocesamiento.js';

export const RUTA_MODELO = 'modelo/modelo.json';

export function construirRed(numClases) {
  const red = tf.sequential();
  red.add(tf.layers.dense({ inputShape: [TAM_VECTOR], units: 128, activation: 'relu' }));
  red.add(tf.layers.dropout({ rate: 0.25 }));
  red.add(tf.layers.dense({ units: 64, activation: 'relu' }));
  red.add(tf.layers.dropout({ rate: 0.15 }));
  red.add(tf.layers.dense({ units: numClases, activation: 'softmax' }));
  red.compile({ optimizer: tf.train.adam(0.002), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return red;
}

export class Clasificador {
  constructor(red, letras, info = {}) {
    this.red = red;
    this.letras = letras;
    this.info = info;
  }

  /** @returns {{letra:string, confianza:number}[]} ordenado de mayor a menor */
  predecir(vector) {
    const probs = tf.tidy(() => this.red.predict(tf.tensor2d([vector])).dataSync());
    return Array.from(probs)
      .map((p, i) => ({ letra: this.letras[i], confianza: p }))
      .sort((a, b) => b.confianza - a.confianza);
  }

  serializar() {
    return {
      version: 1,
      letras: this.letras,
      info: this.info,
      pesos: this.red.getWeights().map(t => ({ forma: t.shape, datos: Array.from(t.dataSync()) })),
    };
  }

  static deserializar(json) {
    const red = construirRed(json.letras.length);
    red.setWeights(json.pesos.map(p => tf.tensor(p.datos, p.forma)));
    return new Clasificador(red, json.letras, json.info || {});
  }

  static async cargar(ruta = RUTA_MODELO) {
    const r = await fetch(ruta, { cache: 'no-store' });
    if (!r.ok) return null;
    return Clasificador.deserializar(await r.json());
  }
}
