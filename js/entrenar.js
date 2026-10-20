// Herramienta de entrenamiento (entrenar.html):
//   1. Extrae landmarks de las imágenes del dataset (MediaPipe en modo IMAGE).
//   2. Captura muestras propias con la webcam (opcional).
//   3. Entrena el MLP y guarda modelo/modelo.json en el proyecto.
/* global tf */

import { crearDetector, iniciarCamara, capturar_senia, capturarImagen, dibujarMano } from './captura.js';
import { normalizar, espejo, aumentar } from './preprocesamiento.js';
import { construirRed, Clasificador } from './clasificador.js';
import { LETRAS_ESTATICAS } from './tablaSimbolos.js';

const $ = id => document.getElementById(id);
const RUTA_DATASET = 'datos/landmarks_dataset.json';
const RUTA_PROPIAS = 'datos/landmarks_propios.json';

let muestrasDataset = [];  // { letra, vector, persona, archivo }
let muestrasPropias = [];

// ---------- Utilidades ----------
async function leerJSON(ruta) {
  const r = await fetch(ruta, { cache: 'no-store' });
  return r.ok ? r.json() : null;
}

async function guardar(ruta, obj) {
  const r = await fetch(`/guardar?ruta=${encodeURIComponent(ruta)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj),
  });
  if (!r.ok) throw new Error(`No se pudo guardar ${ruta}. ¿Iniciaste el proyecto con "python servidor.py"?`);
}

function log(id, texto, reemplazar = false) {
  const el = $(id);
  el.textContent = reemplazar || el.textContent === '—' ? texto : `${el.textContent}\n${texto}`;
  el.scrollTop = el.scrollHeight;
}

function avisar(texto) {
  const t = $('toast');
  t.textContent = texto;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 2500);
}

const contarPorLetra = lista => lista.reduce((c, m) => ((c[m.letra] = (c[m.letra] || 0) + 1), c), {});
const redondear = v => v.map(x => Math.round(x * 1e4) / 1e4);

// ---------- Inicio ----------
(async function inicio() {
  $('selLetra').innerHTML = LETRAS_ESTATICAS.map(l => `<option>${l}</option>`).join('');
  muestrasDataset = (await leerJSON(RUTA_DATASET))?.muestras ?? [];
  muestrasPropias = (await leerJSON(RUTA_PROPIAS))?.muestras ?? [];
  const indice = await leerJSON('dataset/indice.json');
  const totalImgs = indice ? Object.values(indice).reduce((n, l) => n + l.length, 0) : 0;
  $('resumenDataset').textContent = `${totalImgs} imágenes en dataset/ · ${muestrasDataset.length} muestras ya extraídas`;
  pintarPropias();
})();

// ---------- Paso 1: extraer landmarks ----------
$('btnExtraer').onclick = async () => {
  const btn = $('btnExtraer');
  btn.disabled = true;
  try {
    const indice = await leerJSON('dataset/indice.json');
    if (!indice) throw new Error('No se encontró el índice del dataset (usa python servidor.py).');
    const tareas = Object.entries(indice).flatMap(([letra, rutas]) => rutas.map(ruta => ({ letra, ruta })));
    log('logExtraer', `Cargando detector de manos… (${tareas.length} imágenes)`, true);
    const detector = await crearDetector('IMAGE');
    const resultado = [];
    const fallidas = {};
    const t0 = performance.now();
    for (let i = 0; i < tareas.length; i++) {
      const { letra, ruta } = tareas[i];
      const img = await cargarImagen(ruta);
      const cap = capturarImagen(detector, img);
      const vector = cap.puntos && normalizar(cap.puntos, cap.ancho, cap.alto);
      const archivo = ruta.split('/').pop();
      if (vector) {
        resultado.push({ letra, vector: redondear(vector), persona: archivo.match(/^P(\d+)/)?.[1] ?? '?', archivo });
      } else {
        fallidas[letra] = (fallidas[letra] || 0) + 1;
      }
      if (i % 10 === 0 || i === tareas.length - 1) {
        $('barraExtraer').style.width = `${((i + 1) / tareas.length) * 100}%`;
        const seg = (performance.now() - t0) / 1000;
        log('logExtraer', `${i + 1}/${tareas.length} · ${resultado.length} con mano · ${(seg / (i + 1) * (tareas.length - i - 1)).toFixed(0)} s restantes`, true);
      }
    }
    detector.close();
    muestrasDataset = resultado;
    await guardar(RUTA_DATASET, { fuente: 'Mendeley Data 10.17632/5s4mt7xrd9.1 (CC BY-NC 3.0)', creado: new Date().toISOString(), muestras: resultado });
    const sinMano = Object.entries(fallidas).map(([l, n]) => `${l}:${n}`).join(' ') || 'ninguna';
    log('logExtraer', `\nListo: ${resultado.length}/${tareas.length} imágenes con mano detectada.\nSin mano por letra: ${sinMano}\nGuardado en ${RUTA_DATASET}`);
    $('resumenDataset').textContent = `${tareas.length} imágenes en dataset/ · ${resultado.length} muestras extraídas`;
    avisar('Landmarks guardados');
  } catch (e) {
    log('logExtraer', `ERROR: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
};

function cargarImagen(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`No se pudo leer ${src}`));
    img.src = src;
  });
}

// ---------- Paso 2: muestras propias ----------
let detectorVideo = null;
let grabando = null;

$('btnCamaraCaptura').onclick = async () => {
  $('btnCamaraCaptura').disabled = true;
  $('cajaCamara').hidden = false;
  try {
    [detectorVideo] = await Promise.all([crearDetector('VIDEO'), iniciarCamara($('video'))]);
    $('btnCapturar').disabled = false;
    requestAnimationFrame(bucleCaptura);
  } catch (e) {
    avisar(`Cámara: ${e.message}`);
    $('btnCamaraCaptura').disabled = false;
  }
};

$('btnCapturar').onclick = () => {
  const letra = $('selLetra').value;
  const total = +$('numMuestras').value;
  grabando = { letra, total, hechas: 0, inicio: performance.now() + 1500 }; // 1.5 s para acomodar la mano
  $('btnCapturar').disabled = true;
  $('resumenPropias').textContent = `Prepárate para la letra ${letra}…`;
};

$('btnBorrarPropias').onclick = async () => {
  if (!confirm('¿Borrar todas las muestras propias?')) return;
  muestrasPropias = [];
  await guardar(RUTA_PROPIAS, { muestras: [] });
  pintarPropias();
};

let ultimoCuadro = 0;
function bucleCaptura(ahora) {
  const video = $('video');
  if (video.readyState >= 2) {
    const cap = capturar_senia(detectorVideo, video, ahora);
    const lienzo = $('lienzo');
    if (lienzo.width !== video.videoWidth) { lienzo.width = video.videoWidth; lienzo.height = video.videoHeight; }
    const ctx = lienzo.getContext('2d');
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    if (cap.puntos) dibujarMano(ctx, cap.puntos, grabando ? '#ef4444' : '#22c55e');

    // Una muestra cada ~100 ms para que no sean todas idénticas
    if (grabando && ahora > grabando.inicio && cap.puntos && ahora - ultimoCuadro > 100) {
      ultimoCuadro = ahora;
      const vector = normalizar(cap.puntos, cap.ancho, cap.alto);
      if (vector) {
        muestrasPropias.push({ letra: grabando.letra, vector: redondear(vector), persona: 'propia' });
        grabando.hechas++;
        $('resumenPropias').textContent = `Grabando ${grabando.letra}: ${grabando.hechas}/${grabando.total} — mueve un poco la mano`;
        if (grabando.hechas >= grabando.total) terminarGrabacion();
      }
    }
  }
  requestAnimationFrame(bucleCaptura);
}

async function terminarGrabacion() {
  const letra = grabando.letra;
  grabando = null;
  $('btnCapturar').disabled = false;
  try {
    await guardar(RUTA_PROPIAS, { muestras: muestrasPropias });
    avisar(`Muestras de ${letra} guardadas`);
  } catch (e) { avisar(e.message); }
  pintarPropias();
  const sel = $('selLetra');
  if (sel.selectedIndex < sel.options.length - 1) sel.selectedIndex++;
}

function pintarPropias() {
  const c = contarPorLetra(muestrasPropias);
  $('resumenPropias').textContent = muestrasPropias.length
    ? `${muestrasPropias.length} muestras propias · ` + Object.entries(c).map(([l, n]) => `${l}:${n}`).join(' ')
    : 'Sin muestras propias.';
}

// ---------- Paso 3: entrenamiento ----------
$('btnEntrenar').onclick = async () => {
  const btn = $('btnEntrenar');
  btn.disabled = true;
  try { await entrenar(); } catch (e) { log('logEntrenar', `ERROR: ${e.message}`); console.error(e); }
  btn.disabled = false;
};

async function entrenar() {
  const todas = [...muestrasDataset, ...muestrasPropias];
  if (todas.length < 50) throw new Error('Primero extrae los landmarks del dataset (Paso 1) o captura muestras.');
  const letras = LETRAS_ESTATICAS.filter(l => todas.some(m => m.letra === l));
  const indiceLetra = Object.fromEntries(letras.map((l, i) => [l, i]));

  // División entrenamiento / validación
  let entren, valid, descripcion;
  if ($('selValidacion').value === 'persona') {
    const personas = [...new Set(muestrasDataset.map(m => m.persona))].sort();
    const fuera = personas.at(-1);
    entren = todas.filter(m => m.persona !== fuera);
    valid = todas.filter(m => m.persona === fuera);
    descripcion = `validación = persona ${fuera} (nunca vista en el entrenamiento)`;
  } else {
    const mezcladas = todas.slice().sort(() => Math.random() - 0.5);
    const corte = Math.floor(mezcladas.length * 0.8);
    entren = mezcladas.slice(0, corte);
    valid = mezcladas.slice(corte);
    descripcion = 'validación = 20 % aleatorio';
  }

  // Aumento de datos: espejo (mano izq./der.) + rotación y ruido
  const X = [], Y = [];
  for (const m of entren) {
    for (const base of [m.vector, espejo(m.vector)]) {
      X.push(base); Y.push(indiceLetra[m.letra]);
      for (let k = 0; k < 3; k++) { X.push(aumentar(base)); Y.push(indiceLetra[m.letra]); }
    }
  }
  const Xv = [], Yv = [];
  for (const m of valid) for (const v of [m.vector, espejo(m.vector)]) { Xv.push(v); Yv.push(indiceLetra[m.letra]); }

  log('logEntrenar', `${entren.length} muestras de entrenamiento (${X.length} con aumento) · ${valid.length} de validación\n${descripcion}`, true);

  const red = construirRed(letras.length);
  const xs = tf.tensor2d(X), ys = tf.oneHot(tf.tensor1d(Y, 'int32'), letras.length);
  const xv = tf.tensor2d(Xv), yv = tf.oneHot(tf.tensor1d(Yv, 'int32'), letras.length);
  const epocas = +$('numEpocas').value;

  // Una época por llamada: fit() por defecto cede el control con
  // requestAnimationFrame, que se congela si la pestaña no está visible.
  for (let ep = 0; ep < epocas; ep++) {
    const h = await red.fit(xs, ys, {
      epochs: 1, batchSize: 64, shuffle: true, yieldEvery: 'never',
      validationData: Xv.length ? [xv, yv] : undefined,
    });
    const l = Object.fromEntries(Object.entries(h.history).map(([k, v]) => [k, v[0]]));
    $('barraEntrenar').style.width = `${((ep + 1) / epocas) * 100}%`;
    if (ep % 5 === 4 || ep === epocas - 1) {
      log('logEntrenar', `época ${ep + 1}: pérdida ${l.loss.toFixed(3)} · precisión ${(l.acc * 100).toFixed(1)} %` +
        (l.val_acc !== undefined ? ` · validación ${(l.val_acc * 100).toFixed(1)} %` : ''));
    }
    await new Promise(r => setTimeout(r, 0));
  }

  // Evaluación y matriz de confusión
  const pred = Xv.length ? Array.from(tf.tidy(() => red.predict(xv).argMax(1).dataSync())) : [];
  const n = letras.length;
  const matriz = Array.from({ length: n }, () => new Array(n).fill(0));
  let aciertos = 0;
  pred.forEach((p, i) => { matriz[Yv[i]][p]++; if (p === Yv[i]) aciertos++; });
  const precision = pred.length ? aciertos / pred.length : null;
  tf.dispose([xs, ys, xv, yv]);

  const clasificador = new Clasificador(red, letras, {
    entrenado: new Date().toISOString(),
    muestras: todas.length,
    precisionValidacion: precision,
    validacion: descripcion,
  });
  await guardar('modelo/modelo.json', clasificador.serializar());

  $('metricas').innerHTML = [
    [precision !== null ? `${(precision * 100).toFixed(1)} %` : '—', 'Precisión de validación'],
    [todas.length, 'Muestras totales'],
    [letras.length, 'Letras'],
    [epocas, 'Épocas'],
  ].map(([v, t]) => `<div class="metrica"><b>${v}</b><span>${t}</span></div>`).join('');
  pintarConfusion(letras, matriz);
  log('logEntrenar', '\nModelo guardado en modelo/modelo.json. Recarga el traductor para usarlo.');
  avisar('Modelo entrenado y guardado');
}

function pintarConfusion(letras, m) {
  const max = Math.max(1, ...m.flat());
  const cab = `<tr><th>real ↓ / pred →</th>${letras.map(l => `<th>${l}</th>`).join('')}</tr>`;
  const filas = m.map((fila, i) => `<tr><th>${letras[i]}</th>${fila.map((v, j) => {
    const a = v / max;
    const color = i === j ? `rgb(22 163 74 / ${a})` : `rgb(220 38 38 / ${a})`;
    return `<td style="background:${v ? color : 'transparent'}">${v || ''}</td>`;
  }).join('')}</tr>`).join('');
  $('confusion').innerHTML = cab + filas;
}
