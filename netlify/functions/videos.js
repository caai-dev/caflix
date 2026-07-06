// netlify/functions/videos.js
// Public endpoint to retrieve all confirmed videos from Supabase

exports.handler = async function (event, context) {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Supabase credentials are not configured on the server.' })
        };
    }

    try {
        // Query Supabase REST API directly, filtering status = 'confirmed'
        const targetUrl = `${supabaseUrl}/rest/v1/caflix_videos?status=eq.confirmed&select=*&order=paper.asc,created_at.asc`;
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });

        if (!response.ok) {
            const errorMsg = await response.text();
            throw new Error(`Supabase query failed: ${errorMsg}`);
        }

        const videos = await response.json();
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(videos)
        };
    } catch (error) {
        console.error('Error fetching videos:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to retrieve videos from storage: ' + error.message })
        };
    }
};
