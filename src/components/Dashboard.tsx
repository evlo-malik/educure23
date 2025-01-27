import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileUp,
  Loader2,
  Computer,
  AlertCircle,
  Youtube,
  FileText,
  Pencil,
  Trash2,
  Mic,
  ArrowRight,
  Clock,
  BarChart2,
  Upload
} from 'lucide-react';
import {
  saveDocument,
  updateDocumentTitle,
  deleteDocument,
  type Document,
} from '../lib/firestore';
import { extractTextFromPDF } from '../lib/pdf';
import { getYoutubeTranscript } from '../lib/apify';
import { motion } from 'framer-motion';
import DeleteModal from './DeleteModal';
import DeleteAnimation from './DeleteAnimation';
import { useSubscription } from '../contexts/SubscriptionContext';
import { checkUploadLimit, getUploadUsage, PLAN_UPLOAD_LIMITS } from '../lib/uploadLimits';
import { ReferralSourceModal } from './ReferralSourceModal';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface DashboardProps {
  documents?: Document[];
  onDocumentsChange?: () => Promise<void>;
}

function validateYoutubeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
      if (hostname.includes('youtube.com')) {
        const videoId = urlObj.searchParams.get('v');
        return !!videoId && videoId.length === 11;
      } else if (hostname === 'youtu.be') {
        const videoId = urlObj.pathname.slice(1);
        return videoId.length === 11;
      }
    }
    return false;
  } catch (error) {
    return false;
  }
}

export default function Dashboard({ documents = [], onDocumentsChange }: DashboardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile] = useState(() => window.innerWidth <= 768);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isProcessingYoutube, setIsProcessingYoutube] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  const { plan } = useSubscription();
  const [uploadUsage, setUploadUsage] = useState({ documents: 0, lectures: 0 });
  const limits = PLAN_UPLOAD_LIMITS[plan];

  useEffect(() => {
    const loadUsage = async () => {
      if (userId) {
        const usage = await getUploadUsage(userId);
        setUploadUsage(usage);
      }
    };
    loadUsage();
  }, [userId]);

  useEffect(() => {
    const checkReferralModal = async () => {
      if (!userId) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.data();
        
        if (!userData?.hasSeenReferralModal) {
          setShowReferralModal(true);
        }
      } catch (error) {
        console.error('Error checking referral modal status:', error);
      }
    };
    
    checkReferralModal();
  }, [userId]);

  useEffect(() => {
    // Set loading to false after a short delay to show animation
    const timer = setTimeout(() => {
      setIsLoadingDocuments(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleYoutubeImport = async () => {
    if (!userId) {
      setError('Please log in to import videos');
      return;
    }

    if (!youtubeUrl.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    if (!validateYoutubeUrl(youtubeUrl)) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    try {
      // Check upload limits first
      const limitCheck = await checkUploadLimit(userId, 'document', plan);
      if (!limitCheck.allowed) {
        setError(limitCheck.error || 'Upload limit reached');
        return;
      }

      setIsProcessingYoutube(true);
      setError(null);

      const documentId = await getYoutubeTranscript(youtubeUrl, userId);
      setYoutubeUrl('');
      await onDocumentsChange?.();
      const updatedUsage = await getUploadUsage(userId);
      setUploadUsage(updatedUsage);
      navigate(`/document/${documentId}`);
    } catch (err) {
      console.error('YouTube import error:', err);
      setError('Failed to import video transcript. Please try again.');
    } finally {
      setIsProcessingYoutube(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!userId) {
      setError('Please log in to upload documents');
      return;
    }
  
    if (!file.type.includes('pdf')) {
      setError('Please upload a valid PDF file');
      return;
    }
  
    const maxFileSize = PLAN_UPLOAD_LIMITS[plan].maxFileSize * 1024 * 1024; // Convert MB to bytes
    if (file.size > maxFileSize) {
      setError(`File size must be less than ${PLAN_UPLOAD_LIMITS[plan].maxFileSize}MB for your plan`);
      return;
    }
  
    try {
      // Check upload limits first
      const limitCheck = await checkUploadLimit(userId, 'document', plan, file.size);
      if (!limitCheck.allowed) {
        setError(limitCheck.error || 'Upload limit reached');
        return;
      }
  
      setIsProcessing(true);
      setError(null);
      setUploadProgress('Reading PDF content...');
  
      const pdfBuffer = await file.arrayBuffer();
      const text = await extractTextFromPDF(pdfBuffer);
  
      setUploadProgress('Saving document...');
  
      const document = {
        title: file.name.replace('.pdf', ''),
        content: text,
        summary: '',
        notes: '',
        flashcards: [],
        chatHistory: [],
        test: [],
        userId,
        type: 'pdf' as const
      };
  
      const result = await saveDocument(document, file);
  
      if (result.documentId) {
        await onDocumentsChange?.();
        const updatedUsage = await getUploadUsage(userId);
        setUploadUsage(updatedUsage);
        navigate(`/document/${result.documentId}`);
      } else {
        throw new Error('Failed to save document');
      }
    } catch (err) {
      console.error('Document upload error:', err);
      setError('Failed to upload document. Please try again.');
    } finally {
      setIsProcessing(false);
      setUploadProgress('');
    }
  };

  const handleTitleUpdate = async (docId: string) => {
    if (
      !editingTitle.trim() ||
      editingTitle === documents.find((d) => d.id === docId)?.title
    ) {
      setEditingDocId(null);
      return;
    }

    try {
      const result = await updateDocumentTitle(docId, editingTitle.trim());
      if (result.success) {
        await onDocumentsChange?.();
      }
    } catch (error) {
      console.error('Failed to update title:', error);
    } finally {
      setEditingDocId(null);
    }
  };

  const handleDeleteDocument = async () => {
    if (!documentToDelete?.id || !userId) return;

    try {
      setDeletingId(documentToDelete.id);

      const result = await deleteDocument(documentToDelete.id);
      if (result.success) {
        await onDocumentsChange?.();
        const updatedUsage = await getUploadUsage(userId);
        setUploadUsage(updatedUsage);
      } else {
        setError('Failed to delete document');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      setError('Failed to delete document');
    } finally {
      setDeletingId(null);
      setDocumentToDelete(null);
      setShowDeleteModal(false);
    }
  };

  useEffect(() => {
    if (editingDocId && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingDocId]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Mobile Device Notice - Sticky Banner */}
      {isMobile && (
        <div className="fixed top-16 inset-x-0 z-40">
          <div className="bg-gradient-to-r from-red-50 to-rose-50 border-y border-red-100 shadow-sm animate-fadeIn">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Computer className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-red-900">Computer Recommended</h3>
                  <p className="mt-1 text-sm text-red-700">
                    For the best learning experience and access to all features, we strongly recommend using EduCure AI on a desktop or laptop computer.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add padding to account for sticky banner */}
      {isMobile && <div className="h-24" />}

      {/* Delete Animation Container */}
      {deletingId && <DeleteAnimation />}

      <DeleteModal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!deletingId) {
            setShowDeleteModal(false);
            setDocumentToDelete(null);
          }
        }}
        onConfirm={handleDeleteDocument}
        fileName={documentToDelete?.title || ''}
        isDeleting={!!deletingId}
      />

      {showReferralModal && userId && (
        <ReferralSourceModal
          userId={userId}
          onClose={() => setShowReferralModal(false)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Combined Document Upload Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Upload Documents</h2>
          
          {/* YouTube Import */}
          <div className="mb-6">
            <div className="relative">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Paste YouTube video URL..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  disabled={isProcessingYoutube}
                />
                <button
                  onClick={handleYoutubeImport}
                  disabled={isProcessingYoutube}
                  className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessingYoutube ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Youtube className="h-5 w-5" />
                      Import
                    </>
                  )}
                </button>
              </div>
              <Youtube className="absolute left-3 top-1/2 transform -translate-y-1/2 text-red-500 h-5 w-5" />
            </div>
          </div>

          {/* PDF Upload */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer transform hover:scale-[1.01] ${
              isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isProcessing) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (!isProcessing && e.dataTransfer.files.length > 0) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center">
                <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
                <p className="mt-4 text-sm font-semibold text-gray-900">{uploadProgress}</p>
              </div>
            ) : (
              <>
                <FileUp className="mx-auto h-12 w-12 text-gray-400" />
                <div className="mt-4">
                  <label className="cursor-pointer">
                    <span className="text-indigo-600 hover:text-indigo-500">Upload PDF</span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                  </label>
                  <span className="text-gray-500"> or drag and drop</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Maximum file size: {PLAN_UPLOAD_LIMITS[plan].maxFileSize}MB</p>
              </>
            )}
          </div>

          {/* Document Upload Limit Bar */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-medium text-gray-700">Weekly Document Uploads</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {uploadUsage.documents} / {limits.weeklyDocuments === Infinity ? '∞' : limits.weeklyDocuments}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                style={{ 
                  width: limits.weeklyDocuments === Infinity 
                    ? '100%' 
                    : `${(uploadUsage.documents / limits.weeklyDocuments) * 100}%` 
                }}
              />
            </div>
          </div>
        </div>

        {/* Record Live Lecture Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Record Live Lecture</h2>
          <div className="flex flex-col items-center justify-center">
            <Link
              to="/record"
              className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 flex items-center justify-center gap-2 group transform hover:scale-[1.02]"
            >
              <Mic className="h-5 w-5 transition-transform group-hover:scale-110" />
              Start Recording
            </Link>
            <p className="mt-4 text-sm text-center text-gray-500">
              Record and transcribe your lectures in real-time
            </p>
          </div>

          {/* Lecture Recording Limit Bar */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-gray-700">Monthly Lecture Recordings</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {uploadUsage.lectures} / {limits.monthlyLectures}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                style={{ width: `${(uploadUsage.lectures / limits.monthlyLectures) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-md flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
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

      {/* Documents List */}
      <div className="mt-12">
        <h1 className="text-2xl font-bold text-gray-900">Your Documents</h1>

        {/* PDF & Lecture Documents Section */}
        <h2 className="text-lg font-semibold text-gray-700 mb-4">PDF & Lecture Documents</h2>
        
        {isLoadingDocuments ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 overflow-hidden"
              >
                <div className="animate-pulse">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-4 bg-gray-100 rounded w-1/4"></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                      <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : documents.length > 0 ? (
          <>
            {/* PDF & Lecture Documents */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {documents.filter(doc => doc.type !== 'youtube').map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.02 }}
                  className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer h-[120px]"
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('.title-edit, .delete-button')) {
                      navigate(`/document/${doc.id}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {editingDocId === doc.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleTitleUpdate(doc.id);
                          }}
                          className="title-edit"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            ref={titleInputRef}
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => handleTitleUpdate(doc.id)}
                            className="w-full px-2 py-1 text-lg font-semibold text-gray-900 border-b-2 border-indigo-500 focus:outline-none focus:border-indigo-600 bg-transparent"
                            placeholder="Enter document title..."
                          />
                        </form>
                      ) : (
                        <>
                          <h3 className="text-lg font-semibold text-gray-900 truncate mb-1">
                            {doc.title}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDocumentToDelete({ id: doc.id, title: doc.title });
                          setShowDeleteModal(true);
                        }}
                        className="delete-button p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                        title="Delete document"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                      {doc.type === 'pdf' ? (
                        <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      ) : (
                        <Mic className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* YouTube Videos Section */}
            <h2 className="text-lg font-semibold text-gray-700 mb-4 mt-8">YouTube Videos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.filter(doc => doc.type === 'youtube').map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.02 }}
                  className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('.title-edit, .delete-button')) {
                      navigate(`/document/${doc.id}`);
                    }
                  }}
                >
                  {/* Thumbnail */}
                  <div className="w-full mb-3">
                    <div className="relative">
                      {(() => {
                        console.log('Thumbnail URL for', doc.title, ':', doc.thumbnail_url);
                        return doc.thumbnail_url ? (
                          <img 
                            src={doc.thumbnail_url} 
                            alt={doc.title}
                            className="w-full h-48 rounded-lg"
                            style={{ objectFit: 'cover' }}
                            onError={(e) => {
                              console.error('Image failed to load:', doc.thumbnail_url);
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                            <Youtube className="h-8 w-8 text-gray-400" />
                          </div>
                        );
                      })()}
                      <div className="absolute top-2 right-2 bg-black/60 rounded-lg p-2">
                        <Youtube className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {editingDocId === doc.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleTitleUpdate(doc.id);
                          }}
                          className="title-edit"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            ref={titleInputRef}
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => handleTitleUpdate(doc.id)}
                            className="w-full px-2 py-1 text-lg font-semibold text-gray-900 border-b-2 border-indigo-500 focus:outline-none focus:border-indigo-600 bg-transparent"
                            placeholder="Enter document title..."
                          />
                        </form>
                      ) : (
                        <>
                          <h3 className="text-lg font-semibold text-gray-900 truncate mb-1">
                            {doc.title}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </p>
                        </>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDocumentToDelete({ id: doc.id, title: doc.title });
                        setShowDeleteModal(true);
                      }}
                      className="delete-button p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 ml-2"
                      title="Delete document"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-12 text-center">
            <p className="text-gray-500">No documents yet</p>
            <p className="text-sm text-gray-400 mt-2">Upload your first document to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}