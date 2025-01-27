import React, { useState, useEffect, useRef } from 'react';

interface TypingAnimationProps {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
}

export default function TypingAnimation({ 
  text, 
  speed = 30,
  className = '',
  onComplete 
}: TypingAnimationProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const previousTextRef = useRef(text);

  useEffect(() => {
    // If text has changed, reset animation
    if (text !== previousTextRef.current) {
      setDisplayedText('');
      setCurrentIndex(0);
      previousTextRef.current = text;
      return;
    }

    // Only animate if we're not at the end of the text
    if (currentIndex < text.length) {
      // Calculate dynamic speed based on punctuation
      let currentSpeed = speed;
      const char = text[currentIndex];
      if (['.', '!', '?'].includes(char)) currentSpeed *= 4;
      else if ([',', ';', ':'].includes(char)) currentSpeed *= 2;

      timeoutRef.current = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + 1));
        setCurrentIndex(prev => prev + 1);
      }, currentSpeed);
    } else if (onComplete) {
      onComplete();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [currentIndex, text, speed, onComplete]);

  return (
    <span className={className}>
      {displayedText}
    </span>
  );
}