// scripts/catcher.js
// Execution script for the GitHub Action workflow to automatically catch new channel/playlist uploads.

async function classifyVideoWithGemini(title, description, geminiApiKey) {
    if (!geminiApiKey) {
        console.log("No GEMINI_API_KEY found. Defaulting to 'Advanced Accounting'.");
        return 'Advanced Accounting';
    }

    const papers = [
        "Advanced Accounting",
        "Corporate and Other Laws",
        "Taxation",
        "Cost and Management Accounting",
        "Auditing and Ethics",
        "Financial Management and Strategic Management"
    ];

    const prompt = `You are a CA exam syllabus assistant.
Given the following YouTube video title and description, classify it into the best-matching paper name from the exact list of 6 CA Intermediate papers:
1. Advanced Accounting
2. Corporate and Other Laws
3. Taxation
4. Cost and Management Accounting
5. Auditing and Ethics
6. Financial Management and Strategic Management

Video Title: ${title}
Video Description: ${description}

Response format: Return a JSON object with a single key "paper" containing the exact paper name string from the list. If it fits none of them, default to "Advanced Accounting". Do not include markdown code block formatting in your output, just return the raw JSON object.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            console.error(`Gemini API call failed with status ${response.status}: ${await response.text()}`);
            return 'Advanced Accounting';
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            console.error("Gemini API returned an empty text output.");
            return 'Advanced Accounting';
        }

        const result = JSON.parse(text.trim());
        const paperName = result.paper;

        // Verify that it matches one of the 6 papers
        if (papers.includes(paperName)) {
            return paperName;
        } else {
            console.error(`Gemini returned invalid paper: "${paperName}". Defaulting to Advanced Accounting.`);
            return 'Advanced Accounting';
        }
    } catch (err) {
        console.error("Failed to classify video using Gemini:", err);
        return 'Advanced Accounting';
    }
}

async function run() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

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
                // If it is a channel ID (starts with UC...), map uploads playlist ID to UU...
                if (playlistId.startsWith('UC')) {
                    playlistId = 'UU' + playlistId.substring(2);
                    console.log(`Source [${source.title || source.source_id}] is a channel. Uploads playlist: ${playlistId}`);
                } else {
                    console.log(`Warning: Source ID ${playlistId} was tagged as a channel but does not start with 'UC'.`);
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
                    continue;
                }

                const ytData = await ytRes.json();
                const items = ytData.items || [];
                console.log(`Source [${source.title || source.source_id}]: Fetched ${items.length} videos.`);

                for (const item of items) {
                    const snippet = item.snippet;
                    const videoId = item.contentDetails?.videoId || snippet?.resourceId?.videoId;
                    
                    if (videoId && !existingIds.has(videoId)) {
                        let finalPaper = source.paper;
                        let finalStatus = 'confirmed';

                        // If the source is in AI Tagging mode
                        if (source.tagging_mode === 'ai') {
                            console.log(`Classifying new video [${snippet.title}] with Gemini API (gemini-3.1-flash-lite)...`);
                            finalPaper = await classifyVideoWithGemini(snippet.title, snippet.description || '', geminiApiKey);
                            finalStatus = 'pending_review';
                            console.log(`Gemini suggested paper: "${finalPaper}" (Status set to: pending_review)`);
                            
                            // Rate limit buffer: Sleep for 2 seconds to remain within Gemini's free tier RPM limits
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }

                        newVideosTotal.push({
                            title: snippet.title || 'Untitled Video',
                            video_id: videoId,
                            paper: finalPaper,
                            chapter: null,
                            description: snippet.description || '',
                            source_type: source.source_type,
                            source_id: source.source_id,
                            status: finalStatus
                        });

                        existingIds.add(videoId); // Prevent duplicates in the same sync run
                    }
                }
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
