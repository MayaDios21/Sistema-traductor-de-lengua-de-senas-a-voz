// Captura: webcam + MediaPipe Hand Landmarker.
// capturar_senia() devuelve el buffer_captura[21][3] de la mano activa.

import { FilesetResolver, HandLandmarker } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { elegirManoActiva } from './preprocesamiento.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODELO_MANO =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** Crea el detector de manos. modo: 'VIDEO' (webcam) o 'IMAGE' (dataset). */
export async function crearDetector(modo = 'VIDEO') {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const opciones = {
    baseOptions: { modelAssetPath: MODELO_MANO, delegate: 'GPU' },
    runningMode: modo,
    numHands: 2,
    minHandDetectionConfidence: modo === 'IMAGE' ? 0.3 : 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    return await HandLandmarker.createFromOptions(fileset, opciones);
  } catch {
    // Algunas computadoras no tienen WebGL2 → usar CPU
    opciones.baseOptions.delegate = 'CPU';
    return await HandLandmarker.createFromOptions(fileset, opciones);
  }
}

export async function iniciarCamara(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise(res => (video.onloadedmetadata = res));
  await video.play();
  return stream;
}

/**
 * capturar_senia(): procesa un cuadro del video.
 * @returns {{ puntos: object[]|null, manos: number, ancho: number, alto: number }}
 *   puntos = buffer_captura (21 landmarks) de la mano activa, o null si no hay mano.
 */
export function capturar_senia(detector, video, tiempoMs) {
  const r = detector.detectForVideo(video, tiempoMs);
  const i = elegirManoActiva(r.landmarks);
  return {
    puntos: i >= 0 ? r.landmarks[i] : null,
    manos: r.landmarks.length,
    ancho: video.videoWidth,
    alto: video.videoHeight,
  };
}

/** Misma captura pero sobre una imagen fija (para procesar el dataset). */
export function capturarImagen(detector, imagen) {
  const r = detector.detect(imagen);
  const i = elegirManoActiva(r.landmarks);
  return {
    puntos: i >= 0 ? r.landmarks[i] : null,
    manos: r.landmarks.length,
    ancho: imagen.naturalWidth || imagen.width,
    alto: imagen.naturalHeight || imagen.height,
  };
}

// Conexiones del esqueleto de la mano para dibujar
export const CONEXIONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export function dibujarMano(ctx, puntos, color = '#22c55e') {
  const { width: w, height: h } = ctx.canvas;
  ctx.lineWidth = Math.max(2, w / 320);
  ctx.strokeStyle = color;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (const [a, b] of CONEXIONES) {
    ctx.moveTo(puntos[a].x * w, puntos[a].y * h);
    ctx.lineTo(puntos[b].x * w, puntos[b].y * h);
  }
  ctx.stroke();
  const r = Math.max(3, w / 240);
  for (const p of puntos) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
