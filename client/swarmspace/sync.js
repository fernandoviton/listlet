// Sync polling module for SwarmSpace multi-user support

const SwarmSpaceSync = (function() {
    // Sync state
    let lastSyncTime = Date.now();
    let syncInterval = null;
    let syncPaused = false;
    let api = null;
    let onSyncCallback = null;

    // Constants
    const POLL_INTERVAL = 15000; // 15 seconds
    const PAUSE_AFTER = 5 * 60 * 1000; // 5 minutes

    /**
     * Initialize the sync module
     * @param {Object} apiInstance - The API instance to use for fetching
     * @param {Function} onSync - Callback when data is refreshed from server
     */
    function init(apiInstance, onSync) {
        api = apiInstance;
        onSyncCallback = onSync;
        startPolling();
    }

    /**
     * Start sync polling
     */
    function startPolling() {
        lastSyncTime = Date.now();
        syncPaused = false;
        updateStatusUI();

        // Clear any existing interval
        if (syncInterval) {
            clearInterval(syncInterval);
        }

        syncInterval = setInterval(async () => {
            const elapsed = Date.now() - lastSyncTime;

            // After 5 minutes of inactivity, pause and show UI
            if (elapsed > PAUSE_AFTER) {
                pausePolling();
                return;
            }

            await refreshFromServer();
        }, POLL_INTERVAL);
    }

    /**
     * Pause sync polling
     */
    function pausePolling() {
        syncPaused = true;
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
        updateStatusUI();
    }

    /**
     * Refresh data from server
     */
    async function refreshFromServer() {
        if (!api) return;

        try {
            const data = await api.fetchTasks();
            if (onSyncCallback) {
                onSyncCallback(data);
            }
            updateStatusUI();
        } catch (error) {
            console.error('Sync refresh failed:', error);
        }
    }

    /**
     * Manual refresh (called by user clicking sync indicator)
     */
    async function manualRefresh() {
        await refreshFromServer();
        resetActivity();
    }

    /**
     * Reset the activity timer (call after any user action)
     */
    function resetActivity() {
        lastSyncTime = Date.now();
        if (syncPaused) {
            startPolling();
        }
    }

    /**
     * Update the sync status UI
     */
    function updateStatusUI() {
        const indicator = document.getElementById('syncStatus');
        if (!indicator) return;

        if (syncPaused) {
            indicator.textContent = 'Sync paused';
            indicator.classList.add('paused');
            indicator.title = 'Click to refresh and resume sync';
        } else {
            indicator.textContent = 'Synced';
            indicator.classList.remove('paused');
            indicator.title = 'Auto-syncing every 15s';
        }
    }

    /**
     * Stop all sync operations (cleanup)
     */
    function stop() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
        syncPaused = true;
    }

    /**
     * Check if sync is currently paused
     */
    function isPaused() {
        return syncPaused;
    }

    // Public API
    return {
        init,
        startPolling,
        pausePolling,
        manualRefresh,
        resetActivity,
        stop,
        isPaused
    };
})();
