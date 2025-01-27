import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  User, 
  Mail, 
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  Calendar,
  Clock,
  CreditCard,
  Trash2,
  AlertTriangle,
  ArrowRight,
  XCircle,
  X,
  MessageSquare
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { deleteUserAccount } from '../lib/firestore';
import { 
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
  getAuth
} from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { useSubscription } from '../contexts/SubscriptionContext';
import { cancelSubscription, getSubscriptionStatus } from '../lib/stripe';
import SubscriptionStatusMessage from './SubscriptionStatusMessage';
import RetentionModal from './RetentionModal';
import CancelFeedbackModal from './CancelFeedbackModal';
import MessageUsage from './MessageUsage';
import { createCustomerPortalSession } from '../lib/stripe';

interface UserData {
  name: string;
  email: string;
  createdAt: string;
  lastLogin: string;
}

interface FormData {
  name: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function Profile() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { plan } = useSubscription();
  const [showStatusMessage, setShowStatusMessage] = useState(false);
  const [statusMessageType, setStatusMessageType] = useState<'cancel' | 'upgrade' | 'downgrade'>('cancel');
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<number | undefined>();
  const [isCancelling, setIsCancelling] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          navigate('/signup');
          return;
        }

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('uid', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data();
          const userDoc = {
            name: userData.name || '',
            email: currentUser.email || '',
            createdAt: userData.created_at?.toDate?.() 
              ? new Date(userData.created_at.toDate()).toLocaleDateString()
              : new Date().toLocaleDateString(),
            lastLogin: currentUser.metadata.lastSignInTime 
              ? new Date(currentUser.metadata.lastSignInTime).toLocaleDateString()
              : 'Never'
          };

          setUser(userDoc);
          setFormData(prev => ({
            ...prev,
            name: userDoc.name,
          }));
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        setError('Failed to load user data');
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [navigate]);

  const handleUpdateName = async () => {
    if (!formData.name.trim() || !auth.currentUser) return;

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('uid', '==', auth.currentUser.uid));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        await updateDoc(userDoc.ref, {
          name: formData.name.trim()
        });

        localStorage.setItem('userName', formData.name.trim());

        setUser(prev => prev ? { ...prev, name: formData.name.trim() } : null);
        setSuccess('Name updated successfully');
        setIsEditingName(false);

        window.location.reload();
      }
    } catch (error) {
      console.error('Error updating name:', error);
      setError('Failed to update name');
    }
  };

  const handleUpdatePassword = async () => {
    if (!formData.currentPassword || !formData.newPassword || !auth.currentUser) return;
    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email!,
        formData.currentPassword
      );

      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, formData.newPassword);

      setSuccess('Password updated successfully');
      setIsEditingPassword(false);
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
    } catch (error) {
      console.error('Error updating password:', error);
      setError('Failed to update password. Please check your current password and try again.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser?.uid) return;
  
    try {
      setIsLoading(true);
      setError(null);
  
      // Delete everything
      const result = await deleteUserAccount(auth.currentUser.uid);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete account');
      }
  
      // Delete the user from Firebase Authentication
      await deleteUser(auth.currentUser);
  
      // Clear local storage and navigate to home
      localStorage.removeItem('userId');
      localStorage.removeItem('userName');
      localStorage.removeItem('userPlan');
      navigate('/');
    } catch (error) {
      console.error('Error deleting account:', error);
      setError('Failed to delete account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCancelSubscription = async () => {
    if (!auth.currentUser?.uid) return;
    
    setIsCancelling(true);
    try {
      const result = await cancelSubscription(auth.currentUser.uid);
      if (result.success) {
        setShowCancelConfirm(false);
        setShowRetentionModal(true);
        setCurrentPeriodEnd(result.currentPeriodEnd);
      } else {
        console.error('Error cancelling subscription:', result.error);
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRetentionConfirm = () => {
    setShowRetentionModal(false);
    setShowFeedbackModal(true);
  };

  const handleFeedbackSubmit = () => {
    setShowFeedbackModal(false);
    setStatusMessageType('cancel');
    setShowStatusMessage(true);
  };

  const renderSubscriptionActions = () => {
    switch (plan) {
      case 'cooked':
        return (
          <button
            onClick={() => navigate('/pricing')}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 transition-all duration-200 flex items-center gap-2"
          >
            Upgrade Plan
            <ArrowRight className="w-4 h-4" />
          </button>
        );
      case 'commited':
        return (
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/pricing')}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 transition-all duration-200"
            >
              Upgrade to Locked In
            </button>
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="text-xs text-gray-500 hover:text-red-500 transition-colors"
            >
              Cancel subscription
            </button>
          </div>
        );
      case 'locked-in':
        return (
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="text-xs text-gray-500 hover:text-red-500 transition-colors"
          >
            Cancel subscription
          </button>
        );
      default:
        return null;
    }
  };

  useEffect(() => {
    if (isEditingName || isEditingPassword) {
      setError(null);
      setSuccess(null);
    }
  }, [isEditingName, isEditingPassword]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">User Not Found</h2>
          <p className="text-gray-600">Please try logging in again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 md:p-8 border border-white/20">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-8">
            Account Information
          </h1>

          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-green-800">Success</h3>
                <p className="text-sm text-green-700 mt-1">{success}</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Name Section */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-indigo-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Name</p>
                    {isEditingName ? (
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 bg-white border border-indigo-200 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm"
                      />
                    ) : (
                      <p className="text-sm text-gray-900">{user.name}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (isEditingName) {
                      handleUpdateName();
                    } else {
                      setIsEditingName(true);
                    }
                  }}
                  className="px-3 py-1 text-sm text-indigo-600 hover:text-indigo-500 bg-white rounded-full shadow-sm hover:shadow-md transition-all duration-200"
                >
                  {isEditingName ? 'Save' : 'Edit'}
                </button>
              </div>
            </div>

            {/* Email Section */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Email</p>
                  <p className="text-sm text-gray-900">{user.email}</p>
                </div>
              </div>
            </div>

            {/* Password Section */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-indigo-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Password</p>
                    {isEditingPassword ? (
                      <div className="space-y-3 mt-1">
                        <div className="relative">
                          <input
                            type={showCurrentPassword ? 'text' : 'password'}
                            placeholder="Current password"
                            value={formData.currentPassword}
                            onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
                            className="block w-full px-3 py-2 bg-white border border-indigo-200 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute inset-y-0 right-0 px-3 flex items-center"
                          >
                            {showCurrentPassword ? (
                              <EyeOff className="h-4 w-4 text-gray-400" />
                            ) : (
                              <Eye className="h-4 w-4 text-gray-400" />
                            )}
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            placeholder="New password"
                            value={formData.newPassword}
                            onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                            className="block w-full px-3 py-2 bg-white border border-indigo-200 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute inset-y-0 right-0 px-3 flex items-center"
                          >
                            {showNewPassword ? (
                              <EyeOff className="h-4 w-4 text-gray-400" />
                            ) : (
                              <Eye className="h-4 w-4 text-gray-400" />
                            )}
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Confirm new password"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            className="block w-full px-3 py-2 bg-white border border-indigo-200 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute inset-y-0 right-0 px-3 flex items-center"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4 text-gray-400" />
                            ) : (
                              <Eye className="h-4 w-4 text-gray-400" />
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-900">••••••••</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (isEditingPassword) {
                      handleUpdatePassword();
                    } else {
                      setIsEditingPassword(true);
                    }
                  }}
                  className="px-3 py-1 text-sm text-indigo-600 hover:text-indigo-500 bg-white rounded-full shadow-sm hover:shadow-md transition-all duration-200"
                >
                  {isEditingPassword ? 'Save' : 'Change'}
                </button>
              </div>
            </div>

            {/* Subscription Section */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-indigo-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Subscription Plan</p>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        plan === 'locked-in'
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                          : plan === 'commited'
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {plan === 'locked-in'
                          ? 'Locked In'
                          : plan === 'commited'
                          ? 'Commited'
                          : 'Cooked'}
                      </span>
                    </div>
                  </div>
                </div>
                {renderSubscriptionActions()}
              </div>
            </div>

            {/* Message Usage Section */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <MessageSquare className="h-5 w-5 text-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Message Usage</p>
                  <p className="text-xs text-gray-500">Track your daily and weekly message limits</p>
                </div>
              </div>
              {auth.currentUser?.uid && <MessageUsage userId={auth.currentUser.uid} />}
            </div>

            {/* Account Details */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-indigo-600" />
                    <p className="text-sm font-medium text-gray-700">Member Since</p>
                  </div>
                  <p className="text-sm text-gray-900 mt-2 ml-7">{user.createdAt}</p>
                </div>
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-600" />
                    <p className="text-sm font-medium text-gray-700">Last Login</p>
                  </div>
                  <p className="text-sm text-gray-900 mt-2 ml-7">{user.lastLogin}</p>
                </div>
              </div>
            </div>

            {/* Delete Account Section */}
            <div className="mt-12 border-t pt-8">
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-red-800">Danger Zone</h3>
                    <p className="text-sm text-red-700 mt-1">
                      Once you delete your account, there is no going back. Please be certain.
                    </p>
                    {showDeleteConfirm && (
                      <div className="mt-4 space-y-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleDeleteAccount}
                            disabled={isLoading}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Deleting Account...
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-4 w-4" />
                                Confirm Delete
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setShowDeleteConfirm(false);
                            }}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-all duration-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {!showDeleteConfirm && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-all duration-200 flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Account
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Subscription Confirmation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            {!isCancelling && (
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center justify-center mb-4">
              {isCancelling ? (
                <Loader2 className="h-12 w-12 text-indigo-500 animate-spin" />
              ) : (
                <XCircle className="h-12 w-12 text-red-500" />
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
              {isCancelling ? 'Cancelling subscription...' : 'Are you sure you want to cancel?'}
            </h3>
            <p className="text-gray-600 text-center mb-6">
              {isCancelling ? 
                'Please wait while we process your request.' :
                'You\'ll lose access to premium features at the end of your current billing period.'}
            </p>
            {!isCancelling && (
              <div className="flex gap-4">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Keep Subscription
                </button>
                <button
                  onClick={handleCancelSubscription}
                  className="px-4 py-2 text-red-600 hover:text-red-700 transition-colors text-sm"
                >
                  Cancel Subscription
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Retention Modal */}
      <RetentionModal
        isOpen={showRetentionModal}
        onClose={() => setShowRetentionModal(false)}
        onConfirmCancel={handleRetentionConfirm}
      />

      {/* Feedback Modal */}
      <CancelFeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        onSubmit={handleFeedbackSubmit}
        userId={auth.currentUser?.uid || ''}
        userName={user.name}
      />

      {/* Subscription Status Message */}
      {showStatusMessage && (
        <SubscriptionStatusMessage
          action={statusMessageType}
          currentPeriodEnd={currentPeriodEnd}
          onClose={() => setShowStatusMessage(false)}
        />
      )}
    </div>
  );
}