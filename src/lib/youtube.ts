import { YoutubeTranscript } from 'youtube-transcript';

function extractVideoId(url: string): string {
  if (!url) {
    throw new Error('Please provide a YouTube URL');
  }

  try {
    const urlObj = new URL(url);
    let videoId = '';

    if (urlObj.hostname.includes('youtube.com')) {
      videoId = urlObj.searchParams.get('v') || '';
    } else if (urlObj.hostname === 'youtu.be') {
      videoId = urlObj.pathname.slice(1);
    }

    if (!videoId || videoId.length !== 11) {
      throw new Error('Invalid YouTube video ID. Please provide a valid YouTube URL.');
    }

    return videoId;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid URL')) {
      throw new Error('Please provide a valid YouTube URL');
    }
    throw error;
  }
}

async function getVideoMetadata(videoId: string): Promise<{ title: string; description: string }> {
  try {
    const transcriptData = await YoutubeTranscript.getVideoDetails(videoId);
    if (!transcriptData) {
      throw new Error('Failed to fetch video details');
    }
    return {
      title: transcriptData.title || `YouTube Video ${videoId}`,
      description: transcriptData.description || ''
    };
  } catch (error) {
    console.error('Error fetching video metadata:', error);
    throw new Error('Failed to fetch video details. Please check the URL and try again.');
  }
}

export async function fetchTranscript(videoUrl: string): Promise<{ 
  transcript: string; 
  title: string;
  description: string;
}> {
  try {
    const videoId = extractVideoId(videoUrl);
    
    // First try to get metadata to validate video exists and is accessible
    const metadata = await getVideoMetadata(videoId);

    // Then get transcript using youtube-transcript
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: 'en',
      country: 'US'
    });
    
    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error('No transcript available for this video. Please ensure the video has English closed captions enabled.');
    }

    // Combine all transcript parts into one text
    const transcript = transcriptItems
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!transcript) {
      throw new Error('Failed to extract transcript content from the video');
    }

    return {
      transcript,
      title: metadata.title,
      description: metadata.description
    };
  } catch (error) {
    console.error('YouTube Error:', error);

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      if (message.includes('could not get transcripts') || 
          message.includes('no captions found') ||
          message.includes('transcript is disabled')) {
        throw new Error('This video does not have English captions available. Please try a different video with closed captions enabled.');
      }

      if (message.includes('video is unavailable') || 
          message.includes('video not found')) {
        throw new Error('This video is unavailable or does not exist. Please check the URL and try again.');
      }

      if (message.includes('sign in')) {
        throw new Error('This video requires sign-in. Please try a different video.');
      }

      // If we have a specific error message, use it
      throw error;
    }

    // Generic fallback error
    throw new Error('Failed to process YouTube video. Please check your internet connection and try again.');
  }
}