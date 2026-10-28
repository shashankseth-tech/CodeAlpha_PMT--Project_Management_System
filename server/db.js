const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pmt.db');
const legacyDbPath = path.join(dataDir, 'nexuspm.db');
if (!fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) {
  try {
    fs.copyFileSync(legacyDbPath, dbPath);
  } catch (e) {
    console.error('Error copying legacy db:', e.message);
  }
}
const db = new DatabaseSync(fs.existsSync(dbPath) ? dbPath : legacyDbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#6366f1',
      role TEXT DEFAULT 'Team Member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'Engineering',
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT 'rocket',
      owner_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      column_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium',
      due_date TEXT,
      labels TEXT DEFAULT '[]',
      order_index INTEGER DEFAULT 0,
      creator_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS task_assignees (
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (task_id, user_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      task_id INTEGER,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER,
      task_id INTEGER,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'general',
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  seedDataIfEmpty();
}

function seedDataIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) return;

  console.log('Seeding initial data for PMT...');

  const passHash = bcrypt.hashSync('password123', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, avatar_color, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  const u1 = insertUser.run('Alex Rivera', 'alex@pmt.io', passHash, '#6366f1', 'Lead Architect').lastInsertRowid;
  const u2 = insertUser.run('Sarah Chen', 'sarah@pmt.io', passHash, '#ec4899', 'Senior Product Designer').lastInsertRowid;
  const u3 = insertUser.run('Marcus Vance', 'marcus@pmt.io', passHash, '#06b6d4', 'Full Stack Engineer').lastInsertRowid;
  const u4 = insertUser.run('Elena Rostova', 'elena@pmt.io', passHash, '#10b981', 'DevOps & QA Engineer').lastInsertRowid;

  // Project 1: Acme SaaS 2.0
  const insertProject = db.prepare(`
    INSERT INTO projects (title, description, category, color, icon, owner_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const p1 = insertProject.run(
    'Acme SaaS 2.0 Platform',
    'Next-generation collaborative workspace with real-time syncing, AI analytics, and refreshed UI.',
    'Product Engineering',
    '#6366f1',
    'rocket',
    u1,
    'active'
  ).lastInsertRowid;

  // Members for p1
  const insertMember = db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)');
  insertMember.run(p1, u1, 'owner');
  insertMember.run(p1, u2, 'member');
  insertMember.run(p1, u3, 'member');
  insertMember.run(p1, u4, 'member');

  // Columns for p1
  const insertCol = db.prepare('INSERT INTO columns (project_id, title, order_index) VALUES (?, ?, ?)');
  const colBacklog = insertCol.run(p1, 'Backlog', 0).lastInsertRowid;
  const colTodo = insertCol.run(p1, 'To Do', 1).lastInsertRowid;
  const colInProgress = insertCol.run(p1, 'In Progress', 2).lastInsertRowid;
  const colReview = insertCol.run(p1, 'In Review', 3).lastInsertRowid;
  const colDone = insertCol.run(p1, 'Done', 4).lastInsertRowid;

  // Project 2: Mobile App Client
  const p2 = insertProject.run(
    'Mobile Experience (iOS & Android)',
    'Companion mobile application with offline task caching, push notifications, and quick actions.',
    'Mobile Dev',
    '#0ea5e9',
    'smartphone',
    u2,
    'active'
  ).lastInsertRowid;
  insertMember.run(p2, u2, 'owner');
  insertMember.run(p2, u1, 'member');
  insertMember.run(p2, u3, 'member');

  const p2Col1 = insertCol.run(p2, 'Planned', 0).lastInsertRowid;
  const p2Col2 = insertCol.run(p2, 'In Development', 1).lastInsertRowid;
  const p2Col3 = insertCol.run(p2, 'Shipped', 2).lastInsertRowid;

  // Tasks for Project 1
  const insertTask = db.prepare(`
    INSERT INTO tasks (project_id, column_id, title, description, priority, due_date, labels, order_index, creator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
  const insertSubtask = db.prepare('INSERT INTO subtasks (task_id, title, completed) VALUES (?, ?, ?)');
  const insertComment = db.prepare('INSERT INTO comments (task_id, user_id, content, created_at) VALUES (?, ?, ?, ?)');
  const insertActivity = db.prepare('INSERT INTO activities (project_id, task_id, user_id, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?)');

  // 1. Task in In Progress
  const t1 = insertTask.run(
    p1,
    colInProgress,
    'Real-time WebSocket Sync & Conflict Resolution',
    'Implement bi-directional event stream to broadcast task board mutations instantly to all connected teammates.',
    'urgent',
    '2026-10-22',
    JSON.stringify(['Backend', 'WebSockets', 'Core']),
    0,
    u1
  ).lastInsertRowid;
  insertAssignee.run(t1, u1);
  insertAssignee.run(t1, u3);
  insertSubtask.run(t1, 'Define WS event message specifications', 1);
  insertSubtask.run(t1, 'Setup client auto-reconnect with exponential backoff', 1);
  insertSubtask.run(t1, 'Implement broadcast room isolation per project', 0);
  insertSubtask.run(t1, 'Add optimistic UI card state handling', 0);
  insertComment.run(t1, u1, 'Architecture spec looks solid. Starting client listener registration now.', '2026-10-15 10:15:00');
  insertComment.run(t1, u3, 'Got the event payloads aligned with our REST endpoints! Tested multi-tab sync locally.', '2026-10-15 11:30:00');
  insertActivity.run(p1, t1, u1, 'created', 'Created task "Real-time WebSocket Sync & Conflict Resolution"', '2026-10-14 09:00:00');
  insertActivity.run(p1, t1, u3, 'status_changed', 'Moved task to In Progress', '2026-10-15 10:00:00');

  // 2. Task in In Progress
  const t2 = insertTask.run(
    p1,
    colInProgress,
    'Design System Tokens & Dark/Light Theme Switcher',
    'Refine HSL color palette, elevation shadows, smooth cubic-bezier transitions, and accessible contrast ratios.',
    'high',
    '2026-10-25',
    JSON.stringify(['Design', 'UI/UX', 'CSS']),
    1,
    u2
  ).lastInsertRowid;
  insertAssignee.run(t2, u2);
  insertSubtask.run(t2, 'Audit WCAG AA compliance across text tokens', 1);
  insertSubtask.run(t2, 'Build floating theme toggle with system preference auto-detection', 1);
  insertSubtask.run(t2, 'Add subtle glassmorphism backdrop effects for overlays', 0);
  insertComment.run(t2, u2, 'Selected modern Plus Jakarta / Inter font pairings and deep obsidian dark mode.', '2026-10-15 12:00:00');

  // 3. Task in To Do
  const t3 = insertTask.run(
    p1,
    colTodo,
    'Drag-and-Drop Kanban Columns with Visual Drop Indicators',
    'Provide buttery smooth HTML5 drag-and-drop card movement across columns with drop zone highlights and order re-indexing.',
    'high',
    '2026-10-24',
    JSON.stringify(['Frontend', 'Interaction']),
    0,
    u1
  ).lastInsertRowid;
  insertAssignee.run(t3, u3);
  insertSubtask.run(t3, 'Implement dragstart, dragover, and drop event handlers', 1);
  insertSubtask.run(t3, 'Display ghost card placeholder during dragging', 0);
  insertSubtask.run(t3, 'Persist new orderIndex on drop to backend API', 0);

  // 4. Task in To Do
  const t4 = insertTask.run(
    p1,
    colTodo,
    'Collaborative Task Comments & Mention Feed',
    'Support threaded discussions, markdown snippets, relative timestamps, and instant notification alerts.',
    'medium',
    '2026-10-28',
    JSON.stringify(['Collaboration', 'Feature']),
    1,
    u2
  ).lastInsertRowid;
  insertAssignee.run(t4, u2);
  insertAssignee.run(t4, u4);
  insertSubtask.run(t4, 'Create comment list with user avatars and timestamp formatters', 0);
  insertSubtask.run(t4, 'Add keyboard shortcut (Cmd/Ctrl + Enter) to submit comment', 0);

  // 5. Task in Review
  const t5 = insertTask.run(
    p1,
    colReview,
    'Role-Based Project Member Management & Invites',
    'Allow project owners to invite colleagues by email, toggle member roles, and remove members.',
    'medium',
    '2026-10-20',
    JSON.stringify(['Security', 'Auth', 'Team']),
    0,
    u1
  ).lastInsertRowid;
  insertAssignee.run(t5, u4);
  insertAssignee.run(t5, u1);
  insertSubtask.run(t5, 'Validate unique email membership on invite', 1);
  insertSubtask.run(t5, 'Restrict project deletion to project owner', 1);
  insertComment.run(t5, u4, 'PR is ready for review. Unit tests pass with 100% coverage on route guard tests.', '2026-10-15 13:40:00');

  // 6. Task in Backlog
  const t6 = insertTask.run(
    p1,
    colBacklog,
    'Gantt Timeline & Calendar Project View',
    'Visual calendar grid and dependency Gantt chart showing milestone start and end dates.',
    'low',
    '2026-11-15',
    JSON.stringify(['Analytics', 'Views']),
    0,
    u3
  ).lastInsertRowid;
  insertAssignee.run(t6, u3);

  // 7. Task in Done
  const t7 = insertTask.run(
    p1,
    colDone,
    'JWT Authentication & Secure Password Hashing',
    'Implement register, login, session validation, and bcrypt salt rounds with token persistence.',
    'urgent',
    '2026-10-12',
    JSON.stringify(['Security', 'Backend']),
    0,
    u1
  ).lastInsertRowid;
  insertAssignee.run(t7, u1);
  insertSubtask.run(t7, 'Configure bcrypt hash verification', 1);
  insertSubtask.run(t7, 'Set up Bearer token extraction middleware', 1);
  insertSubtask.run(t7, 'Add demo user auto-login credentials', 1);
  insertComment.run(t7, u1, 'Shipped to staging! Tested with mock tokens and token expiration.', '2026-10-12 16:00:00');

  // Sample tasks for p2
  const p2t1 = insertTask.run(
    p2,
    p2Col2,
    'Biometric Login (FaceID / Fingerprint)',
    'Native biometric prompt wrapper with fallback to password.',
    'urgent',
    '2026-10-30',
    JSON.stringify(['Mobile', 'Security']),
    0,
    u2
  ).lastInsertRowid;
  insertAssignee.run(p2t1, u3);

  // Seed sample notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, project_id, task_id, message, type, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertNotif.run(u1, p1, t1, 'Marcus Vance commented on "Real-time WebSocket Sync"', 'comment', 0, '2026-10-15 11:30:00');
  insertNotif.run(u1, p1, t5, 'Elena Rostova requested review on "Member Management"', 'review', 0, '2026-10-15 13:40:00');
  insertNotif.run(u2, p1, t2, 'Alex Rivera assigned you to "Design System Tokens"', 'assignment', 1, '2026-10-15 09:30:00');

  console.log('PMT seeded successfully!');
}

// Helper functions for common queries
function getUserById(id) {
  const user = db.prepare('SELECT id, name, email, avatar_color, role, created_at FROM users WHERE id = ?').get(id);
  return user || null;
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

function getAllUsers() {
  return db.prepare('SELECT id, name, email, avatar_color, role FROM users ORDER BY name ASC').all();
}

function getProjectDetails(projectId, userId) {
  const project = db.prepare(`
    SELECT p.*, u.name as owner_name, u.email as owner_email,
      (SELECT role FROM project_members WHERE project_id = p.id AND user_id = ?) as user_role
    FROM projects p
    JOIN users u ON p.owner_id = u.id
    WHERE p.id = ?
  `).get(userId, projectId);

  if (!project) return null;

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_color, u.role as title, pm.role as project_role
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
    ORDER BY u.name ASC
  `).all(projectId);

  const columns = db.prepare(`
    SELECT * FROM columns WHERE project_id = ? ORDER BY order_index ASC
  `).all(projectId);

  const tasks = db.prepare(`
    SELECT t.*, u.name as creator_name
    FROM tasks t
    JOIN users u ON t.creator_id = u.id
    WHERE t.project_id = ?
    ORDER BY t.order_index ASC, t.id ASC
  `).all(projectId);

  // Attach assignees, subtasks count, and comments count to tasks
  const tasksWithDetails = tasks.map(task => {
    const assignees = db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_color
      FROM task_assignees ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.task_id = ?
    `).all(task.id);

    const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ?').all(task.id);
    const commentCount = db.prepare('SELECT COUNT(*) as count FROM comments WHERE task_id = ?').get(task.id).count;

    return {
      ...task,
      labels: JSON.parse(task.labels || '[]'),
      assignees,
      subtasks,
      commentCount
    };
  });

  return {
    ...project,
    members,
    columns,
    tasks: tasksWithDetails
  };
}

module.exports = {
  db,
  initSchema,
  getUserById,
  getUserByEmail,
  getAllUsers,
  getProjectDetails
};
