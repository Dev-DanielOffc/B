const connections = new Map();

export const hub = {
  add(userId, socket) {
    if (!connections.has(userId)) {
      connections.set(userId, new Set());
    }
    connections.get(userId).add(socket);
  },

  remove(userId, socket) {
    const set = connections.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) {
      connections.delete(userId);
    }
  },

  sendToUser(userId, payload) {
    const set = connections.get(userId);
    if (!set || set.size === 0) return false;

    const raw = JSON.stringify(payload);
    let delivered = false;

    for (const socket of set) {
      try {
        if (socket.readyState === 1) {
          socket.send(raw);
          delivered = true;
        }
      } catch (err) {
        console.error('Error enviando por WS:', err.message);
      }
    }

    return delivered;
  },

  isOnline(userId) {
    return connections.has(userId) && connections.get(userId).size > 0;
  },

  countOnline() {
    return connections.size;
  },

  broadcast(payload) {
    const raw = JSON.stringify(payload);
    for (const set of connections.values()) {
      for (const socket of set) {
        try {
          if (socket.readyState === 1) socket.send(raw);
        } catch (err) {
          console.error('Error en broadcast:', err.message);
        }
      }
    }
  },

  closeAll() {
    for (const set of connections.values()) {
      for (const socket of set) {
        try {
          socket.close();
        } catch (err) {
          console.error('Error cerrando socket:', err.message);
        }
      }
    }
    connections.clear();
  }
};