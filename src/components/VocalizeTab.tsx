import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Loader2, ChevronDown, ChevronUp, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { generateSpeech, type AudioStyle } from '../lib/elevenlabs';
import { deleteAudio, renameAudio, fetchDocumentAudios, MAX_AUDIOS_PER_DOCUMENT } from '../lib/storage';
import LoadingAudio from './LoadingAudio';
import AudioCard from './AudioCard';
import type { AudioEntry } from '../lib/firestore';
import { generateStyledText } from '../lib/openai';
import { checkVocalizeLimit, getVocalizeUsage, VOCALIZE_LIMITS } from '../lib/vocalizeUsage';
import { useSubscription } from '../contexts/SubscriptionContext';
import { Link } from 'react-router-dom';
import { updateDocument } from '../lib/firestore';

interface VocalizeTabProps {
  document: {
    id: string;
    content: string;
    audioUrl?: string;
    audioStyle?: string;
    additionalAudios?: AudioEntry[];
  };
  onUpdate: () => void;
}

const styleOptions = [
  { 
    value: 'Lecture', 
    label: 'Lecture',
    description: 'Professional academic voice for clear explanations',
    icon: '🎓'
  },
  { 
    value: 'News', 
    label: 'News Anchor', 
    description: 'Professional broadcast style voice',
    icon: '📰'
  },
  { 
    value: 'Soft', 
    label: 'Soft Voice', 
    description: 'Gentle, soothing voice for comfortable learning',
    icon: '🌸'
  },
  { 
    value: 'ASMR', 
    label: 'ASMR', 
    description: 'Soft, intimate voice for relaxed learning',
    isPro: true,
    icon: '🎧'
  },
  { 
    value: 'Motivational', 
    label: 'Motivational', 
    description: 'Energetic voice to inspire and engage',
    isPro: true,
    icon: '🔥'
  },
  { 
    value: 'Storytelling', 
    label: 'Storytelling', 
    description: 'Expressive voice for narrative content',
    isPro: true,
    icon: '📚'
  }
];

export default function VocalizeTab({ document, onUpdate }: VocalizeTabProps) {
  const [selectedStyle, setSelectedStyle] = useState<AudioStyle>('Lecture');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [savedAudios, setSavedAudios] = useState<AudioEntry[]>([]);
  const [currentPlayingUrl, setCurrentPlayingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const userId = localStorage.getItem('userId');
  const { plan } = useSubscription();
  const [vocalizeUsage, setVocalizeUsage] = useState({ standard: 0, pro: 0 });
  const limits = VOCALIZE_LIMITS[plan];

  const selectedOption = styleOptions.find(option => option.value === selectedStyle);

  useEffect(() => {
    const loadUsage = async () => {
      if (userId) {
        const usage = await getVocalizeUsage(userId);
        setVocalizeUsage(usage);
      }
    };
    loadUsage();
  }, [userId]);

  useEffect(() => {
    const loadSavedAudios = async () => {
      if (userId && document.id) {
        const audios = await fetchDocumentAudios(userId, document.id);
        setSavedAudios(audios);
      }
    };
    loadSavedAudios();
  }, [userId, document.id]);

  const handleGenerate = async () => {
    if (!document?.content || isGeneratingAudio || !userId) {
      if (!userId) {
        alert('Please log in to generate audio');
      }
      return;
    }

    try {
      // Check vocalize limits first
      const limitCheck = await checkVocalizeLimit(userId, selectedStyle, plan);
      if (!limitCheck.allowed) {
        setError(limitCheck.error || 'Generation limit reached');
        return;
      }

      setIsGeneratingAudio(true);
      setError(null);

      // Generate styled text using OpenAI
      const styledText = await generateStyledText(document.content, selectedStyle);

      // Convert the styled text to speech using Eleven Labs
      const newAudioUrl = await generateSpeech(styledText, selectedStyle, document.id, userId);
      
      // Create new audio entry
      const newAudio: AudioEntry = {
        url: newAudioUrl,
        style: selectedStyle
      };

      // Update saved audios
      const updatedAudios = [...savedAudios, newAudio];
      setSavedAudios(updatedAudios);

      // Update document with new audio
      await updateDocument(document.id, {
        audioUrl: newAudioUrl,
        audioStyle: selectedStyle,
        additionalAudios: updatedAudios.slice(1)
      });

      // Update usage counts
      const updatedUsage = await getVocalizeUsage(userId);
      setVocalizeUsage(updatedUsage);

      setIsGeneratingAudio(false);

      // Auto-play the new audio
      setCurrentPlayingUrl(newAudioUrl);
      if (audioRef.current) {
        try {
          await audioRef.current.play();
          setIsAudioPlaying(true);
        } catch (playError) {
          console.warn('Auto-play failed:', playError);
        }
      }
    } catch (error) {
      console.error('Error generating audio:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate audio');
      setIsGeneratingAudio(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="w-full max-w-2xl">
        {/* Usage Indicators */}
        <div className="mb-8 space-y-4">
          {/* Standard Vocalize Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-medium text-gray-700">Standard Vocalize</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {vocalizeUsage.standard} / {limits.standardVocalize}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                style={{
                  width: `${(vocalizeUsage.standard / limits.standardVocalize) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Pro Vocalize Usage */}
          {plan !== 'cooked' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-gray-700">Pro Vocalize</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {vocalizeUsage.pro} / {limits.proVocalize}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 rounded-full transition-all duration-300"
                  style={{
                    width: `${(vocalizeUsage.pro / limits.proVocalize) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <p className="text-sm text-red-700">{error}</p>
              {error.includes('limit') && (
                <Link
                  to="/pricing"
                  className="mt-2 inline-flex items-center text-sm text-indigo-600 hover:text-indigo-500"
                >
                  Upgrade your plan
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Style Selection */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">Voice Style</label>
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-left flex items-center justify-between group hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedOption?.icon}</span>
                <div>
                  <span className="block font-medium text-gray-900">{selectedOption?.label}</span>
                  <span className="block text-sm text-gray-500">{selectedOption?.description}</span>
                </div>
              </div>
              {isDropdownOpen ? (
                <ChevronUp className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              )}
            </button>

            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-10 w-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden"
                >
                  {styleOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSelectedStyle(option.value as AudioStyle);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                        selectedStyle === option.value ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{option.label}</span>
                          {option.isPro && (
                            <span className="px-1.5 py-0.5 text-xs font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full">
                              PRO
                            </span>
                          )}
                        </div>
                        <span className="block text-sm text-gray-500">{option.description}</span>
                      </div>
                      {selectedStyle === option.value && (
                        <Check className="h-5 w-5 text-indigo-600" />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Generate New Audio Button */}
        {savedAudios.length >= MAX_AUDIOS_PER_DOCUMENT ? (
          <div className="text-center mb-8 p-4 bg-yellow-50 border border-yellow-100 rounded-lg">
            <p className="text-yellow-800 font-medium">Maximum Audio Limit Reached</p>
            <p className="text-sm text-yellow-600 mt-1">
              Delete an existing audio version to generate a new one.
            </p>
          </div>
        ) : isGeneratingAudio ? (
          <div className="flex flex-col items-center mb-8">
            <div className="w-32 h-32 mb-6">
              <LoadingAudio className="w-full h-full" />
            </div>
            <p className="text-lg font-medium text-gray-900">Generating Audio Experience...</p>
            <p className="mt-2 text-sm text-gray-600">
              Creating your {selectedStyle.toLowerCase()} style revision
            </p>
          </div>
        ) : (
          <div className="text-center mb-8">
            <button
              onClick={handleGenerate}
              disabled={savedAudios.length >= MAX_AUDIOS_PER_DOCUMENT}
              className="w-full px-6 py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg font-semibold hover:from-violet-500 hover:to-purple-500 transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
            >
              <span className="flex items-center justify-center gap-2">
                <Volume2 className="h-5 w-5" />
                Generate New Audio in {selectedStyle} Style
              </span>
            </button>
          </div>
        )}

        {/* Saved Audios Section */}
        {savedAudios.length > 0 && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Saved Audio Versions ({savedAudios.length}/{MAX_AUDIOS_PER_DOCUMENT})
            </h3>
            <div className="grid gap-4">
              {savedAudios.map((audio, index) => (
                <AudioCard
                  key={`${audio.url}-${index}`}
                  audio={audio}
                  isPlaying={currentPlayingUrl === audio.url}
                  onPlay={() => setCurrentPlayingUrl(audio.url)}
                  onPause={() => setCurrentPlayingUrl(null)}
                  onEnd={() => setCurrentPlayingUrl(null)}
                  onDelete={async () => {
                    if (audio.fileName && userId) {
                      const success = await deleteAudio(userId, document.id, audio.fileName);
                      if (success) {
                        const updatedAudios = await fetchDocumentAudios(userId, document.id);
                        setSavedAudios(updatedAudios);
                      }
                    }
                  }}
                  onRename={async (newName) => {
                    if (audio.fileName && userId) {
                      const success = await renameAudio(userId, document.id, audio.fileName, newName);
                      if (success) {
                        const updatedAudios = await fetchDocumentAudios(userId, document.id);
                        setSavedAudios(updatedAudios);
                      }
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {savedAudios.length === 0 && !isGeneratingAudio && (
          <div className="text-center text-gray-500 mt-8">
            <p>No audio versions generated yet.</p>
            <p className="text-sm mt-2">Generate your first audio version above!</p>
          </div>
        )}
      </div>
    </div>
  );
}