# Traductor LSM → Texto (alfabeto dactilológico)

Prototipo del proyecto de Traductores (ITT). Reconoce las **21 letras estáticas**
del alfabeto de la Lengua de Señas Mexicana con la webcam y las traduce a texto en
español aplicando análisis **léxico → sintáctico → semántico**.

## Cómo correrlo

```bash
python servidor.py
```

Abre **http://localhost:8000** en Chrome o Edge y permite la cámara.
(No abras el HTML con doble clic: el navegador solo da la cámara en `localhost`.)

### Primera vez: entrenar el modelo
1. Abre **http://localhost:8000/entrenar.html**.
2. **Paso 1** – *Extraer landmarks*: procesa las imágenes de `dataset/` (~9 min) → `datos/landmarks_dataset.json`.
3. **Paso 2** (opcional) – graba muestras con tu propia mano si el modelo falla con tu cámara.
4. **Paso 3** – *Entrenar*: genera `modelo/modelo.json`. Vuelve al traductor.

### Uso del traductor
| Acción | Cómo |
|---|---|
| Letra | Sostén la seña ~⅓ s hasta que el anillo se llene |
| Letra doble (LL, RR) | Baja la mano un instante (< 1 s) y repite |
| Espacio | Quita la mano de la cámara > 1.2 s, o tecla **Espacio** |
| Deshacer | **Backspace** |
| Finalizar oración | **Enter** |
| Borrar todo | **Esc** |

## Arquitectura

```
cámara ─► captura.js ─► preprocesamiento.js ─► lexico.js ─► sintactico.js ─► semantico.js ─► texto
          (MediaPipe,     (centrar, escalar:     (MLP TF.js +    (gramática +      (diccionario,
           21 puntos)      vector de 63)          estabilización  árbol CONCAT)     errores, salida)
                                                  → tokens)
```

| Archivo | Rol en el traductor |
|---|---|
| `js/captura.js` | `capturar_senia()` – webcam + MediaPipe Hand Landmarker → `buffer_captura[21][3]` |
| `js/preprocesamiento.js` | Normalización del vector, espejo y aumento de datos |
| `js/clasificador.js` | `modelo_reconocimiento` – red MLP 63→128→64→21 (TensorFlow.js) |
| `js/lexico.js` | Analizador léxico: `traducir_senia()`, estabilización, tokens `LETRA` / `ESPACIO` |
| `js/sintactico.js` | Gramática `ORACION → PALABRA (ESPACIO PALABRA)*`, `PALABRA → LETRA+`; construye el AST CONCAT |
| `js/semantico.js` | Acciones semánticas por regla + recorrido del AST → oración final |
| `js/tablaSimbolos.js` | Tabla de símbolos, tabla de direcciones, alfabeto y diccionario |
| `js/errores.js` | Los 10 errores semánticos y su recuperación (modo pánico / producción de error) |
| `js/traductor.js` | Orquesta todas las etapas |
| `js/ui.js`, `index.html` | Interfaz del traductor |
| `js/entrenar.js`, `entrenar.html` | Extracción de landmarks y entrenamiento |
| `servidor.py` | Servidor local; permite guardar `datos/` y `modelo/` desde el navegador |

## Errores semánticos implementados

| # | Error | Cuándo ocurre | Recuperación |
|---|---|---|---|
| 1 | Seña no reconocida | Ninguna letra supera 50 % de probabilidad | Modo pánico |
| 2 | Secuencia incompleta | Finalizar una oración vacía | Modo pánico |
| 3 | Ambigüedad de seña | Las dos letras más probables difieren < 20 % (M/N, U/V…) | Producción de error: repetir |
| 4 | Incompatibilidad de categoría | ESPACIO (control) donde la gramática espera LETRA | Modo pánico |
| 5 | Confianza insuficiente | Confianza < `umbral_confianza` (0.85) | Producción de error: repetir |
| 6 | Redundancia semántica | Tercera letra igual seguida | Modo pánico |
| 7 | Variable sin inicializar | Usar `modelo_reconocimiento` u `oracion_salida` sin valor | Producción de error |
| 8 | Desbordamiento del buffer | Palabra > 32 o oración > 128 caracteres | Modo pánico |
| 9 | Número de argumentos incorrecto | `traducir_senia()` recibe ≠ 63 valores | Modo pánico |
| 10 | Orden gramatical inválido | La palabra no existe en el diccionario → sugerencia | Aviso |

## Dataset

Rodríguez, M., Oubram, O., Ali, B., & Lakouari, N. (2023). *Mexican Sign Language's Dactylology
and Ten First Numbers – Labeled images and videos. From person #1 to #5* (V1). Mendeley Data.
https://doi.org/10.17632/5s4mt7xrd9.1 — Licencia CC BY-NC 3.0 (uso no comercial).

Solo se usan las imágenes de las 21 letras estáticas (`dataset/<LETRA>/`).
