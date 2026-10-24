// Almacenamiento simple en archivos JSON, uno por día.
// Suficiente para el volumen de una oficina (máx. 200 turnos/día) y no
// necesita instalar ninguna base de datos para empezar a usarlo mañana.
//
// El sistema permite agendar turnos con fecha (hoy o un día futuro elegido
// en el calendario del asesor). Cada día sigue teniendo su propio archivo
// y su propio tope de 200, y los códigos (A1, A2...) se reinician por día.
//
// Cuando quieran pasar a Postgres, la tabla sería:
//   turnos(codigo text, nombre text, tipo_documento text, telefono text,
//          correo text, fecha date, hora_creacion timestamp, atendido boolean)
// y las funciones de abajo (getTurnosPorFecha / agregarTurno) son las únicas
// que habría que reescribir para usar `pg` en vez de archivos: el resto
// del servidor no cambia.

const fs = require("fs");
const path = require("path");

const CARPETA_DATOS = path.join(__dirname, "data");
if (!fs.existsSync(CARPETA_DATOS)) fs.mkdirSync(CARPETA_DATOS);

const TOPE_DIARIO = 200;
const LETRA_TURNO = "A"; // Cambia esto si luego manejan varias filas/categorías (A, B, C...)

// YYYY-MM-DD de hoy, en hora local del computador de la oficina.
function fechaISOHoy() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d - offset).toISOString().slice(0, 10);
}

function rutaDeFecha(fechaISO) {
  return path.join(CARPETA_DATOS, `turnos-${fechaISO}.json`);
}

function getTurnosPorFecha(fechaISO) {
  const ruta = rutaDeFecha(fechaISO);
  if (!fs.existsSync(ruta)) return [];

  const contenido = fs.readFileSync(ruta, "utf-8").trim();
  if (!contenido) return []; // archivo vacío (0 bytes): no hay turnos ese día

  try {
    return JSON.parse(contenido);
  } catch (e) {
    // Un archivo dañado (ej. se cortó la luz mientras escribía) no debe
    // tumbar el servidor: se ignora ese día en vez de romper el calendario
    // completo. Queda avisado en consola para que se revise a mano.
    console.error(`⚠️  El archivo ${ruta} está dañado y no se pudo leer (${e.message}). Se trata como si no tuviera turnos.`);
    return [];
  }
}

// Compatibilidad: turnos de hoy (lo sigue usando admin.html cuando no se
// pide una fecha específica).
function getTurnosDelDia() {
  return getTurnosPorFecha(fechaISOHoy());
}

function agregarTurno(datos, fechaISO = fechaISOHoy()) {
  const turnos = getTurnosPorFecha(fechaISO);

  const consecutivo = turnos.length + 1;
  const turno = {
    codigo: `${LETRA_TURNO}${consecutivo}`,
    ...datos,
    fecha: fechaISO,
    horaCreacion: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    atendido: false,
  };

  turnos.push(turno);
  // Escritura atómica: primero a un archivo temporal y luego se renombra.
  // Así, si el proceso se interrumpe a mitad de camino (corte de luz,
  // cierre forzado, etc.), el archivo original nunca queda a medio
  // escribir / corrupto — o se guarda completo, o no se guarda.
  const ruta = rutaDeFecha(fechaISO);
  const rutaTemporal = `${ruta}.tmp`;
  fs.writeFileSync(rutaTemporal, JSON.stringify(turnos, null, 2));
  fs.renameSync(rutaTemporal, ruta);
  return turno;
}

function aCSV(turnos) {
  const encabezado = "Codigo,Nombre,TipoDocumento,NumeroDocumento,Telefono,Correo,Fecha,HoraCreacion,ExcepcionPicoYCedula,MotivoExcepcion";
  const filas = turnos.map((t) =>
    [t.codigo, t.nombre, t.tipoDocumento, t.documento, t.telefono, t.correo, t.fecha, t.horaCreacion, t.excepcionPicoYCedula ? "Sí" : "No", t.motivoExcepcion]
      .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(",")
  );
  return [encabezado, ...filas].join("\n");
}

module.exports = {
  getTurnosDelDia,
  getTurnosPorFecha,
  agregarTurno,
  fechaISOHoy,
  TOPE_DIARIO,
  aCSV,
};
