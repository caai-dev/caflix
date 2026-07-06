// scripts/catcher.js
// Execution script for the GitHub Action workflow to automatically catch new channel/playlist uploads.

async function run() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;

    if (!supabaseUrl || !supabaseKey || !youtubeApiKey) {
        console.error('CRITICAL: Missing environment variables SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or YOUTUBE_API_KEY.');
        process.exit(1);
    }

    try {
        console.log('Fetching active sources from database...');
        // 1. Get all active catcher sources
        const sourcesRes = await fetch(`${supabaseUrl}/rest/v1/caflix_sources?select=*`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        if (!sourcesRes.ok) throw new Error(`Failed to fetch sources: ${await sourcesRes.text()}`);
        const sources = await sourcesRes.json();
        
        if (sources.length === 0) {
            console.log('No sources configured in caflix_sources. Exiting.');
            return;
        }

        console.log(`Loaded ${sources.length} source(s). Fetching existing video IDs to deduplicate...`);
        // 2. Fetch all existing video IDs to avoid redundant uploads
        const existingRes = await fetch(`${supabaseUrl}/rest/v1/caflix_videos?select=video_id`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        if (!existingRes.ok) throw new Error(`Failed to fetch existing video IDs: ${await existingRes.text()}`);
        const existingData = await existingRes.json();
        const existingIds = new Set(existingData.map(v => v.video_id));

        console.log(`Found ${existingIds.size} existing videos in library.`);

        let newVideosTotal = [];

        // 3. Query YouTube API for each source
        for (const source of sources) {
            let playlistId = source.source_id;
            
            if (source.source_type === 'channel') {
                // If it is a channel ID (starts with UC...), the uploads playlist ID is the same with UU...
                if (playlistId.startsWith('UC')) {
                    playlistId = 'UU' + playlistId.substring(2);
                    console.log(`Source [${source.title || source.source_id}] is a channel. Mapped uploads playlist ID to: ${playlistId}`);
                } else {
                    console.log(`Warning: Source ID ${playlistId} was tagged as a channel but does not start with 'UC'. Querying as-is.`);
                }
            } else {
                console.log(`Source [${source.title || source.source_id}] is a playlist ID: ${playlistId}`);
            }

            try {
                // Call playlistItems.list to fetch the latest 50 uploads
                const ytUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${youtubeApiKey}`;
                const ytRes = await fetch(ytUrl);
                if (!ytRes.ok) {
                    console.error(`Error querying YouTube API for playlist ${playlistId}: ${await ytRes.text()}`);
                    continue; // Continue to next source
                }

                const ytData = await ytRes.json();
                const items = ytData.items || [];
                console.log(`Fetched ${items.length} videos from source playlist.`);

                let sourceNewCount = 0;
                for (const item of items) {
                    const snippet = item.snippet;
                    const videoId = item.contentDetails?.videoId || snippet?.resourceId?.videoId;
                    
                    if (videoId && !existingIds.has(videoId)) {
                        newVideosTotal.push({
                            title: snippet.title || 'Untitled Video',
                            video_id: videoId,
                            paper: source.paper,
                            chapter: null, // Excluded chapter mapping in catcher
                            description: snippet.description || '',
                            source_type: source.source_type,
                            source_id: source.source_id
                        });
                        sourceNewCount++;
                    }
                }
                console.log(`Found ${sourceNewCount} new videos in this source.`);
            } catch (err) {
                console.error(`Failed processing source ${playlistId}:`, err);
            }
        }

        // 4. Bulk insert new videos into database
        if (newVideosTotal.length > 0) {
            console.log(`Inserting ${newVideosTotal.length} new video(s) into database...`);
            const insertRes = await fetch(`${supabaseUrl}/rest/v1/caflix_videos`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(newVideosTotal)
            });

            if (!insertRes.ok) {
                throw new Error(`Failed to insert new videos: ${await insertRes.text()}`);
            }
            console.log('Successfully saved caught videos.');
        } else {
            console.log('No new videos to insert.');
        }

        console.log('Catcher workflow execution complete.');

    } catch (error) {
        console.error('Fatal execution error:', error);
        process.exit(1);
    }
}

run();
