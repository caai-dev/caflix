/* CAflix - Application Logic */

// Hardcoded array of videos as per specifications.
// Leaving ID as "PLACEHOLDER" - user can replace with actual YouTube Video IDs.
const VIDEOS = [
    {
        id: "PLACEHOLDER",
        title: "Ind AS 115 - Revenue from Contracts with Customers Overview",
        paper: "Paper 1: Financial Reporting",
        chapter: "Chapter 1: Ind AS 115"
    },
    {
        id: "PLACEHOLDER",
        title: "Step 5: Satisfaction of Performance Obligations",
        paper: "Paper 1: Financial Reporting",
        chapter: "Chapter 1: Ind AS 115"
    },
    {
        id: "PLACEHOLDER",
        title: "Ind AS 16 - Revaluation Model vs Cost Model",
        paper: "Paper 1: Financial Reporting",
        chapter: "Chapter 2: Ind AS 16"
    },
    {
        id: "PLACEHOLDER",
        title: "Professional Ethics - Clause 1 to 4 of First Schedule",
        paper: "Paper 3: Advanced Auditing and Professional Ethics",
        chapter: "Chapter 1: Professional Ethics"
    },
    {
        id: "PLACEHOLDER",
        title: "Second Schedule Overview & Case Studies",
        paper: "Paper 3: Advanced Auditing and Professional Ethics",
        chapter: "Chapter 1: Professional Ethics"
    },
    {
        id: "PLACEHOLDER",
        title: "SA 315 - Identifying and Assessing Risk of Material Misstatement",
        paper: "Paper 3: Advanced Auditing and Professional Ethics",
        chapter: "Chapter 2: Audit Planning & Risk Assessment"
    },
    {
        id: "PLACEHOLDER",
        title: "Theory of Constraints (TOC) Concepts & Equations",
        paper: "Paper 5: Strategic Cost Management and Performance Evaluation",
        chapter: "Chapter 1: Modern Business Environment"
    },
    {
        id: "PLACEHOLDER",
        title: "Throughput Accounting Case Study Analysis",
        paper: "Paper 5: Strategic Cost Management and Performance Evaluation",
        chapter: "Chapter 1: Modern Business Environment"
    }
];

// Initialize list with unique UIDs to handle identical IDs (e.g. "PLACEHOLDER")
const VIDEOS_WITH_UID = VIDEOS.map((video, index) => ({
    ...video,
    uid: `video-id-ref-${index}`
}));

let activeVideo = null;

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
    
    // Check if ID is PLACEHOLDER
    if (!video.id || video.id === 'PLACEHOLDER') {
        iframeContainer.classList.add('is-placeholder');
        iframe.src = ''; // Avoid loading broken Youtube URLs
    } else {
        iframeContainer.classList.remove('is-placeholder');
        // rel=0 is MANDATORY to restrict related videos to the same channel
        iframe.src = `https://www.youtube.com/embed/${video.id}?rel=0&modestbranding=1`;
    }
    
    // Update text labels
    document.getElementById('active-video-title').textContent = video.title;
    document.getElementById('active-video-paper').textContent = video.paper;
    document.getElementById('active-video-chapter').textContent = video.chapter;
    
    // Update external links to YouTube watch page in new tab
    const watchUrl = `https://www.youtube.com/watch?v=${video.id || 'PLACEHOLDER'}`;
    document.getElementById('cta-like').href = watchUrl;
    document.getElementById('cta-comment').href = watchUrl;
    document.getElementById('cta-subscribe').href = watchUrl;
    
    // Update active highlight classes on cards
    document.querySelectorAll('.video-card').forEach(card => {
        if (card.dataset.uid === video.uid) {
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
                card.dataset.uid = video.uid;
                
                if (activeVideo && activeVideo.uid === video.uid) {
                    card.classList.add('active');
                }
                
                // Assemble card contents. Uses onerror fallback to display custom SVG thumbnail.
                card.innerHTML = `
                    <div class="video-thumb-container">
                        <img class="video-thumb" src="https://img.youtube.com/vi/${video.id}/hqdefault.jpg" alt="${video.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
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
    
    const filtered = VIDEOS_WITH_UID.filter((video) => {
        return (
            video.title.toLowerCase().includes(query) ||
            video.paper.toLowerCase().includes(query) ||
            video.chapter.toLowerCase().includes(query)
        );
    });
    
    renderFeed(filtered);
}

// App bootstrapping
document.addEventListener('DOMContentLoaded', () => {
    // Select first video by default on launch
    if (VIDEOS_WITH_UID.length > 0) {
        selectVideo(VIDEOS_WITH_UID[0]);
    }
    
    // Render full feed
    renderFeed(VIDEOS_WITH_UID);
    
    // Wire up local search
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', handleSearch);
});
