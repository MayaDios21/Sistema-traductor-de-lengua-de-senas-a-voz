// Preprocesamiento: convierte los 21 landmarks crudos de MediaPipe en el
// vector de características (63 valores) que recibe el clasificador.
//
//  1. Pasa de coordenadas normalizadas (0..1) a píxeles, para que el ancho y
//     alto de la imagen no deformen la mano (el dataset es 2400x1080 y la
//     webcam suele ser 1280x720).
//  2. Centra en la muñeca (landmark 0) → invariante a la posición.
//  3. Escala por la distancia máxima a la muñeca → invariante al tamaño /
//     distancia a la cámara.
//  No se rota: en el alfabeto LSM la orientación sí distingue letras.

export const NUM_PUNTOS = 21;
export const DIMENSIONES = 3;
export const TAM_VECTOR = NUM_PUNTOS * DIMENSIONES; // 63

/**
 * @param {{x:number,y:number,z:number}[]} puntos  landmarks de MediaPipe
 * @param {number} ancho  ancho de la imagen/video en píxeles
 * @param {number} alto   alto de la imagen/video en píxeles
 * @returns {number[] | null}  vector de 63 valores, o null si la entrada es inválida
 */
export function normalizar(puntos, ancho, alto) {
  if (!Array.isArray(puntos) || puntos.length !== NUM_PUNTOS) return null;

  const px = puntos.map(p => [p.x * ancho, p.y * alto, p.z * ancho]);
  const [mx, my, mz] = px[0];
  const centrados = px.map(([x, y, z]) => [x - mx, y - my, z - mz]);

  let escala = 0;
  for (const [x, y, z] of centrados) escala = Math.max(escala, Math.hypot(x, y, z));
  if (!Number.isFinite(escala) || escala === 0) return null;

  return centrados.flatMap(([x, y, z]) => [x / escala, y / escala, z / escala]);
}

/** Refleja el vector en el eje X (mano izquierda ↔ derecha). */
export function espejo(vector) {
  return vector.map((v, i) => (i % 3 === 0 ? -v : v));
}

/** Aumento de datos: pequeña rotación en el plano + ruido gaussiano. */
export function aumentar(vector, maxGrados = 12, ruido = 0.015) {
  const a = ((Math.random() * 2 - 1) * maxGrados * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const out = new Array(vector.length);
  for (let i = 0; i < vector.length; i += 3) {
    const x = vector[i], y = vector[i + 1];
    out[i] = c * x - s * y + gauss() * ruido;
    out[i + 1] = s * x + c * y + gauss() * ruido;
    out[i + 2] = vector[i + 2] + gauss() * ruido;
  }
  return out;
}

function gauss() {
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * De varias manos detectadas elige la que está haciendo la seña: la que tiene
 * la muñeca más arriba (en el dataset la otra mano descansa en las piernas).
 */
export function elegirManoActiva(manos) {
  if (!manos || manos.length === 0) return -1;
  let mejor = 0;
  for (let i = 1; i < manos.length; i++) {
    if (manos[i][0].y < manos[mejor][0].y) mejor = i;
  }
  return mejor;
}
