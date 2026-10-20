// Tabla de símbolos del traductor.
//  - ALFABETO: los lexemas válidos (letras estáticas del LSM) con sus atributos.
//  - DICCIONARIO_LSM: palabras del español que se pueden deletrear solo con
//    letras estáticas (sin J, K, Ñ, Q, X, Z). Se usa en el análisis semántico.
//  - TablaSimbolos: variables del traductor (sección 4 del documento) con su
//    valor actual, más el registro de cada token reconocido.

export const LETRAS_ESTATICAS = 'ABCDEFGHILMNOPRSTUVWY'.split('');
export const LETRAS_DINAMICAS = ['J', 'K', 'Ñ', 'Q', 'X', 'Z'];
export const UMBRAL_CONFIANZA = 0.85;

const VOCALES = new Set(['A', 'E', 'I', 'O', 'U']);

export const ALFABETO = Object.fromEntries(
  LETRAS_ESTATICAS.map(l => [l, {
    lexema: l,
    token: 'LETRA',
    categoria: VOCALES.has(l) ? 'vocal' : 'consonante',
    tipo: 'estática',
  }])
);

export const DICCIONARIO_LSM = new Set(`
YO TU EL ELLA ELLOS ELLAS USTED USTEDES NOSOTROS NOSOTRAS MI MIS TU TUS SU SUS ME TE SE LE LES LO LA LOS LAS
UN UNA UNOS UNAS EL DE DEL AL A EN CON SIN POR PARA SOBRE ENTRE HASTA DESDE Y O PERO SI NO MAS MUY BIEN MAL
HOLA ADIOS GRACIAS POR FAVOR PERDON BUENOS BUENAS DIAS TARDES NOCHES BIENVENIDO BIENVENIDA SALUD
SI NO TAMBIEN SIEMPRE NUNCA AHORA HOY AYER MAÑANA TARDE TEMPRANO ANTES DESPUES AQUI ALLI ALLA DONDE COMO CUANDO
QUE CUAL CUANTO QUIEN POR PORQUE
SER ESTAR TENER HACER PODER DECIR IR VER DAR SABER QUERER LLEGAR PASAR DEBER PONER PARECER SEGUIR ENCONTRAR
LLAMAR VENIR PENSAR SALIR VOLVER TOMAR CONOCER VIVIR SENTIR TRATAR MIRAR CONTAR EMPEZAR ESPERAR BUSCAR ENTRAR
TRABAJAR ESCRIBIR PERDER ENTENDER PEDIR RECORDAR TERMINAR PERMITIR APARECER CONSEGUIR COMENZAR SERVIR SACAR
NECESITAR MANTENER RESULTAR LEER CAER CAMBIAR PRESENTAR CREAR ABRIR CONSIDERAR OIR ACABAR CONVERTIR GANAR
FORMAR TRAER PARTIR MORIR ACEPTAR REALIZAR SUPONER COMPRENDER LOGRAR EXPLICAR PREGUNTAR TOCAR RECONOCER
ESTUDIAR ALCANZAR NACER DIRIGIR CORRER UTILIZAR PAGAR AYUDAR GUSTAR AMAR COMER BEBER DORMIR CAMINAR HABLAR
SOY ERES ES SOMOS SON ESTOY ESTAS ESTA ESTAMOS ESTAN TENGO TIENES TIENE TENEMOS TIENEN VOY VAS VA VAMOS VAN
PUEDO PUEDES PUEDE PODEMOS PUEDEN QUIERO QUIERES QUIERE QUEREMOS QUIEREN NECESITO NECESITAS NECESITA
ME LLAMO TE LLAMAS SE LLAMA GUSTA GUSTAN AMO AMAS AMA COMO COMES BEBO BEBES VIVO VIVES VIVE HABLO HABLAS HABLA
ESTUDIO ESTUDIAS ESTUDIA TRABAJO TRABAJAS TRABAJA ENTIENDO ENTIENDES SE SABES SABE
AGUA COMIDA CASA ESCUELA TRABAJO FAMILIA MAMA PAPA MADRE PADRE HERMANO HERMANA HIJO HIJA AMIGO AMIGA
NOMBRE PERSONA GENTE HOMBRE MUJER NIÑO NIÑA BEBE MAESTRO MAESTRA ALUMNO ALUMNA DOCTOR DOCTORA
CIUDAD PAIS MEXICO CALLE TIENDA HOSPITAL BAÑO SALON CLASE LIBRO PAPEL LAPIZ MESA SILLA PUERTA
DINERO TIEMPO DIA SEMANA MES AÑO HORA MINUTO NOCHE TARDE
AYUDA AMOR PAZ VIDA MUNDO COSA PARTE LUGAR CASO PUNTO FORMA GRUPO PROBLEMA ESTADO HISTORIA
ROPA CAMISA PERRO GATO PAN LECHE CAFE TE ARROZ POLLO CARNE FRUTA PLATANO SOPA
BUENO BUENA MALO MALA GRANDE PEQUEÑO PEQUEÑA NUEVO NUEVA VIEJO VIEJA BONITO BONITA FEO FEA
FELIZ TRISTE CANSADO CANSADA ENFERMO ENFERMA CONTENTO CONTENTA ROTO ABIERTO CERRADO LIBRE
ROSA ROSADO BLANCO BLANCA NEGRO NEGRA AMARILLO AMARILLA VERDE GRIS MORADO
UNO DOS TRES CUATRO CINCO SEIS SIETE OCHO NUEVE CIEN MIL
SORDO SORDA SEÑA SEÑAS LENGUA TRADUCTOR TEXTO LETRA PALABRA ORACION ALFABETO PROYECTO TECNOLOGICO
DIEGO MARIA ANA LUIS CARLOS PEDRO PABLO LAURA SOFIA DANIEL DAVID MIGUEL
`.split(/\s+/).filter(w => w && [...w].every(c => LETRAS_ESTATICAS.includes(c))));

// Tabla de direcciones (sección 4 del documento): estática, ilustrativa.
export const TABLA_DIRECCIONES = [
  ['senia_actual', '0x0010', '32 bytes', 'Pila'],
  ['buffer_captura', '0x0020', '252 bytes', 'Heap'],
  ['diccionario_LSM', '0x0100', 'variable', 'Heap'],
  ['modelo_reconocimiento', '0x0200', 'variable', 'Heap'],
  ['palabra_traducida', '0x0300', '32 bytes', 'Pila'],
  ['oracion_salida', '0x0310', '128 bytes', 'Pila'],
  ['contador_senias', '0x0320', '4 bytes', 'Pila'],
  ['umbral_confianza', '0x0330', '4 bytes', 'Datos (constante)'],
  ['capturar_senia()', '0x0400', '—', 'Código'],
  ['traducir_senia()', '0x0410', '—', 'Código'],
];

export const LIMITE_PALABRA = 32;   // palabra_traducida: 32 bytes
export const LIMITE_ORACION = 128;  // oracion_salida: 128 bytes

export class TablaSimbolos {
  constructor() {
    // Variables del traductor con sus atributos (nombre, tipo, categoría, ámbito, valor)
    this.variables = {
      senia_actual: { tipo: 'string', categoria: 'variable', ambito: 'global', valor: undefined },
      buffer_captura: { tipo: 'array[float]', categoria: 'variable', ambito: 'local', valor: undefined },
      diccionario_LSM: { tipo: 'diccionario', categoria: 'estructura', ambito: 'global', valor: DICCIONARIO_LSM },
      modelo_reconocimiento: { tipo: 'objeto', categoria: 'constante', ambito: 'global', valor: undefined },
      palabra_traducida: { tipo: 'string', categoria: 'variable', ambito: 'local', valor: undefined },
      oracion_salida: { tipo: 'string', categoria: 'variable', ambito: 'global', valor: undefined },
      contador_senias: { tipo: 'entero', categoria: 'variable', ambito: 'local', valor: 0 },
      umbral_confianza: { tipo: 'flotante', categoria: 'constante', ambito: 'global', valor: UMBRAL_CONFIANZA },
      'capturar_senia()': { tipo: 'función', categoria: 'función', ambito: 'global', valor: 'retorna array' },
      'traducir_senia()': { tipo: 'función', categoria: 'función', ambito: 'global', valor: 'retorna string' },
    };
    // Registro de tokens reconocidos (lexema, token, categoría, confianza, posición)
    this.tokens = [];
  }

  asignar(nombre, valor) {
    this.variables[nombre].valor = valor;
  }

  leer(nombre) {
    return this.variables[nombre]?.valor;
  }

  estaInicializada(nombre) {
    const v = this.leer(nombre);
    return v !== undefined && v !== null;
  }

  registrarToken(token) {
    this.tokens.push(token);
    if (this.tokens.length > 200) this.tokens.shift();
  }

  /** Busca un lexema en el alfabeto: devuelve sus atributos o null. */
  static buscarLetra(letra) {
    return ALFABETO[letra] || null;
  }

  static existePalabra(palabra) {
    return DICCIONARIO_LSM.has(palabra);
  }

  /** Palabra del diccionario más parecida (distancia de Levenshtein ≤ 2). */
  static sugerir(palabra) {
    let mejor = null, dMejor = 3;
    for (const p of DICCIONARIO_LSM) {
      if (Math.abs(p.length - palabra.length) >= dMejor) continue;
      const d = levenshtein(palabra, p);
      if (d < dMejor) { dMejor = d; mejor = p; }
    }
    return mejor;
  }
}

function levenshtein(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = tmp;
    }
  }
  return fila[b.length];
}
