import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic,
  StopCircle,
  Loader2,
  AlertCircle,
  Download,
  FileText,
  CheckCircle,
  Pause,
  Play,
  RefreshCw,
  Clock,
  Edit
} from 'lucide-react';
import { saveDocument } from '../lib/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import LectureReview from './LectureReview';
import { motion } from 'framer-motion';
import { checkUploadLimit } from '../lib/uploadLimits';
import { useSubscription } from '../contexts/SubscriptionContext';

// Constants for limits
const MAX_RECORDING_TIME = 60; // 2 hours in minutes
const MAX_TRANSCRIPT_LENGTH = 100000; // characters

interface LiveLectureRecorderProps {
  onDocumentsChange?: () => Promise<void>;
}

export default function LiveLectureRecorder({ onDocumentsChange }: LiveLectureRecorderProps) {
  const navigate = useNavigate();
  const { plan } = useSubscription();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isRecordingStopped, setIsRecordingStopped] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout>();
  const recognitionInstanceRef = useRef<any>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [timeWarning, setTimeWarning] = useState(false);
  const lastTimestampRef = useRef<number>(0);
  const timestampIntervalRef = useRef<NodeJS.Timeout>();
  const wakeLockRef = useRef<any>(null);
  const currentTimeRef = useRef<number>(0);

  // Function to request wake lock
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Wake Lock was released');
        });
        console.log('Wake Lock is active');
      }
    } catch (err) {
      console.error('Error requesting wake lock:', err);
      // Don't set error as this is not critical for functionality
    }
  };

  // Release wake lock when component unmounts or recording stops
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
          .then(() => {
            wakeLockRef.current = null;
          })
          .catch((err: any) => console.error('Error releasing wake lock:', err));
      }
    };
  }, []);

  const formatTimestamp = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `[${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}]`;
  };

  const initializeSpeechRecognition = () => {
    if (typeof window === 'undefined') return null;
    
    // Try all possible speech recognition variants
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in your browser. Please use Chrome, Safari, or Edge.');
      return null;
    }

    try {
      const recognition = new SpeechRecognition();
      
      // Configure for better accuracy and continuous recognition
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3; // Get multiple alternatives to choose the best one
      recognition.lang = 'en-US';

      // Improve recognition accuracy with these settings
      (recognition as any).audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      (recognition as any).interimResultsTimeout = 3000; // Wait longer for final results
      
      // Add more robust error recovery
      let restartAttempts = 0;
      const maxRestartAttempts = 5; // Increased from 3 to 5 for better recovery
      let lastRecognitionTime = Date.now();

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        
        if (event.error === 'no-speech') {
          // Don't treat no-speech as an error, just keep listening
          return;
        }

        if (event.error === 'network') {
          // For network errors, try to restart more aggressively
          try {
            recognition.stop();
            setTimeout(() => {
              if (isRecording && !isPaused) {
                recognition.start();
              }
            }, 500); // Reduced delay for faster recovery
            return;
          } catch (err) {
            console.error('Error restarting after network error:', err);
          }
        }

        // For any error, if we haven't restarted recently, try to restart
        const timeSinceLastRestart = Date.now() - lastRecognitionTime;
        if (timeSinceLastRestart > 2000 && restartAttempts < maxRestartAttempts) {
          restartAttempts++;
          lastRecognitionTime = Date.now();
          try {
            recognition.stop();
            setTimeout(() => {
              if (isRecording && !isPaused) {
                recognition.start();
              }
            }, 300); // Reduced delay for faster recovery
          } catch (err) {
            console.error('Error during recognition restart:', err);
          }
        }
      };

      recognition.onend = () => {
        // Don't reset interim transcript immediately to avoid losing words
        const timeSinceLastRestart = Date.now() - lastRecognitionTime;
        
        // Automatically restart recognition if recording is still active
        if (isRecording && !isPaused && recognitionInstanceRef.current) {
          if (timeSinceLastRestart > 1000) { // Only reset attempts if it's been a while
            restartAttempts = 0;
          }
          try {
            recognition.start();
            lastRecognitionTime = Date.now();
          } catch (err) {
            console.error('Error restarting speech recognition:', err);
            if (restartAttempts < maxRestartAttempts) {
              setTimeout(() => {
                if (isRecording && !isPaused) {
                  setupSpeechRecognition();
                }
              }, 300); // Reduced delay for faster recovery
            }
          }
        }
      };

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          let transcriptText = '';
          
          // Choose the most confident result from alternatives
          if (result.length > 1) {
            const alternatives = Array.from(result) as { confidence: number; transcript: string }[];
            const bestResult = alternatives.reduce((best, current) => 
              (current.confidence || 0) > (best.confidence || 0) ? current : best
            );
            transcriptText = bestResult.transcript.trim();
          } else {
            transcriptText = result[0].transcript.trim();
          }

          if (!result.isFinal) {
            setInterimTranscript(transcriptText);
          } else {
            if ((transcript + transcriptText).length > MAX_TRANSCRIPT_LENGTH) {
              stopRecording();
              setError('Maximum transcript length reached');
              return;
            }

            // Always add final results with current timestamp
            const currentTimestamp = formatTimestamp(currentTimeRef.current);
            setTranscript(prev => {
              // Check if we need to add a timestamp
              const lines = prev.split('\n');
              const lastTimestamp = lines
                .reverse()
                .find((line: string) => line.match(/^\[\d{2}:\d{2}\]$/));
              const lastTimestampTime = lastTimestamp ? 
                parseInt(lastTimestamp.match(/\[(\d{2}):(\d{2})\]/)![1]) * 60 + 
                parseInt(lastTimestamp.match(/\[(\d{2}):(\d{2})\]/)![2]) : 
                -1;

              // Add new timestamp if more than 1 second has passed since last timestamp
              const needsNewTimestamp = currentTimeRef.current - lastTimestampTime > 1;
              const needsNewline = prev.length > 0 && !prev.endsWith('\n');

              if (needsNewTimestamp) {
                return `${prev}${needsNewline ? '\n' : ''}${currentTimestamp}\n${transcriptText}\n`;
              } else {
                // Append to existing timestamp's text
                const withoutLastNewline = prev.endsWith('\n') ? prev.slice(0, -1) : prev;
                return `${withoutLastNewline} ${transcriptText}\n`;
              }
            });
            setInterimTranscript('');
          }
        }
      };

      // Start recognition immediately when recording starts
      recognition.onstart = () => {
        console.log('Speech recognition started');
        // Add initial timestamp if transcript is empty
        setTranscript(prev => {
          if (!prev) {
            const currentTimestamp = formatTimestamp(currentTimeRef.current);
            return `${currentTimestamp}\n`;
          }
          return prev;
        });
      };

      return recognition;
    } catch (err) {
      console.error('Error creating speech recognition instance:', err);
      setError('Failed to initialize speech recognition. Please try again.');
      return null;
    }
  };

  // Remove initial timestamp since we'll capture real speech start times
  useEffect(() => {
    if (isRecording && !isPaused && recordingTime === 0) {
      setTranscript('');
    }
  }, [isRecording, isPaused, recordingTime]);

  // Update currentTimeRef whenever recordingTime changes
  useEffect(() => {
    currentTimeRef.current = recordingTime;
  }, [recordingTime]);

  const setupSpeechRecognition = () => {
    // Clean up any existing instance first
    if (recognitionInstanceRef.current) {
      try {
        recognitionInstanceRef.current.stop();
        recognitionInstanceRef.current = null;
      } catch (err) {
        console.error('Error cleaning up existing recognition:', err);
      }
    }

    const recognition = initializeSpeechRecognition();
    if (!recognition) return;

    const speechState = {
      hasStartedSpeaking: false,
      speechStartTime: -1
    };

    recognition.onresult = (event: any) => {
      const result = event.results[event.resultIndex];
      const transcriptText = result[0].transcript.trim();

      // Only capture start time when we first detect speech
      if (!speechState.hasStartedSpeaking && transcriptText.length > 0) {
        speechState.hasStartedSpeaking = true;
        speechState.speechStartTime = currentTimeRef.current;
        console.log('Speech started at:', speechState.speechStartTime);
      }

      if (!result.isFinal) {
        setInterimTranscript(transcriptText);
      } else {
        if ((transcript + transcriptText).length > MAX_TRANSCRIPT_LENGTH) {
          stopRecording();
          setError('Maximum transcript length reached');
          return;
        }

        // Only add the transcript if we have a valid start time
        if (speechState.speechStartTime >= 0) {
          const timestamp = formatTimestamp(speechState.speechStartTime);
          setTranscript(prev => {
            const needsNewline = prev.length > 0 && !prev.endsWith('\n');
            return `${prev}${needsNewline ? '\n' : ''}${timestamp}\n${transcriptText}\n`;
          });
        }

        // Reset for next speech segment
        speechState.hasStartedSpeaking = false;
        speechState.speechStartTime = -1;
        setInterimTranscript('');
      }
    };

    recognitionInstanceRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.error('Error starting speech recognition:', err);
      setError('Failed to start speech recognition. Please try again.');
    }
  };

  // Initialize speech recognition
  useEffect(() => {
    if (isRecording && !recognitionInstanceRef.current) {
      setupSpeechRecognition();
    }

    return () => {
      if (recognitionInstanceRef.current) {
        try {
          recognitionInstanceRef.current.stop();
        } catch (err) {
          console.error('Error stopping speech recognition:', err);
        }
        recognitionInstanceRef.current = null;
      }
    };
  }, [isRecording]);

  // Check recording time limits
  useEffect(() => {
    if (recordingTime >= MAX_RECORDING_TIME * 60 - 60 && recordingTime < MAX_RECORDING_TIME * 60) {
      setTimeWarning(true);
    }

    if (recordingTime >= MAX_RECORDING_TIME * 60) {
      stopRecording();
      setError('Maximum recording time reached');
    }
  }, [recordingTime]);

  const startRecording = async () => {
    try {
      // Reset state
      setTranscript('');
      setInterimTranscript('');
      setError(null);
      setRecordingTime(0);
      currentTimeRef.current = 0;

      // Request wake lock first to prevent screen from sleeping
      await requestWakeLock();
      
      // Configure audio constraints optimized for mobile devices
      const constraints = {
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 44100 },
          // Add specific constraints for mobile
          googEchoCancellation: { ideal: true },
          googAutoGainControl: { ideal: true },
          googNoiseSuppression: { ideal: true },
          googHighpassFilter: { ideal: true }
        }
      };

      // Check if running on iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      
      try {
        // For iOS, we need to request permission first
        if (isIOS) {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Detect device capabilities
        const isLowEndDevice = navigator.hardwareConcurrency <= 4;
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Configure MediaRecorder with appropriate settings for the device
        const options = {
          mimeType: MediaRecorder.isTypeSupported('audio/webm') 
            ? 'audio/webm' 
            : MediaRecorder.isTypeSupported('audio/mp4') 
              ? 'audio/mp4' 
              : 'audio/ogg',
          bitsPerSecond: isLowEndDevice || isMobileDevice ? 16000 : 128000,
        };

        mediaRecorderRef.current = new MediaRecorder(stream, options);
        
        // Add initial timestamp
        setTranscript(`${formatTimestamp(0)}\n`);
        
        chunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(chunksRef.current, { type: options.mimeType });
          const url = URL.createObjectURL(audioBlob);
          setAudioURL(url);
        };

        // Remove visibility change handler - we want recording to continue in background
        mediaRecorderRef.current.start();
        setIsRecording(true);
        setIsRecordingStopped(false);

        // Initialize speech recognition after media recorder is started
        setupSpeechRecognition();

        // Start timer
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => {
            const newTime = prev + 1;
            currentTimeRef.current = newTime;
            return newTime;
          });
        }, 1000);

      } catch (err) {
        if (err instanceof DOMException) {
          if (err.name === 'NotAllowedError') {
            setError('Microphone access was denied. Please grant permission and try again.');
          } else if (err.name === 'NotFoundError') {
            setError('No microphone found. Please connect a microphone and try again.');
          } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            setError('Your microphone is busy or not working properly. Please check your device settings.');
          } else {
            setError('An error occurred while accessing your microphone. Please check your device settings.');
          }
        } else {
          console.error('Error starting recording:', err);
          setError('Could not start recording. Please check your device settings and try again.');
        }
      }
    } catch (err) {
      console.error('Error in startRecording:', err);
      setError('Failed to start recording. Please try again.');
    }
  };

  const handleVisibilityChange = () => {
    if (document.hidden && isRecording && !isPaused) {
      // Automatically pause recording when app goes to background
      pauseRecording();
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setupSpeechRecognition();
        recognitionInstanceRef.current?.start();
        timerRef.current = setInterval(() => {
          setRecordingTime((prev) => prev + 1);
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        recognitionInstanceRef.current?.stop();
        clearInterval(timerRef.current);
      }
      setIsPaused(!isPaused);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Stop media recorder first
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      
      // Thorough cleanup of speech recognition
      if (recognitionInstanceRef.current) {
        try {
          // First, remove all event listeners
          recognitionInstanceRef.current.onresult = null;
          recognitionInstanceRef.current.onend = null;
          recognitionInstanceRef.current.onerror = null;
          recognitionInstanceRef.current.onstart = null;
          
          // Then stop and abort the recognition
          recognitionInstanceRef.current.stop();
          recognitionInstanceRef.current.abort();
          
          // Finally, destroy the instance
          recognitionInstanceRef.current = null;
        } catch (err) {
          console.error('Error stopping speech recognition:', err);
        }
      }

      // Clear all intervals and state
      if (timestampIntervalRef.current) {
        clearInterval(timestampIntervalRef.current);
        timestampIntervalRef.current = undefined;
      }
      clearInterval(timerRef.current);
      timerRef.current = undefined;
      
      // Clear all state except transcript
      setIsRecording(false);
      setIsPaused(false);
      setIsRecordingStopped(true);
      
      // Clear interim transcript and ensure it's added to final transcript if needed
      if (interimTranscript.trim()) {
        setTranscript(prev => {
          const needsNewline = prev.length > 0 && !prev.endsWith('\n');
          return `${prev}${needsNewline ? '\n' : ''}${interimTranscript.trim()}\n`;
        });
      }
      setInterimTranscript('');
      
      // Release wake lock
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
          .then(() => {
            wakeLockRef.current = null;
          })
          .catch((err: any) => console.error('Error releasing wake lock:', err));
      }

      // Ensure final transcript is properly formatted
      setTranscript(prev => {
        const finalTranscript = prev.trim();
        return finalTranscript.endsWith('\n') ? finalTranscript : finalTranscript + '\n';
      });
    }
  };

  const setIsReviewingWithCleanup = (value: boolean) => {
    if (value) {
      // Force stop any ongoing recording
      if (isRecording) {
        stopRecording();
      }

      // Additional cleanup for review mode
      if (recognitionInstanceRef.current) {
        try {
          // Remove all event listeners first
          recognitionInstanceRef.current.onresult = null;
          recognitionInstanceRef.current.onend = null;
          recognitionInstanceRef.current.onerror = null;
          recognitionInstanceRef.current.onstart = null;
          
          // Stop and abort recognition
          recognitionInstanceRef.current.stop();
          recognitionInstanceRef.current.abort();
          
          // Destroy the instance
          recognitionInstanceRef.current = null;
        } catch (err) {
          console.error('Error stopping speech recognition during review:', err);
        }
      }

      // Ensure all intervals are cleared
      if (timestampIntervalRef.current) {
        clearInterval(timestampIntervalRef.current);
        timestampIntervalRef.current = undefined;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }

      // Reset all recording-related state
      setIsRecording(false);
      setIsPaused(false);

      // Clear interim transcript and ensure it's added to final transcript if needed
      if (interimTranscript.trim()) {
        setTranscript(prev => {
          const needsNewline = prev.length > 0 && !prev.endsWith('\n');
          return `${prev}${needsNewline ? '\n' : ''}${interimTranscript.trim()}\n`;
        });
      }
      setInterimTranscript('');

      // Clean up any double newlines and ensure proper formatting
      setTranscript(prev => {
        const cleanedTranscript = prev
          .split('\n')
          .filter(line => line.trim() !== '')
          .join('\n');
        return cleanedTranscript.endsWith('\n') ? cleanedTranscript : cleanedTranscript + '\n';
      });
    }
    setIsReviewing(value);
  };

  const resetRecording = () => {
    setRecordingTime(0);
    setTranscript('');
    setAudioURL(null);
    setError(null);
    chunksRef.current = [];
    setTimeWarning(false);
    setIsReviewing(false);
    setIsRecordingStopped(false);
  };

  const handleSaveTranscript = async (editedTranscript: string) => {
    if (!editedTranscript.trim()) {
      setError('No transcript available to save.');
      return;
    }

    const userId = localStorage.getItem('userId');
    if (!userId) {
      setError('Please log in to save recordings');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);

      try {
        let audioFileUrl = null;
        if (chunksRef.current.length > 0) {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const timestamp = Date.now();
          const audioRef = ref(storage, `audio/${userId}/${timestamp}_lecture.webm`);
          await uploadBytes(audioRef, audioBlob);
          audioFileUrl = await getDownloadURL(audioRef);
        }

        // Only check upload limits after successful audio upload
        const limitCheck = await checkUploadLimit(userId, 'lecture', plan);
        if (!limitCheck.allowed) {
          throw new Error(limitCheck.error || 'Upload limit reached');
        }

        const result = await saveDocument({
          title: `Live Lecture - ${new Date().toLocaleDateString()}`,
          content: editedTranscript,
          summary: '',
          flashcards: [],
          notes: '',
          userId,
          type: 'lecture',
          audioUrl: audioFileUrl || undefined
        });

        if (result.success) {
          try {
            if (onDocumentsChange) {
              await onDocumentsChange();
            }
            navigate('/dashboard');
          } catch (refreshError) {
            console.error('Error refreshing documents:', refreshError);
            navigate('/dashboard');
          }
        } else {
          throw new Error('Failed to save document');
        }
      } catch (error) {
        console.error('Error saving recording:', error);
        setError(error instanceof Error ? error.message : 'Failed to save recording');
      } finally {
        setIsUploading(false);
      }
    } catch (error) {
      console.error('Error checking upload limits:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
      setIsUploading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours > 0 ? hours.toString().padStart(2, '0') + ':' : ''}${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Additional cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording();
      }
      // Final cleanup
      if (recognitionInstanceRef.current) {
        try {
          recognitionInstanceRef.current.onresult = null;
          recognitionInstanceRef.current.onend = null;
          recognitionInstanceRef.current.onerror = null;
          recognitionInstanceRef.current.onstart = null;
          recognitionInstanceRef.current.stop();
          recognitionInstanceRef.current.abort();
          recognitionInstanceRef.current = null;
        } catch (err) {
          console.error('Error cleaning up speech recognition:', err);
        }
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRecording]);

  // Add cleanup for interruptions
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRecording) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isRecording]);

  if (isReviewing && audioURL) {
    return (
      <LectureReview
        audioUrl={audioURL}
        transcript={transcript}
        onSave={handleSaveTranscript}
        onCancel={() => setIsReviewingWithCleanup(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-6 sm:py-12">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 border border-white/20">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-6 sm:mb-8">
            Record Live Lecture
          </h1>

          {timeWarning && (
            <div className="mb-6 p-4 bg-yellow-50 rounded-lg flex items-start gap-3">
              <Clock className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Time Warning</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  Recording will automatically stop in {MAX_RECORDING_TIME * 60 - recordingTime} seconds
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Recording Controls */}
          <div className="flex flex-col items-center justify-center mb-6 sm:mb-8">
            {/* Timer */}
            <div className="text-3xl sm:text-4xl font-mono font-bold text-gray-900 mb-4 sm:mb-6">{formatTime(recordingTime)}</div>

            {/* Control Buttons */}
            <div className="flex items-center gap-3 sm:gap-4">
              {!isRecording && !isRecordingStopped ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={startRecording}
                  className="p-3 sm:p-4 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors touch-target"
                >
                  <Mic className="h-6 w-6 sm:h-8 sm:w-8" />
                </motion.button>
              ) : isRecording && (
                <>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={pauseRecording}
                    className="p-4 bg-indigo-500 text-white rounded-full hover:bg-indigo-600 transition-colors"
                  >
                    {isPaused ? <Play className="h-8 w-8" /> : <Pause className="h-8 w-8" />}
                  </motion.button>
                  {!isRecordingStopped && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={stopRecording}
                      className="p-4 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                      <StopCircle className="h-8 w-8" />
                    </motion.button>
                  )}
                </>
              )}
            </div>

            {/* Recording Status */}
            {isRecording && (
              <div className="mt-4 flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'
                  }`}
                />
                <span className="text-sm text-gray-600">{isPaused ? 'Paused' : 'Recording...'}</span>
              </div>
            )}
          </div>

          {/* Live Transcript */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
              Live Transcript
              {isRecording && !isPaused && (
                <div className="ml-2 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs sm:text-sm text-gray-500">Live</span>
                </div>
              )}
            </h2>
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4 h-48 sm:h-64 overflow-y-auto">
              {transcript ? (
                <div className="text-gray-700 whitespace-pre-wrap">
                  {transcript.split('\n').map((line, index) => {
                    const isTimestamp = /^\[\d{2}:\d{2}\]$/.test(line.trim());
                    return (
                      <React.Fragment key={index}>
                        {isTimestamp ? (
                          <span className="inline-block px-1.5 py-0.5 bg-indigo-50 text-indigo-600 font-mono text-sm rounded">
                            {line}
                          </span>
                        ) : (
                          line
                        )}
                        {index < transcript.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    );
                  })}
                  {isRecording && !isPaused && (
                    <div className="flex items-center gap-2 mt-2 text-indigo-600">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-sm">Transcribing...</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-center mt-8">Start recording to see the live transcript</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {!isRecording && transcript && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <button
                onClick={() => setIsReviewingWithCleanup(true)}
                disabled={isProcessing}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all duration-200 touch-target"
              >
                <Edit className="h-4 w-4 sm:h-5 sm:w-5" />
                Review & Edit
              </button>

              <button
                onClick={() => handleSaveTranscript(transcript)}
                disabled={isUploading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all duration-200 disabled:opacity-50 touch-target"
              >
                {isUploading ? <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" /> : <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />}
                Save Directly
              </button>

              {audioURL && (
                <a
                  href={audioURL}
                  download="lecture-recording.webm"
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-all duration-200 touch-target"
                >
                  <Download className="h-4 w-4 sm:h-5 sm:w-5" />
                  Download Audio
                </a>
              )}

              <button
                onClick={resetRecording}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 touch-target"
              >
                <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" />
                Reset
              </button>
            </div>
          )}

          {/* Limits Info */}
          <div className="mt-6 sm:mt-8 text-xs sm:text-sm text-gray-500">
            <p>Limits:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Maximum recording time: {MAX_RECORDING_TIME} minutes</li>
              <li>Maximum transcript length: {MAX_TRANSCRIPT_LENGTH.toLocaleString()} characters</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}