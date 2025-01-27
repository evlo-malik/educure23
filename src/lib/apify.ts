import axios from 'axios';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { storeDocumentVectors } from './embeddings';

const APIFY_API_TOKEN = 'apify_api_jKfq8CL3eZcNJXVOckxWOmr6Qpiz002bopK9';
const SYNC_API_ENDPOINT = 'https://api.apify.com/v2/acts/karamelo~youtube-transcripts/run-sync-get-dataset-items';
const MAX_DOCUMENT_CHARACTERS = 200000;

// Function to ensure URL is in the correct format
function normalizeYoutubeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com')) {
      const videoId = urlObj.searchParams.get('v');
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    } else if (urlObj.hostname === 'youtu.be') {
      const videoId = urlObj.pathname.slice(1);
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }
    return url;
  } catch {
    return url;
  }
}

// Function to format transcript data
function formatTranscript(rawTranscript: string): string {
  try {
    const parsed = JSON.parse(rawTranscript);
    if (!Array.isArray(parsed) || !parsed[0]?.captions) {
      throw new Error('Invalid transcript format');
    }

    // Transform captions into simple time: text format
    return parsed[0].captions
      .map((caption: { start: number; text: string }) => 
        `${caption.start}: ${caption.text}`
      )
      .join('\n');
  } catch (error) {
    console.error('Error formatting transcript:', error);
    return rawTranscript;
  }
}

export async function getYoutubeTranscript(url: string, userId: string): Promise<string> {
  try {
    const normalizedUrl = normalizeYoutubeUrl(url);
    const videoId = new URL(normalizedUrl).searchParams.get('v') || new URL(normalizedUrl).pathname.slice(1);
    
    // Get video title first
    const API_KEY = 'AIzaSyBf6NjaAZ-6Rcw6XkzH5Fifh4OLc4rQQ3s';
    const titleResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${API_KEY}`
    );
    
    let videoTitle = 'YouTube Video';
    if (titleResponse.data.items && titleResponse.data.items.length > 0) {
      videoTitle = titleResponse.data.items[0].snippet.title;
    }
    
    // Get transcript from Apify
    const response = await axios.post(
      SYNC_API_ENDPOINT,
      {
        maxRetries: 3,
        outputFormat: "textWithTimestamps",
        proxyOptions: {
          useApifyProxy: true
        },
        urls: [normalizedUrl]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${APIFY_API_TOKEN}`
        }
      }
    );

    // Format the transcript
    const formattedContent = formatTranscript(JSON.stringify(response.data));

    // Check content length
    if (formattedContent.length > MAX_DOCUMENT_CHARACTERS) {
      throw new Error('This video transcript is too long for our processing capacity. Please try a shorter video.');
    }

    // Create new document in Firestore
    const docRef = await addDoc(collection(db, 'documents'), {
      title: videoTitle,
      content: formattedContent,
      user_id: userId,
      created_at: serverTimestamp(),
      summary: '',
      flashcards: '[]',
      chat_messages: '[]',
      test: '[]',
      type: 'youtube',
      youtube_link: normalizedUrl,
      thumbnail_url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    });

    // Store vectors in Pinecone
    await storeDocumentVectors(docRef.id, formattedContent, 'youtube');

    return docRef.id;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}
// Function to get video title from YouTube API
async function getVideoTitle(url: string): Promise<string> {
  try {
    const videoId = new URL(url).searchParams.get('v') || new URL(url).pathname.slice(1);
    const API_KEY = 'AIzaSyBf6NjaAZ-6Rcw6XkzH5Fifh4OLc4rQQ3s';
    
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${API_KEY}`
    );

    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0].snippet.title;
    }
    throw new Error('Video not found');
  } catch (error) {
    console.error('Error getting video title:', error);
    return 'YouTube Video';
  }
}