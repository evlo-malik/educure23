import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Initialize Gemini client
export const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Get Gemini model
export const getGeminiModel = () => genAI.getGenerativeModel({ model: 'models/gemini-1.5-flash' });

// Helper function to clean JSON response from Gemini
const cleanGeminiJsonResponse = (text: string): string => {
  // Remove markdown code block if present
  if (text.includes('```json')) {
    text = text.replace(/```json\n|\n```/g, '');
  } else if (text.includes('```')) {
    text = text.replace(/```\n|\n```/g, '');
  }
  
  // Remove any leading/trailing whitespace
  return text.trim();
};

// Generate content using Gemini
export const generateGeminiContent = async (text: string, prompt: string, expectJson = false) => {
  try {
    const model = getGeminiModel();
    
    // If text is a URL to a PDF, fetch it as binary data
    if (text.startsWith('http') && text.toLowerCase().endsWith('.pdf')) {
      const response = await fetch(text);
      const blob = await response.blob();
      
      // Convert blob to base64 for Gemini
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Data.split(',')[1],
            mimeType: 'application/pdf'
          }
        },
        prompt
      ]);
      const responseText = result.response.text();
      return expectJson ? cleanGeminiJsonResponse(responseText) : responseText;
    }

    // For video/lecture transcripts, include the transcript as context
    if (text.includes('[') && text.includes(']') && /\[\d+\]/.test(text)) {
      const systemContext = `You are analyzing a video/lecture transcript. When referencing specific parts, always include timestamps in [X] format, where X is the number of seconds into the video. For example, if something happens 2 minutes and 30 seconds into the video, reference it as [150].

Here is the transcript:
${text}`;

      const result = await model.generateContent([
        systemContext,
        prompt
      ]);
      const responseText = result.response.text();
      return expectJson ? cleanGeminiJsonResponse(responseText) : responseText;
    }

    // Regular text processing
    const result = await model.generateContent([
      text,
      prompt,
    ]);
    const responseText = result.response.text();
    return expectJson ? cleanGeminiJsonResponse(responseText) : responseText;
  } catch (error: any) {
    console.error('Error generating Gemini content:', error);
    
    // Handle quota exceeded error
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      throw new Error('Gemini API quota exceeded. The system will automatically fall back to DeepSeek.');
    }
    
    throw error;
  }
}; 
