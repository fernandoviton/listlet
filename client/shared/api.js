// Shared API utilities

/**
 * Create API helper for a specific list
 * @param {string} listName - Name of the list
 * @returns {Object} - API methods
 */
function createApi(listName) {
    const baseUrl = CONFIG.API_BASE;
    const isMock = baseUrl === 'mock';

    return {
        isMock,
        listName,

        /**
         * Fetch tasks from API (or localStorage for mock)
         * @param {Array} mockDefault - Default data for mock mode
         * @returns {Promise<Array>} - Tasks array
         */
        async fetchTasks(mockDefault = []) {
            if (isMock) {
                const saved = localStorage.getItem(`mockTasks_${listName}`);
                return saved ? JSON.parse(saved) : mockDefault;
            }

            const response = await fetch(`${baseUrl}/${listName}`);

            if (response.status === 404) {
                const err = new Error('List not found');
                err.code = 'NOT_FOUND';
                throw err;
            }

            if (!response.ok) {
                // Try to get error message from response body
                let message = `Server error (${response.status})`;
                try {
                    const body = await response.json();
                    if (body.error) message = body.error;
                } catch (e) { /* ignore parse errors */ }
                throw new Error(message);
            }
            return response.json();
        },

        /**
         * Save tasks using GET-modify-PUT pattern
         * @param {Function} mutate - Function that mutates the tasks array
         * @returns {Promise<Array>} - Updated tasks array
         */
        async saveTasks(mutate) {
            if (isMock) {
                // For mock, we just get current, mutate, and save
                const current = JSON.parse(localStorage.getItem(`mockTasks_${listName}`) || '[]');
                if (mutate) mutate(current);
                localStorage.setItem(`mockTasks_${listName}`, JSON.stringify(current));
                return current;
            }

            // 1. GET latest server data
            const getResponse = await fetch(`${baseUrl}/${listName}`);
            if (!getResponse.ok) throw new Error('Failed to fetch latest tasks');
            const serverTasks = await getResponse.json();

            // 2. Apply the mutation to server data
            if (mutate) mutate(serverTasks);

            // 3. PUT the merged result
            const putResponse = await fetch(`${baseUrl}/${listName}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverTasks)
            });
            if (!putResponse.ok) throw new Error('Failed to save');

            return serverTasks;
        },

        /**
         * Atomically append an item to an array at a given path
         * Uses ETag-based optimistic locking with automatic retry on conflict
         * @param {string} path - Dot-separated path to array (e.g., 'weeks.0.event.comments')
         * @param {*} value - Value to append
         * @param {number} maxRetries - Maximum retry attempts on conflict
         * @returns {Promise<Object>} - Full document after update
         */
        async appendItem(path, value, maxRetries = 3) {
            if (isMock) {
                // For mock, simulate atomic append
                const current = JSON.parse(localStorage.getItem(`mockTasks_${listName}`) || '{}');
                const target = path.split('.').reduce((obj, key) => {
                    return /^\d+$/.test(key) ? obj[parseInt(key)] : obj[key];
                }, current);
                if (Array.isArray(target)) {
                    target.push(value);
                }
                localStorage.setItem(`mockTasks_${listName}`, JSON.stringify(current));
                return current;
            }

            for (let i = 0; i < maxRetries; i++) {
                const response = await fetch(`${baseUrl}/${listName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path, value })
                });

                if (response.status === 409) {
                    // Conflict - wait with exponential backoff and retry
                    await new Promise(r => setTimeout(r, 100 * (i + 1)));
                    continue;
                }

                if (!response.ok) throw new Error('Failed to append item');
                const result = await response.json();
                return result.data; // Full document for sync
            }
            throw new Error('Max retries exceeded');
        },

        /**
         * Atomically delete an item from an array at a given path by id
         * Uses ETag-based optimistic locking with automatic retry on conflict
         * @param {string} path - Dot-separated path to array (e.g., 'resources')
         * @param {string} id - ID of item to delete
         * @param {number} maxRetries - Maximum retry attempts on conflict
         * @returns {Promise<Object>} - Full document after update
         */
        async deleteItem(path, id, maxRetries = 3) {
            if (isMock) {
                // For mock, simulate atomic delete
                const current = JSON.parse(localStorage.getItem(`mockTasks_${listName}`) || '{}');
                const target = path.split('.').reduce((obj, key) => {
                    return /^\d+$/.test(key) ? obj[parseInt(key)] : obj[key];
                }, current);
                if (Array.isArray(target)) {
                    const index = target.findIndex(item => item.id === id);
                    if (index !== -1) target.splice(index, 1);
                }
                localStorage.setItem(`mockTasks_${listName}`, JSON.stringify(current));
                return current;
            }

            for (let i = 0; i < maxRetries; i++) {
                const response = await fetch(`${baseUrl}/${listName}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path, id })
                });

                if (response.status === 409) {
                    // Conflict - wait with exponential backoff and retry
                    await new Promise(r => setTimeout(r, 100 * (i + 1)));
                    continue;
                }

                if (!response.ok) throw new Error('Failed to delete item');
                const result = await response.json();
                return result.data; // Full document for sync
            }
            throw new Error('Max retries exceeded');
        }
    };
}
