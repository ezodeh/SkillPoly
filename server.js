const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3001;
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
  r.forEach(p => { if (p.ws !== skip && p.ws.readyState === 1) p.ws.send(msg); });
}

function roomInfo(code) {
  return (rooms[code] || []).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, isHost: p.isHost }));
}

wss.on('connection', ws => {
  let myCode = null, myId = null;

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const { type, code, id, name, avatar } = msg;

    if (type === 'create') {
      rooms[code] = [{ ws, id, name, avatar: avatar || null, isHost: true }];
      myCode = code; myId = id;
      ws.send(JSON.stringify({ type: 'created', room: roomInfo(code) }));
    }

    else if (type === 'join') {
      if (!rooms[code]) { ws.send(JSON.stringify({ type: 'error', msg: 'الغرفة غير موجودة' })); return; }
      rooms[code] = rooms[code].filter(p => p.id !== id);
      rooms[code].push({ ws, id, name, avatar: avatar || null, isHost: false });
      myCode = code; myId = id;
      const info = roomInfo(code);
      ws.send(JSON.stringify({ type: 'joined', room: info }));
      broadcast(code, { type: 'lobby_update', room: info }, ws);
    }

    else if (type === 'start') {
      const info = roomInfo(myCode);
      broadcast(myCode, { type: 'start', room: info });
      ws.send(JSON.stringify({ type: 'start', room: info }));
    }

    else if (type === 'sync') {
      broadcast(myCode, { type: 'sync', state: msg.state }, ws);
    }
  });

  ws.on('close', () => {
    if (!myCode || !rooms[myCode]) return;
    rooms[myCode] = rooms[myCode].filter(p => p.id !== myId);
    if (rooms[myCode].length === 0) delete rooms[myCode];
    else broadcast(myCode, { type: 'lobby_update', room: roomInfo(myCode) });
  });
});

server.listen(PORT, () => console.log('SkillPoly server on port ' + PORT));
