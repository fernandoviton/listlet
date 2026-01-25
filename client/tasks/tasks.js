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
    let renamingTag = null;  // Tag being renamed (null = add mode)
    let knownTags = new Set();

    // DOM elements (set during init)
    let taskListEl, savingIndicator, addTaskForm, taskInput;
    let tagModal, tagModalTitle, tagInput, tagSuggestions, saveTagBtn, cancelTagBtn;

    /**
     * Load known tags from localStorage
     * These are stored here so tags that are removed from all tasks can still be suggested (for this page)
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
     * Collect tags from tasks and add to knownTags
     */
    function collectKnownTags(tasks) {
        tasks.forEach(task => {
            if (task.tags) {
                task.tags.forEach(tag => knownTags.add(tag));
            }
        });
        saveKnownTags();
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
        api = createApi(listName, CONFIG.API_BASE_TASKS);

        // Cache DOM elements
        taskListEl = document.getElementById('taskList');
        savingIndicator = document.getElementById('savingIndicator');
        addTaskForm = document.getElementById('addTaskForm');
        taskInput = document.getElementById('taskInput');
        tagModal = document.getElementById('tagModal');
        tagModalTitle = document.getElementById('tagModalTitle');
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
    }

    /**
     * Fetch tasks from API
     */
    async function fetchTasks() {
        try {
            const tasks = await api.fetchTasks([...MOCK_TASKS]);
            TaskStore.setTasks(tasks);
            collectKnownTags(tasks);
            renderTasks();
        } catch (error) {
            if (error.code === 'NOT_FOUND') {
                taskListEl.innerHTML = `
                    <div class="not-found">
                        <h2>List not found</h2>
                        <p>The list "<strong>${escapeHtml(api.listName)}</strong>" doesn't exist.</p>
                        <div class="not-found-actions">
                            <a href="../home/" class="btn">Go to Home</a>
                        </div>
                    </div>
                `;
            } else {
                taskListEl.innerHTML = `<div class="error">Error loading tasks: ${escapeHtml(error.message)}</div>`;
            }
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

        if (isSaving) {
            console.warn('Save skipped - already saving');
            return;
        }
        isSaving = true;
        savingIndicator.classList.add('visible');

        try {
            console.log('Saving tasks...');
            const updatedTasks = await api.saveTasks(mutate);
            console.log('Save complete, tasks:', updatedTasks);
            TaskStore.setTasks(updatedTasks);
            renderTasks();
        } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save: ' + error.message);
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

        const isUntagged = tagName === 'Untagged';
        const editBtn = isUntagged ? '' : `<button class="edit-tag-btn" data-tag="${escapeHtml(tagName)}" title="Rename tag">✎</button>`;

        return `
            <div class="tag-group">
                <div class="tag-group-header">
                    <span class="tag-group-name">${escapeHtml(tagName)}</span>
                    <span class="tag-group-count">(${groupTasks.length})</span>
                    ${editBtn}
                </div>
                <ul class="task-list">${tasksHtml}</ul>
            </div>
        `;
    }

    /**
     * Handle clicks on task list (event delegation)
     */
    function handleTaskListClick(e) {
        // Handle edit tag button (rename)
        if (e.target.classList.contains('edit-tag-btn')) {
            e.stopPropagation();
            renamingTag = e.target.dataset.tag;
            editingTagIndex = null;
            tagModalTitle.textContent = 'Rename Tag';
            saveTagBtn.textContent = 'Rename';
            tagInput.value = renamingTag;
            updateTagSuggestions();
            tagModal.classList.add('visible');
            tagInput.focus();
            tagInput.select();
            return;
        }

        // Handle add tag button
        if (e.target.classList.contains('add-tag-btn')) {
            e.stopPropagation();
            renamingTag = null;
            editingTagIndex = parseInt(e.target.dataset.index, 10);
            tagModalTitle.textContent = 'Add Tag';
            saveTagBtn.textContent = 'Add';
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
        renamingTag = null;
    }

    /**
     * Handle save tag button click
     */
    function handleSaveTag() {
        const newTag = tagInput.value.trim().toLowerCase();
        if (!newTag) return;

        // Rename mode
        if (renamingTag !== null) {
            const oldTag = renamingTag.toLowerCase();
            if (newTag === oldTag) {
                closeTagModal();
                return;
            }
            // Update knownTags
            knownTags.delete(oldTag);
            knownTags.add(newTag);
            saveKnownTags();

            // Rename in store and save
            TaskStore.renameTag(oldTag, newTag);
            renderTasks();
            saveTasks((tasks) => TaskMutations.renameTag(tasks, oldTag, newTag));
            closeTagModal();
            return;
        }

        // Add mode
        if (editingTagIndex === null) return;

        // Capture index before closing modal (closeTagModal sets it to null)
        const taskIndex = editingTagIndex;

        // Remember this tag for future suggestions
        knownTags.add(newTag);
        saveKnownTags();

        if (TaskStore.addTagToTask(taskIndex, newTag)) {
            renderTasks();
            saveTasks((tasks) => TaskMutations.addTagToTask(tasks, taskIndex, newTag));
        }
        closeTagModal();
    }

    // Public API
    return { init };
})();
