/**
 * Tests for the SwarmSpace API
 *
 * These tests verify the atomic operations for multi-user SwarmSpace sessions:
 * - GET: Fetch session document
 * - PUT: Replace entire session document
 * - POST: Atomically append item to array (with ETag locking)
 * - DELETE: Atomically remove item from array by ID (with ETag locking)
 *
 * SwarmSpace Document Schema:
 * {
 *   title: string,
 *   setting: string,
 *   startingWeek: number,
 *   currentWeekId: string | null,
 *   weeks: [{ id, weekNumber, event: { text, comments: [] }, action: { type, comments: [] }, completions: [] }],
 *   resources: [{ id, name, status }],
 *   locations: [{ id, name, distance, notes }],
 *   names: [{ id, name, description }]
 * }
 *
 * API Path: /api/tasks/{sessionName}
 * Example: /api/tasks/session-2026-01-24
 */

// Mock the Azure Blob Storage SDK
jest.mock('@azure/storage-blob', () => ({
    BlobServiceClient: jest.fn()
}));

const { BlobServiceClient } = require('@azure/storage-blob');

// Import the handler after mocking
const handler = require('./index');

// ============ TEST CONSTANTS ============

const TEST_SESSION_NAME = 'test-session-isolated';
const TEST_STORAGE_ACCOUNT = 'https://test-storage-mock.blob.core.windows.net';
const TEST_CONTAINER = 'test-swarmspace-isolated';

// Empty SwarmSpace session template
const EMPTY_SESSION = {
    title: '',
    setting: '',
    startingWeek: 1,
    currentWeekId: null,
    weeks: [],
    resources: [],
    locations: [],
    names: []
};

// ============ TEST HELPERS ============

/**
 * Create a mock Azure context object for a SwarmSpace session
 */
function createContext(sessionName = TEST_SESSION_NAME) {
    return {
        res: null,
        bindingData: { listName: sessionName }
    };
}

/**
 * Create a mock request object
 */
function createRequest(method, body = null) {
    return {
        method,
        body
    };
}

/**
 * Create mock blob client with configurable behavior
 * @param {Object} options
 * @param {Object} options.session - SwarmSpace session document (default: empty session)
 * @param {string} options.etag - ETag for optimistic locking
 * @param {Error} options.downloadError - Error to throw on download
 * @param {Error} options.uploadError - Error to throw on upload
 */
function createMockBlobClient(options = {}) {
    const {
        session = { ...EMPTY_SESSION },
        etag = '"test-etag-123"',
        downloadError = null,
        uploadError = null
    } = options;

    const mockUpload = jest.fn().mockImplementation(async (data, length, opts) => {
        // Simulate ETag mismatch (conflict)
        if (uploadError) {
            throw uploadError;
        }
        if (opts?.conditions?.ifMatch && opts.conditions.ifMatch !== etag) {
            const error = new Error('Precondition Failed');
            error.statusCode = 412;
            throw error;
        }
        return { etag: '"new-etag-456"' };
    });

    const mockDownload = jest.fn().mockImplementation(async () => {
        if (downloadError) {
            throw downloadError;
        }
        return {
            etag,
            readableStreamBody: {
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from(JSON.stringify(session));
                }
            }
        };
    });

    const mockBlockBlobClient = {
        upload: mockUpload,
        download: mockDownload
    };

    const mockContainerClient = {
        getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient)
    };

    const mockBlobServiceClient = {
        getContainerClient: jest.fn().mockReturnValue(mockContainerClient)
    };

    BlobServiceClient.mockImplementation(() => mockBlobServiceClient);

    return {
        blobServiceClient: mockBlobServiceClient,
        containerClient: mockContainerClient,
        blockBlobClient: mockBlockBlobClient,
        upload: mockUpload,
        download: mockDownload
    };
}

// ============ SETUP ============

beforeEach(() => {
    jest.clearAllMocks();
    // Use clearly isolated test values - NOT production
    process.env.BLOB_SAS_URL = `${TEST_STORAGE_ACCOUNT}?sv=2021-06-08&ss=b&srt=sco&sp=rwdlacyx&se=2099-01-01`;
    process.env.BLOB_CONTAINER_NAME = TEST_CONTAINER;
});

afterEach(() => {
    delete process.env.BLOB_SAS_URL;
    delete process.env.BLOB_CONTAINER_NAME;
});

// ============ CONFIGURATION TESTS ============

describe('API Configuration', () => {
    test('returns 500 if BLOB_SAS_URL is not configured', async () => {
        delete process.env.BLOB_SAS_URL;
        const context = createContext();
        const req = createRequest('GET');

        await handler(context, req);

        expect(context.res.status).toBe(500);
        expect(JSON.parse(context.res.body).error).toBe('BLOB_SAS_URL not configured');
    });

    test('returns 500 if BLOB_SAS_URL is invalid', async () => {
        process.env.BLOB_SAS_URL = 'not-a-valid-url';
        const context = createContext();
        const req = createRequest('GET');

        await handler(context, req);

        expect(context.res.status).toBe(500);
        expect(JSON.parse(context.res.body).error).toContain('Invalid BLOB_SAS_URL');
    });
});

// ============ CORS TESTS ============

describe('CORS Handling', () => {
    test('OPTIONS request returns 204 with CORS headers', async () => {
        createMockBlobClient();
        const context = createContext();
        const req = createRequest('OPTIONS');

        await handler(context, req);

        expect(context.res.status).toBe(204);
        expect(context.res.headers['Access-Control-Allow-Origin']).toBe('*');
        expect(context.res.headers['Access-Control-Allow-Methods']).toBe('GET, PUT, POST, DELETE, OPTIONS');
        expect(context.res.headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    });
});

// ============ GET TESTS ============

describe('GET - Fetch Session', () => {
    /**
     * GET /api/tasks/test-session-isolated
     * Returns the full SwarmSpace session document
     */
    test('returns session document', async () => {
        const testSession = {
            title: 'Test Session',
            setting: 'A space colony',
            startingWeek: 1,
            currentWeekId: 'w1',
            weeks: [{ id: 'w1', weekNumber: 1, event: { text: '', comments: [] }, completions: [] }],
            resources: [],
            locations: [],
            names: []
        };
        createMockBlobClient({ session: testSession });

        const context = createContext();
        const req = createRequest('GET');

        await handler(context, req);

        expect(context.res.status).toBe(200);
        expect(JSON.parse(context.res.body)).toEqual(testSession);
    });

    test('returns 404 if session does not exist', async () => {
        const notFoundError = new Error('Not Found');
        notFoundError.statusCode = 404;
        createMockBlobClient({ downloadError: notFoundError });

        const context = createContext();
        const req = createRequest('GET');

        await handler(context, req);

        expect(context.res.status).toBe(404);
        expect(JSON.parse(context.res.body).error).toBe('List not found');
    });
});

// ============ PUT TESTS ============

describe('PUT - Replace Session', () => {
    /**
     * PUT /api/tasks/test-session-isolated
     * Replaces the entire session (used for metadata changes, imports, etc.)
     */
    test('replaces entire session document', async () => {
        const mocks = createMockBlobClient();
        const context = createContext();
        const updatedSession = {
            title: 'Updated Session Title',
            setting: 'New setting',
            startingWeek: 5,
            currentWeekId: null,
            weeks: [],
            resources: [],
            locations: [],
            names: []
        };
        const req = createRequest('PUT', updatedSession);

        await handler(context, req);

        expect(context.res.status).toBe(200);
        expect(JSON.parse(context.res.body).success).toBe(true);
        expect(mocks.upload).toHaveBeenCalledWith(
            JSON.stringify(updatedSession),
            JSON.stringify(updatedSession).length,
            { overwrite: true }
        );
    });
});

// ============ POST (APPEND) TESTS ============

describe('POST - Atomic Append', () => {
    /**
     * Add a new week to the session
     *
     * POST /api/tasks/test-session-isolated
     * { "path": "weeks", "value": { "id": "w2", "weekNumber": 2, ... } }
     */
    test('appends week to weeks array', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            weeks: [{ id: 'w1', weekNumber: 1, event: { text: '', comments: [] }, completions: [] }]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const newWeek = {
            id: 'w2',
            weekNumber: 2,
            event: { text: '', comments: [] },
            action: { type: 'discussion', comments: [] },
            completions: []
        };
        const req = createRequest('POST', { path: 'weeks', value: newWeek });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.success).toBe(true);
        expect(response.data.weeks).toHaveLength(2);
        expect(response.data.weeks[1]).toEqual(newWeek);
    });

    /**
     * Add a comment to a week's event
     *
     * POST /api/tasks/test-session-isolated
     * { "path": "weeks.0.event.comments", "value": { "id": "c1", "text": "My comment" } }
     */
    test('appends comment to week event', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            weeks: [{
                id: 'w1',
                weekNumber: 1,
                event: { text: 'Drew the Plague card', comments: [] },
                completions: []
            }]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const newComment = { id: 'c1', text: 'We decided to quarantine the affected area' };
        const req = createRequest('POST', { path: 'weeks.0.event.comments', value: newComment });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.data.weeks[0].event.comments).toHaveLength(1);
        expect(response.data.weeks[0].event.comments[0]).toEqual(newComment);
    });

    /**
     * Add a scarcity resource
     *
     * POST /api/tasks/test-session-isolated
     * { "path": "resources", "value": { "id": "r1", "name": "Water", "status": "scarce" } }
     */
    test('appends resource (scarcity)', async () => {
        createMockBlobClient({ session: { ...EMPTY_SESSION } });

        const context = createContext();
        const newResource = { id: 'r1', name: 'Clean Water', status: 'scarce' };
        const req = createRequest('POST', { path: 'resources', value: newResource });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.data.resources).toContainEqual(newResource);
    });

    /**
     * Add a location
     *
     * POST /api/tasks/test-session-isolated
     * { "path": "locations", "value": { "id": "l1", "name": "The Ruins", "distance": "3 weeks", "notes": "" } }
     */
    test('appends location', async () => {
        createMockBlobClient({ session: { ...EMPTY_SESSION } });

        const context = createContext();
        const newLocation = { id: 'l1', name: 'The Abandoned Station', distance: '3 weeks', notes: 'Reportedly has supplies' };
        const req = createRequest('POST', { path: 'locations', value: newLocation });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.data.locations).toContainEqual(newLocation);
    });

    /**
     * Add a completion to a week
     *
     * POST /api/tasks/test-session-isolated
     * { "path": "weeks.0.completions", "value": { "id": "comp1", "projectName": "Build Shelter", "comments": [] } }
     */
    test('appends completion to week', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            weeks: [{
                id: 'w1',
                weekNumber: 1,
                event: { text: '', comments: [] },
                completions: []
            }]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const newCompletion = { id: 'comp1', projectName: 'Build Shelter', comments: [] };
        const req = createRequest('POST', { path: 'weeks.0.completions', value: newCompletion });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.data.weeks[0].completions).toHaveLength(1);
        expect(response.data.weeks[0].completions[0].projectName).toBe('Build Shelter');
    });

    test('returns 400 if path is missing', async () => {
        createMockBlobClient();
        const context = createContext();
        const req = createRequest('POST', { value: { id: '1' } });

        await handler(context, req);

        expect(context.res.status).toBe(400);
        expect(JSON.parse(context.res.body).error).toBe('Missing path or value');
    });

    test('returns 400 if value is missing', async () => {
        createMockBlobClient();
        const context = createContext();
        const req = createRequest('POST', { path: 'weeks' });

        await handler(context, req);

        expect(context.res.status).toBe(400);
        expect(JSON.parse(context.res.body).error).toBe('Missing path or value');
    });

    test('returns 400 if path does not point to an array', async () => {
        createMockBlobClient({ session: { ...EMPTY_SESSION, title: 'Test Session' } });

        const context = createContext();
        const req = createRequest('POST', { path: 'title', value: 'ignored' });

        await handler(context, req);

        expect(context.res.status).toBe(400);
        expect(JSON.parse(context.res.body).error).toBe('Path must point to array');
    });

    /**
     * Conflict handling: When another user modifies the session between read and write,
     * the API returns 409 Conflict. The client should retry with exponential backoff.
     */
    test('returns 409 on ETag mismatch (concurrent edit conflict)', async () => {
        const existingSession = { ...EMPTY_SESSION };

        // Simulate another client modifying the document after we read it
        const mocks = createMockBlobClient({ session: existingSession });
        mocks.upload.mockImplementationOnce(async (data, length, opts) => {
            if (opts?.conditions?.ifMatch) {
                const error = new Error('Precondition Failed');
                error.statusCode = 412;
                throw error;
            }
        });

        const context = createContext();
        const req = createRequest('POST', {
            path: 'weeks',
            value: { id: 'w1', weekNumber: 1, event: { text: '', comments: [] }, completions: [] }
        });

        await handler(context, req);

        expect(context.res.status).toBe(409);
        expect(JSON.parse(context.res.body).error).toBe('Conflict, please retry');
    });
});

// ============ DELETE TESTS ============

describe('DELETE - Atomic Remove', () => {
    /**
     * Delete a resource (scarcity/abundance) by ID
     *
     * DELETE /api/tasks/test-session-isolated
     * { "path": "resources", "id": "r1" }
     */
    test('removes resource by id', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            resources: [
                { id: 'r1', name: 'Clean Water', status: 'scarce' },
                { id: 'r2', name: 'Solar Power', status: 'abundant' }
            ]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const req = createRequest('DELETE', { path: 'resources', id: 'r1' });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.success).toBe(true);
        expect(response.data.resources).toHaveLength(1);
        expect(response.data.resources[0].id).toBe('r2');
    });

    /**
     * Delete a comment from a week's event
     *
     * DELETE /api/tasks/test-session-isolated
     * { "path": "weeks.0.event.comments", "id": "c1" }
     */
    test('removes comment from week event', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            weeks: [{
                id: 'w1',
                weekNumber: 1,
                event: {
                    text: 'Drew the Famine card',
                    comments: [
                        { id: 'c1', text: 'First response' },
                        { id: 'c2', text: 'Second response' }
                    ]
                },
                completions: []
            }]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const req = createRequest('DELETE', { path: 'weeks.0.event.comments', id: 'c1' });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.data.weeks[0].event.comments).toHaveLength(1);
        expect(response.data.weeks[0].event.comments[0].id).toBe('c2');
    });

    /**
     * Delete a completion from a week
     *
     * DELETE /api/tasks/test-session-isolated
     * { "path": "weeks.0.completions", "id": "comp1" }
     */
    test('removes completion from week', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            weeks: [{
                id: 'w1',
                weekNumber: 1,
                event: { text: '', comments: [] },
                completions: [
                    { id: 'comp1', projectName: 'Build Shelter', comments: [] },
                    { id: 'comp2', projectName: 'Find Water Source', comments: [] }
                ]
            }]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const req = createRequest('DELETE', { path: 'weeks.0.completions', id: 'comp1' });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.data.weeks[0].completions).toHaveLength(1);
        expect(response.data.weeks[0].completions[0].projectName).toBe('Find Water Source');
    });

    /**
     * Delete a location
     *
     * DELETE /api/tasks/test-session-isolated
     * { "path": "locations", "id": "l1" }
     */
    test('removes location by id', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            locations: [
                { id: 'l1', name: 'The Ruins', distance: '2 weeks', notes: '' },
                { id: 'l2', name: 'Abandoned Mine', distance: '5 weeks', notes: 'Dangerous' }
            ]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const req = createRequest('DELETE', { path: 'locations', id: 'l1' });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.data.locations).toHaveLength(1);
        expect(response.data.locations[0].name).toBe('Abandoned Mine');
    });

    /**
     * Delete a name entry
     *
     * DELETE /api/tasks/test-session-isolated
     * { "path": "names", "id": "n1" }
     */
    test('removes name by id', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            names: [
                { id: 'n1', name: 'Captain Vex', description: 'Colony leader' },
                { id: 'n2', name: 'Dr. Chen', description: 'Medical officer' }
            ]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const req = createRequest('DELETE', { path: 'names', id: 'n1' });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.data.names).toHaveLength(1);
        expect(response.data.names[0].name).toBe('Dr. Chen');
    });

    test('returns 400 if path is missing', async () => {
        createMockBlobClient();
        const context = createContext();
        const req = createRequest('DELETE', { id: 'r1' });

        await handler(context, req);

        expect(context.res.status).toBe(400);
        expect(JSON.parse(context.res.body).error).toBe('Missing path or id');
    });

    test('returns 400 if id is missing', async () => {
        createMockBlobClient();
        const context = createContext();
        const req = createRequest('DELETE', { path: 'resources' });

        await handler(context, req);

        expect(context.res.status).toBe(400);
        expect(JSON.parse(context.res.body).error).toBe('Missing path or id');
    });

    test('returns 400 if path does not point to an array', async () => {
        createMockBlobClient({ session: { ...EMPTY_SESSION, title: 'Test Session' } });

        const context = createContext();
        const req = createRequest('DELETE', { path: 'title', id: 'x' });

        await handler(context, req);

        expect(context.res.status).toBe(400);
        expect(JSON.parse(context.res.body).error).toBe('Path must point to array');
    });

    test('returns 404 if item with id is not found', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            resources: [{ id: 'r1', name: 'Water', status: 'scarce' }]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const req = createRequest('DELETE', { path: 'resources', id: 'nonexistent-id' });

        await handler(context, req);

        expect(context.res.status).toBe(404);
        expect(JSON.parse(context.res.body).error).toBe('Item not found');
    });

    test('returns 409 on ETag mismatch (concurrent edit conflict)', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            resources: [{ id: 'r1', name: 'Water', status: 'scarce' }]
        };
        const mocks = createMockBlobClient({ session: existingSession });

        mocks.upload.mockImplementationOnce(async (data, length, opts) => {
            if (opts?.conditions?.ifMatch) {
                const error = new Error('Precondition Failed');
                error.statusCode = 412;
                throw error;
            }
        });

        const context = createContext();
        const req = createRequest('DELETE', { path: 'resources', id: 'r1' });

        await handler(context, req);

        expect(context.res.status).toBe(409);
        expect(JSON.parse(context.res.body).error).toBe('Conflict, please retry');
    });
});

// ============ PATH NAVIGATION TESTS ============

describe('Path Navigation', () => {
    /**
     * Path syntax supports:
     * - Top-level arrays: "resources" -> session.resources
     * - Nested via index: "weeks.0.event.comments" -> session.weeks[0].event.comments
     * - Numeric indices: "weeks.1" -> session.weeks[1]
     * - Deep nesting: "weeks.0.completions.0.comments"
     */

    test('path "resources" -> session.resources', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            resources: [{ id: 'r1', name: 'Existing', status: 'scarce' }]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const req = createRequest('POST', {
            path: 'resources',
            value: { id: 'r2', name: 'New Resource', status: 'abundant' }
        });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        expect(JSON.parse(context.res.body).data.resources).toHaveLength(2);
    });

    test('path "weeks.1.completions" -> session.weeks[1].completions', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            weeks: [
                { id: 'w1', weekNumber: 1, event: { text: '', comments: [] }, completions: [] },
                { id: 'w2', weekNumber: 2, event: { text: '', comments: [] }, completions: [{ id: 'c1', projectName: 'Existing', comments: [] }] }
            ]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const req = createRequest('POST', {
            path: 'weeks.1.completions',
            value: { id: 'c2', projectName: 'New Completion', comments: [] }
        });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.data.weeks[1].completions).toHaveLength(2);
    });

    test('path "weeks.0.completions.0.comments" -> deeply nested array', async () => {
        const existingSession = {
            ...EMPTY_SESSION,
            weeks: [{
                id: 'w1',
                weekNumber: 1,
                event: { text: '', comments: [] },
                completions: [{
                    id: 'comp1',
                    projectName: 'Build Shelter',
                    comments: []
                }]
            }]
        };
        createMockBlobClient({ session: existingSession });

        const context = createContext();
        const req = createRequest('POST', {
            path: 'weeks.0.completions.0.comments',
            value: { id: 'cm1', text: 'Finished ahead of schedule!' }
        });

        await handler(context, req);

        expect(context.res.status).toBe(200);
        const response = JSON.parse(context.res.body);
        expect(response.data.weeks[0].completions[0].comments).toHaveLength(1);
        expect(response.data.weeks[0].completions[0].comments[0].text).toBe('Finished ahead of schedule!');
    });

    test('returns 400 when intermediate path segment does not exist', async () => {
        // weeks array is empty, so weeks.0 doesn't exist
        createMockBlobClient({ session: { ...EMPTY_SESSION } });

        const context = createContext();
        const req = createRequest('POST', {
            path: 'weeks.0.event.comments',
            value: { id: 'c1', text: 'This should fail' }
        });

        await handler(context, req);

        expect(context.res.status).toBe(400);
        expect(JSON.parse(context.res.body).error).toBe('Path must point to array');
    });
});

// ============ INTEGRATION SCENARIO TESTS ============

describe('Integration Scenarios', () => {
    /**
     * Scenario: Multiple users adding comments to the same week's event
     *
     * This simulates the core multi-user use case:
     * - User A (the scribe) and User B (a participant) both add comments
     * - Each request reads the current state, adds their comment, and writes back
     * - ETag locking ensures no comments are lost
     */
    test('concurrent users adding comments to same event', async () => {
        // Initial session with one week
        let currentSession = {
            ...EMPTY_SESSION,
            weeks: [{
                id: 'w1',
                weekNumber: 1,
                event: { text: 'Drew the Plague card - disease spreads through colony', comments: [] },
                action: { type: 'discussion', comments: [] },
                completions: []
            }]
        };
        let currentEtag = '"etag-v1"';

        // Mock that updates state on successful upload (simulating real blob storage)
        const mockUpload = jest.fn().mockImplementation(async (data, length, opts) => {
            if (opts?.conditions?.ifMatch !== currentEtag) {
                const error = new Error('Precondition Failed');
                error.statusCode = 412;
                throw error;
            }
            currentSession = JSON.parse(data);
            currentEtag = `"etag-v${Date.now()}"`;
            return { etag: currentEtag };
        });

        const mockDownload = jest.fn().mockImplementation(async () => ({
            etag: currentEtag,
            readableStreamBody: {
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from(JSON.stringify(currentSession));
                }
            }
        }));

        BlobServiceClient.mockImplementation(() => ({
            getContainerClient: () => ({
                getBlockBlobClient: () => ({
                    upload: mockUpload,
                    download: mockDownload
                })
            })
        }));

        // User A (scribe) adds their comment
        const contextA = createContext();
        const reqA = createRequest('POST', {
            path: 'weeks.0.event.comments',
            value: { id: 'cA', text: 'We decided to quarantine Section B' }
        });
        await handler(contextA, reqA);
        expect(contextA.res.status).toBe(200);

        // User B (participant) adds their comment
        const contextB = createContext();
        const reqB = createRequest('POST', {
            path: 'weeks.0.event.comments',
            value: { id: 'cB', text: 'Dr. Chen is working on a cure' }
        });
        await handler(contextB, reqB);
        expect(contextB.res.status).toBe(200);

        // Both comments should be preserved
        expect(currentSession.weeks[0].event.comments).toHaveLength(2);
        expect(currentSession.weeks[0].event.comments.map(c => c.id)).toContain('cA');
        expect(currentSession.weeks[0].event.comments.map(c => c.id)).toContain('cB');
    });

    /**
     * Scenario: Complete SwarmSpace session workflow
     *
     * Simulates a typical session:
     * 1. Add Week 1
     * 2. Add a scarcity (Water)
     * 3. Add a location (The Ruins)
     * 4. Add a comment to Week 1's event
     * 5. Add a completion to Week 1
     * 6. Delete the scarcity (problem solved!)
     */
    test('full SwarmSpace session workflow', async () => {
        let currentSession = { ...EMPTY_SESSION };
        let currentEtag = '"etag-v1"';

        const mockUpload = jest.fn().mockImplementation(async (data, length, opts) => {
            if (opts?.conditions?.ifMatch && opts.conditions.ifMatch !== currentEtag) {
                const error = new Error('Precondition Failed');
                error.statusCode = 412;
                throw error;
            }
            currentSession = JSON.parse(data);
            currentEtag = `"etag-v${Date.now()}"`;
        });

        const mockDownload = jest.fn().mockImplementation(async () => ({
            etag: currentEtag,
            readableStreamBody: {
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from(JSON.stringify(currentSession));
                }
            }
        }));

        BlobServiceClient.mockImplementation(() => ({
            getContainerClient: () => ({
                getBlockBlobClient: () => ({
                    upload: mockUpload,
                    download: mockDownload
                })
            })
        }));

        // Step 1: Add Week 1
        await handler(createContext(), createRequest('POST', {
            path: 'weeks',
            value: {
                id: 'w1',
                weekNumber: 1,
                event: { text: 'Colony established on hostile planet', comments: [] },
                action: { type: 'project', projectName: 'Build Water Purifier', projectDuration: 2, comments: [] },
                completions: []
            }
        }));
        expect(currentSession.weeks).toHaveLength(1);

        // Step 2: Add a scarcity
        await handler(createContext(), createRequest('POST', {
            path: 'resources',
            value: { id: 'r1', name: 'Clean Water', status: 'scarce' }
        }));
        expect(currentSession.resources).toHaveLength(1);

        // Step 3: Add a location
        await handler(createContext(), createRequest('POST', {
            path: 'locations',
            value: { id: 'l1', name: 'Underground River', distance: '3 weeks', notes: 'Potentially contaminated' }
        }));
        expect(currentSession.locations).toHaveLength(1);

        // Step 4: Add a comment to the event
        await handler(createContext(), createRequest('POST', {
            path: 'weeks.0.event.comments',
            value: { id: 'c1', text: 'The landing was rough but everyone survived' }
        }));
        expect(currentSession.weeks[0].event.comments).toHaveLength(1);

        // Step 5: Add a completion (project finished)
        await handler(createContext(), createRequest('POST', {
            path: 'weeks.0.completions',
            value: { id: 'comp1', projectName: 'Emergency Shelter', comments: [] }
        }));
        expect(currentSession.weeks[0].completions).toHaveLength(1);

        // Step 6: Delete the scarcity (water problem solved!)
        await handler(createContext(), createRequest('DELETE', {
            path: 'resources',
            id: 'r1'
        }));
        expect(currentSession.resources).toHaveLength(0);

        // Final state verification
        expect(currentSession.weeks).toHaveLength(1);
        expect(currentSession.weeks[0].event.comments).toHaveLength(1);
        expect(currentSession.weeks[0].completions).toHaveLength(1);
        expect(currentSession.locations).toHaveLength(1);
        expect(currentSession.resources).toHaveLength(0);
    });
});
