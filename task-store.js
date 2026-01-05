// ===========================================
// Task State & Mutation Methods
// ===========================================
// All access and changes to tasks should go through these methods.
// This gives us a centralized list of mutations, which will be
// useful for conflict detection in the sync helper.
//
// Task ID: Currently using array index as ID. This is acceptable
// because there is no way to delete or reorder tasks yet. When
// those features are added, we should switch to unique IDs.
// ===========================================

const TaskStore = (function() {
    // Private state
    let tasks = [];
    
    // Status cycle order
    const statusCycle = ['not-started', 'in-progress', 'needs-review', 'done', 'removed'];

    // ===========================================
    // Accessors
    // ===========================================

    /**
     * Get all tasks (returns a reference, not a copy)
     * @returns {Array} - The tasks array
     */
    function getTasks() {
        return tasks;
    }

    /**
     * Get a single task by ID
     * @param {number} taskId - Task index
     * @returns {Object|null} - The task or null if not found
     */
    function getTask(taskId) {
        if (taskId < 0 || taskId >= tasks.length) return null;
        return tasks[taskId];
    }

    /**
     * Set the entire tasks array (used when loading from API)
     * @param {Array} newTasks - The new tasks array
     */
    function setTasks(newTasks) {
        tasks = newTasks;
    }

    /**
     * Get the status cycle array
     * @returns {string[]} - Array of status values in cycle order
     */
    function getStatusCycle() {
        return statusCycle;
    }

    // ===========================================
    // Mutations
    // ===========================================

    /**
     * Add a new task
     * @param {string} name - Task name
     * @returns {number} - The index of the new task
     */
    function addTask(name) {
        const newTask = { name, status: 'not-started', tags: [] };
        tasks.push(newTask);
        return tasks.length - 1;
    }

    /**
     * Update a task's status
     * @param {number} taskId - Task index
     * @param {string} newStatus - New status value
     */
    function updateTaskStatus(taskId, newStatus) {
        if (taskId < 0 || taskId >= tasks.length) return;
        tasks[taskId].status = newStatus;
    }

    /**
     * Add a tag to a task
     * @param {number} taskId - Task index
     * @param {string} tag - Tag to add
     * @returns {boolean} - True if tag was added, false if already exists
     */
    function addTagToTask(taskId, tag) {
        if (taskId < 0 || taskId >= tasks.length) return false;
        if (!tasks[taskId].tags) {
            tasks[taskId].tags = [];
        }
        if (tasks[taskId].tags.includes(tag)) {
            return false;
        }
        tasks[taskId].tags.push(tag);
        return true;
    }

    /**
     * Remove a tag from a task
     * @param {number} taskId - Task index
     * @param {string} tag - Tag to remove
     */
    function removeTagFromTask(taskId, tag) {
        if (taskId < 0 || taskId >= tasks.length) return;
        if (!tasks[taskId].tags) return;
        tasks[taskId].tags = tasks[taskId].tags.filter(t => t !== tag);
    }

    /**
     * Cycle a task's status to the next value
     * @param {number} taskId - Task index
     */
    function cycleTaskStatus(taskId) {
        if (taskId < 0 || taskId >= tasks.length) return;
        const currentStatus = tasks[taskId].status;
        const currentIndex = statusCycle.indexOf(currentStatus);
        const nextIndex = (currentIndex + 1) % statusCycle.length;
        tasks[taskId].status = statusCycle[nextIndex];
    }

    // Public API
    return {
        // Accessors
        getTasks,
        getTask,
        setTasks,
        getStatusCycle,
        // Mutations
        addTask,
        updateTaskStatus,
        addTagToTask,
        removeTagFromTask,
        cycleTaskStatus
    };
})();

