// Smooth HTML5 Drag and Drop Kanban Controller

const DragDrop = {
  draggedCard: null,
  draggedTaskId: null,
  sourceColumnId: null,
  placeholder: null,

  init() {
    this.createPlaceholder();
  },

  createPlaceholder() {
    this.placeholder = document.createElement('div');
    this.placeholder.className = 'drop-placeholder';
  },

  attachCardEvents(cardElement, taskId, columnId) {
    cardElement.setAttribute('draggable', 'true');

    cardElement.addEventListener('dragstart', (e) => {
      this.draggedCard = cardElement;
      this.draggedTaskId = taskId;
      this.sourceColumnId = columnId;

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', taskId);

      setTimeout(() => {
        cardElement.classList.add('dragging');
      }, 0);
    });

    cardElement.addEventListener('dragend', () => {
      if (this.draggedCard) {
        this.draggedCard.classList.remove('dragging');
      }
      if (this.placeholder && this.placeholder.parentNode) {
        this.placeholder.parentNode.removeChild(this.placeholder);
      }
      document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
      this.draggedCard = null;
      this.draggedTaskId = null;
    });
  },

  attachColumnEvents(columnElement, columnId) {
    const cardsContainer = columnElement.querySelector('.cards-container');
    if (!cardsContainer) return;

    columnElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      columnElement.classList.add('drag-over');

      // Calculate position relative to sibling cards
      const afterElement = this.getDragAfterElement(cardsContainer, e.clientY);
      if (afterElement == null) {
        cardsContainer.appendChild(this.placeholder);
      } else {
        cardsContainer.insertBefore(this.placeholder, afterElement);
      }
    });

    columnElement.addEventListener('dragleave', (e) => {
      // Only remove if leaving the column boundary
      if (!columnElement.contains(e.relatedTarget)) {
        columnElement.classList.remove('drag-over');
      }
    });

    columnElement.addEventListener('drop', async (e) => {
      e.preventDefault();
      columnElement.classList.remove('drag-over');

      const taskId = this.draggedTaskId;
      if (!taskId) return;

      const targetColumnId = parseInt(columnId, 10);
      const cards = Array.from(cardsContainer.querySelectorAll('.task-card:not(.dragging)'));
      const placeholderIndex = Array.from(cardsContainer.children).indexOf(this.placeholder);

      // Clean up placeholder
      if (this.placeholder && this.placeholder.parentNode) {
        this.placeholder.parentNode.removeChild(this.placeholder);
      }

      // Optimistic update in AppState
      if (AppState.currentProject && AppState.currentProject.tasks) {
        const task = AppState.currentProject.tasks.find(t => t.id === taskId);
        if (task) {
          task.column_id = targetColumnId;
          task.order_index = placeholderIndex >= 0 ? placeholderIndex : 0;
          UI.renderCurrentView();
        }
      }

      // Persist to server
      try {
        await API.moveTask(taskId, targetColumnId, placeholderIndex);
      } catch (err) {
        console.error('Failed to move task:', err);
        UI.showToast('Move failed', 'Could not sync task movement to server', 'danger');
        // Refresh project state to restore consistency
        if (AppState.currentProject) {
          const fresh = await API.getProject(AppState.currentProject.id);
          AppState.setCurrentProject(fresh.project);
        }
      }
    });
  },

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
};

window.DragDrop = DragDrop;
