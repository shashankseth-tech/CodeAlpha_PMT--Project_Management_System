const WebSocket = require('ws');
const { verifyToken } = require('./auth');
const { getUserById, db } = require('./db');

let wss = null;
// Store active connections: ws -> { userId, userName, avatarColor, projectId }
const clients = new Map();

function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    // default state
    clients.set(ws, {
      userId: null,
      userName: 'Guest',
      avatarColor: '#94a3b8',
      projectId: null
    });

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, message);
      } catch (err) {
        console.error('WS parse error:', err);
      }
    });

    ws.on('close', () => {
      const clientInfo = clients.get(ws);
      if (clientInfo && clientInfo.projectId) {
        const projId = clientInfo.projectId;
        clients.delete(ws);
        broadcastPresence(projId);
      } else {
        clients.delete(ws);
      }
    });

    ws.on('error', (err) => {
      console.error('WS client error:', err);
    });

    // Send connection ack
    ws.send(JSON.stringify({ type: 'connected', time: Date.now() }));
  });

  // Heartbeat interval to clean up stale connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  console.log('WebSocket server initialized on /ws');
}

function handleClientMessage(ws, message) {
  const clientInfo = clients.get(ws) || {};

  switch (message.type) {
    case 'auth': {
      if (message.token) {
        const decoded = verifyToken(message.token);
        if (decoded) {
          const user = getUserById(decoded.id);
          if (user) {
            clientInfo.userId = user.id;
            clientInfo.userName = user.name;
            clientInfo.avatarColor = user.avatar_color;
            clients.set(ws, clientInfo);

            ws.send(JSON.stringify({
              type: 'auth_success',
              user: { id: user.id, name: user.name, email: user.email }
            }));
            return;
          }
        }
      }
      ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
      break;
    }

    case 'join_project': {
      const projectId = parseInt(message.projectId, 10);
      if (!isNaN(projectId)) {
        // Security check: Only allow verified project members to join project room
        if (clientInfo.userId) {
          const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, clientInfo.userId);
          if (!isMember) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not authorized for this project room' }));
            break;
          }
        }
        clientInfo.projectId = projectId;
        clients.set(ws, clientInfo);
        broadcastPresence(projectId);
      }
      break;
    }

    case 'leave_project': {
      const oldProjId = clientInfo.projectId;
      clientInfo.projectId = null;
      clients.set(ws, clientInfo);
      if (oldProjId) {
        broadcastPresence(oldProjId);
      }
      break;
    }

    case 'user_typing': {
      if (clientInfo.projectId) {
        broadcastToProject(
          clientInfo.projectId,
          'user_typing',
          {
            taskId: message.taskId,
            user: { id: clientInfo.userId, name: clientInfo.userName }
          },
          clientInfo.userId
        );
      }
      break;
    }

    default:
      break;
  }
}

function broadcastPresence(projectId) {
  if (!projectId) return;
  const activeMembers = [];
  const seenUsers = new Set();

  for (const [_, info] of clients.entries()) {
    if (info.projectId === projectId && info.userId && !seenUsers.has(info.userId)) {
      seenUsers.add(info.userId);
      activeMembers.push({
        id: info.userId,
        name: info.userName,
        avatarColor: info.avatarColor
      });
    }
  }

  broadcastToProject(projectId, 'presence_update', { members: activeMembers });
}

function broadcastToProject(projectId, event, data, excludeUserId = null) {
  if (!wss) return;
  const messageStr = JSON.stringify({
    type: event,
    projectId,
    data,
    timestamp: Date.now()
  });

  for (const [client, info] of clients.entries()) {
    if (
      client.readyState === WebSocket.OPEN &&
      info.projectId === projectId &&
      (!excludeUserId || info.userId !== excludeUserId)
    ) {
      client.send(messageStr);
    }
  }
}

function sendToUser(userId, event, data) {
  if (!wss) return;
  const messageStr = JSON.stringify({
    type: event,
    data,
    timestamp: Date.now()
  });

  for (const [client, info] of clients.entries()) {
    if (client.readyState === WebSocket.OPEN && info.userId === userId) {
      client.send(messageStr);
    }
  }
}

function notifyUser(userId, projectId, taskId, message, type = 'general') {
  try {
    const res = db.prepare(`
      INSERT INTO notifications (user_id, project_id, task_id, message, type, is_read)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(userId, projectId, taskId, message, type);

    const notification = {
      id: res.lastInsertRowid,
      user_id: userId,
      project_id: projectId,
      task_id: taskId,
      message,
      type,
      is_read: 0,
      created_at: new Date().toISOString()
    };

    sendToUser(userId, 'new_notification', notification);
    return notification;
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

module.exports = {
  initWebSocket,
  broadcastToProject,
  sendToUser,
  notifyUser
};
