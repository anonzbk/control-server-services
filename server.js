const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { NodeSSH } = require('node-ssh');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const ssh = new NodeSSH();

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const SERVERS = process.env.SERVERS.split(',');
const SERVER_LABELS = process.env.SERVER_LABELS.split(',');
const SSH_CONFIG = {
  username: process.env.SSH_USER,
  password: process.env.SSH_PASS,
  port: parseInt(process.env.SSH_PORT || '22', 10)
};

async function runSSHCommand(ip, command, socket) {
  const conn = new NodeSSH();
  let output = '';
  try {
    await conn.connect({ host: ip, ...SSH_CONFIG });
    socket.emit('log', { ip, message: `${ip}: Connected.` });
    const result = await conn.execCommand(command);
    output = result.stdout + result.stderr;
  } catch (err) {
    output = `Error: ${err.message}`;
  } finally {
    conn.dispose();
  }
  socket.emit('log', { ip, message: output });
  return output;
}

io.on('connection', socket => {
  socket.on('action', async action => {
    if (action === 'status') {
      socket.emit('log', { message: '> Checking server status...' });
    } else if (action === 'start') {
      socket.emit('log', { message: '> Starting all servers...' });
    } else if (action === 'stop') {
      socket.emit('log', { message: '> Stopping all servers...' });
    }

    for (let i = 0; i < SERVERS.length; i++) {
      const ip = SERVERS[i].trim();
      const label = SERVER_LABELS[i] || `Server ${i + 1}`;
      socket.emit('log', { ip, message: `\n## ${ip} - ${label}\n` });

      if (action === 'stop') {
        await runSSHCommand(ip, 'systemctl stop nginx', socket);
        await runSSHCommand(ip, 'systemctl stop php8.1-fpm', socket);
        socket.emit('log', { ip, message: `✅ ${label} - All services stopped\n----` });
      } else if (action === 'start') {
        await runSSHCommand(ip, 'systemctl start nginx', socket);
        await runSSHCommand(ip, 'systemctl start php8.1-fpm', socket);
        socket.emit('log', { ip, message: `✅ ${label} - All services started\n----` });
      } else if (action === 'status') {
        await runSSHCommand(ip, 'systemctl is-active nginx', socket);
        await runSSHCommand(ip, 'systemctl is-active php8.1-fpm', socket);
        socket.emit('log', { ip, message: `✅ ${label} - Status checked\n----` });
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
