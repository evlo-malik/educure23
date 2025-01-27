import { z } from 'zod';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { querySimilarChunks } from './embeddings';
import { generateGeminiNotes, generateGeminiFlashcards, generateGeminiTest, generateGeminiStyledText } from './gemini-functions';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;
const ASSISTANT_ID = import.meta.env.VITE_ASSISTANT_ID;

if (!OPENAI_API_KEY) {
  throw new Error('OpenAI API key is not configured. Please add VITE_OPENAI_API_KEY to your .env file.');
}

if (!ANTHROPIC_API_KEY) {
  throw new Error('Anthropic API key is not configured. Please add VITE_ANTHROPIC_API_KEY to your .env file.');
}

if (!DEEPSEEK_API_KEY) {
  throw new Error('Deepseek API key is not configured. Please add VITE_DEEPSEEK_API_KEY to your .env file.');
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

const anthropicClient = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

const deepseekClient = new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1",
  dangerouslyAllowBrowser: true,
});

const TIMEOUT_MS = 20000; // 20 seconds timeout

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = TIMEOUT_MS): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

function handleOpenAIError(error: any): never {
  console.error('OpenAI API Error:', error);
  
  if (error.status === 429) {
    throw new Error('API rate limit exceeded. Please try again in a few moments.');
  }
  
  if (error.error?.type === 'insufficient_quota') {
    throw new Error('The AI service is currently unavailable. Please try again later or contact support.');
  }

  if (error.error?.message) {
    throw new Error(`AI Service Error: ${error.error.message}`);
  }

  throw new Error('An unexpected error occurred with the AI service. Please try again.');
}

export async function generateChatResponse(messages: ChatMessage[], documentId: string, selectedImage?: string, documentType?: string): Promise<any> {
  try {
    if (selectedImage) {
      const lastUserMessage = messages[messages.length - 1];
      const userQuery = typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '';

      const systemPrompt = `You are a knowledgeable tutor analyzing visual content from documents. MOST IMPORTANT RULE FOR THAT YOU MUST NEVER BREAK: Never use parentheses ( ) around equations or matrices or anything related to maths - ALWAYS use $ or $$. Follow these key instructions:

1. Analyze the image content thoroughly and accurately. Explain EVERY SINGLE PART OF THE IMAGE.

2. For diagrams and figures:
   - Describe visual elements clearly
   - Explain relationships between components
   - Reference specific parts using clear terminology

3. Make your response in a very beautiful, well structured and easy to read format. 

4. Keep responses focused and relevant to the question. You are explaining content to students, so explain the content of the image very well to make sure that they understand.

Make sure to explain every single part of the image. You really have to teach the user.

THESE RULES ARE ABSOLUTE AND MUST BE FOLLOWED FOR EVERY SINGLE MATHEMATICAL EXPRESSION:

1. For display/block equations, use double dollar signs with NO SPACES after/before the dollars:
   $$k_d = k_0 e^{-E_a/RT}$$

2. For inline math, use single dollar signs with NO SPACES:
   The diffusion constant $k_d$ depends on temperature $T$

3. NEVER use parentheses ( ) around equations or matrices - ALWAYS use $ or $$

4. For matrices, use double dollar signs:
   $$\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$$

5. For fractions in inline math, use \\frac{numerator}{denominator}:
   The rate is $\\frac{dx}{dt}$

6. For integrals, use proper LaTeX notation:
   $$\\int_0^\\infty f(x) dx$$`;

      // Extract base64 data and detect MIME type
      const mimeTypeMatch = selectedImage.match(/^data:([^;]+);base64,/);
      const detectedType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
      
      // Define supported MIME types
      type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      const supportedTypes: Record<string, SupportedMimeType> = {
        'image/jpeg': 'image/jpeg',
        'image/png': 'image/png',
        'image/gif': 'image/gif',
        'image/webp': 'image/webp'
      };
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: userQuery || "Please analyze and explain this content from the document." 
              },
              {
                type: "image_url",
                image_url: {
                  url: selectedImage
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        stream: true,
      });

      return response;
    }

    return generateDeepSeekResponse(messages, documentId, undefined, documentType);

  } catch (error) {
    console.error('Error in generateChatResponse:', error);
    return handleOpenAIError(error);
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface TestQuestion {
  type: 'multiple_choice' | 'true_false';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

const flashcardSchema = z.object({
  question: z.string().min(1, "Question cannot be empty"),
  answer: z.string().min(1, "Answer cannot be empty")
});

const flashcardsResponseSchema = z.object({
  flashcards: z.array(flashcardSchema).min(1, "At least one flashcard is required")
});

const testQuestionSchema = z.object({
  type: z.enum(['multiple_choice', 'true_false']),
  question: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string(),
  explanation: z.string()
});

const testSchema = z.object({
  questions: z.array(testQuestionSchema)
});

export async function generateNotes(text: string, useGemini: boolean = false): Promise<string> {
  if (useGemini) {
    console.log('📝 Generating notes using: Gemini');
    return generateGeminiNotes(text);
  }

  try {
    console.log('📝 Generating notes using: DeepSeek');
    const response = await withTimeout(makeDeepSeekRequest([
      {
        role: "system",
        content: `You are an expert study notes creator. Create detailed, well-structured revision notes from the provided text. Cover every single topic and explain it. Make the notes very detailed, use up to 10,000 tokens if necessary. Follow these formatting rules:

1. Use clear headings with # for main sections and ## for subsections
2. Use bullet points (- ) for key points
3. Use numbered lists (1. ) for sequential information or steps
4. Add two blank lines between main sections for better readability
5. Use bold (**text**) for important terms and concepts
6. Use > for important quotes or definitions
7. Group related information under appropriate headings
8. Use --- for horizontal rules between major sections
9. Keep paragraphs short and focused
10. Use lists and bullet points liberally for better scanning
11. For mathematical expressions:
    - Use double dollar signs ($$...$$) for display/block equations
    - Use single dollar signs ($...$) for inline math
    - Use \\text{} for text within equations
    - Format complex equations properly with LaTeX syntax
    - Add explanations after complex equations
12. For equations, always:
    - Define all variables and symbols used
    - Break down complex equations into steps
    - Use proper mathematical notation (e.g., fractions with \\frac{}{}, subscripts with _{}, etc.)
    - Align multi-line equations using proper LaTeX alignment

Make the notes visually organized and easy to read. IMPORTNT: ALWAYS use LaTeX format (dollar signs) for math expressions - ALWAYS use $ or $$, AROUND maths expressions.`
      },
      {
        role: "user",
        content: `Create comprehensive revision notes from the following text, organizing key concepts and important details in a clear, structured format. Make sure to cover every single topic of the text in depth and explain harder concepts with your own knowledge. IMPORTNT: ALWAYS use LaTeX format (dollar signs) for math expressions - ALWAYS use $ or $$, AROUND maths expressions. Text: ${text}`
      }
    ], {
      temperature: 0.6,
      max_tokens: 8192,
    }));

    const notes = response.choices[0]?.message?.content;
    if (!notes) {
      throw new Error('No notes generated');
    }

    return notes.trim();
  } catch (error) {
    if (!useGemini) {
      console.log('❌ DeepSeek failed or timed out, trying Gemini...');
      return generateNotes(text, true);
    }
    return handleOpenAIError(error);
  }
}

export async function generateTest(text: string, useGemini: boolean = false): Promise<TestQuestion[]> {
  if (useGemini) {
    console.log('📝 Generating test using: Gemini');
    return generateGeminiTest(text);
  }

  try {
    console.log('📝 Generating test using: DeepSeek');
    const response = await withTimeout(makeDeepSeekRequest([
      {
        role: "system",
        content: `You are an expert test creator. Create a comprehensive test with multiple-choice and true/false questions based on the provided content. The test must be on then educational part of the content. Nothing like "How many times this word has appeared in the text". Imagine that you're making an exam for a student, and it must be a proper exam with proper questions. Follow these rules:
          1. Create 30-50 questions depending on content length
          2. Ensure questions cover every key concept and topic
          3. Make questions clear and unambiguous
          4. Include short but detailed explanations of the answer.
          5. Return only valid JSON in the specified format
          6. Cover every single topic of the document
          7. Keep your answer under 4000 tokens (under 15000 characters).`
      },
      {
        role: "user",
        content: `Create a test with both multiple-choice and true/false questions based on this text. Return the response in this exact JSON format:
          {
            "questions": [
              {
                "type": "multiple_choice",
                "question": "Clear question text",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correctAnswer": "The correct option exactly matching one option",
                "explanation": "Brief explanation of why this is correct"
              },
              {
                "type": "true_false",
                "question": "Statement to evaluate",
                "correctAnswer": "True or False",
                "explanation": "Brief explanation of why this is correct"
              }
            ]
          }

          Content to analyze: ${text}`
      }
    ], {
      temperature: 0.4,
      max_tokens: 5000,
      response_format: { type: "json_object" }
    }));

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No test questions generated');
    }

    try {
      const parsedTest = JSON.parse(content);
      const validatedTest = testSchema.parse(parsedTest);
      
      // Additional validation
      for (const question of validatedTest.questions) {
        if (question.type === 'multiple_choice') {
          if (!question.options?.includes(question.correctAnswer)) {
            throw new Error('Correct answer must match one of the options exactly');
          }
        } else if (question.type === 'true_false') {
          if (!['True', 'False'].includes(question.correctAnswer)) {
            throw new Error('True/False answer must be exactly "True" or "False"');
          }
        }
      }

      return validatedTest.questions;
    } catch (parseError) {
      console.error('Test validation error:', parseError);
      throw new Error('Generated test format was invalid. Please try again.');
    }
  } catch (error) {
    if (!useGemini) {
      console.log('❌ DeepSeek failed or timed out, trying Gemini...');
      return generateTest(text, true);
    }
    if (error instanceof z.ZodError) {
      console.error('Zod validation error:', error);
      throw new Error('Invalid test format in AI response. Please try again.');
    }
    if (error instanceof SyntaxError) {
      console.error('JSON parse error:', error);
      throw new Error('Invalid JSON in AI response. Please try again.');
    }
    return handleOpenAIError(error);
  }
}

export async function generateFlashcards(text: string, useGemini: boolean = false): Promise<{ question: string; answer: string }[]> {
  if (useGemini) {
    console.log('🎴 Generating flashcards using: Gemini');
    return generateGeminiFlashcards(text);
  }

  try {
    console.log('🎴 Generating flashcards using: DeepSeek');
    const response = await withTimeout(makeDeepSeekRequest([
      {
        role: "system",
        content: "Create 15-20 educational flashcards from the provided text. Make them proper flashcards that will ask the user about the educational content (nothing like teacher's name) of the text provided. Don't make the answers too long. Do not make any True/False questions. Make sure to cover every topic of the document. Questions must be about the educational content of the document. Return only valid JSON in the specified format. Make sure to answer in the exact format as specified!"
      },
      {
        role: "user",
        content: `Create flashcards in this exact JSON format:
        {
          "flashcards": [
            {
              "question": "Clear, focused question",
              "answer": "Concise, accurate answer"
            }
          ]
        }

        Text to analyze: ${text}`
      }
    ], {
      temperature: 0.4,
      max_tokens: 8000,
      response_format: { type: "json_object" }
    }));

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No flashcards generated');
    }

    const parsedFlashcards = JSON.parse(content);
    const validatedFlashcards = flashcardsResponseSchema.parse(parsedFlashcards);
    
    return validatedFlashcards.flashcards;
  } catch (error) {
    if (!useGemini) {
      console.log('❌ DeepSeek failed or timed out, trying Gemini...');
      return generateFlashcards(text, true);
    }
    if (error instanceof z.ZodError) {
      throw new Error('Invalid flashcard format in AI response');
    }
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON in AI response');
    }
    return handleOpenAIError(error);
  }
}

export async function generateStyledText(text: string, style: 'Lecture' | 'News' | 'Soft' | 'ASMR' | 'Motivational' | 'Storytelling', useGemini: boolean = false): Promise<string> {
  if (useGemini) {
    console.log('🗣️ Generating vocalized text using: Gemini');
    return generateGeminiStyledText(text, style);
  }

  const stylePrompts = {
    Lecture: "You are a university professor giving a clear, structured lecture. Explain the content in an academic but engaging way, using appropriate terminology and examples. Your response will then be converted to Speech, so take that into account. Make sure to cover all topics, in detail and with explanations if needed. Make sure to keep it under 6000 characters long.",
    News: "You are a professional news anchor presenting educational content. Deliver the information in a clear, authoritative, and well-structured manner, similar to how news broadcasts present complex topics to their audience. Use precise language and maintain a formal, broadcast-style tone while ensuring the content remains engaging and accessible. Your response will be converted to Speech, so take that into account. Make sure to cover all topics thoroughly, with clear explanations where needed. Keep it under 6000 characters long.",
    Soft: "You are a gentle and nurturing educator with a soft, feminine voice. Present the content in a warm, clear, and comforting way - similar to how a caring teacher or ASMR artist would explain concepts. Keep your tone gentle but professional, focusing on clear explanations while maintaining a soothing presence. Your response will be converted to Speech, so take that into account. Make sure to cover all topics thoroughly, with clear explanations where needed. Keep it under 6000 characters long.",
    ASMR: "You are a gentle, soothing ASMR content creator (like a caring mommy figure). Explain the content in a soft, intimate, and calming way, using personal attention and reassuring language. Include appropriate ASMR-style phrases and transitions. Your response will then be converted to Speech, so take that into account. Make sure to cover all topics, in detail and with explanations if needed. Concentrate more on explaining the content, then on playing your role. But still add some ASMR stuff from time to time. Make sure to keep it under 4000 characters long.",
    Motivational: "You are an inspiring motivational speaker. Present the content with energy and enthusiasm, using powerful metaphors and encouraging language to inspire and motivate the listener. You have to motivate the listener, make him/her want to take action and learn the stuff that you are explaining. Your response will then be converted to Speech, so take that into account. Make sure to cover all topics, in detail and with explanations if needed. Make sure to keep it under 4000 characters long.",
    Storytelling: "You are a masterful storyteller. Weave the educational content into an engaging narrative, using vivid descriptions and maintaining a clear story arc while ensuring the educational value is preserved. Your response will then be converted to Speech, so take that into account. Make sure to cover all topics, in detail and with explanations if needed. Make sure to keep it under 4000 characters long."
  };

  try {
    console.log('🗣️ Generating vocalized text using: DeepSeek');
    const response = await withTimeout(makeDeepSeekRequest([
      {
        role: "system",
        content: stylePrompts[style]
      },
      {
        role: "user",
        content: `Transform this educational content into a ${style.toLowerCase()} style explanation: ${text}. Concentrate more on explaining the content, then on playing your role. Make sure to explain every single topic from the content, adding your own knowldege to explain it harder topics from time to time. Make sure to explain the content in a structured format, like you are teaching someone. If the content's explanation doesn't require long text, explain it in a short text. Only describe the content that is provided to you, never make up content to explain. Generate the text that will then be converted to speech, so without including any special characters used for visual formatting, such as hashtags or symbols. However, keep punctuation like exclamation marks, question marks, commas, and periods that enhance the natural flow of speech. The output should be text suitable for direct conversion to speech. DO NOT include any highlighted messages (so no hashtags). Do not include any formatting symbols. Your response must be pure text, with punctuation marks and numbers being the only symbols allowed.`
      }
    ], {
      temperature: 0.8,
      max_tokens: 4000,
    }));

    const styledText = response.choices[0]?.message?.content;
    if (!styledText) {
      throw new Error('No styled text generated');
    }

    return styledText.trim();
  } catch (error) {
    if (!useGemini) {
      console.log('❌ DeepSeek failed or timed out, trying Gemini...');
      return generateStyledText(text, style, true);
    }
    return handleOpenAIError(error);
  }
}

export async function generateDeepSeekResponse(messages: ChatMessage[], documentId: string, selectedImage?: string, documentType?: string): Promise<any> {
  try {
    const lastUserMessage = messages[messages.length - 1];
    const userQuery = typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '';
    
    const relevantChunks = await querySimilarChunks(userQuery, documentId, 3);
    console.log('Retrieved chunks:', relevantChunks.length);

    const systemPrompt = documentType === 'youtube' 
      ? `You are a knowledgeable tutor analyzing a YouTube video transcript. When referencing specific parts of the video, always include timestamps in [X] format, where X is the number of seconds into the video. For example, if something happens 2 minutes and 30 seconds into the video, reference it as [150].

Key instructions:
1. Base your responses primarily on the provided transcript, but never say anything like "based on the video transcript".
2. ALWAYS include relevant timestamps in [X] format when referencing specific parts
3. Be clear and concise in your explanations
4. If you're not sure about something, say so
5. Keep responses focused and relevant to the question
6. Make timestamps clickable by wrapping them in [X] format
7. Make your response in a very beautiful, well structured and easy to read format
8. For mathematical expressions, use LaTeX format with double dollar signs for display math (e.g., $$ \epsilon = a_{\text{actual}} - a_{\text{setpoint}} $$) and single dollar signs for inline math (e.g., $\epsilon$). Again, For inline math, use single dollar signs with NO SPACES, e.g.: The diffusion constant $k_d$ depends on temperature $T$. Never use parentheses ( ) around equations or matrices - ALWAYS use $ or $$`
      : documentType === 'lecture' 
      ? `You are a knowledgeable tutor analyzing a lecture recording transcript. You have access to relevant sections of the lecture in the context message.

Key instructions:
1. Base your responses primarily on the provided lecture transcript
2. ALWAYS include timestamps when referencing specific parts of the lecture
3. Format timestamps as [X] where X is the number of seconds into the lecture - these will be clickable and redirect users to that exact moment
4. For example, if referencing something at 2 minutes 30 seconds, write it as [150]
5. Be clear and concise in your explanations
6. If you're not sure about something, say so
7. Keep responses focused and relevant to the question
8. If the context doesn't fully answer the question, use your knowledge to supplement
9. If the user asks something specifically about the lecture, but the transcript doesn't provide an answer, say that there's no answer to that question in the available transcript
10. Structure your responses with clear sections and bullet points when appropriate
11. Make your response in a very beautiful, well structured and easy to read format
12. For mathematical expressions, use LaTeX format with double dollar signs for display math (e.g., $$ \epsilon = a_{\text{actual}} - a_{\text{setpoint}} $$) and single dollar signs for inline math (e.g., $\epsilon$). Again, For inline math, use single dollar signs with NO SPACES, e.g.: The diffusion constant $k_d$ depends on temperature $T$. Never use parentheses ( ) around equations or matrices - ALWAYS use $ or $$`
      : documentType === 'pdf'
      ? `You are a knowledgeable tutor analyzing a PDF document. You have access to relevant sections of the document in the context message.

Key instructions:
1. Base your responses primarily on the provided document content
2. When referencing specific parts, mention page numbers if available (e.g., "On page X...")
3. Be clear and concise in your explanations
4. If you're not sure about something, say so
5. Keep responses focused and relevant to the question
6. If the context doesn't fully answer the question, use your knowledge to supplement
7. If referencing figures, tables, or diagrams, clearly indicate their location in the document
8. Structure your responses with clear sections and bullet points when appropriate
9. If the user asks something specifically about the document, but the document doesn't provide an answer, say that there's no answer to that question in the available content
10. Make your response in a very beautiful, well structured and easy to read format
11. If mathematical equations or formulas are present, explain them clearly and break down complex concepts
12. For mathematical expressions, use LaTeX format with double dollar signs for display math (e.g., $$ \epsilon = a_{\text{actual}} - a_{\text{setpoint}} $$) and single dollar signs for inline math (e.g., $\epsilon$). Again, For inline math, use single dollar signs with NO SPACES, e.g.: The diffusion constant $k_d$ depends on temperature $T$. Never use parentheses ( ) around equations or matrices - ALWAYS use $ or $$`
      : `You are a knowledgeable tutor analyzing a document. You have access to relevant sections of the document in the context message.

Key instructions:
1. Base your responses primarily on the provided document context
2. If the context doesn't fully answer the question, use your knowledge to supplement
3. Be clear and concise in your explanations
4. If you're not sure about something, say so
5. Keep responses focused and relevant to the question
6. If the user asks something specifically about the document, but the document doesn't provide an answer, and you don't have the knowledge about this specific question, say that there's no answer to that question, and suggest to the user that he/she waits for a minute and tries again.
7. Make your response in a very beautiful, well structured and easy to read format
8. For mathematical expressions, use LaTeX format with double dollar signs for display math (e.g., $$ \epsilon = a_{\text{actual}} - a_{\text{setpoint}} $$) and single dollar signs for inline math (e.g., $\epsilon$)`;

    const contextMessage = {
      role: 'system' as const,
      content: `${systemPrompt}\n\nHere is the relevant content from the document:\n\n${relevantChunks.join('\n\n')}`
    };

    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));

    try {
      console.log('💬 Generating chat response using: DeepSeek');
      const response = await withTimeout(fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [contextMessage, ...formattedMessages],
          stream: true
        }),
      }), 10000);

      if (!response.ok) {
        throw new Error('DeepSeek request failed');
      }

      return response.body;
    } catch (error) {
      console.log('❌ DeepSeek failed or timed out, trying GPT-4o-mini...');
      console.log('💬 Generating chat response using: GPT-4o-mini');
      
      // Fallback to GPT-4o-mini with the exact same prompts
      const gpt4Response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [contextMessage, ...formattedMessages],
        temperature: 0.7,
        max_tokens: 1000,
        stream: true
      });

      return gpt4Response;
    }
  } catch (error) {
    console.error('Error in generateDeepSeekResponse:', error);
    return handleOpenAIError(error);
  }
}

async function makeDeepSeekRequest(messages: any[], options: any = {}) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      ...options,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to make DeepSeek request');
  }

  return response.json();
}