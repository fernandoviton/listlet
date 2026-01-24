const { BlobServiceClient } = require('@azure/storage-blob');

module.exports = async function (context, req) {
    // CORS headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 204, headers };
        return;
    }

    const listName = context.bindingData.listName;
    const blobName = `${listName}.json`;

    const sasUrl = process.env.BLOB_SAS_URL;
    const containerName = process.env.BLOB_CONTAINER_NAME || 'tasklists';

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
