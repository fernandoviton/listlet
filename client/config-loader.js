// Config loader - tries config.local.js first, falls back to config.js
// This script must be loaded synchronously before other scripts that need CONFIG

(function() {
    // Check if CONFIG is already defined (config.local.js was loaded)
    if (typeof window.CONFIG !== 'undefined') {
        console.log('[Config] Using pre-loaded config');
        return;
    }

    // Try to load config.local.js synchronously via XHR
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/config.local.js', false); // synchronous
        xhr.send();
        if (xhr.status === 200) {
            // Execute in global scope
            const script = document.createElement('script');
            script.textContent = xhr.responseText;
            document.head.appendChild(script);
            console.log('[Config] Loaded config.local.js');
            return;
        }
    } catch (e) {
        // config.local.js doesn't exist, fall through to config.js
    }

    // Fall back to config.js
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/config.js', false); // synchronous
        xhr.send();
        if (xhr.status === 200) {
            const script = document.createElement('script');
            script.textContent = xhr.responseText;
            document.head.appendChild(script);
            console.log('[Config] Loaded config.js');
        }
    } catch (e) {
        console.error('[Config] Failed to load any config file');
    }
})();
