// Interfaz del traductor en vivo (index.html).

import { crearDetector, iniciarCamara, capturar_senia, dibujarMano } from './captura.js';
import { Clasificador } from './clasificador.js';
import { Traductor } from './traductor.js';
import { LETRAS_ESTATICAS, LETRAS_DINAMICAS, TABLA_DIRECCIONES, UMBRAL_CONFIANZA, ALFABETO } from './tablaSimbolos.js';
import { ERRORES } from './errores.js';

const $ = id => document.getElementById(id);
const traductor = new Traductor();
let detector = null;
let ultimoRefresco = 0;

// ---------- Inicio ----------
pintarAlfabeto();
pintarDirecciones();
pintarTodo();
configurarPestanas();
configurarControles();
traductor.errores.alEmitir(e => { pintarErrores(); avisar(`#${e.codigo} ${e.nombre}`); });

cargarModelo();
$('btnCamara').addEventListener('click', arrancar);
arrancar();

async function cargarModelo() {
  try {
    const modelo = await Clasificador.cargar();
    if (!modelo) throw new Error('no existe modelo/modelo.json');
    traductor.cargarModelo(modelo);
    const prec = modelo.info.precisionValidacion;
    estadoModelo('ok', `Modelo cargado · ${modelo.letras.length} letras` + (prec ? ` · ${(prec * 100).toFixed(1)} % validación` : ''));
  } catch (err) {
    estadoModelo('error', 'Sin modelo: ve a “Entrenar modelo”');
    console.warn(err);
  }
  pintarTablas();
}

async function arrancar() {
  const aviso = $('avisoCamara');
  $('textoAvisoCamara').textContent = 'Iniciando cámara y detector de manos…';
  $('btnCamara').hidden = true;
  try {
    const video = $('video');
    [detector] = await Promise.all([detector || crearDetector('VIDEO'), iniciarCamara(video)]);
    aviso.hidden = true;
    $('estadoVivo').textContent = 'Muestra tu mano';
    requestAnimationFrame(bucle);
  } catch (err) {
    console.error(err);
    $('textoAvisoCamara').textContent = err.name === 'NotAllowedError'
      ? 'Permiso de cámara denegado. Actívalo en el candado de la barra de direcciones.'
      : `No se pudo iniciar la cámara: ${err.message}`;
    $('btnCamara').hidden = false;
  }
}

// ---------- Bucle principal ----------
let ultimoTiempoVideo = -1;
function bucle(ahora) {
  const video = $('video');
  if (video.readyState >= 2 && video.currentTime !== ultimoTiempoVideo) {
    ultimoTiempoVideo = video.currentTime;
    const captura = capturar_senia(detector, video, ahora);
    const r = traductor.procesarCuadro(captura, ahora);
    pintarCamara(captura);
    pintarEnVivo(r);
    if (r.token || ahora - ultimoRefresco > 300) {
      ultimoRefresco = ahora;
      if (r.token) pintarTodo(); else pintarTablas();
    }
  }
  requestAnimationFrame(bucle);
}

function pintarCamara(captura) {
  const lienzo = $('lienzo'), video = $('video');
  if (lienzo.width !== video.videoWidth) { lienzo.width = video.videoWidth; lienzo.height = video.videoHeight; }
  const ctx = lienzo.getContext('2d');
  ctx.clearRect(0, 0, lienzo.width, lienzo.height);
  if (captura.puntos) dibujarMano(ctx, captura.puntos);
}

const TEXTO_ESTADO = {
  'sin-mano': 'Sin mano', ok: 'Reconociendo…', emitida: 'Letra aceptada ✓', baja: 'Confianza baja',
  ambigua: 'Seña ambigua', desconocida: 'No reconocida', error: 'Error',
};

function pintarEnVivo(r) {
  const [p1] = r.top;
  $('letraVivo').textContent = p1 && r.estado !== 'sin-mano' ? p1.letra : '–';
  $('anillo').style.setProperty('--p', r.progreso);
  const est = $('estadoVivo');
  est.textContent = TEXTO_ESTADO[r.estado] || r.estado;
  est.className = `estado ${r.estado}`;
  $('confianzaVivo').textContent = p1 ? `confianza ${(p1.confianza * 100).toFixed(0)} % · umbral ${UMBRAL_CONFIANZA * 100} %` : `umbral ${UMBRAL_CONFIANZA * 100} %`;

  $('top3').innerHTML = r.top.slice(0, 3).map(t => `
    <div class="barra"><b>${t.letra}</b>
      <div class="pista"><div class="relleno ${t.confianza >= UMBRAL_CONFIANZA ? 'sobre-umbral' : ''}" style="width:${(t.confianza * 100).toFixed(1)}%"></div></div>
      <small>${(t.confianza * 100).toFixed(1)}%</small></div>`).join('');

  for (const s of $('alfabeto').children) {
    s.classList.toggle('activa', r.estado === 'emitida' && p1?.letra === s.textContent);
    s.classList.toggle('candidata', r.estado !== 'emitida' && r.estado !== 'sin-mano' && p1?.letra === s.textContent);
  }
}

// ---------- Pintado de paneles ----------
function pintarTodo() {
  pintarSalida();
  pintarTokens();
  pintarArbol();
  pintarTablas();
  pintarErrores();
}

function pintarSalida() {
  const s = $('salida');
  s.innerHTML = traductor.salida
    ? `${escapar(traductor.salida)}<span class="cursor"></span>`
    : '<span class="vacio">Deletrea una palabra frente a la cámara…</span>';
  $('historial').innerHTML = traductor.oraciones.slice(-4).reverse().map(o => `<li>${escapar(o)}</li>`).join('');
}

function pintarTokens() {
  const tokens = traductor.tabla.tokens.slice(-40);
  $('tokens').innerHTML = tokens.map(t =>
    `<span class="token ${t.tipo === 'ESPACIO' ? 'espacio' : ''} ${t.aceptado === false ? 'rechazado' : ''}" title="${t.tipo} #${t.posicion}">${t.lexema}<sub>${t.posicion}</sub></span>`
  ).join('');
}

function pintarTablas() {
  const vars = traductor.tabla.variables;
  $('tablaVariables').innerHTML = Object.entries(vars).map(([nombre, v]) =>
    `<tr><td><code>${nombre}</code></td><td>${v.tipo}</td><td>${v.categoria}</td><td>${v.ambito}</td><td class="valor">${formatear(nombre, v.valor)}</td></tr>`
  ).join('');
  $('tablaTokens').innerHTML = traductor.tabla.tokens.slice(-30).reverse().map(t => {
    const cat = t.tipo === 'LETRA' ? (ALFABETO[t.lexema]?.categoria ?? '—') : 'control';
    const conf = t.confianza !== undefined ? `${(t.confianza * 100).toFixed(1)} %` : '—';
    const est = t.aceptado === false ? '<span class="sin-valor">rechazado</span>' : 'aceptado';
    return `<tr><td>${t.posicion}</td><td><code>${t.lexema}</code></td><td>${t.tipo}</td><td>${cat}</td><td>${conf}</td><td>${est}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="sin-valor">Aún no hay tokens</td></tr>';
}

function formatear(nombre, valor) {
  if (valor === undefined || valor === null) return '<span class="sin-valor">sin inicializar</span>';
  if (nombre === 'buffer_captura') return `[21][3] · muñeca (${valor[0].x.toFixed(2)}, ${valor[0].y.toFixed(2)})`;
  if (nombre === 'diccionario_LSM') return `${valor.size} palabras`;
  if (nombre === 'modelo_reconocimiento') return `MLP 63→128→64→${valor.letras.length}`;
  if (typeof valor === 'string') return `"${escapar(valor)}"`;
  return escapar(String(valor));
}

function pintarDirecciones() {
  $('tablaDirecciones').innerHTML = TABLA_DIRECCIONES.map(([n, d, t, a]) =>
    `<tr><td><code>${n}</code></td><td class="mono">${d}</td><td>${t}</td><td>${a}</td></tr>`).join('');
}

function pintarAlfabeto() {
  const todas = [...LETRAS_ESTATICAS, ...LETRAS_DINAMICAS].sort((a, b) => a.localeCompare(b, 'es'));
  $('alfabeto').innerHTML = todas.map(l =>
    `<span class="${LETRAS_DINAMICAS.includes(l) ? 'dinamica' : ''}">${l}</span>`).join('');
}

function pintarErrores() {
  const lista = traductor.errores.lista.slice().reverse();
  const c = $('contadorErrores');
  c.hidden = lista.length === 0;
  c.textContent = lista.length;
  $('listaErrores').innerHTML = lista.map(e => `
    <li class="${e.recuperacion}">
      <div class="titulo"><span>#${e.codigo} · ${e.nombre}</span><span class="meta">${e.hora.toLocaleTimeString()}</span></div>
      <div>${escapar(e.detalle)}</div>
      <div class="meta">${e.posicion !== null ? `Posición ${e.posicion} · ` : ''}Recuperación: ${NOMBRE_RECUP[e.recuperacion]}</div>
    </li>`).join('') || '<li class="vacio">Sin errores. Los 10 errores semánticos posibles están descritos en el documento del proyecto.</li>';
}

const NOMBRE_RECUP = { panico: 'modo pánico (se descarta y continúa)', produccion: 'producción de error (repetir seña)', aviso: 'aviso (se conserva)' };

// ---------- Árbol de expresión (SVG) ----------
function pintarArbol() {
  const cont = $('arbol');
  const ast = traductor.ast;
  if (!ast) {
    cont.innerHTML = '<div class="vacio">El árbol CONCAT aparecerá al deletrear palabras.</div>';
    return;
  }
  const ANCHO_HOJA = 110, ALTO_NIVEL = 70, MARGEN = 20;
  let siguiente = 0, prof = 0;
  const nodos = [], aristas = [];
  (function ubicar(n, nivel) {
    prof = Math.max(prof, nivel);
    if (n.tipo === 'PALABRA') {
      n._x = MARGEN + siguiente++ * ANCHO_HOJA + ANCHO_HOJA / 2;
    } else {
      ubicar(n.izq, nivel + 1);
      ubicar(n.der, nivel + 1);
      n._x = (n.izq._x + n.der._x) / 2;
      aristas.push([n, n.izq], [n, n.der]);
    }
    n._nivel = nivel;
    nodos.push(n);
  })(ast, 0);
  // Las hojas van todas al nivel más profundo, como en el documento
  for (const n of nodos) n._y = MARGEN + 16 + (n.tipo === 'PALABRA' ? prof : n._nivel) * ALTO_NIVEL;

  const ancho = Math.max(siguiente * ANCHO_HOJA + MARGEN * 2, 240);
  const alto = MARGEN * 2 + prof * ALTO_NIVEL + 56;
  const lineas = aristas.map(([a, b]) => `<line x1="${a._x}" y1="${a._y + 14}" x2="${b._x}" y2="${b._y - 14}"/>`).join('');
  const cajas = nodos.map(n => {
    if (n.tipo === 'CONCAT') {
      return `<g class="nodo-concat"><title>${escapar(n.valor)}</title>
        <rect x="${n._x - 36}" y="${n._y - 14}" width="72" height="28" rx="8"/>
        <text x="${n._x}" y="${n._y + 4}" text-anchor="middle">CONCAT</text></g>`;
    }
    const clase = `nodo-palabra ${n.abierta ? 'abierta' : ''} ${!n.existe && !n.abierta ? 'no-existe' : ''}`;
    const w = Math.min(ANCHO_HOJA - 10, Math.max(56, n.valor.length * 9 + 20));
    const titulo = n.abierta ? 'palabra en construcción' : n.existe ? 'existe en el diccionario' : `no está en el diccionario${n.sugerencia ? ` · ¿${n.sugerencia}?` : ''}`;
    const etiqueta = n.valor.length > 11 ? n.valor.slice(0, 10) + '…' : n.valor;
    return `<g class="${clase}"><title>${escapar(n.valor)} — ${titulo}</title>
      <rect x="${n._x - w / 2}" y="${n._y - 14}" width="${w}" height="28" rx="8"/>
      <text x="${n._x}" y="${n._y + 4}" text-anchor="middle">${escapar(etiqueta)}</text>
      <text class="letras" x="${n._x}" y="${n._y + 32}" text-anchor="middle">${n.letras.map(t => t.lexema).join('·').slice(0, 18)}</text></g>`;
  }).join('');
  cont.innerHTML = `<svg width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Árbol de expresión CONCAT">${lineas}${cajas}</svg>`;
}

// ---------- Controles ----------
function configurarControles() {
  $('btnEspacio').onclick = () => { traductor.espacio(); pintarTodo(); };
  $('btnDeshacer').onclick = () => { traductor.deshacer(); pintarTodo(); };
  $('btnFinalizar').onclick = () => { traductor.finalizar(); pintarTodo(); };
  $('btnBorrar').onclick = () => { traductor.borrar(); traductor.errores.limpiar(); pintarTodo(); };
  $('btnCopiar').onclick = async () => {
    const t = traductor.usarOracion();
    if (!t) return;
    try { await navigator.clipboard.writeText(t); avisar('Copiado'); } catch { avisar('No se pudo copiar'); }
  };
  $('btnVoz').onclick = () => {
    const t = traductor.usarOracion();
    if (!t || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'es-MX';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select')) return;
    const acciones = { ' ': 'btnEspacio', Backspace: 'btnDeshacer', Enter: 'btnFinalizar', Escape: 'btnBorrar' };
    if (acciones[e.key]) { e.preventDefault(); $(acciones[e.key]).click(); }
  });
}

function configurarPestanas() {
  const tabs = document.querySelectorAll('[role="tab"]');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(o => {
      o.setAttribute('aria-selected', String(o === t));
      $(o.getAttribute('aria-controls')).hidden = o !== t;
    });
  }));
}

// ---------- Utilidades ----------
function estadoModelo(tipo, texto) {
  $('puntoModelo').className = `punto ${tipo}`;
  $('textoModelo').textContent = texto;
}

let temporizadorToast;
function avisar(texto) {
  const t = $('toast');
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => t.classList.remove('visible'), 2200);
}

function escapar(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Para depurar desde la consola
window.traductor = traductor;
window.ERRORES = ERRORES;
