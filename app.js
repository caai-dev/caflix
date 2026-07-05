/* CAflix - Application Logic */

let globalVideos = [];
let activeVideo = null;

function extractVideoId(input) {
    if (typeof input !== 'string') return null;
    const cleanInput = input.trim();
    // 1. Bare valid 11-character video ID check
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleanInput)) {
        return cleanInput;
    }
    // 2. YouTube URL patterns
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|live\/|shorts\/)([^#\&\?]*).*/;
    const match = cleanInput.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Group flat video list by Paper and then by Chapter, preserving list order.
 */
function getGroupedVideos(videoList) {
    const papers = [];
    const paperMap = new Map();

    videoList.forEach((video) => {
        let paperObj = paperMap.get(video.paper);
        if (!paperObj) {
            paperObj = { name: video.paper, chapters: [], chapterMap: new Map() };
            paperMap.set(video.paper, paperObj);
            papers.push(paperObj);
        }

        let chapterObj = paperObj.chapterMap.get(video.chapter);
        if (!chapterObj) {
            chapterObj = { name: video.chapter, videos: [] };
            paperObj.chapterMap.set(video.chapter, chapterObj);
            paperObj.chapters.push(chapterObj);
        }

        chapterObj.videos.push(video);
    });

    return papers;
}

/**
 * Select a video to display in the player and update CTA metadata.
 */
function selectVideo(video) {
    activeVideo = video;
    
    const iframe = document.getElementById('video-player');
    const iframeContainer = iframe.parentElement;
    
    // Check if ID is PLACEHOLDER or empty
    const vId = extractVideoId(video.video_id);
    if (!vId || vId === 'PLACEHOLDER') {
        iframeContainer.classList.add('is-placeholder');
        iframe.src = ''; // Avoid loading broken Youtube URLs
    } else {
        iframeContainer.classList.remove('is-placeholder');
        // rel=0 is MANDATORY to restrict related videos to the same channel
        iframe.src = `https://www.youtube.com/embed/${vId}?rel=0&modestbranding=1`;
    }
    
    // Update text labels
    document.getElementById('active-video-title').textContent = video.title;
    document.getElementById('active-video-paper').textContent = video.paper;
    document.getElementById('active-video-chapter').textContent = video.chapter;
    
    // Update external links to YouTube watch page in new tab
    const watchUrl = `https://www.youtube.com/watch?v=${vId || 'PLACEHOLDER'}`;
    document.getElementById('cta-like').href = watchUrl;
    document.getElementById('cta-comment').href = watchUrl;
    document.getElementById('cta-subscribe').href = watchUrl;
    
    // Update active highlight classes on cards
    document.querySelectorAll('.video-card').forEach(card => {
        if (card.dataset.id === video.id) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
}

/**
 * Render the filtered list into grouped UI structure
 */
function renderFeed(filteredList) {
    const feedContainer = document.getElementById('video-feed');
    const emptyState = document.getElementById('empty-state');
    
    feedContainer.innerHTML = '';
    
    if (filteredList.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }
    
    const grouped = getGroupedVideos(filteredList);
    
    grouped.forEach((paper) => {
        // Create Paper group
        const paperEl = document.createElement('div');
        paperEl.className = 'paper-group';
        
        const paperTitle = document.createElement('h3');
        paperTitle.className = 'paper-title';
        paperTitle.textContent = paper.name;
        paperEl.appendChild(paperTitle);
        
        paper.chapters.forEach((chapter) => {
            // Create Chapter group
            const chapterEl = document.createElement('div');
            chapterEl.className = 'chapter-group';
            
            const chapterTitle = document.createElement('h4');
            chapterTitle.className = 'chapter-title';
            chapterTitle.textContent = chapter.name;
            chapterEl.appendChild(chapterTitle);
            
            const videoListEl = document.createElement('div');
            videoListEl.className = 'video-list';
            
            chapter.videos.forEach((video) => {
                const card = document.createElement('div');
                card.className = 'video-card';
                card.dataset.id = video.id;
                
                if (activeVideo && activeVideo.id === video.id) {
                    card.classList.add('active');
                }
                
                // Assemble card contents. Uses onerror fallback to display custom SVG thumbnail.
                card.innerHTML = `
                    <div class="video-thumb-container">
                        <img class="video-thumb" src="https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg" alt="${video.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                        <div class="thumb-fallback" style="display: none;">
                            <span>CA</span>
                        </div>
                    </div>
                    <div class="video-card-info">
                        <span class="video-card-title">${video.title}</span>
                    </div>
                `;
                
                card.addEventListener('click', () => selectVideo(video));
                videoListEl.appendChild(card);
            });
            
            chapterEl.appendChild(videoListEl);
            paperEl.appendChild(chapterEl);
        });
        
        feedContainer.appendChild(paperEl);
    });
}

/**
 * Filter list based on search term
 */
function handleSearch(event) {
    const query = event.target.value.toLowerCase().trim();
    
    const filtered = globalVideos.filter((video) => {
        return (
            video.title.toLowerCase().includes(query) ||
            video.paper.toLowerCase().includes(query) ||
            video.chapter.toLowerCase().includes(query)
        );
    });
    
    renderFeed(filtered);
}

// ==========================================
// SHARE MODAL OPERATIONS
// ==========================================
function openShareModal() {
    if (!activeVideo) return;
    
    const vId = extractVideoId(activeVideo.video_id) || 'PLACEHOLDER';
    const shareUrl = `https://www.youtube.com/watch?v=${vId}`;
    
    document.getElementById('share-url-input').value = shareUrl;
    
    // Configure WhatsApp URL
    const waText = encodeURIComponent(`Check out this CA study video: ${activeVideo.title} - ${shareUrl}`);
    document.getElementById('share-whatsapp').href = `https://api.whatsapp.com/send?text=${waText}`;
    
    // Configure Email URL
    const mailSubject = encodeURIComponent(`CAflix: ${activeVideo.title}`);
    const mailBody = encodeURIComponent(`Check out this CA study video:\n\n${activeVideo.title}\n${shareUrl}`);
    document.getElementById('share-email').href = `mailto:?subject=${mailSubject}&body=${mailBody}`;
    
    document.getElementById('share-modal').classList.add('active');
}

function closeShareModal() {
    document.getElementById('share-modal').classList.remove('active');
}

function copyShareLink() {
    const copyText = document.getElementById('share-url-input');
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices
    
    navigator.clipboard.writeText(copyText.value)
        .then(() => {
            const btn = document.getElementById('btn-copy-link');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.backgroundColor = '#25d366';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.backgroundColor = 'var(--color-primary-gold)';
            }, 2000);
        })
        .catch(err => {
            console.error('Failed to copy text: ', err);
        });
}

// App bootstrapping
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/.netlify/functions/videos');
        if (!res.ok) throw new Error('Failed to load videos endpoint.');
        
        globalVideos = await res.json();
        
        // Select first video by default on launch
        if (globalVideos.length > 0) {
            selectVideo(globalVideos[0]);
        }
        
        // Render full feed
        renderFeed(globalVideos);
        
    } catch (err) {
        console.error('Error bootstrapping app:', err);
        // Fallback display message if database is empty
        const feedContainer = document.getElementById('video-feed');
        feedContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--color-text-muted);">
                <h3>Welcome to CAflix!</h3>
                <p style="margin-top: 0.5rem;">The library database is currently empty. Please access the <a href="admin.html" style="color: var(--color-primary-gold); font-weight: bold;">Admin Panel</a> to configure resources.</p>
            </div>
        `;
    }
    
    // Wire up local search
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', handleSearch);
});
