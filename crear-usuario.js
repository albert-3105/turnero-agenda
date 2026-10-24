// Crea o cambia el usuario y la contraseña para entrar al turnero.
// Se ejecuta UNA VEZ (o cada vez que quieran cambiar la contraseña) desde
// la terminal, en el computador donde corre el servidor:
//
//   node crear-usuario.js
//
// Pide el usuario y la contraseña, y guarda un hash seguro (nunca la
// contraseña en texto plano) en el archivo `usuarios.json`.

const readline = require("readline");
const { guardarUsuario } = require("./auth");

function preguntar(pregunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(pregunta, (respuesta) => {
      rl.close();
      resolve(respuesta.trim());
    });
  });
}

// Pide la contraseña ocultando lo que se escribe (muestra *).
function preguntarOculto(pregunta) {
  return new Promise((resolve) => {
    const output = process.stdout;
    const input = process.stdin;
    let contrasena = "";

    output.write(pregunta);

    if (!input.isTTY) {
      // Si no hay terminal interactiva (poco común), se pide sin ocultar.
      const rl = readline.createInterface({ input, output });
      rl.question("", (respuesta) => {
        rl.close();
        resolve(respuesta.trim());
      });
      return;
    }

    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");

    const onData = (char) => {
      char = char.toString();
      if (char === "\n" || char === "\r" || char === "\u0004") {
        input.setRawMode(false);
        input.pause();
        input.removeListener("data", onData);
        output.write("\n");
        resolve(contrasena.trim());
        return;
      }
      if (char === "\u0003") {
        // Ctrl+C
        process.exit(1);
      }
      if (char === "\u007f" || char === "\b") {
        // Backspace
        if (contrasena.length > 0) {
          contrasena = contrasena.slice(0, -1);
          output.write("\b \b");
        }
        return;
      }
      contrasena += char;
      output.write("*");
    };

    input.on("data", onData);
  });
}

async function main() {
  console.log("== Configurar acceso al turnero SISBÉN ==\n");
  console.log("Esto crea (o reemplaza) el usuario y contraseña con el que se");
  console.log("entra a /asesor.html y /admin.html.\n");

  const usuario = await preguntar("Usuario (ej. asesor): ");
  if (!usuario) {
    console.log("\nEl usuario no puede estar vacío. Vuelve a intentarlo.");
    process.exit(1);
  }

  const contrasena = await preguntarOculto("Contraseña: ");
  if (!contrasena || contrasena.length < 6) {
    console.log("\nLa contraseña debe tener al menos 6 caracteres. Vuelve a intentarlo.");
    process.exit(1);
  }

  const confirmar = await preguntarOculto("Confirma la contraseña: ");
  if (contrasena !== confirmar) {
    console.log("\nLas contraseñas no coinciden. Vuelve a intentarlo.");
    process.exit(1);
  }

  guardarUsuario(usuario, contrasena);
  console.log(`\nListo ✔ Usuario "${usuario}" configurado.`);
  console.log("Ya puedes iniciar (o reiniciar) el servidor con: npm start");
}

main();
