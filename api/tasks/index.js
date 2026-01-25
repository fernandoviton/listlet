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
    // CORS headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
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
                const startingWeek = data.startingWeek || 1;
                value.weekNumber = startingWeek + target.length;
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
