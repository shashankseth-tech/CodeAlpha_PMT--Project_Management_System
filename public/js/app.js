// Application Bootstrap & WebSocket Synchronization

document.addEventListener('DOMContentLoaded', async () => {
  UI.init();
  DragDrop.init();

  // Setup WebSocket and Form Listeners
  WSClient.init();
  setupWebSocketListeners();
  bindFormSubmissions();

  try {
    // 1. Verify Authentication from stored token
    let token = API.getToken();
    let me = null;

    if (token) {
      try {
        const res = await API.getMe();
        me = res.user;
      } catch (err) {
        console.warn('Existing token invalid or expired');
        API.setToken(null);
      }
    }

    if (me) {
      // Authenticated session exists -> Reveal full workspace
      await UI.switchUserSession(me);
    } else {
      // Unauthenticated -> Show ONLY the auth/login panel!
      UI.showAuthScreen('login');
    }

  } catch (err) {
    console.error('App bootstrap error:', err);
    UI.showAuthScreen('login');
  }
});

function setupWebSocketListeners() {
  // When another teammate creates a task
  WSClient.on('task_created', (data) => {
    if (!data.task) return;
    const project = AppState.currentProject;
    if (project && project.id === data.task.project_id) {
      // Check if already in tasks
      if (!project.tasks.some(t => t.id === data.task.id)) {
        project.tasks.push(data.task);
        UI.renderCurrentView();
        UI.showToast('New Task', `"${data.task.title}" was created by ${data.task.creator_name}`, 'info');
      }
    }
  });

  // When another teammate moves a task
  WSClient.on('task_moved', (data) => {
    const project = AppState.currentProject;
    if (project && project.id === data.task?.project_id) {
      const idx = project.tasks.findIndex(t => t.id === data.taskId);
      if (idx !== -1) {
        project.tasks[idx] = data.task;
        UI.renderCurrentView();
      }
    }
  });

  // When a task is updated
  WSClient.on('task_updated', (data) => {
    const project = AppState.currentProject;
    if (project && project.id === data.task?.project_id) {
      const idx = project.tasks.findIndex(t => t.id === data.task.id);
      if (idx !== -1) {
        project.tasks[idx] = data.task;
        UI.renderCurrentView();
      }
    }
  });

  // When a task is deleted
  WSClient.on('task_deleted', (data) => {
    const project = AppState.currentProject;
    if (project) {
      project.tasks = project.tasks.filter(t => t.id !== data.taskId);
      UI.renderCurrentView();
    }
  });

  // When a comment is added
  WSClient.on('comment_created', (data) => {
    const project = AppState.currentProject;
    if (project) {
      const task = project.tasks.find(t => t.id === data.taskId);
      if (task) {
        task.commentCount = (task.commentCount || 0) + 1;
        UI.renderCurrentView();
      }
    }

    // If modal is open for this task, append to comments feed
    const dialog = document.getElementById('task-modal');
    if (dialog && dialog.open && AppState.activeTask?.id === data.taskId) {
      const feed = dialog.querySelector('#modal-comments-feed');
      if (feed && data.comment) {
        // If "no comments" message was present, clear it
        if (feed.querySelector('div[style*="italic"]')) {
          feed.innerHTML = '';
        }
        const card = document.createElement('div');
        card.className = 'comment-card';
        card.innerHTML = `
          <div class="user-avatar-circle" style="background-color: ${data.comment.avatar_color}; width: 32px; height: 32px; flex-shrink: 0;">
            ${UI.getInitials(data.comment.user_name)}
          </div>
          <div class="comment-content-box">
            <div class="comment-header">
              <span class="comment-author-name">${UI.escapeHtml(data.comment.user_name)}</span>
              <span class="comment-date">Just now</span>
            </div>
            <div class="comment-text">${UI.escapeHtml(data.comment.content)}</div>
          </div>
        `;
        feed.appendChild(card);
        feed.scrollTop = feed.scrollHeight;
      }
    }
  });

  // When a teammate is typing
  WSClient.on('user_typing', (data) => {
    const dialog = document.getElementById('task-modal');
    if (dialog && dialog.open && AppState.activeTask?.id === data.taskId) {
      const typingEl = dialog.querySelector('#typing-indicator');
      if (typingEl) {
        typingEl.textContent = `${data.user.name} is typing...`;
        clearTimeout(typingEl._timer);
        typingEl._timer = setTimeout(() => {
          typingEl.textContent = '';
        }, 2500);
      }
    }
  });

  // Real-time personal notification
  WSClient.on('new_notification', (data) => {
    AppState.notifications.unshift(data);
    AppState.unreadNotifsCount++;
    UI.renderNotifications();
    UI.showToast('Notification', data.message, 'info');
  });

  // Project members updated
  WSClient.on('members_updated', (data) => {
    if (AppState.currentProject) {
      AppState.currentProject.members = data.members;
      UI.renderProjectHeader();
      if (AppState.activeView === 'team' || AppState.activeView === 'analytics') {
        UI.renderCurrentView();
      }
    }
  });
}

function bindFormSubmissions() {
  // 1. New Task Form
  const newTaskForm = document.getElementById('new-task-form');
  if (newTaskForm) {
    newTaskForm.onsubmit = async (e) => {
      e.preventDefault();
      const title = document.getElementById('new-task-title').value.trim();
      const desc = document.getElementById('new-task-desc').value.trim();
      const columnId = parseInt(document.getElementById('new-task-column').value, 10);
      const priority = document.getElementById('new-task-priority').value;
      const dueDate = document.getElementById('new-task-due').value;
      const labels = document.getElementById('new-task-labels').value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const assigneeIds = Array.from(document.querySelectorAll('.new-assignee-check:checked'))
        .map(cb => parseInt(cb.value, 10));

      if (!title) return;

      try {
        const res = await API.createTask(AppState.currentProject.id, {
          title,
          description: desc,
          columnId,
          priority,
          dueDate: dueDate || null,
          labels,
          assigneeIds
        });

        // Add to state and re-render
        AppState.currentProject.tasks.push(res.task);
        UI.renderCurrentView();

        newTaskForm.reset();
        document.getElementById('new-task-modal').close();
        UI.showToast('Task Created', `"${title}" has been added`, 'success');
      } catch (err) {
        console.error('Failed to create task:', err);
        UI.showToast('Error', err.message, 'danger');
      }
    };
  }

  // 2. New Project Form
  const newProjectForm = document.getElementById('new-project-form');
  if (newProjectForm) {
    newProjectForm.onsubmit = async (e) => {
      e.preventDefault();
      const title = document.getElementById('new-proj-title').value.trim();
      const description = document.getElementById('new-proj-desc').value.trim();
      const category = document.getElementById('new-proj-category').value;
      const color = document.querySelector('.color-swatch.active')?.dataset.color || '#6366f1';

      if (!title) return;

      try {
        const res = await API.createProject({
          title,
          description,
          category,
          color,
          icon: 'rocket'
        });

        AppState.projects.unshift(res.project);
        AppState.setCurrentProject(res.project);
        WSClient.joinProject(res.project.id);
        UI.renderCurrentView();

        newProjectForm.reset();
        document.getElementById('new-project-modal').close();
        UI.showToast('Project Created', `"${title}" board is ready`, 'success');
      } catch (err) {
        console.error('Failed to create project:', err);
        UI.showToast('Error', err.message, 'danger');
      }
    };

    // Color swatch selector
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.onclick = () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      };
    });
  }

  // 3. New Task Modal Open Trigger
  const topNewTaskBtn = document.getElementById('top-new-task-btn');
  if (topNewTaskBtn) {
    topNewTaskBtn.onclick = () => {
      const firstColId = AppState.currentProject?.columns?.[0]?.id;
      UI.openNewTaskModal(firstColId);
    };
  }

  // 4. New Project Modal Open Trigger
  const sidebarAddProjBtn = document.getElementById('sidebar-add-project-btn');
  if (sidebarAddProjBtn) {
    sidebarAddProjBtn.onclick = () => {
      UI.openNewProjectModal();
    };
  }

  const projectSelectorBtn = document.getElementById('project-selector-btn');
  const projectDropdown = document.getElementById('project-selector-dropdown');
  if (projectSelectorBtn && projectDropdown) {
    projectSelectorBtn.onclick = (e) => {
      e.stopPropagation();
      projectDropdown.classList.toggle('show');
      document.getElementById('notifications-dropdown')?.classList.remove('show');
      document.getElementById('user-menu-dropdown')?.classList.remove('show');
    };
  }

  const navNewProjBtn = document.getElementById('nav-new-proj-btn');
  if (navNewProjBtn) {
    navNewProjBtn.onclick = (e) => {
      e.stopPropagation();
      projectDropdown?.classList.remove('show');
      UI.openNewProjectModal();
    };
  }

  const inviteMemberBtn = document.getElementById('invite-member-btn');
  if (inviteMemberBtn) {
    inviteMemberBtn.onclick = () => {
      UI.openInviteModal();
    };
  }

  // 5. Auth Login Form Submission
  const loginForm = document.getElementById('form-auth-login');
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!email || !password) return;

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Signing in...';
        }
        const res = await API.login(email, password);
        await UI.switchUserSession(res.user);
        document.getElementById('auth-modal')?.close();
        loginForm.reset();
        UI.showToast('Welcome Back!', `Signed in as ${res.user.name}`, 'success');
      } catch (err) {
        console.error('Login error:', err);
        UI.showToast('Authentication Failed', err.message || 'Invalid email or password', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        }
      }
    };
  }

  // 6. Auth Register Form Submission (Create New ID)
  const regForm = document.getElementById('form-auth-register');
  if (regForm) {
    regForm.onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const role = document.getElementById('reg-role').value.trim() || 'Team Member';
      const avatarColor = document.querySelector('#reg-avatar-swatches .color-swatch.active')?.dataset.color || '#3b82f6';
      const submitBtn = regForm.querySelector('button[type="submit"]');

      if (!name || !email || !password) return;

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Creating Account...';
        }
        const res = await API.register(name, email, password, avatarColor, role);
        await UI.switchUserSession(res.user);
        document.getElementById('auth-modal')?.close();
        regForm.reset();
        UI.showToast('Account Created', `Welcome to PMT, ${res.user.name}! Your workspace is ready.`, 'success');
      } catch (err) {
        console.error('Registration error:', err);
        UI.showToast('Registration Error', err.message || 'Could not create account', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account & Start';
        }
      }
    };
  }

  // 7. Delete Account Form Submission (Requires Password)
  const deleteForm = document.getElementById('form-delete-account');
  if (deleteForm) {
    deleteForm.onsubmit = async (e) => {
      e.preventDefault();
      const passwordInput = document.getElementById('delete-confirm-password');
      const password = passwordInput ? passwordInput.value : '';
      const submitBtn = deleteForm.querySelector('button[type="submit"]');

      if (!password) return;

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Deleting Account...';
        }
        await API.deleteAccount(password);
        document.getElementById('delete-account-modal')?.close();
        deleteForm.reset();
        UI.showToast('Account Deleted', 'Your account and personal data were permanently deleted.', 'info');
        UI.logout();
      } catch (err) {
        console.error('Delete account error:', err);
        UI.showToast('Delete Failed', err.message || 'Incorrect password', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Delete My Account';
        }
      }
    };
  }

  // 7. Request Reset Code Button
  const reqCodeBtn = document.getElementById('btn-request-reset-code');
  if (reqCodeBtn) {
    reqCodeBtn.onclick = async () => {
      const emailInput = document.getElementById('forgot-email');
      const email = emailInput ? emailInput.value.trim() : '';
      if (!email) {
        UI.showToast('Email Required', 'Please enter your registered email address first.', 'warning');
        emailInput?.focus();
        return;
      }
      try {
        reqCodeBtn.disabled = true;
        reqCodeBtn.textContent = 'Generating...';
        const res = await API.forgotPassword(email);
        UI.showToast('Reset Code Ready', `Verification code: ${res.code}`, 'success');

        const banner = document.getElementById('forgot-code-banner');
        const display = document.getElementById('forgot-code-display');
        const codeInput = document.getElementById('forgot-code');
        if (banner && display) {
          display.textContent = res.code;
          banner.style.display = 'flex';
        }
        if (codeInput) {
          codeInput.value = res.code;
          document.getElementById('forgot-new-password')?.focus();
        }
      } catch (err) {
        console.error('Forgot password error:', err);
        UI.showToast('Request Failed', err.message || 'Could not generate reset code', 'danger');
      } finally {
        reqCodeBtn.disabled = false;
        reqCodeBtn.innerHTML = `${UI.icon('send', { size: 12 })} Get Code`;
      }
    };
  }

  // 8. Forgot / Reset Password Form Submission
  const forgotForm = document.getElementById('form-auth-forgot');
  if (forgotForm) {
    forgotForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim();
      const code = document.getElementById('forgot-code').value.trim();
      const newPassword = document.getElementById('forgot-new-password').value;
      const confirmPassword = document.getElementById('forgot-confirm-password').value;
      const submitBtn = forgotForm.querySelector('button[type="submit"]');

      if (!email || !code || !newPassword) return;

      if (newPassword.length < 6) {
        UI.showToast('Weak Password', 'New password must be at least 6 characters.', 'warning');
        return;
      }

      if (newPassword !== confirmPassword) {
        UI.showToast('Password Mismatch', 'New password and confirmation password do not match.', 'danger');
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Resetting Password...';
        }
        const res = await API.resetPassword(email, code, newPassword);
        await UI.switchUserSession(res.user);
        forgotForm.reset();
        const banner = document.getElementById('forgot-code-banner');
        if (banner) banner.style.display = 'none';
        UI.showToast('Password Reset Successfully!', `Welcome back, ${res.user.name}!`, 'success');
      } catch (err) {
        console.error('Reset password error:', err);
        UI.showToast('Reset Failed', err.message || 'Invalid or expired code', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `${UI.icon('check-circle-2', { size: 14 })} Update Password & Sign In`;
        }
      }
    };
  }

  // 9. Change Password Form Submission (in Settings Modal)
  const changePassForm = document.getElementById('settings-password-form');
  if (changePassForm) {
    changePassForm.onsubmit = async (e) => {
      e.preventDefault();
      const curPass = document.getElementById('settings-current-password').value;
      const newPass = document.getElementById('settings-new-password').value;
      const submitBtn = changePassForm.querySelector('button[type="submit"]');

      if (!curPass || !newPass) return;

      if (newPass.length < 6) {
        UI.showToast('Weak Password', 'New password must be at least 6 characters.', 'warning');
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Updating...';
        }
        await API.changePassword(curPass, newPass);
        changePassForm.reset();
        UI.showToast('Password Updated', 'Your account password has been updated successfully.', 'success');
      } catch (err) {
        console.error('Change password error:', err);
        UI.showToast('Update Failed', err.message || 'Incorrect current password', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `${UI.icon('lock', { size: 14 })} Update Password`;
        }
      }
    };
  }
}
