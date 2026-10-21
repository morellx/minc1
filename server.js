// Servidor local mínimo para probar el contador.
// Uso:  npm i express socket.io   y luego   node server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname)); // sirve control.html, overlay.html, etc.

let last = null; // último estado real enviado por el panel

io.on('connection', (socket) => {
  // Quien se conecta tarde (el overlay en OBS) recibe el último estado, sin animación
  if (last) socket.emit('updateDeathState', { ...last, trigger: -1 });

  socket.on('updateDeathState', (d) => {
    if (d && d.players) {
      if ((d.rev || 0) < (last?.rev || 0)) return; // estado de un panel viejo: se descarta
      last = d;
    }
    socket.broadcast.emit('updateDeathState', d); // reenvía a todos los demás
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Panel:   http://localhost:${PORT}/control.html`);
  console.log(`Overlay: http://localhost:${PORT}/overlay.html?debug`);
});