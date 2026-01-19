// ===========================================
// Task Store (State Container)
// ===========================================
// Holds the tasks array and provides access to it.
// Uses TaskMutations for all mutation operations.
// ===========================================

const TaskStore = (function() {
    // Private state
    let tasks = [];

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

    // ===========================================
    // Mutations (delegate to TaskMutations)
    // ===========================================

    function addTask(name) {
        return TaskMutations.addTask(tasks, name);
    }

    function updateTaskStatus(taskId, newStatus) {
        return TaskMutations.updateTaskStatus(tasks, taskId, newStatus);
    }

    function addTagToTask(taskId, tag) {
        return TaskMutations.addTagToTask(tasks, taskId, tag);
    }

    function removeTagFromTask(taskId, tag) {
        return TaskMutations.removeTagFromTask(tasks, taskId, tag);
    }

    function cycleTaskStatus(taskId) {
        return TaskMutations.cycleTaskStatus(tasks, taskId);
    }

    // Public API
    return {
        // Accessors
        getTasks,
        getTask,
        setTasks,
        getStatusCycle: TaskMutations.getStatusCycle,
        // Mutations
        addTask,
        updateTaskStatus,
        addTagToTask,
        removeTagFromTask,
        cycleTaskStatus
    };
})();
