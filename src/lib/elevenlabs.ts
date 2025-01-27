import axios from 'axios';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { updateDocument } from './firestore';

const VOICEMAKER_API_KEY = 'f1be3710-aa08-11ef-bb59-537716419fdc';
const API_URL = 'https://developer.voicemaker.in/voice/api';

// Voice IDs for different styles
const VOICE_IDS = {
  Lecture: 'ai3-en-US-Alexander', // Professional male voice
  ASMR: 'proplus-Lexi', // Soft female voice
  Motivational: 'proplus-TheJack', // Energetic male voice
  Storytelling: 'proplus-Eldon', // Expressive female voice
  Soft: 'ai3-Jenny', // Soft female voice
  News: 'ai3-Jony' // Professional news voice
};

// Voice effects for specific styles
const VOICE_EFFECTS = {
  Soft: 'whispered',
  News: 'news',
  default: 'default'
};

export type AudioStyle = keyof typeof VOICE_IDS;

export async function generateSpeech(text: string, style: AudioStyle, documentId: string, userId: string): Promise<string> {
  try {
    if (!text) {
      throw new Error('No text provided for speech generation');
    }

    // Generate audio using Voicemaker API
    const response = await axios.post(
      API_URL,
      {
        Engine: 'neural',
        VoiceId: VOICE_IDS[style],
        LanguageCode: 'en-US',
        Text: text,
        OutputFormat: 'mp3',
        SampleRate: '48000',
        Effect: VOICE_EFFECTS[style] || VOICE_EFFECTS.default,
        MasterVolume: '0',
        MasterSpeed: style === 'ASMR' ? '-20' : '0',
        MasterPitch: '0'
      },
      {
        headers: {
          'Authorization': `Bearer ${VOICEMAKER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'json'
      }
    );

    if (!response.data.success || !response.data.path) {
      throw new Error('Failed to generate audio');
    }

    // Download the audio file
    const audioResponse = await axios.get(response.data.path, {
      responseType: 'arraybuffer'
    });

    // Create a blob from the audio data
    const audioBlob = new Blob([audioResponse.data], { type: 'audio/mpeg' });

    // Create a reference to the audio file in Firebase Storage
    const audioRef = ref(storage, `audio/${userId}/${documentId}/${style.toLowerCase()}_${Date.now()}.mp3`);

    // Upload the audio file
    await uploadBytes(audioRef, audioBlob, {
      contentType: 'audio/mpeg',
      cacheControl: 'public,max-age=31536000',
    });

    // Get the download URL
    const audioUrl = await getDownloadURL(audioRef);

    // Update the document with the audio URL and style
    await updateDocument(documentId, {
      audioUrl,
      audioStyle: style,
    });

    return audioUrl;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('Invalid API key or authentication failed');
      } else if (error.response?.status === 429) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }
      throw new Error(`API Error: ${error.response?.data?.message || 'Failed to generate speech'}`);
    }
    throw error;
  }
}