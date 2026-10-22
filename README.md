# PMT — Project Management Tool (Agile Collaborative Workspace)

A modern, high-performance collaborative project management platform inspired by **Linear**, **Trello**, and **Asana**. Built with real-time **WebSockets**, Kanban drag-and-drop boards, live project progress tracking, inline quick task creation, 1-click completion toggles, CSV data export, keyboard shortcuts, synthesized audio feedback, subtasks, threaded discussions, and analytics.

---

## ⚡ Features

### 1. Collaborative Project Boards
- **Multiple Group Projects**: Create and switch between multiple team workspaces.
- **Kanban Board View**: Customizable columns (`Backlog`, `To Do`, `In Progress`, `In Review`, `Done`).
- **Smooth Drag-and-Drop**: Native HTML5 card movement across columns with drop placeholders and instant order re-indexing.
- **Multiple Views**:
  - 📋 **Board View**: Visual Kanban workflow.
  - 📄 **List / Table View**: Sortable table with inline status dropdowns, due dates, and assignees.
  - 📊 **Analytics Dashboard**: Real-time completion rates, overdue counters, column distribution bars, and individual team workload breakdown.
  - 👥 **Team & Audit Trail**: Active project members roster and chronological change log.

### 2. Task Cards & Detail Modals
- **Card Metadata**: Priority pills (`Urgent`, `High`, `Medium`, `Low`), custom tag chips (`Frontend`, `Backend`, `Design`, etc.), due date warnings with overdue alerts.
- **Subtasks & Checklist**: Interactive checkboxes with instant strike-through and progress counters.
- **Assignees Stack**: Multi-user assignments with distinct avatar color badges.
- **Search & Filters**: Instant live filtering by keywords, priority levels, or assignees.

### 3. In-Task Team Communication
- **Threaded Discussion Feed**: Real-time comment stream on every task.
- **Relative Timestamps & Avatars**: Formatted relative dates ("Just now", "5m ago", "2h ago").
- **Live Typing Indicators**: Broadcasts who is currently typing a note.

### 4. Real-time WebSockets & Live Notifications (Bonus)
- **Live Sync**: When any teammate creates, updates, moves, or deletes a task, changes reflect immediately on all connected client boards without page refreshing.
- **Notification Dropdown & Bell Badge**: Unread notification counter, mark all read, and instant click-to-task navigation.
- **Real-Time Toast Alerts**: Slide-in visual toasts when teammates post comments or assign you to tasks.

### 5. Multi-User Demo Switcher & Auth
- **JWT & Password Security**: Bcrypt hashed passwords and bearer token authentication.
- **1-Click Teammate Switcher**: Switch instantly between pre-seeded personas:
  - 👨‍💻 **Alex Rivera** (Lead Architect)
  - 🎨 **Sarah Chen** (Product Designer)
  - ⚙️ **Marcus Vance** (Full Stack Engineer)
  - 🛡️ **Elena Rostova** (DevOps & QA)

---

## 🛠️ Tech Stack & Architecture

- **Backend**: Node.js v24 + Express + Native `node:sqlite` (`DatabaseSync`) + `ws` (WebSockets) + `jsonwebtoken` + `bcryptjs`.
- **Database**: Zero-dependency SQLite file database initialized at `data/pmt.db` with schema and seed data.
- **Frontend**: Semantic HTML5 (`<dialog>` modals with scroll containment), Vanilla CSS with custom tokens and Dark/Light modes, Modular JavaScript (API, State, WebSocket client, Drag & Drop controller, UI renderer).

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Start the application
```bash
npm start
```

Open your browser at:
👉 **[http://localhost:3000](http://localhost:3000)**

*(Dev auto-reload mode is also available with `npm run dev`)*

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login with email and password |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/demo-login` | 1-click login as seeded demo user |
| `GET` | `/api/auth/me` | Fetch authenticated user profile |
| `GET` | `/api/auth/users` | List all available team members |
| `GET` | `/api/projects` | List projects user belongs to |
| `POST` | `/api/projects` | Create a new project board |
| `GET` | `/api/projects/:id` | Get full project board with columns, tasks & members |
| `POST` | `/api/projects/:id/tasks` | Create a new task |
| `PUT` | `/api/tasks/:id/move` | Move task to a new column / order index |
| `GET` | `/api/tasks/:id/comments` | Fetch comments for a task |
| `POST` | `/api/tasks/:id/comments` | Post a comment on a task |
| `POST` | `/api/tasks/:id/subtasks` | Add a checklist subtask |
| `PATCH`| `/api/tasks/:id/subtasks/:subId` | Toggle subtask completed state |
| `GET` | `/api/notifications` | Fetch user notifications and unread count |
| `WS` | `/ws` | Bi-directional real-time event socket |
