const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const rooms = {};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.writeHead(200);
  res.end('SkillPoly OK');
});

const wss = new WebSocketServer({ server });

function broadcast(code, data, skip) {
  const r = rooms[code];
  if (!r) return;
  const msg = JSON.stringify(data);
  r.forEach(p => {
    if (p.ws !== skip && p.ws.readyState === 1) p.ws.send(msg);
  });
}

function sendTo(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function roomInfo(code) {
  return (rooms[code] || []).map(p => ({
    id: p.id, name: p.name, avatar: p.avatar, isHost: p.isHost
  }));
}

wss.on('connection', ws => {
  let myCode = null, myId = null;

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const { type, code, id, name, avatar } = msg;

    if (type === 'create') {
      rooms[code] = [{ ws, id, name, avatar: avatar||null, isHost: true }];
      myCode = code; myId = id;
      // Send back to host with his own info
      sendTo(ws, { type: 'created', room: roomInfo(code) });
      console.log(`Room ${code} created by ${name}`);
    }

    else if (type === 'join') {
      if (!rooms[code]) {
        sendTo(ws, { type: 'error', msg: 'الغرفة غير موجودة — تأكد من الكود' });
        return;
      }
      // Remove duplicate
      rooms[code] = rooms[code].filter(p => p.id !== id);
      rooms[code].push({ ws, id, name, avatar: avatar||null, isHost: false });
      myCode = code; myId = id;
      const info = roomInfo(code);
      // Tell joiner current room state
      sendTo(ws, { type: 'joined', room: info });
      // Tell EVERYONE (including host) updated list
      broadcast(code, { type: 'lobby_update', room: info }, ws);
      // Also send to host explicitly
      const host = rooms[code].find(p => p.isHost);
      if (host && host.ws !== ws) {
        sendTo(host.ws, { type: 'lobby_update', room: info });
      }
      console.log(`${name} joined ${code} — ${rooms[code].length} players`);
    }

    else if (type === 'start') {
      const info = roomInfo(myCode);
      // Send to all including host
      broadcast(myCode, { type: 'start', room: info });
      sendTo(ws, { type: 'start', room: info });
      console.log(`Room ${myCode} started`);
    }

    else if (type === 'sync') {
      broadcast(myCode, { type: 'sync', state: msg.state }, ws);
    }
  });

  ws.on('close', () => {
    if (!myCode || !rooms[myCode]) return;
    rooms[myCode] = rooms[myCode].filter(p => p.id !== myId);
    if (rooms[myCode].length === 0) {
      delete rooms[myCode];
      console.log(`Room ${myCode} deleted`);
    } else {
      broadcast(myCode, { type: 'lobby_update', room: roomInfo(myCode) });
    }
  });
});

server.listen(PORT, () => console.log(`SkillPoly server on port ${PORT}`));
