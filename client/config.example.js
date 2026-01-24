// Configuration - copy this file to config.js and update values for your deployment
const CONFIG = {
    // For Azure Static Web Apps: use relative path (SWA proxies to integrated API)
    API_BASE: '/api/tasks',
    // For standalone Azure Functions: use full URL
    // API_BASE: 'https://YOUR_FUNCTION_APP.azurewebsites.net/api/tasks',
    // For local development without API: use 'mock' for localStorage-based testing
    // API_BASE: 'mock',
    DEFAULT_LIST_NAME: 'tasks'  // Used when no ?list= param in URL
};
