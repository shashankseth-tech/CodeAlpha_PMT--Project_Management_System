// Central Application State

const AppState = {
  currentUser: null,
  allUsers: [],
  projects: [],
  currentProject: null,
  activeView: 'board', // 'board' | 'calendar' | 'list' | 'analytics' | 'team'
  calendarDate: new Date(),
  filters: {
    search: '',
    priority: 'all',
    assigneeId: 'all',
    quickFilter: 'all'
  },
  sortBy: 'default', // 'default' | 'due-date' | 'priority' | 'title'
  activeTask: null, // Full task object for modal
  notifications: [],
  unreadNotifsCount: 0,
  presenceMembers: [],
  theme: localStorage.getItem('pmt_theme') || localStorage.getItem('nexus_theme') || 'dark',
  accentColor: localStorage.getItem('pmt_accent') || localStorage.getItem('nexus_accent') || '#3b82f6',
  compactCards: (localStorage.getItem('pmt_compact') || localStorage.getItem('nexus_compact')) === 'true',
  soundEnabled: (localStorage.getItem('pmt_sound') || localStorage.getItem('nexus_sound')) !== 'false',
  blurLevel: localStorage.getItem('pmt_blur') || localStorage.getItem('nexus_blur') || 'balanced',

  prevCalendarMonth() {
    this.calendarDate = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth() - 1, 1);
    this.notify('calendar_date_changed', this.calendarDate);
  },
  nextCalendarMonth() {
    this.calendarDate = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth() + 1, 1);
    this.notify('calendar_date_changed', this.calendarDate);
  },
  resetCalendarMonth() {
    this.calendarDate = new Date();
    this.notify('calendar_date_changed', this.calendarDate);
  },

  subscribers: new Set(),

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  },

  notify(event, payload) {
    this.subscribers.forEach(cb => {
      try { cb(event, payload, this); } catch (err) { console.error('State subscriber error:', err); }
    });
  },

  setTheme(theme) {
    this.theme = theme;
    localStorage.setItem('pmt_theme', theme);
    localStorage.setItem('nexus_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.notify('theme_changed', theme);
  },

  setAccentColor(color) {
    this.accentColor = color;
    localStorage.setItem('pmt_accent', color);
    localStorage.setItem('nexus_accent', color);
    document.documentElement.style.setProperty('--accent-primary', color);
    document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${color} 0%, ${color} 100%)`);
    this.notify('accent_changed', color);
  },

  setCompactCards(enabled) {
    this.compactCards = !!enabled;
    localStorage.setItem('pmt_compact', this.compactCards ? 'true' : 'false');
    localStorage.setItem('nexus_compact', this.compactCards ? 'true' : 'false');
    document.body.classList.toggle('compact-view', this.compactCards);
    this.notify('preference_changed', { compactCards: this.compactCards });
  },

  setBlurLevel(level) {
    this.blurLevel = level;
    localStorage.setItem('pmt_blur', level);
    localStorage.setItem('nexus_blur', level);
    const blurMap = {
      soft: 'blur(12px) saturate(140%)',
      balanced: 'blur(22px) saturate(160%)',
      ultra: 'blur(34px) saturate(180%)'
    };
    document.documentElement.style.setProperty('--glass-blur', blurMap[level] || blurMap.balanced);
    this.notify('blur_changed', level);
  },

  setCurrentUser(user) {
    this.currentUser = user;
    this.notify('user_changed', user);
  },

  setProjects(projects) {
    this.projects = projects;
    this.notify('projects_loaded', projects);
  },

  setCurrentProject(project) {
    this.currentProject = project;
    this.notify('project_changed', project);
  },

  setActiveView(view) {
    this.activeView = view;
    this.notify('view_changed', view);
  },

  setFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
    this.notify('filters_changed', this.filters);
  },

  setActiveTask(task) {
    this.activeTask = task;
    this.notify('active_task_changed', task);
  },

  setNotifications(notifications, unreadCount) {
    this.notifications = notifications;
    this.unreadNotifsCount = unreadCount;
    this.notify('notifications_updated', { notifications, unreadCount });
  },

  setPresenceMembers(members) {
    this.presenceMembers = members;
    this.notify('presence_updated', members);
  },

  setSort(sort) {
    this.sortBy = sort;
    this.notify('sort_changed', sort);
  },

  setQuickFilter(qf) {
    this.filters.quickFilter = qf;
    this.notify('filters_changed', this.filters);
  },

  isOverdue(dateStr) {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr);
    return d < today;
  },

  // Helper to get filtered and sorted tasks in current project
  getFilteredTasks() {
    if (!this.currentProject || !this.currentProject.tasks) return [];
    let list = [...this.currentProject.tasks];

    // Search query filter
    if (this.filters.search && this.filters.search.trim()) {
      const q = this.filters.search.toLowerCase().trim();
      list = list.filter(t => {
        const titleMatch = (t.title || '').toLowerCase().includes(q);
        const descMatch = (t.description || '').toLowerCase().includes(q);
        const labelMatch = (t.labels || []).some(l => l.toLowerCase().includes(q));
        return titleMatch || descMatch || labelMatch;
      });
    }

    // Sidebar Priority filter
    if (this.filters.priority !== 'all') {
      list = list.filter(t => (t.priority || '').toLowerCase() === this.filters.priority.toLowerCase());
    }

    // Sidebar Assignee filter
    if (this.filters.assigneeId !== 'all') {
      const uid = parseInt(this.filters.assigneeId, 10);
      list = list.filter(t => (t.assignees || []).some(a => a.id === uid));
    }

    // Quick Toolbar Filters
    if (this.filters.quickFilter === 'my-tasks') {
      if (this.currentUser) {
        list = list.filter(t => (t.assignees || []).some(a => a.id === this.currentUser.id));
      }
    } else if (this.filters.quickFilter === 'urgent') {
      list = list.filter(t => (t.priority || '').toLowerCase() === 'urgent');
    } else if (this.filters.quickFilter === 'overdue') {
      const doneCol = (this.currentProject.columns || []).find(c => c.title.toLowerCase().includes('done'));
      list = list.filter(t => this.isOverdue(t.due_date) && t.column_id !== doneCol?.id);
    }

    // Sorting
    if (this.sortBy === 'due-date') {
      list.sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      });
    } else if (this.sortBy === 'priority') {
      const prioWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
      list.sort((a, b) => {
        const wA = prioWeight[(a.priority || 'medium').toLowerCase()] || 0;
        const wB = prioWeight[(b.priority || 'medium').toLowerCase()] || 0;
        return wB - wA;
      });
    } else if (this.sortBy === 'title') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    return list;
  }
};

window.AppState = AppState;
