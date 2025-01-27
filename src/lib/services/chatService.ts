import { updateDocument } from '../firestore';
import type { ChatMessage } from '../openai';

export async function saveChatMessages(documentId: string, messages: ChatMessage[]): Promise<void> {
  if (!documentId || !messages.length) {
    console.error('Invalid parameters for saving chat messages:', { documentId, messageCount: messages.length });
    return;
  }

  try {
    console.log('Attempting to save chat messages to Firestore:', {
      documentId,
      messageCount: messages.length,
      lastMessage: messages[messages.length - 1]
    });

    await updateDocument(documentId, { 
      chatHistory: messages 
    });

    console.log('Successfully saved chat messages to Firestore');
  } catch (error) {
    console.error('Error saving chat messages to Firestore:', error);
    throw error;
  }
}

export async function saveUserMessage(
  documentId: string, 
  messages: ChatMessage[], 
  userMessage: ChatMessage
): Promise<ChatMessage[]> {
  console.log('Saving user message:', userMessage);
  const updatedMessages = [...messages, userMessage];
  await saveChatMessages(documentId, updatedMessages);
  return updatedMessages;
}

export async function saveCompletedConversation(
  documentId: string,
  messages: ChatMessage[],
  assistantResponse: string
): Promise<ChatMessage[]> {
  console.log('Saving completed conversation with assistant response:', {
    documentId,
    currentMessages: messages.length,
    responseLength: assistantResponse.length
  });

  const assistantMessage: ChatMessage = {
    role: 'assistant',
    content: assistantResponse
  };
  
  const finalMessages = [...messages, assistantMessage];
  
  try {
    await saveChatMessages(documentId, finalMessages);
    console.log('Successfully saved complete conversation');
    return finalMessages;
  } catch (error) {
    console.error('Failed to save complete conversation:', error);
    throw error;
  }
}