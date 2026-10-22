// PMT REST API Client

const API = {
  baseUrl: '/api',

  getToken() {
    return localStorage.getItem('pmt_token') || localStorage.getItem('nexuspm_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('pmt_token', token);
      localStorage.setItem('nexuspm_token', token);
    } else {
      localStorage.removeItem('pmt_token');
      localStorage.removeItem('nexuspm_token');
    }
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
  },

  // Auth
  async login(email, password) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(res.token);
    return res;
  },

  async register(name, email, password, avatarColor, role) {
    const res = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, avatarColor, role })
    });
    this.setToken(res.token);
    return res;
  },

  async demoLogin(userId) {
    const res = await this.request('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
    this.setToken(res.token);
    return res;
  },

  async getMe() {
    return this.request('/auth/me');
  },

  async getAllUsers() {
    return this.request('/auth/users');
  },

  async deleteAccount(password) {
    return this.request('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password })
    });
  },

  // Projects
  async getProjects() {
    return this.request('/projects');
  },

  async getProject(id) {
    return this.request(`/projects/${id}`);
  },

  async createProject(data) {
    return this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateProject(id, data) {
    return this.request(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteProject(id) {
    return this.request(`/projects/${id}`, {
      method: 'DELETE'
    });
  },

  async addMember(projectId, memberData) {
    return this.request(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(memberData)
    });
  },

  async removeMember(projectId, userId) {
    return this.request(`/projects/${projectId}/members/${userId}`, {
      method: 'DELETE'
    });
  },

  async getActivities(projectId) {
    return this.request(`/projects/${projectId}/activities`);
  },

  // Columns
  async addColumn(projectId, title) {
    return this.request(`/projects/${projectId}/columns`, {
      method: 'POST',
      body: JSON.stringify({ title })
    });
  },

  async updateColumn(projectId, colId, title) {
    return this.request(`/projects/${projectId}/columns/${colId}`, {
      method: 'PUT',
      body: JSON.stringify({ title })
    });
  },

  async deleteColumn(projectId, colId) {
    return this.request(`/projects/${projectId}/columns/${colId}`, {
      method: 'DELETE'
    });
  },

  async archiveDoneTasks(projectId) {
    return this.request(`/projects/${projectId}/archive-done`, {
      method: 'POST'
    });
  },

  // Tasks
  async createTask(projectIdOrData, maybeData) {
    let pId = projectIdOrData;
    let data = maybeData;
    if (typeof projectIdOrData === 'object' && projectIdOrData !== null) {
      pId = projectIdOrData.projectId;
      data = projectIdOrData;
    }
    return this.request(`/projects/${pId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getTask(id) {
    return this.request(`/tasks/${id}`);
  },

  async updateTask(id, data) {
    return this.request(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async moveTask(id, targetColumnId, newIndex) {
    return this.request(`/tasks/${id}/move`, {
      method: 'PUT',
      body: JSON.stringify({ targetColumnId, newIndex })
    });
  },

  async deleteTask(id) {
    return this.request(`/tasks/${id}`, {
      method: 'DELETE'
    });
  },

  // Subtasks
  async addSubtask(taskId, title) {
    return this.request(`/tasks/${taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title })
    });
  },

  async toggleSubtask(taskId, subtaskId, completed) {
    return this.request(`/tasks/${taskId}/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed })
    });
  },

  async deleteSubtask(taskId, subtaskId) {
    return this.request(`/tasks/${taskId}/subtasks/${subtaskId}`, {
      method: 'DELETE'
    });
  },

  // Comments
  async getComments(taskId) {
    return this.request(`/tasks/${taskId}/comments`);
  },

  async createComment(taskId, content) {
    return this.request(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  },

  async deleteComment(taskId, commentId) {
    return this.request(`/tasks/${taskId}/comments/${commentId}`, {
      method: 'DELETE'
    });
  },

  // Notifications
  async getNotifications() {
    return this.request('/notifications');
  },

  async markNotificationRead(id) {
    return this.request(`/notifications/${id}/read`, {
      method: 'PATCH'
    });
  },

  async markAllNotificationsRead() {
    return this.request('/notifications/read-all', {
      method: 'POST'
    });
  }
};

window.API = API;
