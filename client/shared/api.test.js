/**
 * Tests for createApi - shared API helper.
 *
 * The module is browser code (no module.exports), so we eval it to get createApi on globalThis.
 */

const fs = require('fs');
const path = require('path');

// Load the API helper into global scope
const apiCode = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf-8');
const wrappedCode = apiCode.replace(
    'function createApi(',
    'global.createApi = function createApi('
);
eval(wrappedCode);

// ============ MOCK FETCH ============

let fetchCalls;
let fetchResponses;

function mockFetch(responses) {
    fetchResponses = [...responses];
    fetchCalls = [];
    global.fetch = jest.fn(async (url, opts) => {
        fetchCalls.push({ url, opts });
        const response = fetchResponses.shift();
        if (!response) throw new Error('No more mock responses');
        return response;
    });
}

function jsonResponse(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => body
    };
}

afterEach(() => {
    delete global.fetch;
});

// ============ fetchTasks ============

describe('fetchTasks', () => {
    test('returns data on 200', async () => {
        const api = global.createApi('my-list', '/api/store/quicktrip');
        const doc = { title: 'Trip', participants: [], dates: [] };
        mockFetch([jsonResponse(200, doc)]);

        const result = await api.fetchTasks();

        expect(result).toEqual(doc);
        expect(fetchCalls[0].url).toBe('/api/store/quicktrip/my-list');
    });

    test('throws NOT_FOUND on 404', async () => {
        const api = global.createApi('missing', '/api/store/quicktrip');
        mockFetch([jsonResponse(404, { error: 'List not found' })]);

        await expect(api.fetchTasks()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    test('throws on other errors', async () => {
        const api = global.createApi('broken', '/api/store/quicktrip');
        mockFetch([jsonResponse(500, { error: 'Internal error' })]);

        await expect(api.fetchTasks()).rejects.toThrow('Internal error');
    });
});

// ============ saveTasks ============

describe('saveTasks', () => {
    test('GET-mutate-PUT flow for existing list', async () => {
        const api = global.createApi('existing', '/api/store/quicktrip');
        const existingDoc = { title: 'Old', participants: ['Alice'], dates: [] };
        mockFetch([
            jsonResponse(200, existingDoc),
            jsonResponse(200, { success: true })
        ]);

        const result = await api.saveTasks(d => { d.title = 'Updated'; });

        expect(result.title).toBe('Updated');
        expect(result.participants).toEqual(['Alice']);
        // Verify PUT was called
        expect(fetchCalls[1].opts.method).toBe('PUT');
        const putBody = JSON.parse(fetchCalls[1].opts.body);
        expect(putBody.title).toBe('Updated');
    });

    test('handles 404 on GET by starting with empty object (on-demand creation)', async () => {
        const api = global.createApi('new-trip', '/api/store/quicktrip');
        const defaultDoc = { title: '', participants: [], dates: [] };
        mockFetch([
            jsonResponse(404, { error: 'List not found' }),
            jsonResponse(200, { success: true })
        ]);

        const result = await api.saveTasks(d => {
            Object.assign(d, defaultDoc);
        });

        expect(result).toEqual(defaultDoc);
        // Verify PUT was called with the default doc
        expect(fetchCalls[1].opts.method).toBe('PUT');
        const putBody = JSON.parse(fetchCalls[1].opts.body);
        expect(putBody).toEqual(defaultDoc);
    });

    test('throws on non-404 GET errors', async () => {
        const api = global.createApi('broken', '/api/store/quicktrip');
        mockFetch([jsonResponse(500, { error: 'Server error' })]);

        await expect(api.saveTasks(d => {})).rejects.toThrow('Failed to fetch latest tasks');
    });

    test('throws on PUT failure', async () => {
        const api = global.createApi('existing', '/api/store/quicktrip');
        mockFetch([
            jsonResponse(200, { title: '' }),
            jsonResponse(500, { error: 'Write failed' })
        ]);

        await expect(api.saveTasks(d => {})).rejects.toThrow('Failed to save');
    });
});
