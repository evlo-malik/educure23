import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  MessageSquare, 
  X, 
  Reply, 
  CornerDownRight, 
  Image, 
  AlertCircle, 
  Loader2,
  ArrowRight,
  Settings,
  ArrowDown
} from 'lucide-react';
import { generateChatResponse, generateDeepSeekResponse, type ChatMessage } from '../lib/openai';
import ChatMessageComponent from './ChatMessage';
import ThinkingAnimation from './ThinkingAnimation';
import { saveUserMessage, saveCompletedConversation } from '../lib/services/chatService';
import { useSubscription } from '../contexts/SubscriptionContext';
import { checkMessageLimit } from '../lib/messageUsage';
import MessageLimitIndicator from './MessageLimitIndicator';

const CHARACTER_LIMIT = 1500;

interface ChatProps {
  documentContent: string;
  documentId: string;
  initialMessages?: ChatMessage[];
  onChatUpdate?: (messages: ChatMessage[]) => void;
  selectedText?: string | null;
  selectedImage?: string | null;
  onClearSelection?: () => void;
  documentType?: 'youtube';
  youtubeUrl?: string;
  onTimestampClick?: (time: number) => void;
}

export default function Chat({
  documentContent,
  documentId,
  initialMessages = [],
  onChatUpdate,
  selectedText,
  selectedImage,
  onClearSelection,
  documentType,
  youtubeUrl,
  onTimestampClick,
}: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOverLimit, setIsOverLimit] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isMobile] = useState(() => window.innerWidth <= 768);
  const [showReplyingTo, setShowReplyingTo] = useState(false);
  const documentIdRef = useRef<string>(documentId);
  const runRef = useRef<any>(null);
  const [streamComplete, setStreamComplete] = useState(true);
  const fullResponseRef = useRef<string>('');
  const currentMessagesRef = useRef<ChatMessage[]>(messages);
  const hasEndedRef = useRef<boolean>(false);
  const userId = localStorage.getItem('userId');
  const { plan } = useSubscription();
  const [showScrollButton, setShowScrollButton] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
    currentMessagesRef.current = initialMessages;
  }, [initialMessages]);

  useEffect(() => {
    currentMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (selectedText || selectedImage) {
      setShowReplyingTo(true);
      if (isMobile) {
        setTimeout(() => {
          const replyElement = document.querySelector('.reply-indicator');
          replyElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    } else {
      setShowReplyingTo(false);
    }
  }, [selectedText, selectedImage, isMobile]);

  useEffect(() => {
    documentIdRef.current = documentId;
    return () => {
      if (runRef.current) {
        runRef.current.off();
      }
    };
  }, [documentId]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const timeoutId = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timeoutId);
  }, [messages, currentResponse, isThinking]);

  const handleStreamEnd = async () => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;

    try {
      const finalMessages = await saveCompletedConversation(
        documentId,
        currentMessagesRef.current,
        fullResponseRef.current
      );
      
      setCurrentResponse('');
      setMessages(finalMessages);
      
      if (onChatUpdate) {
        await onChatUpdate(finalMessages);
      }

      if (onClearSelection) {
        onClearSelection();
      }
    } catch (error) {
      console.error('Error saving completed conversation:', error);
    } finally {
      setStreamComplete(true);
      setIsLoading(false);
      setIsTyping(false);
      setIsThinking(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= CHARACTER_LIMIT) {
      setInput(newValue);
      setIsOverLimit(false);
    } else {
      setInput(newValue.slice(0, CHARACTER_LIMIT));
      setIsOverLimit(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedText && !selectedImage) || isLoading || !userId) return;

    const messageType = selectedImage ? 'area' : 'text';
    
    try {
      // Check message limits
      const limitCheck = await checkMessageLimit(userId, messageType, plan);
      if (!limitCheck.allowed) {
        setError(`${limitCheck.error} You can purchase additional messages or upgrade your plan to continue.`);
        return;
      }

      let messageContent = '';
      if (selectedImage) {
        messageContent = input.trim() || 'Please analyze this image.';
      } else if (selectedText) {
        messageContent = input.trim() 
          ? `Regarding this text: "${selectedText}"\n\nQuestion: ${input}`
          : `Please explain this text: "${selectedText}"`;
      } else {
        messageContent = input;
      }

      const userMessage: ChatMessage = {
        role: 'user',
        content: messageContent
      };

      setIsLoading(true);
      setIsTyping(true);
      setIsThinking(true);
      setCurrentResponse('');
      setShowReplyingTo(false);
      setStreamComplete(false);
      setInput('');
      setError(null);
      fullResponseRef.current = '';
      hasEndedRef.current = false;

      const updatedMessages = await saveUserMessage(documentId, currentMessagesRef.current, userMessage);
      setMessages(updatedMessages);

      if (onChatUpdate) {
        await onChatUpdate(updatedMessages);
      }

      const response = await generateChatResponse(updatedMessages, documentId, selectedImage || undefined, documentType);

      if (selectedImage) {
        await handleImageAnalysis(response);
      } else {
        try {
          for await (const chunk of response) {
            setIsThinking(false);
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullResponseRef.current += content;
              setCurrentResponse(prev => prev + content);
            }
          }
          await handleStreamEnd();
        } catch (error) {
          console.error('Error processing chat response:', error);
          setCurrentResponse('I apologize, but I encountered an error. Please try again.');
          handleStreamEnd();
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setError('An error occurred while processing your message. Please try again.');
      setIsLoading(false);
      setIsTyping(false);
      setIsThinking(false);
    }
  };

  const handleImageAnalysis = async (response: any) => {
    try {
      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponseRef.current += content;
          setCurrentResponse(prev => prev + content);
        }
      }
      await handleStreamEnd();
    } catch (error) {
      console.error('Error processing image analysis:', error);
      setCurrentResponse('I apologize, but I encountered an error analyzing the image. Please try again.');
      handleStreamEnd();
    }
  };

  return (
    <div className="flex flex-col h-full md:h-[calc(100vh-4rem)]">
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto md:max-h-[calc(100vh-12rem)]"
      >
        <div className="p-3 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p className="text-lg font-medium">
                Ask me anything about your document!
              </p>
              <p className="text-sm mt-2">
                I'll help you understand the content better.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                message.role !== 'system' && (
                  <ChatMessageComponent
                    key={`${documentId}-${index}`}
                    role={message.role}
                    content={message.content}
                    animate={false}
                    youtubeUrl={documentType === 'youtube' ? youtubeUrl : undefined}
                    onTimestampClick={onTimestampClick}
                    isComplete={true}
                  />
                )
              ))}
              {isThinking && <ThinkingAnimation />}
              {currentResponse && !hasEndedRef.current && (
                <ChatMessageComponent
                  role="assistant"
                  content={currentResponse}
                  animate={true}
                  youtubeUrl={documentType === 'youtube' ? youtubeUrl : undefined}
                  onTimestampClick={onTimestampClick}
                  isComplete={!streamComplete}
                />
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Mobile scroll button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="md:hidden fixed bottom-24 right-4 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-500 transition-colors z-20"
        >
          <ArrowDown className="h-5 w-5" />
        </button>
      )}

      <div className="md:sticky md:bottom-0 fixed bottom-0 left-0 right-0 bg-white border-t shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-10">
        {showReplyingTo && (selectedText || selectedImage) && (
          <div className="mx-3 mb-2 md:mb-3 reply-indicator">
            <div className="relative bg-indigo-50 rounded-lg overflow-hidden animate-slideUp">
              <div className="px-2 py-1 md:px-3 md:py-1.5 bg-indigo-100 flex items-center gap-2">
                <Reply className="h-3 w-3 md:h-4 md:w-4 text-indigo-600 animate-bounce-small" />
                <span className="text-xs md:text-sm font-medium text-indigo-600">
                  Replying to {selectedImage ? 'selected area' : 'selection'}
                </span>
                <button
                  onClick={onClearSelection}
                  className="ml-auto p-1 hover:bg-indigo-200 rounded-full transition-colors"
                >
                  <X className="h-3 w-3 md:h-4 md:w-4 text-indigo-600" />
                </button>
              </div>
              <div className="p-2 flex items-start gap-2">
                <CornerDownRight className="h-3 w-3 md:h-4 md:w-4 text-indigo-400 flex-shrink-0 mt-1" />
                {selectedImage ? (
                  <div className="flex flex-col gap-1 md:gap-2 animate-fadeIn">
                    <div className="flex items-center gap-2">
                      <Image className="h-3 w-3 md:h-4 md:w-4 text-indigo-400" />
                      <span className="text-xs md:text-sm text-gray-600">
                        Selected area from PDF
                      </span>
                    </div>
                    <img
                      src={selectedImage}
                      alt="Selected area"
                      className="max-h-24 md:max-h-32 rounded border border-indigo-100 shadow-sm"
                    />
                  </div>
                ) : (
                  <p className="text-xs md:text-sm text-gray-600 line-clamp-2 animate-fadeIn">
                    {selectedText}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hide message limit indicator on mobile */}
        <div className="hidden md:block">
          {userId && <MessageLimitIndicator userId={userId} />}
        </div>

        <form onSubmit={handleSubmit} className="p-2 md:p-3">
          {error && (
            <div className="mb-2 px-2 py-1.5 md:px-3 md:py-2 bg-red-50 border border-red-100 rounded-lg text-xs md:text-sm flex flex-col gap-1 md:gap-2">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
              {error.includes('message limit') && (
                <div className="flex items-center gap-2 pl-6">
                  <Link
                    to="/purchase-messages"
                    className="text-indigo-600 hover:text-indigo-500 font-medium flex items-center gap-1 group"
                  >
                    Purchase additional messages
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {isOverLimit && (
            <div className="mb-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Character limit exceeded. Maximum {CHARACTER_LIMIT} characters allowed.
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder={
                selectedImage
                  ? 'Ask about the selected area...'
                  : selectedText
                  ? 'Ask about the selected text...'
                  : 'Ask a question about your document...'
              }
              className={`flex-1 px-2 py-1.5 md:px-3 md:py-2 border rounded-full shadow-sm backdrop-blur-sm bg-white/90 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm ${
                isOverLimit ? 'border-red-300' : 'border-gray-200'
              }`}
              style={{ 
                fontSize: '16px',
                WebkitAppearance: 'none',
                height: '40px'
              }}
              onBlur={() => {
                // Force scroll back to position after keyboard closes
                window.scrollTo(0, 0);
              }}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && !selectedText && !selectedImage)}
              className="px-2 py-1.5 md:px-3 md:py-2 bg-indigo-600 text-white rounded-full shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] h-[40px] w-[40px] flex items-center justify-center"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}