// netlify/functions/admin.js
// Admin endpoints for manual additions, editing, and managing sources.
// Secured with x-admin-key verification.

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json'
};

function extractVideoId(input) {
    if (typeof input !== 'string') return null;
    const cleanInput = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleanInput)) {
        return cleanInput;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|live\/|shorts\/)([^#\&\?]*).*/;
    const match = cleanInput.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function extractPlaylistId(input) {
    if (typeof input !== 'string') return null;
    const clean = input.trim();
    if (/^PL[a-zA-Z0-9_-]+$/.test(clean)) {
        return clean;
    }
    const match = clean.match(/[&?]list=(PL[a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

exports.handler = async function (event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Verify Admin Key
    const clientAdminKey = event.headers['x-admin-key'];
    const serverAdminKey = process.env.ADMIN_API_KEY;

    if (!serverAdminKey) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'ADMIN_API_KEY environment variable is not set on the server.' })
        };
    }

    if (!clientAdminKey || clientAdminKey !== serverAdminKey) {
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Unauthorized: Invalid or missing x-admin-key header.' })
        };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Supabase credentials are not configured on the server.' })
        };
    }

    // Parse path parameters to route action
    const pathSegments = event.path.split('/').filter(Boolean);
    const action = pathSegments[pathSegments.length - 1]; // e.g. 'add-video', 'sources', 'video'

    try {
        let bodyData = {};
        if (event.body) {
            bodyData = JSON.parse(event.body);
        }

        // ==========================================
        // ACTION: GET/POST/DELETE sources
        // ==========================================
        if (action === 'sources') {
            if (event.httpMethod === 'GET') {
                // List auto-catcher sources
                const res = await fetch(`${supabaseUrl}/rest/v1/caflix_sources?select=*&order=created_at.desc`, {
                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                });
                const data = await res.json();
                return { statusCode: 200, headers, body: JSON.stringify(data) };
            } 
            
            if (event.httpMethod === 'POST') {
                // Add a source (Channel or Playlist)
                const { sourceId, sourceType, paper, chapter, title } = bodyData;
                if (!sourceId || !sourceType || !paper || !chapter) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required source fields.' }) };
                }

                const res = await fetch(`${supabaseUrl}/rest/v1/caflix_sources`, {
                    method: 'POST',
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates'
                    },
                    body: JSON.stringify({
                        source_id: sourceId.trim(),
                        source_type: sourceType,
                        paper,
                        chapter,
                        title: title || `${sourceType} Source`
                    })
                });

                if (!res.ok) throw new Error(await res.text());
                return { statusCode: 201, headers, body: JSON.stringify({ message: 'Source added successfully' }) };
            }

            if (event.httpMethod === 'DELETE') {
                // Delete a source
                const id = event.queryStringParameters?.id;
                if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing source ID.' }) };

                const res = await fetch(`${supabaseUrl}/rest/v1/caflix_sources?id=eq.${id}`, {
                    method: 'DELETE',
                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                });

                if (!res.ok) throw new Error(await res.text());
                return { statusCode: 200, headers, body: JSON.stringify({ message: 'Source deleted successfully' }) };
            }
        }

        // ==========================================
        // ACTION: POST add-video (Single or Playlist)
        // ==========================================
        if (action === 'add-video' && event.httpMethod === 'POST') {
            const { url, title, paper, chapter, description } = bodyData;
            if (!url || !paper || !chapter) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url, paper, or chapter.' }) };
            }

            const playlistId = extractPlaylistId(url);
            
            if (playlistId) {
                // ----------------------------------------------------
                // CASE A: Input is a Playlist URL/ID -> Full Pagination
                // ----------------------------------------------------
                if (!youtubeApiKey) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'YOUTUBE_API_KEY is not set on the server.' }) };
                }

                let allItems = [];
                let pageToken = '';
                let hasNextPage = true;
                let pageCount = 0;

                while (hasNextPage) {
                    const ytUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${youtubeApiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
                    const ytRes = await fetch(ytUrl);
                    if (!ytRes.ok) {
                        const err = await ytRes.text();
                        throw new Error(`Failed to fetch playlist items: ${err}`);
                    }
                    const ytData = await ytRes.json();
                    if (ytData.items && ytData.items.length > 0) {
                        allItems = allItems.concat(ytData.items);
                    }
                    
                    pageCount++;
                    if (ytData.nextPageToken && pageCount < 100) { // Safety cap of 5000 videos to prevent infinite loops
                        pageToken = ytData.nextPageToken;
                    } else {
                        hasNextPage = false;
                    }
                }

                if (allItems.length === 0) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No videos found in the playlist.' }) };
                }

                const videosToInsert = allItems.map(item => {
                    const snippet = item.snippet;
                    const videoId = item.contentDetails?.videoId || snippet?.resourceId?.videoId;
                    return {
                        title: snippet.title || 'Untitled Video',
                        video_id: videoId,
                        paper,
                        chapter,
                        description: snippet.description || '',
                        source_type: 'playlist',
                        source_id: playlistId
                    };
                }).filter(v => v.video_id);

                // Bulk upsert into Supabase
                const dbRes = await fetch(`${supabaseUrl}/rest/v1/caflix_videos`, {
                    method: 'POST',
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates'
                    },
                    body: JSON.stringify(videosToInsert)
                });

                if (!dbRes.ok) throw new Error(await dbRes.text());

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        message: `Successfully imported ${videosToInsert.length} videos from playlist.`,
                        count: videosToInsert.length
                    })
                };

            } else {
                // ----------------------------------------------------
                // CASE B: Input is a Single Video URL or ID
                // ----------------------------------------------------
                const videoId = extractVideoId(url);
                if (!videoId) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid YouTube Video URL or ID.' }) };
                }

                let finalTitle = title ? title.trim() : '';
                let finalDesc = description ? description.trim() : '';

                // Fetch metadata if title is empty
                if (!finalTitle && youtubeApiKey) {
                    const ytUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${youtubeApiKey}`;
                    const ytRes = await fetch(ytUrl);
                    if (ytRes.ok) {
                        const ytData = await ytRes.json();
                        if (ytData.items && ytData.items[0]) {
                            finalTitle = ytData.items[0].snippet.title;
                            finalDesc = finalDesc || ytData.items[0].snippet.description;
                        }
                    }
                }

                if (!finalTitle) finalTitle = `CA Video [${videoId}]`;

                const dbRes = await fetch(`${supabaseUrl}/rest/v1/caflix_videos`, {
                    method: 'POST',
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates'
                    },
                    body: JSON.stringify({
                        title: finalTitle,
                        video_id: videoId,
                        paper,
                        chapter,
                        description: finalDesc,
                        source_type: 'manual',
                        source_id: null
                    })
                });

                if (!dbRes.ok) throw new Error(await dbRes.text());

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ message: 'Video added successfully', videoId })
                };
            }
        }

        // ==========================================
        // ACTION: PATCH/DELETE single video
        // ==========================================
        if (action === 'video') {
            const id = event.queryStringParameters?.id || bodyData.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing Video Database ID.' }) };

            if (event.httpMethod === 'PATCH') {
                const { title, paper, chapter, description } = bodyData;
                const dbRes = await fetch(`${supabaseUrl}/rest/v1/caflix_videos?id=eq.${id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ title, paper, chapter, description })
                });

                if (!dbRes.ok) throw new Error(await dbRes.text());
                return { statusCode: 200, headers, body: JSON.stringify({ message: 'Video updated successfully' }) };
            }

            if (event.httpMethod === 'DELETE') {
                const dbRes = await fetch(`${supabaseUrl}/rest/v1/caflix_videos?id=eq.${id}`, {
                    method: 'DELETE',
                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                });

                if (!dbRes.ok) throw new Error(await dbRes.text());
                return { statusCode: 200, headers, body: JSON.stringify({ message: 'Video deleted successfully' }) };
            }
        }

        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Action endpoint not found.' }) };

    } catch (err) {
        console.error('Admin API error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error: ' + err.message })
        };
    }
};
