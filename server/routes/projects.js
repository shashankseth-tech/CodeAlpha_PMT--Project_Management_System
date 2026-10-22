const express = require('express');
const { db, getProjectDetails } = require('../db');
const { requireAuth } = require('../auth');
const { broadcastToProject, notifyUser } = require('../websocket');

const router = express.Router();

function getMembership(projectId, userId) {
  return db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}

// List all projects user is a member or owner of
router.get('/', requireAuth, (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT p.*, u.name as owner_name, pm.role as user_role,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
      FROM projects p
      JOIN users u ON p.owner_id = u.id
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);

    res.json({ projects });
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Create a new project
router.post('/', requireAuth, (req, res) => {
  try {
    const { title, description, category, color, icon, memberIds } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Project title is required' });
    }

    const projCategory = category || 'General';
    const projColor = color || '#6366f1';
    const projIcon = icon || 'rocket';

    const insertProj = db.prepare(`
      INSERT INTO projects (title, description, category, color, icon, owner_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insertProj.run(
      title.trim(),
      description ? description.trim() : '',
      projCategory,
      projColor,
      projIcon,
      req.user.id
    );

    const projectId = result.lastInsertRowid;

    // Add creator as owner in project_members
    db.prepare(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (?, ?, 'owner')
    `).run(projectId, req.user.id);

    // Default columns
    const insertCol = db.prepare('INSERT INTO columns (project_id, title, order_index) VALUES (?, ?, ?)');
    insertCol.run(projectId, 'Backlog', 0);
    insertCol.run(projectId, 'To Do', 1);
    insertCol.run(projectId, 'In Progress', 2);
    insertCol.run(projectId, 'In Review', 3);
    insertCol.run(projectId, 'Done', 4);

    // Add optional initial invited members
    if (Array.isArray(memberIds)) {
      const insertMember = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)');
      for (const mId of memberIds) {
        if (mId !== req.user.id) {
          insertMember.run(projectId, mId, 'member');
          notifyUser(mId, projectId, null, `${req.user.name} added you to project "${title}"`, 'project_invite');
        }
      }
    }

    // Log activity
    db.prepare(`
      INSERT INTO activities (project_id, user_id, action, details)
      VALUES (?, ?, 'project_created', ?)
    `).run(projectId, req.user.id, `Created project "${title}"`);

    const projectData = getProjectDetails(projectId, req.user.id);
    res.status(201).json({ project: projectData });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get single project details (board view)
router.get('/:id', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const membership = getMembership(projectId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this project' });
    }

    const project = getProjectDetails(projectId, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Failed to fetch project details' });
  }
});

// Update project
router.put('/:id', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const { title, description, category, color, icon, status } = req.body;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check membership
    const member = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, req.user.id);
    if (!member) {
      return res.status(403).json({ error: 'You are not a member of this project' });
    }

    db.prepare(`
      UPDATE projects
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          category = COALESCE(?, category),
          color = COALESCE(?, color),
          icon = COALESCE(?, icon),
          status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      title !== undefined ? title : null,
      description !== undefined ? description : null,
      category !== undefined ? category : null,
      color !== undefined ? color : null,
      icon !== undefined ? icon : null,
      status !== undefined ? status : null,
      projectId
    );

    const updated = getProjectDetails(projectId, req.user.id);
    broadcastToProject(projectId, 'project_updated', { project: updated }, req.user.id);

    res.json({ project: updated });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project (owner only)
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the project owner can delete this project' });
    }

    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    broadcastToProject(projectId, 'project_deleted', { projectId });

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Add member to project
router.post('/:id/members', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const membership = getMembership(projectId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied: Only project members can invite teammates' });
    }

    const { userId, email, role } = req.body;

    let targetUserId = userId;
    if (!targetUserId && email) {
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (u) targetUserId = u.id;
    }

    if (!targetUserId) {
      return res.status(404).json({ error: 'User not found to add' });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    db.prepare(`
      INSERT OR REPLACE INTO project_members (project_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(projectId, targetUserId, role || 'member');

    db.prepare(`
      INSERT INTO activities (project_id, user_id, action, details)
      VALUES (?, ?, 'member_added', ?)
    `).run(projectId, req.user.id, `Added a new teammate to the project`);

    notifyUser(targetUserId, projectId, null, `${req.user.name} added you to project "${project.title}"`, 'project_invite');

    const updated = getProjectDetails(projectId, req.user.id);
    broadcastToProject(projectId, 'members_updated', { members: updated.members });

    res.json({ members: updated.members });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member from project
router.delete('/:id/members/:userId', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== req.user.id && req.user.id !== targetUserId) {
      return res.status(403).json({ error: 'Not authorized to remove this member' });
    }

    if (targetUserId === project.owner_id) {
      return res.status(400).json({ error: 'Cannot remove the project owner' });
    }

    db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(projectId, targetUserId);

    const updated = getProjectDetails(projectId, req.user.id);
    broadcastToProject(projectId, 'members_updated', { members: updated.members });

    res.json({ members: updated.members });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Get project activity feed
router.get('/:id/activities', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const membership = getMembership(projectId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this project' });
    }

    const activities = db.prepare(`
      SELECT a.*, u.name as user_name, u.avatar_color, t.title as task_title
      FROM activities a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN tasks t ON a.task_id = t.id
      WHERE a.project_id = ?
      ORDER BY a.created_at DESC
      LIMIT 50
    `).all(projectId);

    res.json({ activities });
  } catch (err) {
    console.error('Get activities error:', err);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Add custom column to project
router.post('/:id/columns', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const membership = getMembership(projectId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this project' });
    }

    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Column title is required' });
    }

    const maxOrder = db.prepare('SELECT MAX(order_index) as max_idx FROM columns WHERE project_id = ?').get(projectId)?.max_idx || 0;
    const ins = db.prepare('INSERT INTO columns (project_id, title, order_index) VALUES (?, ?, ?)');
    const result = ins.run(projectId, title.trim(), maxOrder + 1);

    const newCol = {
      id: result.lastInsertRowid,
      project_id: projectId,
      title: title.trim(),
      order_index: maxOrder + 1
    };

    db.prepare(`
      INSERT INTO activities (project_id, user_id, action, details)
      VALUES (?, ?, 'column_created', ?)
    `).run(projectId, req.user.id, `Created column "${title.trim()}"`);

    const updated = getProjectDetails(projectId, req.user.id);
    broadcastToProject(projectId, 'columns_updated', { columns: updated.columns });

    res.status(201).json({ column: newCol, columns: updated.columns });
  } catch (err) {
    console.error('Add column error:', err);
    res.status(500).json({ error: 'Failed to add column' });
  }
});

// Rename column
router.put('/:id/columns/:colId', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const colId = parseInt(req.params.colId, 10);
    const membership = getMembership(projectId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this project' });
    }

    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Column title is required' });
    }

    db.prepare('UPDATE columns SET title = ? WHERE id = ? AND project_id = ?').run(title.trim(), colId, projectId);

    const updated = getProjectDetails(projectId, req.user.id);
    broadcastToProject(projectId, 'columns_updated', { columns: updated.columns });

    res.json({ columns: updated.columns });
  } catch (err) {
    console.error('Rename column error:', err);
    res.status(500).json({ error: 'Failed to update column' });
  }
});

// Delete column
router.delete('/:id/columns/:colId', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const colId = parseInt(req.params.colId, 10);
    const membership = getMembership(projectId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this project' });
    }

    // Delete tasks in column or reassign them
    db.prepare('DELETE FROM tasks WHERE column_id = ?').run(colId);
    db.prepare('DELETE FROM columns WHERE id = ? AND project_id = ?').run(colId, projectId);

    const updated = getProjectDetails(projectId, req.user.id);
    broadcastToProject(projectId, 'columns_updated', { columns: updated.columns, tasks: updated.tasks });

    res.json({ columns: updated.columns, tasks: updated.tasks });
  } catch (err) {
    console.error('Delete column error:', err);
    res.status(500).json({ error: 'Failed to delete column' });
  }
});

// Archive all tasks in Done column
router.post('/:id/archive-done', requireAuth, (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const membership = getMembership(projectId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this project' });
    }

    const doneCol = db.prepare(`SELECT id FROM columns WHERE project_id = ? AND LOWER(title) LIKE '%done%' LIMIT 1`).get(projectId);
    if (!doneCol) {
      return res.status(400).json({ error: 'No Done column found to archive' });
    }

    const info = db.prepare(`DELETE FROM tasks WHERE project_id = ? AND column_id = ?`).run(projectId, doneCol.id);

    db.prepare(`
      INSERT INTO activities (project_id, user_id, action, details)
      VALUES (?, ?, 'tasks_archived', ?)
    `).run(projectId, req.user.id, `Archived ${info.changes} completed tasks`);

    const updated = getProjectDetails(projectId, req.user.id);
    broadcastToProject(projectId, 'tasks_archived', { count: info.changes });

    res.json({ archivedCount: info.changes, tasks: updated.tasks });
  } catch (err) {
    console.error('Archive tasks error:', err);
    res.status(500).json({ error: 'Failed to archive tasks' });
  }
});

module.exports = router;
