// Regla de pico y cédula:
// Si el último dígito de la cédula es par, solo se atiende en días PARES
// del mes (2, 4, 6, 8...). Si es impar, solo en días IMPARES (1, 3, 5, 7...).
// Se compara contra el día del mes de la fecha del turno (días hábiles
// porque la oficina simplemente no genera turnos los fines de semana).

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function grupoDeDocumento(documento) {
  const ultimoDigito = Number(String(documento).trim().slice(-1));
  return ultimoDigito % 2 === 0 ? "par" : "impar";
}

function grupoDeHoy(fecha = new Date()) {
  return fecha.getDate() % 2 === 0 ? "par" : "impar";
}

function permitidoHoy(documento, fecha = new Date()) {
  return grupoDeDocumento(documento) === grupoDeHoy(fecha);
}

// true si la fecha cae en sábado o domingo (la oficina no atiende esos días).
function esFinDeSemana(fecha) {
  const dia = fecha.getDay();
  return dia === 0 || dia === 6;
}

function nombreDiaSemana(fecha) {
  return DIAS_SEMANA[fecha.getDay()];
}

function etiquetaCorta(fecha) {
  return `${DIAS_SEMANA[fecha.getDay()].slice(0, 3)} ${fecha.getDate()} ${MESES[fecha.getMonth()]}`;
}

module.exports = {
  grupoDeDocumento,
  grupoDeHoy,
  permitidoHoy,
  esFinDeSemana,
  nombreDiaSemana,
  etiquetaCorta,
};
