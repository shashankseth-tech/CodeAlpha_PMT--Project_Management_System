const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// Get user notifications
router.get('/', requireAuth, (req, res) => {
  try {
    const notifications = db.prepare(`
      SELECT n.*, p.title as project_title, t.title as task_title
      FROM notifications n
      LEFT JOIN projects p ON n.project_id = p.id
      LEFT JOIN tasks t ON n.task_id = t.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `).all(req.user.id);

    const unreadCount = db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND is_read = 0
    `).get(req.user.id).count;

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark single notification read
router.patch('/:id/read', requireAuth, (req, res) => {
  try {
    const notifId = parseInt(req.params.id, 10);
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notifId, req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Mark all read
router.post('/read-all', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

module.exports = router;
