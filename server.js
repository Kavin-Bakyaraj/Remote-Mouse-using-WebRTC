const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const os = require('os');

app.use(express.static('public'));

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('signal', (data) => {
    socket.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });
  socket.on('join', (room) => {
    socket.join(room);
  });
  socket.on('input', (data) => {
    console.log('Forwarding input:', data);
    socket.to('controlled').emit('input', data);
  });
});

const ip = getLocalIP();
server.listen(3000, '0.0.0.0', () => {
  console.log(`Signaling server running on http://${ip}:3000`);
  console.log(`Main page: http://${ip}:3000`);
  console.log(`Controller: http://${ip}:3000/controller.html`);
  console.log(`Access from mobile: Open http://${ip}:3000 in mobile browser`);
});
