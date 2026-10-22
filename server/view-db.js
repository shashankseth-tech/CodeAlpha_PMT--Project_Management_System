const { db } = require('./db');

console.clear();
console.log('\n=================== 📊 PMT DATABASE VIEWER ===================\n');

const tables = [
  'users',
  'projects',
  'project_members',
  'columns',
  'tasks',
  'task_assignees',
  'subtasks',
  'comments',
  'activities',
  'notifications'
];

for (const tableName of tables) {
  try {
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    console.log(`\n📌 TABLE: ${tableName.toUpperCase()} (${rows.length} rows)`);
    if (rows.length > 0) {
      console.table(rows);
    } else {
      console.log('   (Empty table)');
    }
  } catch (err) {
    console.error(`Error reading ${tableName}:`, err.message);
  }
}

console.log('\n===================================================================\n');
