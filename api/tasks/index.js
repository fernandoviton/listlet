const { BlobServiceClient } = require('@azure/storage-blob');

/**
 * Navigate to a nested path in an object
 * @param {Object} obj - The object to navigate
 * @param {string} path - Dot-separated path (e.g., 'weeks.0.event.comments')
 * @returns {*} - The value at the path, or undefined if not found
 */
function navigateToPath(obj, path) {
    return path.split('.').reduce((curr, part) => {
        if (curr === undefined) return undefined;
        return /^\d+$/.test(part) ? curr[parseInt(part)] : curr[part];
    }, obj);
}

module.exports = async function (context, req) {
    // Allowed CORS origins
    const allowedOrigins = [
        'https://nice-mud-08d29c61e.1.azurestaticapps.net',
        'http://localhost:8000',
        'http://localhost:8080',
        'http://localhost:3000',
        'http://127.0.0.1:8000',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:3000'
    ];

    const reqHeaders = req.headers || {};
    const origin = reqHeaders['origin'] || reqHeaders['Origin'] || '';
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    // CORS headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 204, headers };
        return;
    }

    const containerName = context.bindingData.container;
    const blobName = `${context.bindingData.name}.json`;

    const sasUrl = process.env.BLOB_SAS_URL;

    // Validate container name (alphanumeric and hyphens only, 3-63 chars)
    if (!containerName || !/^[a-z0-9-]{3,63}$/.test(containerName)) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: 'Invalid container name' }) };
        return;
    }

    // Validate env vars
    if (!sasUrl) {
        context.res = { status: 500, headers, body: JSON.stringify({ error: 'BLOB_SAS_URL not configured' }) };
        return;
    }

    let blobServiceClient;
    try {
        // SAS URL format: https://<account>.blob.core.windows.net?<sas-token>
        const url = new URL(sasUrl);
        const sasToken = url.search; // includes the '?'
        blobServiceClient = new BlobServiceClient(`${url.origin}${sasToken}`);
    } catch (e) {
        context.res = { status: 500, headers, body: JSON.stringify({ error: `Invalid BLOB_SAS_URL: ${e.message}` }) };
        return;
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(blobName);

    try {
        if (req.method === 'GET') {
            const downloadResponse = await blobClient.download(0);
            const content = await streamToString(downloadResponse.readableStreamBody);
            context.res = { status: 200, headers, body: content };
        } 
        else if (req.method === 'PUT') {
            const data = JSON.stringify(req.body);
            await blobClient.upload(data, data.length, { overwrite: true });
            context.res = { status: 200, headers, body: JSON.stringify({ success: true }) };
        }
        else if (req.method === 'POST') {
            // Atomic append to array with ETag-based optimistic locking
            const { path, value } = req.body;

            if (!path || value === undefined) {
                context.res = { status: 400, headers, body: JSON.stringify({ error: 'Missing path or value' }) };
                return;
            }

            // GET with ETag
            const downloadResponse = await blobClient.download(0);
            const etag = downloadResponse.etag;
            const content = await streamToString(downloadResponse.readableStreamBody);
            const data = JSON.parse(content);

            // Navigate to path and append value
            const target = navigateToPath(data, path);
            if (!Array.isArray(target)) {
                context.res = { status: 400, headers, body: JSON.stringify({ error: 'Path must point to array' }) };
                return;
            }

            // Server-side week number calculation to prevent duplicates from concurrent adds
            if (path === 'weeks' && value && typeof value === 'object') {
                // If weeks exist, new week is last week's number + 1; otherwise default to 1
                if (target.length > 0) {
                    const lastWeek = target[target.length - 1];
                    value.weekNumber = (lastWeek.weekNumber || 1) + 1;
                } else {
                    value.weekNumber = value.weekNumber || 1;
                }
            }

            target.push(value);

            // PUT with If-Match (optimistic locking)
            try {
                const newData = JSON.stringify(data);
                await blobClient.upload(newData, newData.length, {
                    overwrite: true,
                    conditions: { ifMatch: etag }
                });
                // Return full document for client sync
                context.res = { status: 200, headers, body: JSON.stringify({ success: true, data }) };
            } catch (e) {
                if (e.statusCode === 412) {
                    context.res = { status: 409, headers, body: JSON.stringify({ error: 'Conflict, please retry' }) };
                    return;
                }
                throw e;
            }
        }
        else if (req.method === 'DELETE') {
            // Atomic remove from array by id with ETag-based optimistic locking
            const { path, id } = req.body;

            if (!path || !id) {
                context.res = { status: 400, headers, body: JSON.stringify({ error: 'Missing path or id' }) };
                return;
            }

            // GET with ETag
            const downloadResponse = await blobClient.download(0);
            const etag = downloadResponse.etag;
            const content = await streamToString(downloadResponse.readableStreamBody);
            const data = JSON.parse(content);

            // Navigate to path and remove item by id
            const target = navigateToPath(data, path);
            if (!Array.isArray(target)) {
                context.res = { status: 400, headers, body: JSON.stringify({ error: 'Path must point to array' }) };
                return;
            }

            const index = target.findIndex(item => item.id === id);
            if (index === -1) {
                context.res = { status: 404, headers, body: JSON.stringify({ error: 'Item not found' }) };
                return;
            }
            target.splice(index, 1);

            // PUT with If-Match (optimistic locking)
            try {
                const newData = JSON.stringify(data);
                await blobClient.upload(newData, newData.length, {
                    overwrite: true,
                    conditions: { ifMatch: etag }
                });
                // Return full document for client sync
                context.res = { status: 200, headers, body: JSON.stringify({ success: true, data }) };
            } catch (e) {
                if (e.statusCode === 412) {
                    context.res = { status: 409, headers, body: JSON.stringify({ error: 'Conflict, please retry' }) };
                    return;
                }
                throw e;
            }
        }
        else if (req.method === 'PATCH') {
            // Atomic update of single field with ETag-based optimistic locking
            const { path, value } = req.body;

            if (!path || value === undefined) {
                context.res = { status: 400, headers, body: JSON.stringify({ error: 'Missing path or value' }) };
                return;
            }

            // GET with ETag
            const downloadResponse = await blobClient.download(0);
            const etag = downloadResponse.etag;
            const content = await streamToString(downloadResponse.readableStreamBody);
            const data = JSON.parse(content);

            // Navigate to parent and set the value
            const pathParts = path.split('.');
            const fieldName = pathParts.pop();
            const parentPath = pathParts.join('.');

            let parent;
            if (parentPath === '') {
                parent = data;
            } else {
                parent = navigateToPath(data, parentPath);
            }

            if (parent === undefined || parent === null) {
                context.res = { status: 400, headers, body: JSON.stringify({ error: 'Invalid path' }) };
                return;
            }

            // Handle array index in field name
            const key = /^\d+$/.test(fieldName) ? parseInt(fieldName) : fieldName;

            // Check if the key exists (for nested paths, we require it to exist except for top-level)
            if (parentPath !== '' && !(key in parent)) {
                context.res = { status: 400, headers, body: JSON.stringify({ error: 'Invalid path' }) };
                return;
            }

            parent[key] = value;

            // PUT with If-Match (optimistic locking)
            try {
                const newData = JSON.stringify(data);
                await blobClient.upload(newData, newData.length, {
                    overwrite: true,
                    conditions: { ifMatch: etag }
                });
                // Return full document for client sync
                context.res = { status: 200, headers, body: JSON.stringify({ success: true, data }) };
            } catch (e) {
                if (e.statusCode === 412) {
                    context.res = { status: 409, headers, body: JSON.stringify({ error: 'Conflict, please retry' }) };
                    return;
                }
                throw e;
            }
        }
    } catch (error) {
        if (error.statusCode === 404) {
            context.res = { status: 404, headers, body: JSON.stringify({ error: 'List not found' }) };
        } else {
            context.res = { status: 500, headers, body: JSON.stringify({ error: error.message }) };
        }
    }
};

async function streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
}
