// Task list UI logic

const TasksUI = (function() {
    // Status icons
    const statusIcons = {
        'not-started': '○',
        'in-progress': '◐',
        'needs-review': '?',
        'done': '✓',
        'removed': '✕'
    };

    // Mock data for local testing
    const MOCK_TASKS = [
        { name: 'Set up project structure', status: 'done', tags: ['backend'] },
        { name: 'Create basic UI components', status: 'done', tags: ['frontend'] },
        { name: 'Implement API integration', status: 'in-progress', tags: ['backend', 'frontend'] },
        { name: 'Add authentication', status: 'needs-review', tags: ['backend'] },
        { name: 'Write unit tests', status: 'not-started', tags: ['testing'] },
        { name: 'Deploy to production', status: 'not-started' },
        { name: 'Old feature removed', status: 'removed' }
    ];

    // State
    let api = null;
    let isSaving = false;
    let editingTagIndex = null;
    let knownTags = new Set();

    // DOM elements (set during init)
    let taskListEl, savingIndicator, addTaskForm, taskInput;
    let tagModal, tagInput, tagSuggestions, saveTagBtn, cancelTagBtn;

    /**
     * Load known tags from localStorage
     */
    function loadKnownTags() {
        const stored = localStorage.getItem(`knownTags_${api.listName}`);
        if (stored) {
            try {
                knownTags = new Set(JSON.parse(stored));
            } catch (e) {
                knownTags = new Set();
            }
        }
    }

    /**
     * Save known tags to localStorage
     */
    function saveKnownTags() {
        localStorage.setItem(`knownTags_${api.listName}`, JSON.stringify([...knownTags]));
    }

    /**
     * Update the datalist with current known tags
     */
    function updateTagSuggestions() {
        const sortedTags = [...knownTags].sort();
        tagSuggestions.innerHTML = sortedTags
            .map(tag => `<option value="${escapeHtml(tag)}">`)
            .join('');
    }

    /**
     * Initialize the tasks UI
     * @param {string} listName - Name of the list to load
     */
    async function init(listName) {
        // Create API instance
        api = createApi(listName);

        // Cache DOM elements
        taskListEl = document.getElementById('taskList');
        savingIndicator = document.getElementById('savingIndicator');
        addTaskForm = document.getElementById('addTaskForm');
        taskInput = document.getElementById('taskInput');
        tagModal = document.getElementById('tagModal');
        tagInput = document.getElementById('tagInput');
        tagSuggestions = document.getElementById('tagSuggestions');
        saveTagBtn = document.getElementById('saveTagBtn');
        cancelTagBtn = document.getElementById('cancelTagBtn');

        // Load known tags from localStorage
        loadKnownTags();

        // Set up page title
        document.title = `${listName} - Task List`;
        document.getElementById('listNameDisplay').textContent = `(${listName})`;

        // Set up event listeners
        setupEventListeners();

        // Load tasks
        await fetchTasks();
    }

    /**
     * Set up all event listeners
     */
    function setupEventListeners() {
        // Task list clicks (delegation)
        taskListEl.addEventListener('click', handleTaskListClick);

        // Add task form
        addTaskForm.addEventListener('submit', handleAddTask);

        // Tag modal
        cancelTagBtn.addEventListener('click', closeTagModal);
        tagModal.addEventListener('click', (e) => {
            if (e.target === tagModal) closeTagModal();
        });
        saveTagBtn.addEventListener('click', handleSaveTag);
        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveTagBtn.click();
            } else if (e.key === 'Escape') {
                closeTagModal();
            }
        });
        // Auto-submit when selecting from datalist
        tagInput.addEventListener('input', (e) => {
            // Check if the current value matches a known tag (user selected from list)
            if (knownTags.has(tagInput.value.trim().toLowerCase())) {
                // Small delay to ensure the input is fully updated
                setTimeout(() => saveTagBtn.click(), 0);
            }
        });
    }

    /**
     * Fetch tasks from API
     */
    async function fetchTasks() {
        try {
            const tasks = await api.fetchTasks([...MOCK_TASKS]);
            TaskStore.setTasks(tasks);
            renderTasks();
        } catch (error) {
            taskListEl.innerHTML = `<div class="error">Error loading tasks: ${escapeHtml(error.message)}</div>`;
        }
    }

    /**
     * Save tasks with a mutation
     * @param {Function} mutate - Function to mutate the tasks array
     */
    async function saveTasks(mutate) {
        if (api.isMock) {
            // For mock, save current state directly
            localStorage.setItem(`mockTasks_${api.listName}`, JSON.stringify(TaskStore.getTasks()));
            showSaveIndicator();
            return;
        }

        if (isSaving) return;
        isSaving = true;
        savingIndicator.classList.add('visible');

        try {
            const updatedTasks = await api.saveTasks(mutate);
            TaskStore.setTasks(updatedTasks);
            renderTasks();
        } catch (error) {
            console.error('Save error:', error);
        } finally {
            isSaving = false;
            savingIndicator.classList.remove('visible');
        }
    }

    /**
     * Brief visual feedback for mock saves
     */
    function showSaveIndicator() {
        savingIndicator.classList.add('visible');
        setTimeout(() => savingIndicator.classList.remove('visible'), 300);
    }

    /**
     * Render tasks grouped by tags
     */
    function renderTasks() {
        const tasks = TaskStore.getTasks();
        if (tasks.length === 0) {
            taskListEl.innerHTML = '<div class="loading">No tasks yet. Add one above!</div>';
            return;
        }

        // Collect all unique tags and group tasks
        const tagGroups = new Map();
        const untaggedTasks = [];

        tasks.forEach((task, index) => {
            if (task.tags && task.tags.length > 0) {
                task.tags.forEach(tag => {
                    if (!tagGroups.has(tag)) {
                        tagGroups.set(tag, []);
                    }
                    tagGroups.get(tag).push({ task, index });
                });
            } else {
                untaggedTasks.push({ task, index });
            }
        });

        // Sort tags alphabetically
        const sortedTags = Array.from(tagGroups.keys()).sort();

        let html = '';

        // Render each tag group
        sortedTags.forEach(tag => {
            const groupTasks = tagGroups.get(tag);
            html += renderTagGroup(tag, groupTasks);
        });

        // Render untagged group at the end
        if (untaggedTasks.length > 0) {
            html += renderTagGroup('Untagged', untaggedTasks);
        }

        taskListEl.innerHTML = html;
    }

    /**
     * Render a single tag group
     */
    function renderTagGroup(tagName, groupTasks) {
        const tasksHtml = groupTasks.map(({ task, index }) => `
            <li class="task ${task.status}" data-index="${index}">
                <span class="task-icon">${statusIcons[task.status] || '○'}</span>
                <span class="task-name">${escapeHtml(task.name)}</span>
                <div class="task-tags">
                    ${(task.tags || []).map(t => `<span class="task-tag" data-index="${index}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}
                    <button class="add-tag-btn" data-index="${index}">+</button>
                </div>
            </li>
        `).join('');

        return `
            <div class="tag-group">
                <div class="tag-group-header">
                    <span class="tag-group-name">${escapeHtml(tagName)}</span>
                    <span class="tag-group-count">(${groupTasks.length})</span>
                </div>
                <ul class="task-list">${tasksHtml}</ul>
            </div>
        `;
    }

    /**
     * Handle clicks on task list (event delegation)
     */
    function handleTaskListClick(e) {
        // Handle add tag button
        if (e.target.classList.contains('add-tag-btn')) {
            e.stopPropagation();
            editingTagIndex = parseInt(e.target.dataset.index, 10);
            tagInput.value = '';
            updateTagSuggestions();
            tagModal.classList.add('visible');
            tagInput.focus();
            return;
        }

        // Handle tag click (remove tag)
        if (e.target.classList.contains('task-tag')) {
            e.stopPropagation();
            const taskId = parseInt(e.target.dataset.index, 10);
            const tag = e.target.dataset.tag;
            TaskStore.removeTagFromTask(taskId, tag);
            renderTasks();
            saveTasks((tasks) => TaskMutations.removeTagFromTask(tasks, taskId, tag));
            return;
        }

        // Handle task click (cycle status)
        const taskEl = e.target.closest('.task');
        if (!taskEl) return;

        const taskId = parseInt(taskEl.dataset.index, 10);
        TaskStore.cycleTaskStatus(taskId);
        renderTasks();
        saveTasks((tasks) => TaskMutations.cycleTaskStatus(tasks, taskId));
    }

    /**
     * Handle add task form submission
     */
    function handleAddTask(e) {
        e.preventDefault();
        const name = taskInput.value.trim();
        if (!name) return;

        TaskStore.addTask(name);
        taskInput.value = '';
        renderTasks();
        saveTasks((tasks) => TaskMutations.addTask(tasks, name));
    }

    /**
     * Close the tag modal
     */
    function closeTagModal() {
        tagModal.classList.remove('visible');
        editingTagIndex = null;
    }

    /**
     * Handle save tag button click
     */
    function handleSaveTag() {
        const tag = tagInput.value.trim().toLowerCase();
        if (!tag || editingTagIndex === null) return;

        // Remember this tag for future suggestions
        knownTags.add(tag);
        saveKnownTags();

        if (TaskStore.addTagToTask(editingTagIndex, tag)) {
            renderTasks();
            saveTasks((tasks) => TaskMutations.addTagToTask(tasks, editingTagIndex, tag));
        }
        closeTagModal();
    }

    // Public API
    return { init };
})();
