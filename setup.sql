-- SQL Script to set up CAflix tables in Supabase SQL Editor.
-- Copy and run this script in your Supabase dashboard SQL Editor.

-- 1. Create the videos table
CREATE TABLE IF NOT EXISTS caflix_videos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    video_id VARCHAR(11) NOT NULL UNIQUE,
    paper TEXT NOT NULL,
    chapter TEXT NOT NULL,
    description TEXT,
    source_type TEXT NOT NULL, -- 'manual', 'channel', or 'playlist'
    source_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the catcher sources table
CREATE TABLE IF NOT EXISTS caflix_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_id TEXT NOT NULL UNIQUE, -- Channel ID (UC...) or Playlist ID (PL...)
    source_type TEXT NOT NULL,      -- 'channel' or 'playlist'
    paper TEXT NOT NULL,            -- default Paper to assign to caught videos
    chapter TEXT NOT NULL,          -- default Chapter to assign to caught videos
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable Row Level Security (RLS) policies if desired, 
-- or disable RLS for direct REST access.
-- Note: By default, Supabase tables have RLS enabled. If you want the Netlify functions
-- (which connect via the anon or service_role key) to read/write without complex auth policies,
-- you can disable RLS for these two tables in your dashboard or run:
ALTER TABLE caflix_videos DISABLE ROW LEVEL SECURITY;
ALTER TABLE caflix_sources DISABLE ROW LEVEL SECURITY;

-- 4. Verify indexes for performance
CREATE INDEX IF NOT EXISTS idx_caflix_videos_paper_chapter ON caflix_videos(paper, chapter);
