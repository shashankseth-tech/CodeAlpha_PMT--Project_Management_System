const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { broadcastToProject, notifyUser } = require('../websocket');

const router = express.Router();

// Get comments for a task
router.get('/tasks/:id/comments', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(task.project_id, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this project' });
    }

    const comments = db.prepare(`
      SELECT c.*, u.name as user_name, u.email as user_email, u.avatar_color, u.role as user_role
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).all(taskId);

    res.json({ comments });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Post a comment on a task
router.post('/tasks/:id/comments', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content cannot be empty' });
    }

    const task = db.prepare('SELECT project_id, title, creator_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(task.project_id, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this project' });
    }

    const insert = db.prepare(`
      INSERT INTO comments (task_id, user_id, content)
      VALUES (?, ?, ?)
    `);

    const result = insert.run(taskId, req.user.id, content.trim());
    const commentId = result.lastInsertRowid;

    // Log activity
    db.prepare(`
      INSERT INTO activities (project_id, task_id, user_id, action, details)
      VALUES (?, ?, ?, 'comment_added', ?)
    `).run(task.project_id, taskId, req.user.id, `Commented on "${task.title}"`);

    const newComment = db.prepare(`
      SELECT c.*, u.name as user_name, u.email as user_email, u.avatar_color, u.role as user_role
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(commentId);

    // Notify task creator and assignees (except the comment author)
    const assignees = db.prepare('SELECT user_id FROM task_assignees WHERE task_id = ?').all(taskId);
    const notifiedUserIds = new Set();

    if (task.creator_id !== req.user.id) {
      notifiedUserIds.add(task.creator_id);
    }
    for (const a of assignees) {
      if (a.user_id !== req.user.id) {
        notifiedUserIds.add(a.user_id);
      }
    }

    for (const uId of notifiedUserIds) {
      notifyUser(
        uId,
        task.project_id,
        taskId,
        `${req.user.name} commented on "${task.title}"`,
        'task_comment'
      );
    }

    // Broadcast to project
    broadcastToProject(task.project_id, 'comment_created', {
      taskId,
      comment: newComment
    });

    res.status(201).json({ comment: newComment });
  } catch (err) {
    console.error('Post comment error:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// Delete comment
router.delete('/tasks/:id/comments/:commentId', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const commentId = parseInt(req.params.commentId, 10);

    const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND task_id = ?').get(commentId, taskId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    if (comment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);

    if (task) {
      broadcastToProject(task.project_id, 'comment_deleted', { taskId, commentId });
    }

    res.json({ message: 'Comment deleted successfully' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = router;
