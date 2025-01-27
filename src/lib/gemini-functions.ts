import { generateGeminiContent } from './gemini';
import { TestQuestion } from './openai';
import { z } from 'zod';

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

export async function generateGeminiNotes(text: string): Promise<string> {
  try {
    const notes = await generateGeminiContent(text, 
      `You are an expert study notes creator. Create detailed, well-structured revision notes from the provided text. Cover every single topic and explain it. Make the notes very detailed, use up to 10,000 tokens if necessary. Follow these formatting rules:

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

Make the notes visually organized and easy to read. IMPORTNT: ALWAYS use LaTeX format (dollar signs) for math expressions - ALWAYS use $ or $$, AROUND maths expressions.

Create comprehensive revision notes from the following text, organizing key concepts and important details in a clear, structured format. Make sure to cover every single topic of the text in depth and explain harder concepts with your own knowledge. IMPORTNT: ALWAYS use LaTeX format (dollar signs) for math expressions - ALWAYS use $ or $$, AROUND maths expressions.`
    );
    return notes.trim();
  } catch (error) {
    console.error('Error generating notes with Gemini:', error);
    throw error;
  }
}

export const generateGeminiFlashcards = async (text: string): Promise<{ question: string; answer: string }[]> => {
  try {
    const prompt = `Create 15-20 educational flashcards from the provided text. Make them proper flashcards that will ask the user about the educational content (nothing like teacher's name) of the text provided. Don't make the answers too long. Do not make any True/False questions. Make sure to cover every topic of the document. Questions must be about the educational content of the document. Return only valid JSON in the specified format. Make sure to answer in the exact format as specified!

Create flashcards in this exact JSON format:
{
  "flashcards": [
    {
      "question": "Clear, focused question",
      "answer": "Concise, accurate answer"
    }
  ]
}`;
    
    const response = await generateGeminiContent(text, prompt, true);
    const parsedFlashcards = JSON.parse(response);
    const validatedFlashcards = flashcardsResponseSchema.parse(parsedFlashcards);
    return validatedFlashcards.flashcards;
  } catch (error) {
    console.error('Error generating flashcards with Gemini:', error);
    throw error;
  }
};

export const generateGeminiTest = async (text: string): Promise<TestQuestion[]> => {
  try {
    const prompt = `You are an expert test creator. Create a comprehensive test with multiple-choice and true/false questions based on the provided content. The test must be on then educational part of the content. Nothing like "How many times this word has appeared in the text". Imagine that you're making an exam for a student, and it must be a proper exam with proper questions. Follow these rules:
1. Create 30-50 questions depending on content length
2. Ensure questions cover every key concept and topic
3. Make questions clear and unambiguous
4. Include short but detailed explanations of the answer.
5. Return only valid JSON in the specified format
6. Cover every single topic of the document
7. Keep your answer under 5000 tokens (under 20000 characters).

Create a test with both multiple-choice and true/false questions based on this text. Return the response in this exact JSON format:
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
}`;
    
    const response = await generateGeminiContent(text, prompt, true);
    const parsedTest = JSON.parse(response);
    const validatedTest = testSchema.parse(parsedTest);
    return validatedTest.questions;
  } catch (error) {
    console.error('Error generating test with Gemini:', error);
    throw error;
  }
};

export const generateGeminiStyledText = async (text: string, style: 'Lecture' | 'News' | 'Soft' | 'ASMR' | 'Motivational' | 'Storytelling'): Promise<string> => {
  const stylePrompts = {
    Lecture: "You are a university professor giving a clear, structured lecture. Explain the content in an academic but engaging way, using appropriate terminology and examples. Your response will then be converted to Speech, so take that into account. Make sure to cover all topics, in detail and with explanations if needed. Make sure to keep it under 6000 characters long.",
    News: "You are a professional news anchor presenting educational content. Deliver the information in a clear, authoritative, and well-structured manner, similar to how news broadcasts present complex topics to their audience. Use precise language and maintain a formal, broadcast-style tone while ensuring the content remains engaging and accessible. Your response will be converted to Speech, so take that into account. Make sure to cover all topics thoroughly, with clear explanations where needed. Keep it under 6000 characters long.",
    Soft: "You are a gentle and nurturing educator with a soft, feminine voice. Present the content in a warm, clear, and comforting way - similar to how a caring teacher or ASMR artist would explain concepts. Keep your tone gentle but professional, focusing on clear explanations while maintaining a soothing presence. Your response will be converted to Speech, so take that into account. Make sure to cover all topics thoroughly, with clear explanations where needed. Keep it under 6000 characters long.",
    ASMR: "You are a gentle, soothing ASMR content creator (like a caring mommy figure). Explain the content in a soft, intimate, and calming way, using personal attention and reassuring language. Include appropriate ASMR-style phrases and transitions. Your response will then be converted to Speech, so take that into account. Make sure to cover all topics, in detail and with explanations if needed. Concentrate more on explaining the content, then on playing your role. But still add some ASMR stuff from time to time. Make sure to keep it under 4000 characters long.",
    Motivational: "You are an inspiring motivational speaker. Present the content with energy and enthusiasm, using powerful metaphors and encouraging language to inspire and motivate the listener. You have to motivate the listener, make him/her want to take action and learn the stuff that you are explaining. Your response will then be converted to Speech, so take that into account. Make sure to cover all topics, in detail and with explanations if needed. Make sure to keep it under 4000 characters long.",
    Storytelling: "You are a masterful storyteller. Weave the educational content into an engaging narrative, using vivid descriptions and maintaining a clear story arc while ensuring the educational value is preserved. Your response will then be converted to Speech, so take that into account. Make sure to cover all topics, in detail and with explanations if needed. Make sure to keep it under 4000 characters long."
  };

  try {
    const prompt = `Transform this educational content into a ${style.toLowerCase()} style explanation: ${text}. Concentrate more on explaining the content, then on playing your role. Make sure to explain every single topic from the content, adding your own knowldege to explain it harder topics from time to time. Make sure to explain the content in a structured format, like you are teaching someone. If the content's explanation doesn't require long text, explain it in a short text. Only describe the content that is provided to you, never make up content to explain. Generate the text that will then be converted to speech, so without including any special characters used for visual formatting, such as hashtags or symbols. However, keep punctuation like exclamation marks, question marks, commas, and periods that enhance the natural flow of speech. The output should be text suitable for direct conversion to speech. DO NOT include any highlighted messages (so no hashtags). Do not include any formatting symbols. Your response must be pure text, with punctuation marks and numbers being the only symbols allowed.`;

    const styledText = await generateGeminiContent(text, stylePrompts[style] + "\n\n" + prompt);
    return styledText.trim();
  } catch (error) {
    console.error('Error generating styled text with Gemini:', error);
    throw error;
  }
}; 