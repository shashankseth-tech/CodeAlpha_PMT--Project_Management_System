// WebSocket Client for Real-Time Updates & Notifications

const WSClient = {
  socket: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,
  reconnectDelay: 2000,
  currentProjectId: null,
  listeners: new Map(),

  init() {
    this.connect();
  },

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.updateStatus(false, 'Connecting...');

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus(true, 'Live Connected');

        // Authenticate with current token
        const token = API.getToken();
        if (token) {
          this.send({ type: 'auth', token });
        }

        // Rejoin project room if active
        if (this.currentProjectId) {
          this.joinProject(this.currentProjectId);
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      this.socket.onclose = () => {
        this.updateStatus(false, 'Disconnected');
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.warn('WS error:', err);
        this.updateStatus(false, 'Connection error');
      };
    } catch (err) {
      console.error('WS connection failed:', err);
      this.scheduleReconnect();
    }
  },

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(10000, this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1));
      setTimeout(() => this.connect(), delay);
    }
  },

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  },

  joinProject(projectId) {
    this.currentProjectId = projectId;
    this.send({ type: 'join_project', projectId });
  },

  leaveProject() {
    this.send({ type: 'leave_project' });
    this.currentProjectId = null;
  },

  sendTyping(taskId) {
    this.send({ type: 'user_typing', taskId });
  },

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  },

  emit(event, data) {
    const cbs = this.listeners.get(event);
    if (cbs) {
      cbs.forEach(cb => {
        try { cb(data); } catch (e) { console.error('WS callback error:', e); }
      });
    }
  },

  handleMessage(msg) {
    // Notify registered event listeners
    if (msg.type) {
      this.emit(msg.type, msg.data || msg);
    }
  },

  updateStatus(isConnected, text) {
    const badge = document.getElementById('ws-status-badge');
    const label = document.getElementById('ws-status-text');
    if (badge && label) {
      if (isConnected) {
        badge.classList.remove('disconnected');
        label.textContent = text || 'Live Connected';
      } else {
        badge.classList.add('disconnected');
        label.textContent = text || 'Offline';
      }
    }
  }
};

window.WSClient = WSClient;
