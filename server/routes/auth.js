const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getUserById, getUserByEmail, getAllUsers } = require('../db');
const { generateToken, requireAuth } = require('../auth');

const router = express.Router();

// Register new user
router.post('/register', (req, res) => {
  try {
    const { name, email, password, avatarColor, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = getUserByEmail(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const color = avatarColor || '#6366f1';
    const userRole = role || 'Team Member';

    const insert = db.prepare(`
      INSERT INTO users (name, email, password_hash, avatar_color, role)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = insert.run(name.trim(), email.toLowerCase().trim(), passwordHash, color, userRole);
    const newUser = getUserById(result.lastInsertRowid);
    const token = generateToken(newUser);

    // Create user's personal project (no default group projects added)
    try {
      const pRes = db.prepare(`
        INSERT INTO projects (title, description, category, color, icon, owner_id)
        VALUES (?, ?, 'Product Engineering', ?, 'rocket', ?)
      `).run(`${name.trim()}'s Workspace`, 'Personal project workspace for tasks and deliverables', color, newUser.id);
      
      const pId = pRes.lastInsertRowid;
      db.prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')").run(pId, newUser.id);

      const insCol = db.prepare('INSERT INTO columns (project_id, title, order_index) VALUES (?, ?, ?)');
      insCol.run(pId, 'Backlog', 0);
      const colTodo = insCol.run(pId, 'To Do', 1).lastInsertRowid;
      insCol.run(pId, 'In Progress', 2);
      insCol.run(pId, 'In Review', 3);
      insCol.run(pId, 'Done', 4);

      // Welcoming first task
      const tRes = db.prepare(`
        INSERT INTO tasks (project_id, column_id, title, description, priority, due_date, labels, order_index, creator_id)
        VALUES (?, ?, ?, ?, 'high', date('now', '+3 days'), '["Onboarding", "PMT"]', 0, ?)
      `).run(
        pId,
        colTodo,
        'Welcome to PMT! Explore your workspace',
        'Create tasks, invite teammates, collaborate via WebSockets, and manage projects.',
        newUser.id
      );

      db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)').run(tRes.lastInsertRowid, newUser.id);
      db.prepare('INSERT INTO subtasks (task_id, title, completed) VALUES (?, ?, 0)').run(tRes.lastInsertRowid, 'Create a new project board');
      db.prepare('INSERT INTO subtasks (task_id, title, completed) VALUES (?, ?, 0)').run(tRes.lastInsertRowid, 'Try dragging cards across columns');
      db.prepare('INSERT INTO subtasks (task_id, title, completed) VALUES (?, ?, 0)').run(tRes.lastInsertRowid, 'Post a comment on a task');
    } catch (projErr) {
      console.warn('Failed to create default starter project for user:', projErr);
    }

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        avatarColor: newUser.avatar_color,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = getUserByEmail(email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarColor: user.avatar_color,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Quick demo login (switch between seeded teammates)
router.post('/demo-login', (req, res) => {
  try {
    const { userId } = req.body || {};
    const requestedId = parseInt(userId || 1, 10);
    // Security check: Only allow seeded demo team accounts (IDs 1-4) for instant switch
    const allowedDemoIds = [1, 2, 3, 4];
    if (!allowedDemoIds.includes(requestedId)) {
      return res.status(403).json({ error: 'Instant demo switch is restricted to default demo team accounts only.' });
    }

    const user = getUserById(requestedId);
    if (!user) {
      return res.status(404).json({ error: 'Demo user not found' });
    }

    const token = generateToken(user);
    res.json({
      message: 'Demo login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarColor: user.avatar_color,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Demo login error:', err);
    res.status(500).json({ error: 'Failed demo login' });
  }
});

// Get current user profile
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      avatarColor: req.user.avatar_color,
      role: req.user.role,
      createdAt: req.user.created_at
    }
  });
});

// Get all users in system (for assigning, tagging, and member invites)
router.get('/users', requireAuth, (req, res) => {
  const users = getAllUsers();
  res.json({
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatarColor: u.avatar_color,
      role: u.role
    }))
  });
});

// Delete current user account
router.delete('/account', requireAuth, (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Please enter your password to confirm account deletion' });
    }

    const userId = req.user.id;
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!userRow) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = bcrypt.compareSync(password, userRow.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Incorrect password. Account deletion cancelled.' });
    }

    // Delete user's notifications
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);

    // Delete task assignees
    db.prepare('DELETE FROM task_assignees WHERE user_id = ?').run(userId);

    // Delete comments by user
    db.prepare('DELETE FROM comments WHERE user_id = ?').run(userId);

    // Delete activities by user
    db.prepare('DELETE FROM activities WHERE user_id = ?').run(userId);

    // Delete projects owned by user
    const ownedProjects = db.prepare('SELECT id FROM projects WHERE owner_id = ?').all(userId);
    for (const proj of ownedProjects) {
      const tasks = db.prepare('SELECT id FROM tasks WHERE project_id = ?').all(proj.id);
      for (const t of tasks) {
        db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(t.id);
        db.prepare('DELETE FROM comments WHERE task_id = ?').run(t.id);
        db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(t.id);
      }
      db.prepare('DELETE FROM tasks WHERE project_id = ?').run(proj.id);
      db.prepare('DELETE FROM columns WHERE project_id = ?').run(proj.id);
      db.prepare('DELETE FROM project_members WHERE project_id = ?').run(proj.id);
      db.prepare('DELETE FROM activities WHERE project_id = ?').run(proj.id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(proj.id);
    }

    // Remove user from other project memberships
    db.prepare('DELETE FROM project_members WHERE user_id = ?').run(userId);

    // Remove tasks created by this user
    db.prepare('DELETE FROM tasks WHERE creator_id = ?').run(userId);

    // Delete user record
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ message: 'Account successfully deleted' });
  } catch (err) {
    console.error('Failed to delete account:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
