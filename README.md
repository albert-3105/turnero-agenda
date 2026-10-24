# Turnero con agenda (Node.js)

Sistema de turnos para una oficina de atención al ciudadano. Lo hice para el **Sisbén Cúcuta**: los asesores generan los turnos desde una tablet conectada a la red de la oficina y el servidor corre en un computador que nunca se apaga, **sin depender de internet**.

## Qué hace

- **Turnos por día** con código `A1, A2…` y **tope diario** (200 por defecto, en `db.js`).
- **Agenda** en carrusel con los próximos 14 días hábiles; cada día muestra sus cupos y los días llenos no se pueden elegir.
- **Pico y cédula** automático (`picoCedula.js`): cédula par → días pares, impar → impares. El asesor puede marcar una **excepción con motivo** (adulto mayor, discapacidad, urgencia) y queda registrada.
- **Panel de administración** para ver y descargar en CSV los turnos de cualquier día.
- **Google Sheets**: cada turno se copia a una hoja con una cuenta de servicio. Si no hay internet, el turno igual queda guardado en el equipo.
- **Correo** de recordatorio al ciudadano y **resumen diario** al administrador (`node-cron`).

## Seguridad

- Usuario y contraseña para entrar; la contraseña se guarda con **scrypt** (`usuarios.json`), nunca en texto plano.
- Sesión por cookie de 12 horas y **bloqueo de 5 minutos tras 5 intentos fallidos**.
- Si aún no se ha creado el usuario, el sistema no queda abierto: muestra un aviso.

## Instalación

```bash
npm install
cp config.example.json config.json   # y completa sheetId, correoAdmin y smtp
node crear-usuario.js                 # crea el usuario de acceso
npm start
```

- Asesor: `http://<IP-del-computador>:3000/asesor.html` (desde la tablet, misma red)
- Administración: `http://localhost:3000/admin.html`
- Pon el logo de tu oficina en `public/img/logo.png`.

Para Google Sheets: crea una cuenta de servicio en Google Cloud, habilita Sheets API, guarda la llave como `credenciales-google.json` en esta carpeta y comparte la hoja con el correo de la cuenta de servicio. Para el correo con Gmail usa una **contraseña de aplicación**.

Para dejarlo siempre encendido en Windows se puede instalar como servicio con [NSSM](https://nssm.cc).

> `config.json`, `usuarios.json`, `credenciales-google.json` y la carpeta `data/` están en `.gitignore`: tienen claves y datos de personas.

## Siguiente paso

Los turnos se guardan en archivos JSON por día, suficiente para 200 turnos diarios. Para pasar a PostgreSQL solo hay que reescribir las funciones de `db.js`.

---
Autor: [Albert Bermúdez](https://albert-3105.github.io)
