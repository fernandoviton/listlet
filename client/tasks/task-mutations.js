// ===========================================
// Task Mutation Functions (Pure/Functional)
// ===========================================
// These functions take a tasks array as input and mutate it.
// This allows them to be used on both:
// - The UI state (TaskStore's internal array)
// - Server data (after fetching, before merging)
//
// Task ID: Currently using array index as ID. This is acceptable
// because there is no way to delete or reorder tasks yet. When
// those features are added, we should switch to unique IDs.
// ===========================================

const TaskMutations = (function() {
    
    // Status cycle order
    const statusCycle = ['not-started', 'in-progress', 'needs-review', 'done', 'removed'];

    /**
     * Get the status cycle array
     * @returns {string[]} - Array of status values in cycle order
     */
    function getStatusCycle() {
        return statusCycle;
    }

    /**
     * Add a new task to a tasks array
     * @param {Array} tasks - The tasks array to mutate
     * @param {string} name - Task name
     * @returns {number} - The index of the new task
     */
    function addTask(tasks, name) {
        const newTask = { name, status: 'not-started', tags: [] };
        tasks.push(newTask);
        return tasks.length - 1;
    }

    /**
     * Update a task's status
     * @param {Array} tasks - The tasks array to mutate
     * @param {number} taskId - Task index
     * @param {string} newStatus - New status value
     * @returns {boolean} - True if update was successful
     */
    function updateTaskStatus(tasks, taskId, newStatus) {
        if (taskId < 0 || taskId >= tasks.length) return false;
        tasks[taskId].status = newStatus;
        return true;
    }

    /**
     * Add a tag to a task
     * @param {Array} tasks - The tasks array to mutate
     * @param {number} taskId - Task index
     * @param {string} tag - Tag to add
     * @returns {boolean} - True if tag was added, false if already exists or invalid
     */
    function addTagToTask(tasks, taskId, tag) {
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
     * @param {Array} tasks - The tasks array to mutate
     * @param {number} taskId - Task index
     * @param {string} tag - Tag to remove
     * @returns {boolean} - True if removal was successful
     */
    function removeTagFromTask(tasks, taskId, tag) {
        if (taskId < 0 || taskId >= tasks.length) return false;
        if (!tasks[taskId].tags) return false;
        const originalLength = tasks[taskId].tags.length;
        tasks[taskId].tags = tasks[taskId].tags.filter(t => t !== tag);
        return tasks[taskId].tags.length < originalLength;
    }

    /**
     * Cycle a task's status to the next value
     * @param {Array} tasks - The tasks array to mutate
     * @param {number} taskId - Task index
     * @returns {boolean} - True if cycle was successful
     */
    function cycleTaskStatus(tasks, taskId) {
        if (taskId < 0 || taskId >= tasks.length) return false;
        const currentStatus = tasks[taskId].status;
        const currentIndex = statusCycle.indexOf(currentStatus);
        const nextIndex = (currentIndex + 1) % statusCycle.length;
        tasks[taskId].status = statusCycle[nextIndex];
        return true;
    }

    /**
     * Rename a tag across all tasks
     * @param {Array} tasks - The tasks array to mutate
     * @param {string} oldTag - Tag to rename
     * @param {string} newTag - New tag name
     * @returns {number} - Number of tasks updated
     */
    function renameTag(tasks, oldTag, newTag) {
        let count = 0;
        tasks.forEach(task => {
            if (!task.tags) return;
            const idx = task.tags.indexOf(oldTag);
            if (idx === -1) return;
            
            // Check if task already has the new tag
            if (task.tags.includes(newTag)) {
                // Remove the old tag (would be duplicate)
                task.tags.splice(idx, 1);
            } else {
                // Replace old with new
                task.tags[idx] = newTag;
            }
            count++;
        });
        return count;
    }

    // Public API
    return {
        getStatusCycle,
        addTask,
        updateTaskStatus,
        addTagToTask,
        removeTagFromTask,
        cycleTaskStatus,
        renameTag
    };
})();
