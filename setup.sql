-- SQL Script to set up CAflix tables in Supabase SQL Editor.
-- Copy and run this script in your Supabase dashboard SQL Editor.

-- 1. Create the videos table
CREATE TABLE IF NOT EXISTS caflix_videos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    video_id VARCHAR(11) NOT NULL UNIQUE,
    paper TEXT NOT NULL,
    chapter TEXT, -- Nullable to allow CA Inter Paper grouping
    description TEXT,
    source_type TEXT NOT NULL, -- 'manual', 'channel', or 'playlist'
    source_id TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed', -- status field: 'confirmed' or 'pending_review'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the catcher sources table
CREATE TABLE IF NOT EXISTS caflix_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_id TEXT NOT NULL UNIQUE, -- Channel ID (UC...) or Playlist ID (PL...)
    source_type TEXT NOT NULL,      -- 'channel' or 'playlist'
    paper TEXT NOT NULL,            -- default Paper to assign to caught videos
    chapter TEXT, -- Nullable to allow CA Inter Paper grouping
    title TEXT,
    tagging_mode TEXT NOT NULL DEFAULT 'fixed', -- tagging_mode field: 'fixed' or 'ai'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Disable RLS for direct REST API access
ALTER TABLE caflix_videos DISABLE ROW LEVEL SECURITY;
ALTER TABLE caflix_sources DISABLE ROW LEVEL SECURITY;

-- 4. Verify indexes for performance
CREATE INDEX IF NOT EXISTS idx_caflix_videos_paper ON caflix_videos(paper);
CREATE INDEX IF NOT EXISTS idx_caflix_videos_status ON caflix_videos(status);
