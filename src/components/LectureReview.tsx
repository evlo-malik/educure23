import React, { useState, useRef, useEffect } from 'react';
import { Volume2, Save, X, Pause, Play } from 'lucide-react';

interface LectureReviewProps {
  audioUrl: string;
  transcript: string;
  onSave: (editedTranscript: string) => void;
  onCancel: () => void;
}

export default function LectureReview({ audioUrl, transcript, onSave, onCancel }: LectureReviewProps) {
  const [editedTranscript, setEditedTranscript] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timestampRegex = /^\[\d{2}:\d{2}\]$/;

  useEffect(() => {
    // Split transcript into segments, preserving timestamps
    const segments = transcript.split('\n').map(line => ({
      text: line,
      isTimestamp: timestampRegex.test(line.trim())
    }));
    setEditedTranscript(segments.map(s => s.text));
  }, [transcript]);

  const handleTranscriptChange = (index: number, newValue: string) => {
    setEditedTranscript(prev => {
      const updated = [...prev];
      // Only allow editing of non-timestamp lines
      if (!timestampRegex.test(prev[index].trim())) {
        updated[index] = newValue;
      }
      return updated;
    });
  };

  const handleTimestampClick = (timestamp: string) => {
    if (audioRef.current) {
      // Convert timestamp [MM:SS] to seconds
      const [minutes, seconds] = timestamp
        .slice(1, -1) // Remove brackets
        .split(':')
        .map(Number);
      
      const timeInSeconds = minutes * 60 + seconds;
      audioRef.current.currentTime = timeInSeconds;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSave = () => {
    // Filter out empty lines before saving
    const cleanedTranscript = editedTranscript
      .filter(line => line.trim() !== '')
      .join('\n');
    onSave(cleanedTranscript);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-6 sm:py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 border border-white/20">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Review & Edit Transcript
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (audioRef.current) {
                    if (isPlaying) {
                      audioRef.current.pause();
                    } else {
                      audioRef.current.play();
                    }
                    setIsPlaying(!isPlaying);
                  }
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 text-indigo-600" />
                ) : (
                  <Play className="h-5 w-5 text-indigo-600" />
                )}
              </button>
            </div>
          </div>

          {audioUrl && (
            <div className="mb-6">
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                controls
                className="w-full"
              />
            </div>
          )}

          <div className="space-y-4">
            {editedTranscript.map((text, index) => {
              const isTimestamp = timestampRegex.test(text.trim());
              return (
                <div key={index} className={`relative ${isTimestamp ? 'pointer-events-none' : ''}`}>
                  {isTimestamp ? (
                    <button
                      onClick={() => handleTimestampClick(text.trim())}
                      className="w-auto px-2 py-1 bg-indigo-50 text-indigo-600 font-mono text-sm rounded hover:bg-indigo-100 cursor-pointer transition-colors pointer-events-auto"
                    >
                      {text}
                    </button>
                  ) : (
                    <textarea
                      value={text}
                      onChange={(e) => handleTranscriptChange(index, e.target.value)}
                      className="w-full p-3 rounded-lg border resize-none transition-colors bg-white border-gray-200 hover:border-indigo-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      rows={1}
                      style={{ minHeight: '4rem' }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <span className="flex items-center gap-2">
                <X className="h-4 w-4" />
                Cancel
              </span>
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}