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
                // List doesn't exist - create it
                const createResponse = await fetch(`${baseUrl}/${listName}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: '[]'
                });
                if (!createResponse.ok) throw new Error('Failed to create list');
                return [];
            }
            
            if (!response.ok) throw new Error('Failed to fetch tasks');
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
        }
    };
}
