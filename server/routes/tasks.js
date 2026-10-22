const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { broadcastToProject, notifyUser } = require('../websocket');

const router = express.Router();

function getFullTask(taskId) {
  const task = db.prepare(`
    SELECT t.*, u.name as creator_name, c.title as column_title
    FROM tasks t
    JOIN users u ON t.creator_id = u.id
    JOIN columns c ON t.column_id = c.id
    WHERE t.id = ?
  `).get(taskId);

  if (!task) return null;

  const assignees = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_color, u.role
    FROM task_assignees ta
    JOIN users u ON ta.user_id = u.id
    WHERE ta.task_id = ?
  `).all(taskId);

  const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY id ASC').all(taskId);
  const commentCount = db.prepare('SELECT COUNT(*) as count FROM comments WHERE task_id = ?').get(taskId).count;

  return {
    ...task,
    labels: JSON.parse(task.labels || '[]'),
    assignees,
    subtasks,
    commentCount
  };
}

function isMember(projectId, userId) {
  return !!db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}

// Create new task in a project
router.post('/projects/:projectId/tasks', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (!isMember(projectId, req.user.id)) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this project' });
    }

    const { columnId, title, description, priority, dueDate, labels, assigneeIds } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    // Determine target column if not provided
    let targetColId = columnId;
    if (!targetColId) {
      const firstCol = db.prepare('SELECT id FROM columns WHERE project_id = ? ORDER BY order_index ASC LIMIT 1').get(projectId);
      if (firstCol) targetColId = firstCol.id;
    }

    // Get max order_index in that column
    const maxOrder = db.prepare('SELECT MAX(order_index) as max_idx FROM tasks WHERE column_id = ?').get(targetColId)?.max_idx || 0;

    const taskPriority = priority || 'medium';
    const labelsJson = JSON.stringify(Array.isArray(labels) ? labels : []);

    const insertTask = db.prepare(`
      INSERT INTO tasks (project_id, column_id, title, description, priority, due_date, labels, order_index, creator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertTask.run(
      projectId,
      targetColId,
      title.trim(),
      description ? description.trim() : '',
      taskPriority,
      dueDate || null,
      labelsJson,
      maxOrder + 1,
      req.user.id
    );

    const taskId = result.lastInsertRowid;

    // Insert assignees
    if (Array.isArray(assigneeIds)) {
      const insertAssignee = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)');
      for (const uid of assigneeIds) {
        insertAssignee.run(taskId, uid);
        if (uid !== req.user.id) {
          notifyUser(uid, projectId, taskId, `${req.user.name} assigned you to task "${title.trim()}"`, 'task_assigned');
        }
      }
    }

    // Log activity
    db.prepare(`
      INSERT INTO activities (project_id, task_id, user_id, action, details)
      VALUES (?, ?, ?, 'task_created', ?)
    `).run(projectId, taskId, req.user.id, `Created task "${title.trim()}"`);

    const fullTask = getFullTask(taskId);

    // Broadcast real-time
    broadcastToProject(projectId, 'task_created', { task: fullTask }, req.user.id);

    res.status(201).json({ task: fullTask });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Get task detail
router.get('/tasks/:id', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = getFullTask(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!isMember(task.project_id, req.user.id)) {
      return res.status(403).json({ error: 'Access denied: You do not have access to this task' });
    }

    res.json({ task });
  } catch (err) {
    console.error('Get task error:', err);
    res.status(500).json({ error: 'Failed to fetch task details' });
  }
});

// Update task
router.put('/tasks/:id', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!isMember(existing.project_id, req.user.id)) {
      return res.status(403).json({ error: 'Access denied: You cannot edit tasks in this project' });
    }

    const { title, description, priority, dueDate, labels, assigneeIds, columnId } = req.body;

    const labelsJson = labels !== undefined ? JSON.stringify(labels) : existing.labels;

    db.prepare(`
      UPDATE tasks
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          priority = COALESCE(?, priority),
          due_date = COALESCE(?, due_date),
          labels = ?,
          column_id = COALESCE(?, column_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title ? title.trim() : null,
      description !== undefined ? description.trim() : null,
      priority,
      dueDate,
      labelsJson,
      columnId,
      taskId
    );

    // Update assignees if provided
    if (Array.isArray(assigneeIds)) {
      db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
      const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
      for (const uid of assigneeIds) {
        insertAssignee.run(taskId, uid);
        if (uid !== req.user.id) {
          notifyUser(uid, existing.project_id, taskId, `${req.user.name} assigned you to "${existing.title}"`, 'task_assigned');
        }
      }
    }

    // Activity
    db.prepare(`
      INSERT INTO activities (project_id, task_id, user_id, action, details)
      VALUES (?, ?, ?, 'task_updated', ?)
    `).run(existing.project_id, taskId, req.user.id, `Updated task "${existing.title}"`);

    const updatedTask = getFullTask(taskId);

    broadcastToProject(existing.project_id, 'task_updated', { task: updatedTask }, req.user.id);

    res.json({ task: updatedTask });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Move task (Drag-and-Drop or status update)
router.put('/tasks/:id/move', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { targetColumnId, newIndex } = req.body;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!isMember(task.project_id, req.user.id)) {
      return res.status(403).json({ error: 'Access denied: You cannot move tasks in this project' });
    }

    const oldColumnId = task.column_id;
    let destColumnId = oldColumnId;
    if (targetColumnId) {
      const colId = parseInt(targetColumnId, 10);
      const colCheck = db.prepare('SELECT id FROM columns WHERE id = ? AND project_id = ?').get(colId, task.project_id);
      if (!colCheck) {
        return res.status(400).json({ error: 'Target column does not belong to this project' });
      }
      destColumnId = colId;
    }
    const orderIdx = typeof newIndex === 'number' ? newIndex : 0;

    // Update the task column and order index
    db.prepare(`
      UPDATE tasks
      SET column_id = ?, order_index = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(destColumnId, orderIdx, taskId);

    // Log activity if column changed
    if (oldColumnId !== destColumnId) {
      const colName = db.prepare('SELECT title FROM columns WHERE id = ?').get(destColumnId)?.title || 'new column';
      db.prepare(`
        INSERT INTO activities (project_id, task_id, user_id, action, details)
        VALUES (?, ?, ?, 'task_moved', ?)
      `).run(task.project_id, taskId, req.user.id, `Moved "${task.title}" to ${colName}`);
    }

    const updatedTask = getFullTask(taskId);

    broadcastToProject(task.project_id, 'task_moved', {
      taskId,
      task: updatedTask,
      sourceColumnId: oldColumnId,
      targetColumnId: destColumnId,
      orderIndex: orderIdx
    }, req.user.id);

    res.json({ task: updatedTask });
  } catch (err) {
    console.error('Move task error:', err);
    res.status(500).json({ error: 'Failed to move task' });
  }
});

// Delete task
router.delete('/tasks/:id', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!isMember(task.project_id, req.user.id)) {
      return res.status(403).json({ error: 'Access denied: You cannot delete tasks in this project' });
    }

    db.prepare(`
      INSERT INTO activities (project_id, user_id, action, details)
      VALUES (?, ?, 'task_deleted', ?)
    `).run(task.project_id, req.user.id, `Deleted task "${task.title}"`);

    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

    broadcastToProject(task.project_id, 'task_deleted', { taskId, columnId: task.column_id }, req.user.id);

    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Add subtask
router.post('/tasks/:id/subtasks', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Subtask title is required' });
    }

    const task = db.prepare('SELECT project_id, title FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!isMember(task.project_id, req.user.id)) {
      return res.status(403).json({ error: 'Access denied: You cannot modify subtasks in this project' });
    }

    const result = db.prepare(`
      INSERT INTO subtasks (task_id, title, completed)
      VALUES (?, ?, 0)
    `).run(taskId, title.trim());

    const newSubtask = {
      id: result.lastInsertRowid,
      task_id: taskId,
      title: title.trim(),
      completed: 0
    };

    broadcastToProject(task.project_id, 'subtask_created', { taskId, subtask: newSubtask }, req.user.id);

    res.status(201).json({ subtask: newSubtask });
  } catch (err) {
    console.error('Add subtask error:', err);
    res.status(500).json({ error: 'Failed to add subtask' });
  }
});

// Toggle subtask completed
router.patch('/tasks/:id/subtasks/:subtaskId', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const subtaskId = parseInt(req.params.subtaskId, 10);
    const { completed } = req.body;

    const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!isMember(task.project_id, req.user.id)) {
      return res.status(403).json({ error: 'Access denied: You cannot modify subtasks in this project' });
    }

    const newStatus = completed ? 1 : 0;
    db.prepare('UPDATE subtasks SET completed = ? WHERE id = ? AND task_id = ?').run(newStatus, subtaskId, taskId);

    const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(subtaskId);

    broadcastToProject(task.project_id, 'subtask_toggled', { taskId, subtask }, req.user.id);

    res.json({ subtask });
  } catch (err) {
    console.error('Toggle subtask error:', err);
    res.status(500).json({ error: 'Failed to toggle subtask' });
  }
});

// Delete subtask
router.delete('/tasks/:id/subtasks/:subtaskId', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const subtaskId = parseInt(req.params.subtaskId, 10);

    const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!isMember(task.project_id, req.user.id)) {
      return res.status(403).json({ error: 'Access denied: You cannot delete subtasks in this project' });
    }

    db.prepare('DELETE FROM subtasks WHERE id = ? AND task_id = ?').run(subtaskId, taskId);

    broadcastToProject(task.project_id, 'subtask_deleted', { taskId, subtaskId }, req.user.id);

    res.json({ message: 'Subtask deleted' });
  } catch (err) {
    console.error('Delete subtask error:', err);
    res.status(500).json({ error: 'Failed to delete subtask' });
  }
});

module.exports = router;
