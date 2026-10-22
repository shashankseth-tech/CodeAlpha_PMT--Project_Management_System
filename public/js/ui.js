// UI Rendering & View Controller

const UI = {
  init() {
    AppState.setAccentColor(AppState.accentColor);
    AppState.setBlurLevel(AppState.blurLevel);
    AppState.setCompactCards(AppState.compactCards);
    this.bindGlobalEvents();
    this.updateUserUI();
    this.renderTheme();
  },

  renderTheme() {
    document.documentElement.setAttribute('data-theme', AppState.theme);
    const themeIcons = document.querySelectorAll('.theme-mode-icon');
    themeIcons.forEach(icon => {
      icon.textContent = AppState.theme === 'dark' ? '🌙' : '☀️';
    });
  },

  updateUserUI() {
    const user = AppState.currentUser;
    const userBtn = document.getElementById('user-menu-btn');
    const avatar = document.getElementById('nav-user-avatar');
    const name = document.getElementById('nav-user-name');
    const dropdownCurrentUserName = document.getElementById('dropdown-current-user-name');

    if (user && userBtn) {
      if (avatar) {
        avatar.textContent = this.getInitials(user.name);
        avatar.style.backgroundColor = user.avatarColor || '#6366f1';
      }
      if (name) {
        name.textContent = user.name;
      }
      if (dropdownCurrentUserName) {
        dropdownCurrentUserName.textContent = `${user.name} (${user.role || 'Member'})`;
      }
    } else {
      if (avatar) {
        avatar.textContent = '👤';
        avatar.style.backgroundColor = 'var(--text-muted)';
      }
      if (name) {
        name.textContent = 'Sign In';
      }
      if (dropdownCurrentUserName) {
        dropdownCurrentUserName.textContent = 'Guest / Signed Out';
      }
    }

    // Hide Demo accounts section in user dropdown when logged into a genuine registered account
    const demoSection = document.getElementById('user-dropdown-demo-section');
    if (demoSection) {
      if (user && user.id > 4) {
        demoSection.style.display = 'none';
      } else if (user && user.id <= 4) {
        demoSection.style.display = 'block';
      } else {
        demoSection.style.display = 'none';
      }
    }
  },

  getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  },

  formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },

  isOverdue(dueDateStr) {
    if (!dueDateStr) return false;
    const due = new Date(dueDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  },

  audioCtx: null,
  playSound(type = 'success') {
    if (!AppState.soundEnabled) return;
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.audioCtx = new AudioCtx();
      }
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'move') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (type === 'ping') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(740, now);
        osc.frequency.setValueAtTime(987.77, now + 0.08);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (e) {
      // Audio autoplay policy
    }
  },

  exportProjectToCSV() {
    const project = AppState.currentProject;
    if (!project || !project.tasks || project.tasks.length === 0) {
      this.showToast('Nothing to Export', 'This project has no tasks to export.', 'info');
      return;
    }
    const cols = project.columns || [];
    const colMap = {};
    cols.forEach(c => colMap[c.id] = c.title);

    const headers = ['Task ID', 'Title', 'Status Column', 'Priority', 'Due Date', 'Tags/Labels', 'Assignees', 'Subtasks (Done/Total)', 'Description'];
    const rows = project.tasks.map(t => {
      const status = colMap[t.column_id] || 'Unknown';
      const assignees = (t.assignees || []).map(a => a.name).join('; ');
      const labels = (t.labels || []).join('; ');
      const subDone = (t.subtasks || []).filter(s => s.completed).length;
      const subTotal = (t.subtasks || []).length;
      const subStr = subTotal > 0 ? `${subDone}/${subTotal}` : 'None';
      const cleanDesc = (t.description || '').replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ');
      const cleanTitle = (t.title || '').replace(/"/g, '""');

      return [
        t.id,
        `"${cleanTitle}"`,
        `"${status}"`,
        `"${t.priority}"`,
        `"${t.due_date || ''}"`,
        `"${labels}"`,
        `"${assignees}"`,
        `"${subStr}"`,
        `"${cleanDesc}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `PMT_${(project.title || 'project').replace(/\s+/g, '_')}_tasks.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.playSound('success');
    this.showToast('Export Complete! 📥', `Saved as ${filename}`, 'success');
  },

  openShortcutsModal() {
    const dialog = document.getElementById('shortcuts-modal');
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  },

  showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-title">${this.escapeHtml(title)}</div>
        <div class="toast-message">${this.escapeHtml(message)}</div>
      </div>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    toast.querySelector('.toast-close').onclick = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      setTimeout(() => toast.remove(), 200);
    };

    container.appendChild(toast);

    // Auto dismiss after 4.5s
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        setTimeout(() => toast.remove(), 200);
      }
    }, 4500);
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // Select and switch active project
  async selectProject(projectId) {
    const id = parseInt(projectId, 10);
    if (isNaN(id)) return;
    try {
      const res = await API.getProject(id);
      if (res && res.project) {
        AppState.setCurrentProject(res.project);
        WSClient.joinProject(res.project.id);
        this.renderCurrentView();
        this.showToast('Project Switched', `Active: "${res.project.title}"`, 'info');
      }
    } catch (err) {
      console.error('Failed to switch project:', err);
      this.showToast('Error', 'Could not load project', 'danger');
    }
  },

  // Render Projects in Sidebar
  renderSidebarProjects() {
    const listEl = document.getElementById('sidebar-projects-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    AppState.projects.forEach(p => {
      const li = document.createElement('li');
      const isActive = AppState.currentProject && AppState.currentProject.id === p.id;
      li.className = `project-nav-item ${isActive ? 'active' : ''}`;
      li.innerHTML = `
        <div class="project-nav-left">
          <span class="project-color-dot" style="background-color: ${p.color || '#3b82f6'}"></span>
          <span class="project-nav-title">${this.escapeHtml(p.title)}</span>
        </div>
        <span class="project-nav-badge">${p.task_count || 0}</span>
      `;
      li.onclick = () => {
        if (AppState.currentProject?.id !== p.id) {
          this.selectProject(p.id);
        }
      };
      listEl.appendChild(li);
    });
  },

  // Render Projects in Navbar Dropdown
  renderProjectSelectorDropdown() {
    const listEl = document.getElementById('project-selector-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    AppState.projects.forEach(p => {
      const item = document.createElement('div');
      const isActive = AppState.currentProject && AppState.currentProject.id === p.id;
      item.className = `notif-card ${isActive ? 'unread' : ''}`;
      item.style.cursor = 'pointer';
      item.innerHTML = `
        <span class="project-color-dot" style="background-color: ${p.color || '#3b82f6'}; margin-top: 5px;"></span>
        <div class="notif-text">
          <div style="font-weight: 700; color: var(--text-primary);">${this.escapeHtml(p.title)}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${p.task_count || 0} tasks • ${p.category || 'General'}</div>
        </div>
        ${isActive ? '<span style="font-size: 0.8rem; color: var(--accent-primary); font-weight: 800;">✓</span>' : ''}
      `;
      item.onclick = () => {
        document.getElementById('project-selector-dropdown')?.classList.remove('show');
        if (AppState.currentProject?.id !== p.id) {
          this.selectProject(p.id);
        }
      };
      listEl.appendChild(item);
    });
  },

  // Render Project Top Header Banner
  renderProjectHeader() {
    const p = AppState.currentProject;
    if (!p) return;

    const titleEl = document.getElementById('project-heading');
    const catEl = document.getElementById('project-category');
    const descEl = document.getElementById('project-description');
    const membersStack = document.getElementById('project-member-stack');
    const selectorLabel = document.getElementById('project-selector-name');
    const selectorDot = document.getElementById('project-selector-dot');

    if (titleEl) titleEl.textContent = p.title;
    if (catEl) catEl.textContent = p.category || 'General';
    if (descEl) descEl.textContent = p.description || 'No description provided';
    if (selectorLabel) selectorLabel.textContent = p.title;
    if (selectorDot) selectorDot.style.backgroundColor = p.color || '#6366f1';

    if (membersStack) {
      membersStack.innerHTML = '';
      (p.members || []).forEach(m => {
        const av = document.createElement('div');
        av.className = 'member-stack-avatar';
        av.style.backgroundColor = m.avatar_color || '#6366f1';
        av.textContent = this.getInitials(m.name);
        av.title = `${m.name} (${m.project_role || 'member'})`;
        membersStack.appendChild(av);
      });
    }

    // Dynamic Project Progress & Live Metrics Bar calculations
    const tasks = p.tasks || [];
    const columns = p.columns || [];
    const doneCol = columns.find(c => c.title.toLowerCase().includes('done')) || columns[columns.length - 1];
    const totalTasks = tasks.length;
    const doneTasks = doneCol ? tasks.filter(t => t.column_id === doneCol.id).length : 0;
    const inProgressCol = columns.find(c => c.title.toLowerCase().includes('progress'));
    const inProgressTasks = inProgressCol ? tasks.filter(t => t.column_id === inProgressCol.id).length : 0;
    const overdueTasks = tasks.filter(t => this.isOverdue(t.due_date) && t.column_id !== doneCol?.id).length;
    const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const progressEl = document.getElementById('metric-progress-percent');
    const totalEl = document.getElementById('metric-total-tasks');
    const doneEl = document.getElementById('metric-completed-tasks');
    const inProgEl = document.getElementById('metric-in-progress-tasks');
    const overdueEl = document.getElementById('metric-overdue-tasks');
    const barFillEl = document.getElementById('project-progress-bar-fill');

    if (progressEl) progressEl.textContent = `${progressPercent}%`;
    if (totalEl) totalEl.textContent = totalTasks;
    if (doneEl) doneEl.textContent = doneTasks;
    if (inProgEl) inProgEl.textContent = inProgressTasks;
    if (overdueEl) overdueEl.textContent = overdueTasks;
    if (barFillEl) barFillEl.style.width = `${progressPercent}%`;
  },

  // Main View Router
  renderCurrentView() {
    this.renderProjectHeader();
    this.renderSidebarProjects();
    this.renderProjectSelectorDropdown();

    const canvas = document.getElementById('view-canvas');
    if (!canvas) return;

    // Update active tab buttons
    document.querySelectorAll('.view-tab').forEach(tab => {
      if (tab.dataset.view === AppState.activeView) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    switch (AppState.activeView) {
      case 'board':
        this.renderBoard(canvas);
        break;
      case 'calendar':
        this.renderCalendar(canvas);
        break;
      case 'list':
        this.renderList(canvas);
        break;
      case 'analytics':
        this.renderAnalytics(canvas);
        break;
      case 'team':
        this.renderTeam(canvas);
        break;
      default:
        this.renderBoard(canvas);
    }
  },

  // 1. Kanban Board View
  renderBoard(container) {
    const project = AppState.currentProject;
    if (!project) return;

    const filteredTasks = AppState.getFilteredTasks();
    const columns = project.columns || [];

    const wrapper = document.createElement('div');
    wrapper.className = 'board-wrapper';

    columns.forEach(col => {
      const colTasks = filteredTasks
        .filter(t => t.column_id === col.id)
        .sort((a, b) => a.order_index - b.order_index);

      const colEl = document.createElement('div');
      colEl.className = 'kanban-column';
      colEl.dataset.columnId = col.id;

      // Col indicator color class
      const indicatorClass = col.title.toLowerCase().replace(/\s+/g, '-');

      colEl.innerHTML = `
        <div class="column-header">
          <div class="col-header-left">
            <span class="col-indicator ${indicatorClass}"></span>
            <span class="column-title">${this.escapeHtml(col.title)}</span>
            <span class="col-count-badge">${colTasks.length}</span>
          </div>
          <div class="col-header-actions">
            <button class="col-add-btn" title="Add task in ${this.escapeHtml(col.title)}">+</button>
            ${columns.length > 2 ? `<button class="col-action-btn col-del-btn" title="Delete column">&times;</button>` : ''}
          </div>
        </div>
        <div class="cards-container" data-column-id="${col.id}"></div>
        <div class="col-inline-composer">
          <form class="inline-composer-form" data-column-id="${col.id}">
            <input type="text" class="inline-composer-input" placeholder="+ Quick task... (Enter)" required>
            <button type="submit" class="inline-composer-btn">Add</button>
          </form>
        </div>
      `;

      // Quick add button in header
      colEl.querySelector('.col-add-btn').onclick = () => {
        this.openNewTaskModal(col.id);
      };

      // Column delete button
      const delBtn = colEl.querySelector('.col-del-btn');
      if (delBtn) {
        delBtn.onclick = async () => {
          if (confirm(`Are you sure you want to delete column "${col.title}"? Tasks inside it will be removed.`)) {
            try {
              const res = await API.deleteColumn(project.id, col.id);
              project.columns = res.columns;
              project.tasks = res.tasks;
              this.playSound('move');
              this.renderCurrentView();
              this.showToast('Column Deleted', `"${col.title}" column was deleted`, 'info');
            } catch (err) {
              this.showToast('Error', err.message || 'Failed to delete column', 'danger');
            }
          }
        };
      }

      // Inline Quick Task Composer submit
      const composerForm = colEl.querySelector('.inline-composer-form');
      if (composerForm) {
        composerForm.onsubmit = async (e) => {
          e.preventDefault();
          const input = composerForm.querySelector('.inline-composer-input');
          const title = input.value.trim();
          if (!title) return;
          try {
            const res = await API.createTask({
              projectId: project.id,
              columnId: col.id,
              title: title,
              priority: 'medium',
              description: ''
            });
            input.value = '';
            project.tasks.push(res.task);
            this.playSound('success');
            this.renderCurrentView();
            this.showToast('Task Created ⚡', `"${title}" added to ${col.title}`, 'success');
          } catch (err) {
            this.showToast('Error', err.message || 'Failed to create task', 'danger');
          }
        };
      }

      const cardsContainer = colEl.querySelector('.cards-container');

      colTasks.forEach(task => {
        const card = this.createTaskCard(task);
        cardsContainer.appendChild(card);
        DragDrop.attachCardEvents(card, task.id, col.id);
      });

      // Attach column drop events
      DragDrop.attachColumnEvents(colEl, col.id);

      wrapper.appendChild(colEl);
    });

    // Custom Add Column Card at end of board
    const addColCard = document.createElement('div');
    addColCard.className = 'kanban-add-column-card';
    addColCard.innerHTML = `
      <div id="add-column-trigger" class="add-column-trigger-btn">
        <span>➕</span> Add New Column
      </div>
      <form id="add-column-form" class="add-column-form" style="display: none;">
        <input type="text" id="add-column-input" class="add-column-input" placeholder="e.g. QA / Testing" required>
        <div class="add-column-actions">
          <button type="submit" class="btn-primary" style="padding: 4px 10px; font-size: 0.78rem;">Create</button>
          <button type="button" id="cancel-add-column-btn" class="btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;">Cancel</button>
        </div>
      </form>
    `;

    const triggerBtn = addColCard.querySelector('#add-column-trigger');
    const formEl = addColCard.querySelector('#add-column-form');
    const cancelBtn = addColCard.querySelector('#cancel-add-column-btn');
    const colInput = addColCard.querySelector('#add-column-input');

    triggerBtn.onclick = () => {
      triggerBtn.style.display = 'none';
      formEl.style.display = 'flex';
      colInput.focus();
    };

    cancelBtn.onclick = () => {
      formEl.style.display = 'none';
      triggerBtn.style.display = 'flex';
      colInput.value = '';
    };

    formEl.onsubmit = async (e) => {
      e.preventDefault();
      const title = colInput.value.trim();
      if (!title) return;
      try {
        const res = await API.addColumn(project.id, title);
        project.columns = res.columns;
        this.playSound('success');
        this.renderCurrentView();
        this.showToast('Column Added 🗂️', `Column "${title}" created successfully`, 'success');
      } catch (err) {
        this.showToast('Error', err.message || 'Failed to add column', 'danger');
      }
    };

    wrapper.appendChild(addColCard);

    container.innerHTML = '';
    container.appendChild(wrapper);
  },

  // 2. Interactive Calendar View
  renderCalendar(container) {
    const project = AppState.currentProject;
    if (!project) return;

    const tasks = AppState.getFilteredTasks();
    const curDate = AppState.calendarDate || new Date();
    const year = curDate.getFullYear();
    const month = curDate.getMonth();

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDayCurrentMonth = new Date(year, month + 1, 0).getDate();
    const lastDayPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const wrapper = document.createElement('div');
    wrapper.className = 'calendar-wrapper';

    wrapper.innerHTML = `
      <div class="calendar-header-bar">
        <div class="calendar-month-title">
          <span>📅 ${monthNames[month]} ${year}</span>
        </div>
        <div class="calendar-nav-group">
          <button id="cal-prev-btn" class="calendar-nav-btn">◀ Prev</button>
          <button id="cal-today-btn" class="calendar-nav-btn">Today</button>
          <button id="cal-next-btn" class="calendar-nav-btn">Next ▶</button>
        </div>
      </div>
      <div class="calendar-grid-container">
        <div class="calendar-weekdays-row">
          <div class="calendar-weekday">Sun</div>
          <div class="calendar-weekday">Mon</div>
          <div class="calendar-weekday">Tue</div>
          <div class="calendar-weekday">Wed</div>
          <div class="calendar-weekday">Thu</div>
          <div class="calendar-weekday">Fri</div>
          <div class="calendar-weekday">Sat</div>
        </div>
        <div class="calendar-days-grid" id="calendar-days-grid"></div>
      </div>
    `;

    const grid = wrapper.querySelector('#calendar-days-grid');

    // Previous month padding days
    for (let i = firstDayIndex; i > 0; i--) {
      const dayNum = lastDayPrevMonth - i + 1;
      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell other-month';
      cell.innerHTML = `<div class="calendar-day-header"><span>${dayNum}</span></div>`;
      grid.appendChild(cell);
    }

    // Current month days
    for (let day = 1; day <= lastDayCurrentMonth; day++) {
      const monthPadded = String(month + 1).padStart(2, '0');
      const dayPadded = String(day).padStart(2, '0');
      const dateStr = `${year}-${monthPadded}-${dayPadded}`;
      const isToday = dateStr === todayStr;

      const cell = document.createElement('div');
      cell.className = `calendar-day-cell ${isToday ? 'today' : ''}`;
      cell.dataset.date = dateStr;

      const dayTasks = tasks.filter(t => t.due_date === dateStr);

      const tasksHtml = dayTasks.map(t => {
        const p = (t.priority || 'medium').toLowerCase();
        return `
          <div class="calendar-task-chip ${p}" data-task-id="${t.id}" title="${this.escapeHtml(t.title)} (${p})">
            <span>${this.escapeHtml(t.title)}</span>
          </div>
        `;
      }).join('');

      cell.innerHTML = `
        <div class="calendar-day-header">
          <span>${day}</span>
          ${dayTasks.length > 0 ? `<span style="font-size: 0.65rem; color: var(--accent-primary);">${dayTasks.length}</span>` : ''}
        </div>
        <div class="calendar-tasks-stack">
          ${tasksHtml}
        </div>
      `;

      cell.onclick = (e) => {
        if (e.target.closest('.calendar-task-chip')) return;
        this.openNewTaskModal(null, dateStr);
      };

      grid.appendChild(cell);
    }

    // Attach task chip clicks
    grid.querySelectorAll('.calendar-task-chip').forEach(chip => {
      chip.onclick = (e) => {
        e.stopPropagation();
        const taskId = parseInt(chip.dataset.taskId, 10);
        this.openTaskModal(taskId);
      };
    });

    // Nav buttons
    wrapper.querySelector('#cal-prev-btn').onclick = () => {
      AppState.prevCalendarMonth();
      this.renderCurrentView();
    };

    wrapper.querySelector('#cal-next-btn').onclick = () => {
      AppState.nextCalendarMonth();
      this.renderCurrentView();
    };

    wrapper.querySelector('#cal-today-btn').onclick = () => {
      AppState.resetCalendarMonth();
      this.renderCurrentView();
    };

    container.innerHTML = '';
    container.appendChild(wrapper);
  },

  createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.taskId = task.id;

    const project = AppState.currentProject;
    const columns = project?.columns || [];
    const doneCol = columns.find(c => c.title.toLowerCase().includes('done')) || columns[columns.length - 1];
    const isCompleted = task.column_id === doneCol?.id;

    if (isCompleted) {
      card.classList.add('is-completed');
    }

    // Subtasks calculation
    const subtasks = task.subtasks || [];
    const doneCount = subtasks.filter(s => s.completed).length;
    const totalSubtasks = subtasks.length;
    const subtaskDone = totalSubtasks > 0 && doneCount === totalSubtasks;

    // Priority
    const priority = (task.priority || 'medium').toLowerCase();

    // Labels chips
    const labelsHtml = (task.labels || [])
      .map(l => `<span class="label-chip">${this.escapeHtml(l)}</span>`)
      .join('');

    // Assignees stack
    const assigneesHtml = (task.assignees || []).map(a => `
      <div class="card-avatar" style="background-color: ${a.avatar_color || '#6366f1'}" title="${this.escapeHtml(a.name)}">
        ${this.getInitials(a.name)}
      </div>
    `).join('');

    // Smart Due date badge
    let dueHtml = '';
    if (task.due_date) {
      const isOver = this.isOverdue(task.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = new Date(task.due_date);
      const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

      let badgeClass = '';
      let dueText = task.due_date;

      if (isOver && !isCompleted) {
        badgeClass = 'overdue';
        const daysAgo = Math.abs(diffDays);
        dueText = daysAgo > 0 ? `⚠️ Overdue (${daysAgo}d)` : `⚠️ Overdue`;
      } else if (diffDays === 0) {
        badgeClass = 'today';
        dueText = `⏰ Due Today`;
      } else if (diffDays === 1) {
        dueText = `📅 Tomorrow`;
      } else {
        dueText = `📅 ${task.due_date}`;
      }

      dueHtml = `
        <span class="meta-item ${badgeClass}" title="Due date: ${task.due_date}">
          ${dueText}
        </span>
      `;
    }

    // Subtask badge
    let subtaskBadgeHtml = '';
    if (totalSubtasks > 0) {
      subtaskBadgeHtml = `
        <span class="meta-item ${subtaskDone ? 'completed-all' : ''}" title="Checklist progress">
          ☑️ ${doneCount}/${totalSubtasks}
        </span>
      `;
    }

    // Comment count badge
    let commentBadgeHtml = '';
    if (task.commentCount > 0) {
      commentBadgeHtml = `
        <span class="meta-item" title="Comments">
          💬 ${task.commentCount}
        </span>
      `;
    }

    // Mini Subtask progress bar
    let subtaskBarHtml = '';
    if (totalSubtasks > 0) {
      const pct = Math.round((doneCount / totalSubtasks) * 100);
      subtaskBarHtml = `
        <div class="card-subtask-bar" title="Checklist: ${doneCount}/${totalSubtasks} (${pct}%)">
          <div class="card-subtask-fill" style="width: ${pct}%;"></div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-top-row">
        <div class="card-top-left">
          <button class="card-check-btn ${isCompleted ? 'completed' : ''}" title="${isCompleted ? 'Mark incomplete' : 'Mark complete'}">
            ${isCompleted ? '✓' : ''}
          </button>
          <span class="priority-pill ${priority}">
            <span class="prio-dot"></span>
            ${priority}
          </span>
        </div>
      </div>
      <div class="card-title">${this.escapeHtml(task.title)}</div>
      ${subtaskBarHtml}
      ${labelsHtml ? `<div class="card-labels-row">${labelsHtml}</div>` : ''}
      <div class="card-footer">
        <div class="card-meta-left">
          ${dueHtml}
          ${subtaskBadgeHtml}
          ${commentBadgeHtml}
        </div>
        <div class="card-assignees">
          ${assigneesHtml}
        </div>
      </div>
    `;

    // 1-Click Fast Completion Toggle Button
    const checkBtn = card.querySelector('.card-check-btn');
    if (checkBtn) {
      checkBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          if (!doneCol) return;
          const targetColId = isCompleted
            ? (columns.find(c => c.id !== doneCol.id)?.id || columns[0].id)
            : doneCol.id;
          
          await API.moveTask(task.id, targetColId, 0);
          task.column_id = targetColId;
          this.playSound(isCompleted ? 'move' : 'success');
          this.renderCurrentView();
          this.showToast(
            isCompleted ? 'Task Reopened' : 'Task Completed! 🎉',
            `"${task.title}" marked as ${isCompleted ? 'active' : 'done'}`,
            isCompleted ? 'info' : 'success'
          );
        } catch (err) {
          this.showToast('Error', err.message || 'Could not update task status', 'danger');
        }
      };
    }

    // Click card to open full details modal
    card.onclick = (e) => {
      // Avoid opening if dragging
      if (card.classList.contains('dragging')) return;
      this.openTaskModal(task.id);
    };

    return card;
  },

  // 2. List / Table View
  renderList(container) {
    const tasks = AppState.getFilteredTasks();
    const columns = AppState.currentProject.columns || [];

    const wrapper = document.createElement('div');
    wrapper.className = 'list-wrapper';

    wrapper.innerHTML = `
      <div class="list-table-container">
        <table class="list-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Due Date</th>
              <th>Checklist</th>
              <th>Assignees</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map(t => {
              const subCount = t.subtasks?.length || 0;
              const subDone = (t.subtasks || []).filter(s => s.completed).length;
              return `
                <tr data-task-id="${t.id}">
                  <td>
                    <div class="list-task-title">
                      <span>${this.escapeHtml(t.title)}</span>
                    </div>
                  </td>
                  <td>
                    <select class="status-select" data-task-id="${t.id}">
                      ${columns.map(c => `
                        <option value="${c.id}" ${c.id === t.column_id ? 'selected' : ''}>${this.escapeHtml(c.title)}</option>
                      `).join('')}
                    </select>
                  </td>
                  <td>
                    <span class="priority-pill ${t.priority.toLowerCase()}">
                      <span class="prio-dot"></span>
                      ${t.priority}
                    </span>
                  </td>
                  <td>${t.due_date ? `${this.isOverdue(t.due_date) ? '⚠️ ' : ''}${t.due_date}` : '—'}</td>
                  <td>${subCount > 0 ? `${subDone}/${subCount}` : '—'}</td>
                  <td>
                    <div class="card-assignees">
                      ${(t.assignees || []).map(a => `
                        <div class="card-avatar" style="background-color: ${a.avatar_color}" title="${this.escapeHtml(a.name)}">
                          ${this.getInitials(a.name)}
                        </div>
                      `).join('')}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Attach event listeners
    wrapper.querySelectorAll('tbody tr').forEach(row => {
      row.onclick = (e) => {
        if (e.target.tagName === 'SELECT') return;
        const taskId = parseInt(row.dataset.taskId, 10);
        this.openTaskModal(taskId);
      };
    });

    wrapper.querySelectorAll('.status-select').forEach(sel => {
      sel.onchange = async (e) => {
        e.stopPropagation();
        const taskId = parseInt(sel.dataset.taskId, 10);
        const colId = parseInt(sel.value, 10);
        await API.moveTask(taskId, colId, 0);
        const fresh = await API.getProject(AppState.currentProject.id);
        AppState.setCurrentProject(fresh.project);
      };
    });

    container.innerHTML = '';
    container.appendChild(wrapper);
  },

  // 3. Analytics View
  renderAnalytics(container) {
    const tasks = AppState.currentProject.tasks || [];
    const columns = AppState.currentProject.columns || [];
    const members = AppState.currentProject.members || [];

    const totalTasks = tasks.length;
    const doneCol = columns.find(c => c.title.toLowerCase().includes('done')) || columns[columns.length - 1];
    const doneTasks = doneCol ? tasks.filter(t => t.column_id === doneCol.id).length : 0;
    const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    const overdueTasks = tasks.filter(t => this.isOverdue(t.due_date) && t.column_id !== doneCol?.id).length;

    const wrapper = document.createElement('div');
    wrapper.className = 'analytics-wrapper';

    wrapper.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Total Tasks</div>
          <div class="metric-value">${totalTasks}</div>
          <div class="metric-subtitle">Across ${columns.length} columns</div>
        </div>
        <div class="metric-card success">
          <div class="metric-label">Completion Rate</div>
          <div class="metric-value">${completionRate}%</div>
          <div class="metric-subtitle">${doneTasks} of ${totalTasks} completed</div>
        </div>
        <div class="metric-card ${overdueTasks > 0 ? 'danger' : 'warning'}">
          <div class="metric-label">Overdue Tasks</div>
          <div class="metric-value">${overdueTasks}</div>
          <div class="metric-subtitle">Needs immediate attention</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Team Members</div>
          <div class="metric-value">${members.length}</div>
          <div class="metric-subtitle">Active project contributors</div>
        </div>
      </div>

      <div class="analytics-charts-grid">
        <!-- Column Distribution -->
        <div class="chart-card">
          <div class="chart-title">Status Breakdown</div>
          <div class="progress-bar-container">
            ${columns.map(c => {
              const count = tasks.filter(t => t.column_id === c.id).length;
              const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
              return `
                <div style="margin-bottom: 10px;">
                  <div class="progress-bar-label">
                    <span>${this.escapeHtml(c.title)}</span>
                    <span>${count} (${pct}%)</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width: ${pct}%; background: var(--accent-primary);"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Team Workload -->
        <div class="chart-card">
          <div class="chart-title">Team Workload</div>
          <div class="progress-bar-container">
            ${members.map(m => {
              const assigned = tasks.filter(t => (t.assignees || []).some(a => a.id === m.id)).length;
              const pct = totalTasks > 0 ? Math.round((assigned / totalTasks) * 100) : 0;
              return `
                <div style="margin-bottom: 10px;">
                  <div class="progress-bar-label">
                    <span>${this.escapeHtml(m.name)}</span>
                    <span>${assigned} tasks (${pct}%)</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width: ${pct}%; background: ${m.avatar_color || '#10b981'};"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(wrapper);
  },

  // 4. Team & Activity View
  async renderTeam(container) {
    const project = AppState.currentProject;
    if (!project) return;

    let activities = [];
    try {
      const res = await API.getActivities(project.id);
      activities = res.activities || [];
    } catch (err) {
      console.warn('Could not load activities:', err);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'team-view-wrapper';

    wrapper.innerHTML = `
      <div class="team-members-panel">
        <div class="chart-title">
          <span>Project Members (${project.members?.length || 0})</span>
          <button class="btn-primary" id="btn-open-invite" style="font-size: 0.8rem; padding: 5px 12px;">+ Add Teammate</button>
        </div>
        <div class="member-list">
          ${(project.members || []).map(m => `
            <div class="member-card">
              <div class="member-card-left">
                <div class="user-avatar-circle" style="background-color: ${m.avatar_color}; width: 36px; height: 36px;">
                  ${this.getInitials(m.name)}
                </div>
                <div>
                  <div class="member-card-name">${this.escapeHtml(m.name)}</div>
                  <div class="member-card-role">${this.escapeHtml(m.title || m.project_role)} • ${this.escapeHtml(m.email)}</div>
                </div>
              </div>
              <span class="project-nav-badge">${m.project_role}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="activity-panel">
        <div class="chart-title">Project Audit & Activity Trail</div>
        <div class="activity-list">
          ${activities.length === 0 ? '<div style="color: var(--text-muted); font-size: 0.85rem;">No recent activities logged yet.</div>' : ''}
          ${activities.map(a => `
            <div class="activity-item">
              <div class="user-avatar-circle" style="background-color: ${a.avatar_color}; width: 28px; height: 28px; flex-shrink: 0;">
                ${this.getInitials(a.user_name)}
              </div>
              <div>
                <div><strong>${this.escapeHtml(a.user_name)}</strong> ${this.escapeHtml(a.details || a.action)}</div>
                <div class="activity-time">${this.formatRelativeTime(a.created_at)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    wrapper.querySelector('#btn-open-invite').onclick = () => {
      this.openInviteModal();
    };

    container.innerHTML = '';
    container.appendChild(wrapper);
  },

  // Open Full Task Detail Modal
  async openTaskModal(taskId) {
    const dialog = document.getElementById('task-modal');
    if (!dialog) return;

    try {
      const res = await API.getTask(taskId);
      const task = res.task;
      AppState.setActiveTask(task);

      const titleInput = dialog.querySelector('#modal-task-title');
      const descInput = dialog.querySelector('#modal-task-desc');
      const colSelect = dialog.querySelector('#modal-task-column');
      const prioSelect = dialog.querySelector('#modal-task-priority');
      const dueInput = dialog.querySelector('#modal-task-due');
      const labelsInput = dialog.querySelector('#modal-task-labels');
      const assigneesContainer = dialog.querySelector('#modal-task-assignees');
      const subtasksList = dialog.querySelector('#modal-subtasks-list');
      const commentsFeed = dialog.querySelector('#modal-comments-feed');
      const deleteBtn = dialog.querySelector('#modal-task-delete-btn');

      // Populate basic info
      if (titleInput) titleInput.value = task.title;
      if (descInput) descInput.value = task.description || '';
      if (prioSelect) prioSelect.value = task.priority;
      if (dueInput) dueInput.value = task.due_date || '';
      if (labelsInput) labelsInput.value = (task.labels || []).join(', ');

      // Populate columns dropdown
      if (colSelect) {
        colSelect.innerHTML = (AppState.currentProject.columns || []).map(c => `
          <option value="${c.id}" ${c.id === task.column_id ? 'selected' : ''}>${this.escapeHtml(c.title)}</option>
        `).join('');
      }

      // Populate assignees
      if (assigneesContainer) {
        assigneesContainer.innerHTML = (AppState.currentProject.members || []).map(m => {
          const isAssigned = (task.assignees || []).some(a => a.id === m.id);
          return `
            <label class="assignee-checkbox-item">
              <input type="checkbox" value="${m.id}" ${isAssigned ? 'checked' : ''} class="assignee-check">
              <div class="card-avatar" style="background-color: ${m.avatar_color}; width: 20px; height: 20px; font-size: 0.6rem;">
                ${this.getInitials(m.name)}
              </div>
              <span>${this.escapeHtml(m.name)}</span>
            </label>
          `;
        }).join('');
      }

      // Populate subtasks
      this.renderModalSubtasks(task.subtasks || [], subtasksList, task.id);

      // Populate comments
      await this.loadTaskComments(task.id, commentsFeed);

      // Delete action
      if (deleteBtn) {
        deleteBtn.onclick = async () => {
          if (confirm(`Are you sure you want to delete "${task.title}"?`)) {
            await API.deleteTask(task.id);
            dialog.close();
            const fresh = await API.getProject(AppState.currentProject.id);
            AppState.setCurrentProject(fresh.project);
            this.showToast('Task deleted', `"${task.title}" was removed`, 'info');
          }
        };
      }

      // Auto-save on blur / change
      const saveTaskChanges = async () => {
        const updatedAssignees = Array.from(assigneesContainer.querySelectorAll('.assignee-check:checked'))
          .map(cb => parseInt(cb.value, 10));

        const labels = labelsInput.value
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);

        const payload = {
          title: titleInput.value,
          description: descInput.value,
          columnId: parseInt(colSelect.value, 10),
          priority: prioSelect.value,
          dueDate: dueInput.value || null,
          labels,
          assigneeIds: updatedAssignees
        };

        try {
          const updated = await API.updateTask(task.id, payload);
          // Sync in state
          const p = AppState.currentProject;
          const idx = p.tasks.findIndex(t => t.id === task.id);
          if (idx !== -1) {
            p.tasks[idx] = updated.task;
            this.renderCurrentView();
          }
        } catch (err) {
          console.error('Failed to update task:', err);
        }
      };

      titleInput.onblur = saveTaskChanges;
      descInput.onblur = saveTaskChanges;
      colSelect.onchange = saveTaskChanges;
      prioSelect.onchange = saveTaskChanges;
      dueInput.onchange = saveTaskChanges;
      labelsInput.onblur = saveTaskChanges;
      assigneesContainer.querySelectorAll('.assignee-check').forEach(cb => {
        cb.onchange = saveTaskChanges;
      });

      // Bind Subtask Add
      const subtaskForm = dialog.querySelector('#add-subtask-form');
      const subtaskInput = dialog.querySelector('#add-subtask-input');
      subtaskForm.onsubmit = async (e) => {
        e.preventDefault();
        const val = subtaskInput.value.trim();
        if (!val) return;
        const res = await API.addSubtask(task.id, val);
        subtaskInput.value = '';
        task.subtasks.push(res.subtask);
        this.renderModalSubtasks(task.subtasks, subtasksList, task.id);
        this.renderCurrentView();
      };

      // Bind Comment Add
      const commentForm = dialog.querySelector('#add-comment-form');
      const commentText = dialog.querySelector('#add-comment-text');
      commentForm.onsubmit = async (e) => {
        e.preventDefault();
        const val = commentText.value.trim();
        if (!val) return;
        const res = await API.createComment(task.id, val);
        commentText.value = '';
        await this.loadTaskComments(task.id, commentsFeed);
        this.showToast('Comment added', 'Your note was posted to the task', 'success');
      };

      // Typing broadcast
      commentText.oninput = () => {
        WSClient.sendTyping(task.id);
      };

      // Open Modal using standard modern HTML showModal()
      dialog.showModal();
    } catch (err) {
      console.error('Failed to open task modal:', err);
      this.showToast('Error', 'Could not open task details', 'danger');
    }
  },

  renderModalSubtasks(subtasks, container, taskId) {
    if (!container) return;
    container.innerHTML = '';
    subtasks.forEach(s => {
      const item = document.createElement('div');
      item.className = 'checklist-item';
      item.innerHTML = `
        <div class="checklist-item-left">
          <input type="checkbox" class="checklist-checkbox" ${s.completed ? 'checked' : ''}>
          <span class="checklist-item-title ${s.completed ? 'completed' : ''}">${this.escapeHtml(s.title)}</span>
        </div>
        <button class="checklist-delete-btn" title="Delete subtask">&times;</button>
      `;

      item.querySelector('.checklist-checkbox').onchange = async (e) => {
        s.completed = e.target.checked ? 1 : 0;
        await API.toggleSubtask(taskId, s.id, s.completed);
        this.renderModalSubtasks(subtasks, container, taskId);
        this.renderCurrentView();
      };

      item.querySelector('.checklist-delete-btn').onclick = async () => {
        await API.deleteSubtask(taskId, s.id);
        const idx = subtasks.findIndex(sub => sub.id === s.id);
        if (idx !== -1) subtasks.splice(idx, 1);
        this.renderModalSubtasks(subtasks, container, taskId);
        this.renderCurrentView();
      };

      container.appendChild(item);
    });
  },

  async loadTaskComments(taskId, container) {
    if (!container) return;
    try {
      const res = await API.getComments(taskId);
      container.innerHTML = '';
      if (!res.comments || res.comments.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">No comments yet. Start the conversation below!</div>';
        return;
      }
      res.comments.forEach(c => {
        const card = document.createElement('div');
        card.className = 'comment-card';
        card.innerHTML = `
          <div class="user-avatar-circle" style="background-color: ${c.avatar_color}; width: 32px; height: 32px; flex-shrink: 0;">
            ${this.getInitials(c.user_name)}
          </div>
          <div class="comment-content-box">
            <div class="comment-header">
              <span class="comment-author-name">${this.escapeHtml(c.user_name)}</span>
              <span class="comment-date">${this.formatRelativeTime(c.created_at)}</span>
            </div>
            <div class="comment-text">${this.escapeHtml(c.content)}</div>
          </div>
        `;
        container.appendChild(card);
      });
      // Scroll to bottom
      container.scrollTop = container.scrollHeight;
    } catch (err) {
      console.warn('Failed to load comments:', err);
    }
  },

  // Open New Task Modal
  openNewTaskModal(columnId = null, defaultDueDate = null) {
    const dialog = document.getElementById('new-task-modal');
    if (!dialog) return;

    const colSelect = dialog.querySelector('#new-task-column');
    const assigneesContainer = dialog.querySelector('#new-task-assignees');
    const dueInput = dialog.querySelector('#new-task-due');

    if (dueInput) {
      dueInput.value = defaultDueDate || '';
    }

    const defaultCol = columnId || AppState.currentProject?.columns?.[0]?.id;

    if (colSelect) {
      colSelect.innerHTML = (AppState.currentProject.columns || []).map(c => `
        <option value="${c.id}" ${c.id === defaultCol ? 'selected' : ''}>${this.escapeHtml(c.title)}</option>
      `).join('');
    }

    if (assigneesContainer) {
      assigneesContainer.innerHTML = (AppState.currentProject.members || []).map(m => `
        <label class="assignee-checkbox-item">
          <input type="checkbox" value="${m.id}" class="new-assignee-check">
          <div class="card-avatar" style="background-color: ${m.avatar_color}; width: 20px; height: 20px; font-size: 0.6rem;">
            ${this.getInitials(m.name)}
          </div>
          <span>${this.escapeHtml(m.name)}</span>
        </label>
      `).join('');
    }

    dialog.showModal();
  },

  // Open New Project Modal
  openNewProjectModal() {
    const dialog = document.getElementById('new-project-modal');
    if (dialog) dialog.showModal();
  },

  // Open Invite Member Modal
  openInviteModal() {
    const dialog = document.getElementById('invite-modal');
    if (!dialog) return;

    const usersList = dialog.querySelector('#invite-users-list');
    if (usersList) {
      usersList.innerHTML = AppState.allUsers.map(u => {
        const isAlready = (AppState.currentProject.members || []).some(m => m.id === u.id);
        return `
          <div class="demo-user-card" style="padding: 10px; margin-bottom: 6px;">
            <div class="demo-user-info">
              <div class="user-avatar-circle" style="background-color: ${u.avatarColor}; width: 32px; height: 32px;">
                ${this.getInitials(u.name)}
              </div>
              <div class="demo-user-details">
                <span class="demo-user-name">${this.escapeHtml(u.name)}</span>
                <span class="demo-user-role">${this.escapeHtml(u.email)}</span>
              </div>
            </div>
            ${isAlready ? '<span class="project-nav-badge">Member</span>' : `<button class="btn-primary btn-invite-user" data-uid="${u.id}" style="padding: 4px 10px; font-size: 0.78rem;">Add</button>`}
          </div>
        `;
      }).join('');

      usersList.querySelectorAll('.btn-invite-user').forEach(btn => {
        btn.onclick = async () => {
          const uid = parseInt(btn.dataset.uid, 10);
          await API.addMember(AppState.currentProject.id, { userId: uid });
          dialog.close();
          const fresh = await API.getProject(AppState.currentProject.id);
          AppState.setCurrentProject(fresh.project);
          this.showToast('Member added', 'Teammate was invited to the project', 'success');
        };
      });
    }

    dialog.showModal();
  },

  // Open Settings Modal
  openSettingsModal() {
    const dialog = document.getElementById('settings-modal');
    if (!dialog) return;

    const p = AppState.currentProject;
    const u = AppState.currentUser;

    // Populate active project settings
    const nameInput = dialog.querySelector('#settings-proj-name');
    const catSelect = dialog.querySelector('#settings-proj-category');
    const descInput = dialog.querySelector('#settings-proj-desc');

    if (p) {
      if (nameInput) nameInput.value = p.title || '';
      if (catSelect) catSelect.value = p.category || 'Product Engineering';
      if (descInput) descInput.value = p.description || '';
    }

    // Populate user profile
    const userName = dialog.querySelector('#settings-user-name');
    const userEmail = dialog.querySelector('#settings-user-email');
    const userAvatar = dialog.querySelector('#settings-user-avatar');

    if (u) {
      if (userName) userName.textContent = u.name;
      if (userEmail) userEmail.textContent = `${u.email} • ${u.role || 'Member'}`;
      if (userAvatar) {
        userAvatar.textContent = this.getInitials(u.name);
        userAvatar.style.backgroundColor = u.avatarColor || 'var(--accent-primary)';
      }
    }

    // Active accent color swatch
    dialog.querySelectorAll('#settings-accent-swatches .color-swatch').forEach(swatch => {
      if (swatch.dataset.color.toLowerCase() === AppState.accentColor.toLowerCase()) {
        swatch.classList.add('active');
      } else {
        swatch.classList.remove('active');
      }
      swatch.onclick = () => {
        dialog.querySelectorAll('#settings-accent-swatches .color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        AppState.setAccentColor(swatch.dataset.color);
        this.showToast('Accent Updated', `Theme accent set to ${swatch.title || swatch.dataset.color}`, 'info');
      };
    });

    // Theme buttons in settings
    const darkBtn = dialog.querySelector('#settings-theme-dark-btn');
    const lightBtn = dialog.querySelector('#settings-theme-light-btn');
    if (darkBtn) {
      darkBtn.onclick = () => {
        AppState.setTheme('dark');
        this.renderTheme();
        this.showToast('Theme', 'Switched to Dark Mode', 'info');
      };
    }
    if (lightBtn) {
      lightBtn.onclick = () => {
        AppState.setTheme('light');
        this.renderTheme();
        this.showToast('Theme', 'Switched to Light Mode', 'info');
      };
    }

    // Glass blur select
    const blurSelect = dialog.querySelector('#settings-blur-select');
    if (blurSelect) {
      blurSelect.value = AppState.blurLevel || 'balanced';
      blurSelect.onchange = (e) => {
        AppState.setBlurLevel(e.target.value);
        this.showToast('Blur Adjusted', `Glass effect set to ${e.target.value}`, 'info');
      };
    }

    // Compact cards toggle
    const compactToggle = dialog.querySelector('#settings-compact-cards-toggle');
    if (compactToggle) {
      compactToggle.checked = !!AppState.compactCards;
      compactToggle.onchange = (e) => {
        AppState.setCompactCards(e.target.checked);
        this.renderCurrentView();
        this.showToast('Preference', e.target.checked ? 'Compact cards enabled' : 'Full cards enabled', 'info');
      };
    }

    // Sound toggle
    const soundToggle = dialog.querySelector('#settings-sound-toggle');
    if (soundToggle) {
      soundToggle.checked = !!AppState.soundEnabled;
      soundToggle.onchange = (e) => {
        AppState.soundEnabled = e.target.checked;
        localStorage.setItem('pmt_sound', e.target.checked ? 'true' : 'false');
        localStorage.setItem('nexus_sound', e.target.checked ? 'true' : 'false');
      };
    }



    // Populate user profile info in settings modal
    const sAvatar = dialog.querySelector('#settings-user-avatar');
    const sName = dialog.querySelector('#settings-user-name');
    const sEmail = dialog.querySelector('#settings-user-email');
    const curUser = AppState.currentUser;
    if (curUser) {
      if (sAvatar) {
        sAvatar.textContent = this.getInitials(curUser.name);
        sAvatar.style.backgroundColor = curUser.avatarColor || 'var(--accent-primary)';
      }
      if (sName) sName.textContent = curUser.name;
      if (sEmail) sEmail.textContent = `${curUser.email} • ${curUser.role || 'Team Member'}`;
    } else {
      if (sAvatar) {
        sAvatar.textContent = '👤';
        sAvatar.style.backgroundColor = 'var(--text-muted)';
      }
      if (sName) sName.textContent = 'Guest / Signed Out';
      if (sEmail) sEmail.textContent = 'Sign in or register a new ID';
    }

    // Form submit for project update
    const projForm = dialog.querySelector('#settings-project-form');
    if (projForm) {
      projForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!AppState.currentProject) return;

        const newTitle = nameInput.value.trim();
        const newCat = catSelect.value;
        const newDesc = descInput.value.trim();

        try {
          const res = await API.updateProject(AppState.currentProject.id, {
            title: newTitle,
            category: newCat,
            description: newDesc
          });

          AppState.setCurrentProject(res.project);
          // Update in projects list too
          const pIdx = AppState.projects.findIndex(pr => pr.id === res.project.id);
          if (pIdx !== -1) {
            AppState.projects[pIdx].title = res.project.title;
            AppState.projects[pIdx].category = res.project.category;
          }

          this.renderCurrentView();
          this.showToast('Project Saved', `Updated "${newTitle}" settings`, 'success');
        } catch (err) {
          console.error('Failed to update project settings:', err);
          this.showToast('Error', err.message, 'danger');
        }
      };
    }

    dialog.showModal();
  },

  // Show Main Application Workspace
  showApp() {
    const authScreen = document.getElementById('auth-screen');
    const appRoot = document.getElementById('app-root');
    if (authScreen) authScreen.style.display = 'none';
    if (appRoot) appRoot.style.display = 'flex';
  },

  // Show Full-Screen Authentication / Login Panel (Shown when logged out)
  showAuthScreen(initialTab = 'login') {
    const authScreen = document.getElementById('auth-screen');
    const appRoot = document.getElementById('app-root');
    if (appRoot) appRoot.style.display = 'none';
    if (authScreen) authScreen.style.display = 'flex';

    // Close all open dialog modals
    document.querySelectorAll('dialog[open]').forEach(d => d.close());

    // Close any open dropdowns
    document.getElementById('user-menu-dropdown')?.classList.remove('show');
    document.getElementById('project-selector-dropdown')?.classList.remove('show');
    document.getElementById('notifications-dropdown')?.classList.remove('show');

    const loginTab = document.getElementById('tab-auth-login');
    const registerTab = document.getElementById('tab-auth-register');
    const loginForm = document.getElementById('form-auth-login');
    const registerForm = document.getElementById('form-auth-register');

    if (initialTab === 'register') {
      loginTab?.classList.remove('active');
      registerTab?.classList.add('active');
      if (loginForm) loginForm.style.display = 'none';
      if (registerForm) registerForm.style.display = 'flex';
    } else {
      registerTab?.classList.remove('active');
      loginTab?.classList.add('active');
      if (loginForm) loginForm.style.display = 'flex';
      if (registerForm) registerForm.style.display = 'none';
    }
  },

  openAuthModal(initialTab = 'login') {
    this.showAuthScreen(initialTab);
  },

  // Switch user session & sync state across projects, ws, and views
  async switchUserSession(user) {
    this.showApp();
    AppState.setCurrentUser(user);
    this.updateUserUI();

    // Re-authenticate WebSocket
    if (WSClient.socket && WSClient.socket.readyState === WebSocket.OPEN) {
      WSClient.send({ type: 'auth', token: API.getToken() });
    } else {
      WSClient.connect();
    }

    // Reload Projects
    try {
      const projectsRes = await API.getProjects();
      const projects = projectsRes.projects || [];
      AppState.setProjects(projects);
      if (projects.length > 0) {
        const stillInCurrent = AppState.currentProject && projects.some(p => p.id === AppState.currentProject.id);
        const targetId = stillInCurrent ? AppState.currentProject.id : projects[0].id;
        await this.selectProject(targetId);
      } else {
        AppState.setCurrentProject(null);
        this.renderSidebarProjects();
        this.renderCurrentView();
      }
    } catch (err) {
      console.warn('Failed to reload projects after user switch:', err);
    }

    // Reload Notifications
    try {
      const notifs = await API.getNotifications();
      AppState.setNotifications(notifs.notifications || [], notifs.unreadCount || 0);
      this.renderNotifications();
    } catch (err) {
      console.warn('Failed to reload notifications:', err);
    }

    // Refresh Users Directory
    try {
      const usersRes = await API.getAllUsers();
      AppState.allUsers = usersRes.users || [];
    } catch (err) {
      console.warn('Failed to reload users directory:', err);
    }
  },

  // Open Delete Account Confirmation Modal (Requires Password)
  openDeleteAccountModal() {
    const dialog = document.getElementById('delete-account-modal');
    if (!dialog) return;
    const form = dialog.querySelector('#form-delete-account');
    if (form) form.reset();
    dialog.showModal();
  },

  // Logout session (hides app workspace, shows only auth screen)
  logout() {
    API.setToken(null);
    AppState.setCurrentUser(null);
    this.updateUserUI();
    if (WSClient.socket) {
      try { WSClient.socket.close(); } catch (e) {}
    }
    this.showAuthScreen('login');
    this.showToast('Logged Out', 'You have been signed out. Please sign in or create an ID.', 'info');
  },

  // Bind Global Clicks & Menus
  bindGlobalEvents() {
    // Theme toggle button clicks (Navbar and Auth screen)
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.onclick = () => {
        const next = AppState.theme === 'dark' ? 'light' : 'dark';
        AppState.setTheme(next);
        this.renderTheme();
        this.showToast('Theme Changed', `Switched to ${next === 'dark' ? 'Dark Mode 🌙' : 'Light Mode ☀️'}`, 'info');
      };
    }

    const authThemeBtn = document.getElementById('auth-theme-toggle-btn');
    if (authThemeBtn) {
      authThemeBtn.onclick = () => {
        const next = AppState.theme === 'dark' ? 'light' : 'dark';
        AppState.setTheme(next);
        this.renderTheme();
      };
    }

    // Auth screen tabs & links
    const loginTab = document.getElementById('tab-auth-login');
    const registerTab = document.getElementById('tab-auth-register');
    if (loginTab) loginTab.onclick = () => this.showAuthScreen('login');
    if (registerTab) registerTab.onclick = () => this.showAuthScreen('register');

    const linkToReg = document.getElementById('link-switch-to-register');
    if (linkToReg) {
      linkToReg.onclick = (e) => {
        e.preventDefault();
        this.showAuthScreen('register');
      };
    }

    const linkToLogin = document.getElementById('link-switch-to-login');
    if (linkToLogin) {
      linkToLogin.onclick = (e) => {
        e.preventDefault();
        this.showAuthScreen('login');
      };
    }

    // Register avatar swatches
    const regSwatches = document.querySelectorAll('#reg-avatar-swatches .color-swatch');
    regSwatches.forEach(swatch => {
      swatch.onclick = () => {
        regSwatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      };
    });

    // Quick Toolbar Filter Chips
    document.querySelectorAll('.quick-filter-chip').forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll('.quick-filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        AppState.setQuickFilter(chip.dataset.filter || 'all');
        this.renderCurrentView();
      };
    });

    // Toolbar Sort Select
    const sortSelect = document.getElementById('sort-tasks-select');
    if (sortSelect) {
      sortSelect.onchange = (e) => {
        AppState.setSort(e.target.value);
        this.renderCurrentView();
      };
    }

    // Export Project CSV button
    const exportBtn = document.getElementById('export-project-btn');
    if (exportBtn) {
      exportBtn.onclick = () => {
        this.exportProjectToCSV();
      };
    }

    // Shortcuts Help button
    const shortcutsBtn = document.getElementById('shortcuts-help-btn');
    if (shortcutsBtn) {
      shortcutsBtn.onclick = () => {
        this.openShortcutsModal();
      };
    }

    // Archive Done Tasks button
    const archiveBtn = document.getElementById('archive-done-btn');
    if (archiveBtn) {
      archiveBtn.onclick = async () => {
        const project = AppState.currentProject;
        if (!project) return;
        const doneCol = (project.columns || []).find(c => c.title.toLowerCase().includes('done'));
        const doneTasksCount = (project.tasks || []).filter(t => t.column_id === doneCol?.id).length;
        if (doneTasksCount === 0) {
          this.showToast('Nothing to Archive', 'No completed tasks found in Done column.', 'info');
          return;
        }
        if (confirm(`Archive ${doneTasksCount} completed tasks in the Done column?`)) {
          try {
            const res = await API.archiveDoneTasks(project.id);
            project.tasks = res.tasks;
            this.playSound('success');
            this.renderCurrentView();
            this.showToast('Tasks Archived 📦', `${res.archivedCount} completed tasks archived`, 'success');
          } catch (err) {
            this.showToast('Error', err.message || 'Failed to archive tasks', 'danger');
          }
        }
      };
    }

    // Top New Task button
    const topNewTaskBtn = document.getElementById('top-new-task-btn');
    if (topNewTaskBtn) {
      topNewTaskBtn.onclick = () => {
        this.openNewTaskModal();
      };
    }

    // Global Pro Keyboard Shortcuts Listener
    document.addEventListener('keydown', (e) => {
      // Focus search on Ctrl+K or '/'
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.focus();
        return;
      }

      const activeTag = (document.activeElement && document.activeElement.tagName) || '';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || document.activeElement?.isContentEditable) {
        return; // Don't trigger when user is typing text
      }

      if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.focus();
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this.openNewTaskModal();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        AppState.setActiveView('board');
        this.renderCurrentView();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        AppState.setActiveView('calendar');
        this.renderCurrentView();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        AppState.setActiveView('list');
        this.renderCurrentView();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        AppState.setActiveView('analytics');
        this.renderCurrentView();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        AppState.setActiveView('team');
        this.renderCurrentView();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        this.exportProjectToCSV();
      } else if (e.key === '?') {
        e.preventDefault();
        this.openShortcutsModal();
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const next = AppState.theme === 'dark' ? 'light' : 'dark';
        AppState.setTheme(next);
        this.renderTheme();
        this.showToast('Theme Shortcut [D]', `Switched to ${next === 'dark' ? 'Dark Mode 🌙' : 'Light Mode ☀️'}`, 'info');
      }
    });

    // View tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.onclick = () => {
        AppState.setActiveView(tab.dataset.view);
        this.renderCurrentView();
      };
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        AppState.setFilters({ search: e.target.value });
        this.renderCurrentView();
      };
    }

    // Priority filter pills in sidebar
    document.querySelectorAll('.filter-pill-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        AppState.setFilters({ priority: btn.dataset.priority || 'all' });
        this.renderCurrentView();
      };
    });

    // Dropdown toggles
    const notifBtn = document.getElementById('notifications-btn');
    const notifDropdown = document.getElementById('notifications-dropdown');
    if (notifBtn && notifDropdown) {
      notifBtn.onclick = (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('show');
        document.getElementById('user-menu-dropdown')?.classList.remove('show');
      };
    }

    const userBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-menu-dropdown');
    if (userBtn && userDropdown) {
      userBtn.onclick = (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('show');
        notifDropdown?.classList.remove('show');
      };
    }

    // Settings button
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        this.openSettingsModal();
      };
    }

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
      notifDropdown?.classList.remove('show');
      userDropdown?.classList.remove('show');
      document.getElementById('project-selector-dropdown')?.classList.remove('show');
    });

    // Mark all notifications read
    const markAllBtn = document.getElementById('mark-all-read-btn');
    if (markAllBtn) {
      markAllBtn.onclick = async () => {
        await API.markAllNotificationsRead();
        AppState.unreadNotifsCount = 0;
        document.getElementById('notif-badge').style.display = 'none';
        const notifList = document.getElementById('notif-items-list');
        if (notifList) {
          notifList.querySelectorAll('.notif-card').forEach(c => c.classList.remove('unread'));
        }
      };
    }

    // Modal close buttons (all modals)
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.onclick = () => {
        const dialog = btn.closest('dialog');
        if (dialog) dialog.close();
      };
    });

    // Light dismiss dialogs on backdrop click
    document.querySelectorAll('dialog').forEach(dialog => {
      dialog.addEventListener('click', (e) => {
        const rect = dialog.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
          dialog.close();
        }
      });
    });

    // User dropdown options: Switch Account & Delete Account
    const dropdownSwitchBtn = document.getElementById('dropdown-switch-btn');
    if (dropdownSwitchBtn) {
      dropdownSwitchBtn.onclick = () => {
        userDropdown?.classList.remove('show');
        this.logout();
      };
    }

    const dropdownDeleteBtn = document.getElementById('dropdown-delete-btn');
    if (dropdownDeleteBtn) {
      dropdownDeleteBtn.onclick = () => {
        userDropdown?.classList.remove('show');
        this.openDeleteAccountModal();
      };
    }

    const dropdownLogoutBtn = document.getElementById('dropdown-logout-btn');
    if (dropdownLogoutBtn) {
      dropdownLogoutBtn.onclick = () => {
        userDropdown?.classList.remove('show');
        this.logout();
      };
    }

    // Demo user switcher items
    document.querySelectorAll('.demo-user-item').forEach(item => {
      item.onclick = async () => {
        const uid = parseInt(item.dataset.userId, 10);
        try {
          const res = await API.demoLogin(uid);
          await this.switchUserSession(res.user);
          userDropdown?.classList.remove('show');
          this.showToast('Teammate Switched', `Logged in as ${res.user.name}`, 'info');
        } catch (err) {
          console.error('Demo login switch error:', err);
          this.showToast('Error', err.message, 'danger');
        }
      };
    });
  },

  renderNotifications() {
    const list = document.getElementById('notif-items-list');
    const badge = document.getElementById('notif-badge');
    if (!list) return;

    if (badge) {
      if (AppState.unreadNotifsCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = AppState.unreadNotifsCount;
      } else {
        badge.style.display = 'none';
      }
    }

    if (AppState.notifications.length === 0) {
      list.innerHTML = '<div style="padding: 16px; color: var(--text-muted); font-size: 0.8rem; text-align: center;">No notifications</div>';
      return;
    }

    list.innerHTML = AppState.notifications.map(n => `
      <div class="notif-card ${n.is_read ? '' : 'unread'}" data-notif-id="${n.id}" data-task-id="${n.task_id || ''}">
        ${n.is_read ? '' : '<div class="notif-dot"></div>'}
        <div class="notif-text">
          <div>${this.escapeHtml(n.message)}</div>
          <div class="notif-timestamp">${this.formatRelativeTime(n.created_at)}</div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.notif-card').forEach(card => {
      card.onclick = async () => {
        const notifId = card.dataset.notifId;
        const taskId = card.dataset.taskId;
        if (notifId) {
          await API.markNotificationRead(notifId);
          card.classList.remove('unread');
          card.querySelector('.notif-dot')?.remove();
        }
        if (taskId) {
          this.openTaskModal(parseInt(taskId, 10));
        }
      };
    });
  }
};

window.UI = UI;
