// src/components/ChatMessage.tsx
import React, { useEffect, useState, useRef } from 'react';
import { User, Check, Copy, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import TypingAnimation from './TypingAnimation';

interface ChatMessageProps {
  content: string;
  role: 'user' | 'assistant';
  animate?: boolean;
  youtubeUrl?: string;
  onTimestampClick?: (time: number) => void;
  isComplete?: boolean;
}

interface CodeProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface CodeComponentProps extends CodeProps {}

const CodeBlock: React.FC<CodeProps> = ({ inline, className, children }) => {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const language = className?.replace('language-', '');

  const handleCopy = async () => {
    if (codeRef.current) {
      const code = codeRef.current.textContent || '';
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (inline) {
    return (
      <code className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-mono text-sm">
        {children}
      </code>
    );
  }

  return (
    <div className="relative group">
      <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative">
        <div className="absolute right-4 top-3 flex items-center gap-3 z-10">
          {language && (
            <div className="text-xs text-indigo-300 font-mono uppercase tracking-wider">
              {language}
            </div>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 hover:text-indigo-200 px-2 py-1.5 rounded-md transition-colors"
            aria-label="Copy code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <pre className="!mt-0 !mb-0 relative bg-gradient-to-br from-gray-900 via-[#1e1b4b] to-gray-900 text-gray-100 p-4 pt-12 rounded-lg overflow-x-auto font-mono text-sm shadow-lg border border-indigo-500/20">
          <code ref={codeRef} className={className}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
};

const convertBracketMath = (text: string) => {
  // Convert [ ... ] math blocks to $...$, but ignore timestamps
  return text
    .replace(/\\\[(.*?)\\\]/gs, '$$$1$$') // Block math
    .replace(/\[(.*?)\]/gs, (match, content) => {
      // If content is purely numeric (timestamp), return as is
      if (/^\d+(\.\d+)?$/.test(content.trim())) {
        return match;
      }
      
      const cleaned = content
        .replace(/, /g, ' ') // Remove vector component commas
        .replace(/(\w)(\s+)([+-])/g, '$1 $3') // Fix operator spacing
        .replace(/\s+/g, ' '); // Collapse multiple spaces
      return `$${cleaned}$`;
    });
};

export default function ChatMessage({ 
  content, 
  role, 
  animate = false,
  youtubeUrl,
  onTimestampClick,
  isComplete = true
}: ChatMessageProps) {
  const processedContent = convertBracketMath(content);
  const [displayedContent, setDisplayedContent] = useState(animate ? '' : processedContent);
  const previousContentRef = useRef(content);
  const [isAnimating, setIsAnimating] = useState(animate && !isComplete);

  useEffect(() => {
    if (content !== previousContentRef.current) {
      previousContentRef.current = content;
      if (animate) {
        setDisplayedContent(content);
        setIsAnimating(!isComplete);
      } else {
        setDisplayedContent(content);
        setIsAnimating(false);
      }
    }

    if (isComplete && isAnimating) {
      setIsAnimating(false);
      setDisplayedContent(content);
    }
  }, [content, animate, isComplete]);

  const renderContent = () => {
    const messageClasses = `
      relative min-w-0 max-w-[95%] md:max-w-[85%] rounded-2xl p-4 mb-3
      break-words overflow-x-auto backdrop-blur-sm
      shadow-lg transition-all duration-200 hover:shadow-xl
      ${role === 'user' 
        ? 'ml-auto bg-gradient-to-br from-blue-600 via-indigo-500 to-purple-500 text-white ring-1 ring-purple-500/30' 
        : 'mr-auto bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 text-gray-900 ring-1 ring-indigo-100/50'
      }
      ${role === 'user' 
        ? 'rounded-tr-sm' 
        : 'rounded-tl-sm'
      }
    `;

    if (!youtubeUrl) {
      return (
        <div className={messageClasses}>
          <div className="prose prose-sm max-w-none overflow-x-auto">
            {isAnimating ? (
              <TypingAnimation 
                text={displayedContent}
                speed={20}
                className={`text-sm ${role === 'user' ? 'text-white' : 'text-slate-700'}`}
                onComplete={() => setIsAnimating(false)}
              />
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  h1: ({node, ...props}) => (
                    <h1 className={`text-lg font-bold mb-2 ${role === 'user' ? 'text-white' : 'text-slate-900'}`} {...props} />
                  ),
                  h2: ({node, ...props}) => (
                    <h2 className={`text-base font-semibold mb-2 ${role === 'user' ? 'text-white' : 'text-slate-800'}`} {...props} />
                  ),
                  h3: ({node, ...props}) => (
                    <h3 className={`text-sm font-medium mb-1 ${role === 'user' ? 'text-white' : 'text-slate-800'}`} {...props} />
                  ),
                  p: ({node, ...props}) => (
                    <p className={`text-sm leading-relaxed mb-2 ${role === 'user' ? 'text-white/95' : 'text-slate-700'}`} {...props} />
                  ),
                  ul: ({node, ...props}) => (
                    <ul className="space-y-1.5 mb-2 text-sm" {...props} />
                  ),
                  ol: ({node, ...props}) => (
                    <ol className="list-decimal pl-4 space-y-1.5 mb-2 text-sm" {...props} />
                  ),
                  li: ({node, ...props}) => (
                    <li className={`flex items-start gap-2 ${role === 'user' ? 'text-white/95' : 'text-slate-700'}`}>
                      <span className={`mt-2 w-1.5 h-1.5 rounded-full ${role === 'user' ? 'bg-purple-300' : 'bg-indigo-400'} flex-shrink-0`} />
                      <span className="flex-1" {...props} />
                    </li>
                  ),
                  strong: ({node, ...props}) => (
                    <strong className={`font-semibold ${role === 'user' ? 'text-purple-100' : 'text-slate-900'}`} {...props} />
                  ),
                  em: ({node, ...props}) => (
                    <em className={`italic ${role === 'user' ? 'text-blue-100' : 'text-indigo-700'}`} {...props} />
                  ),
                  blockquote: ({node, ...props}) => (
                    <blockquote className={`border-l-2 pl-3 my-2 italic ${role === 'user' ? 'border-purple-300 text-white/90 bg-white/10 rounded-r-lg' : 'border-indigo-300 text-slate-700 bg-indigo-50/70 rounded-r-lg'}`} {...props} />
                  ),
                  table: ({node, ...props}) => (
                    <div className="my-4 w-full overflow-x-auto rounded-lg shadow-lg">
                      <div className={`${role === 'user' 
                        ? 'bg-gradient-to-br from-blue-600/90 via-indigo-500/90 to-purple-500/90 ring-1 ring-white/20' 
                        : 'bg-gradient-to-br from-white via-indigo-50 to-indigo-100/80 ring-1 ring-indigo-200/50'}`}>
                        <table className="w-full border-collapse" {...props} />
                      </div>
                    </div>
                  ),
                  thead: ({node, ...props}) => (
                    <thead className={`${role === 'user' 
                      ? 'bg-gradient-to-r from-white/10 via-white/[0.07] to-white/10 text-white' 
                      : 'bg-gradient-to-r from-indigo-100/50 via-indigo-50/50 to-indigo-100/50 text-slate-900'}`} {...props} />
                  ),
                  tbody: ({node, ...props}) => (
                    <tbody className={`${role === 'user' 
                      ? 'divide-y divide-white/10' 
                      : 'divide-y divide-indigo-100'}`} {...props} />
                  ),
                  tr: ({node, ...props}) => (
                    <tr className={`transition-colors duration-150 ${role === 'user' 
                      ? 'hover:bg-white/[0.06] even:bg-white/[0.03]' 
                      : 'hover:bg-indigo-50/70 even:bg-indigo-50/30'}`} {...props} />
                  ),
                  th: ({node, ...props}) => (
                    <th className={`px-4 py-3 text-left text-sm font-semibold ${role === 'user' 
                      ? 'text-white/95' 
                      : 'text-indigo-900'}`} {...props} />
                  ),
                  td: ({node, ...props}) => (
                    <td className={`px-4 py-3 text-sm ${role === 'user' 
                      ? 'text-white/90' 
                      : 'text-slate-700'}`} {...props} />
                  ),
                  code: ({node, inline, className, children}: CodeComponentProps) => {
                    const match = /language-(\w+)/.exec(className || '');
                    if (inline) {
                      return (
                        <code className={`px-1.5 py-0.5 rounded-md font-mono text-xs ${role === 'user' ? 'bg-purple-900/30 text-purple-100 ring-1 ring-purple-300/20' : 'bg-indigo-50/80 text-indigo-700 ring-1 ring-indigo-200'}`}>
                          {children}
                        </code>
                      );
                    }
                    return (
                      <CodeBlock inline={inline} className={className}>
                        {children}
                      </CodeBlock>
                    );
                  },
                }}
              >
                {displayedContent}
              </ReactMarkdown>
            )}
            {isAnimating && (
              <span className={`ml-1 inline-block w-[2px] h-[1.2em] ${role === 'user' ? 'bg-purple-200' : 'bg-indigo-500'} animate-cursor`} />
            )}
          </div>
        </div>
      );
    }

    // Handle YouTube content with timestamps and markdown
    const parts = [];
    let lastIndex = 0;
    const timestampRegex = /\[(\d+(\.\d+)?)\]/g;
    let match;

    while ((match = timestampRegex.exec(displayedContent)) !== null) {
      // Add text before timestamp with markdown
      if (match.index > lastIndex) {
        const textBeforeTimestamp = displayedContent.slice(lastIndex, match.index);
        parts.push(
          <ReactMarkdown
            key={`text-${lastIndex}`}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {textBeforeTimestamp}
          </ReactMarkdown>
        );
      }

      // Add timestamp button
      const time = parseFloat(match[1]);
      if (!isNaN(time)) {
        parts.push(
          <button
            key={`timestamp-${match.index}`}
            onClick={() => onTimestampClick?.(time)}
            className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-md mx-1 transition-colors ${
              role === 'user'
                ? 'bg-white/10 text-white hover:bg-white/20 ring-1 ring-white/20'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 ring-1 ring-indigo-200/50'
            }`}
          >
            [{Math.floor(time)}s]
          </button>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text with markdown
    if (lastIndex < displayedContent.length) {
      const remainingText = displayedContent.slice(lastIndex);
      parts.push(
        <ReactMarkdown
          key={`text-${lastIndex}`}
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {remainingText}
        </ReactMarkdown>
      );
    }

    return (
      <div className={messageClasses}>
        <div className="prose prose-sm max-w-none overflow-x-auto">
          {isAnimating ? (
            <TypingAnimation 
              text={displayedContent}
              speed={20}
              className={`text-sm ${role === 'user' ? 'text-white' : 'text-slate-700'}`}
              onComplete={() => setIsAnimating(false)}
            />
          ) : (
            <div className="space-y-2">
              {parts.map((part, index) => {
                if (React.isValidElement(part) && part.type === ReactMarkdown) {
                  return React.cloneElement(part as React.ReactElement<any>, {
                    key: `text-${index}`,
                    components: {
                      p: ({children}: {children: React.ReactNode}) => (
                        <span className={`text-sm ${role === 'user' ? 'text-white/95' : 'text-slate-700'}`}>{children}</span>
                      ),
                      strong: ({children}: {children: React.ReactNode}) => (
                        <strong className={`font-semibold ${role === 'user' ? 'text-purple-100' : 'text-slate-900'}`}>{children}</strong>
                      ),
                      em: ({children}: {children: React.ReactNode}) => (
                        <em className={`italic ${role === 'user' ? 'text-blue-100' : 'text-indigo-700'}`}>{children}</em>
                      ),
                      code: ({children}: {children: React.ReactNode}) => (
                        <code className={`px-1.5 py-0.5 rounded-md font-mono text-xs ${role === 'user' ? 'bg-purple-900/30 text-purple-100 ring-1 ring-purple-300/20' : 'bg-indigo-50/80 text-indigo-700 ring-1 ring-indigo-200'}`}>
                          {children}
                        </code>
                      ),
                    }
                  });
                }
                // This is a timestamp button
                return part;
              })}
            </div>
          )}
          {isAnimating && (
            <span className={`ml-1 inline-block w-[2px] h-[1.2em] ${role === 'user' ? 'bg-purple-200' : 'bg-indigo-500'} animate-cursor`} />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`flex items-start gap-3 ${role === 'assistant' ? 'animate-scaleIn' : ''}`}>
      <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center mt-1 shadow-md ${
        role === 'assistant' ? 'bg-gradient-to-br from-indigo-200 via-indigo-100 to-white ring-1 ring-indigo-200/50' : 'bg-gradient-to-br from-slate-200 via-slate-100 to-white ring-1 ring-slate-200/50'
      }`}>
        {role === 'assistant' ? (
          <Bot className="h-3.5 w-3.5 text-indigo-700" />
        ) : (
          <User className="h-3.5 w-3.5 text-slate-700" />
        )}
      </div>
      <div className="flex-1">
        {renderContent()}
      </div>
    </div>
  );
}
