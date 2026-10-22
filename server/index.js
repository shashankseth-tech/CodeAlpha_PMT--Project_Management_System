const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');

const { initSchema } = require('./db');
const { initWebSocket } = require('./websocket');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const commentRoutes = require('./routes/comments');
const notificationRoutes = require('./routes/notifications');

// Initialize database schema and initial seed data
initSchema();

const app = express();
const server = http.createServer(app);

// Security: Disable Express fingerprinting
app.disable('x-powered-by');

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Initialize WebSocket server attached to HTTP server
initWebSocket(server);

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', taskRoutes);
app.use('/api', commentRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve frontend static assets
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// Fallback to index.html for client-side routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(publicPath, 'index.html'));
  }
  next();
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 PMT Collaborative Server running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`======================================================\n`);
});
