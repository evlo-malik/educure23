import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { LogOut, Book, User, Settings, HelpCircle, LayoutDashboard, Sparkles, Loader2 } from 'lucide-react';
import { useSubscription } from './contexts/SubscriptionContext';
import Hero from './components/Hero';
import Features from './components/Features';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import DocumentView from './components/DocumentView';
import Footer from './components/Footer';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import CookiePolicy from './components/CookiePolicy';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import Profile from './components/Profile';
import FeatureTourModal from './components/FeatureTourModal';
import LiveLectureRecorder from './components/LiveLectureRecorder';
import LecturePage from './components/LecturePage';
import UserMenu from './components/UserMenu';
import FeatureRequest from './components/FeatureRequest';
import { getUserDocuments, type Document } from './lib/firestore';
import Feedback from './components/Feedback';
import { ToastProvider } from './contexts/ToastContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import CookieConsent from './components/CookieConsent';
import Pricing from './components/Pricing';
import CheckoutSuccess from './components/CheckoutSuccess';
import Support from './components/Support';
import EmailVerification from './components/EmailVerification';
import EmailVerified from './components/EmailVerified';
import AuthAction from './components/AuthAction';
import MessagePurchase from './components/MessagePurchase';

function Layout({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [showFeatureTour, setShowFeatureTour] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const loadDocumentsRef = useRef<() => Promise<void>>();
  const userId = localStorage.getItem('userId');
  const userName = localStorage.getItem('userName');
  const location = useLocation();
  const { plan, isLoading: isPlanLoading } = useSubscription();
  const isLandingPage = location.pathname === '/';

  // Initialize loadDocuments function
  loadDocumentsRef.current = async () => {
    if (!userId) return;
    const docs = await getUserDocuments(userId);
    setDocuments(docs);
  };

  useEffect(() => {
    if (!isPlanLoading) {
      // Add a small delay to ensure smooth transition
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isPlanLoading]);

  useEffect(() => {
    if (userId) {
      loadDocumentsRef.current?.();
    }
  }, [userId]);

  if (isInitialLoad) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl animate-pulse" />
            <img 
              src="https://evlo-malik.github.io/uni-logos/2.png"
              alt="EduCure AI Logo"
              className="relative z-10 w-full h-full object-contain"
            />
          </div>
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white/90 backdrop-blur-sm shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Left side - Logo */}
            <Link to={userId ? "/dashboard" : "/"} className="flex items-center gap-2 min-w-0">
              <img 
                src="https://evlo-malik.github.io/uni-logos/2.png"
                alt="EduCure AI Logo"
                className="h-8 w-8 md:h-12 md:w-12 object-contain flex-shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-lg md:text-2xl font-bold truncate">
                  <span className="text-gray-900">Edu</span>
                  <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Cure AI</span>
                </span>
                <span className="text-[10px] md:text-xs text-gray-500 hidden sm:block">Transform Your Learning Journey</span>
              </div>
            </Link>

            {/* Right side - User Menu */}
            {userId ? (
              <div className="flex items-center gap-2 md:gap-4">
                {/* Help Button - Hidden on mobile */}
                <button 
                  onClick={() => setShowFeatureTour(true)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors hidden md:flex"
                >
                  <HelpCircle className="h-5 w-5 text-gray-500" />
                </button>

                {!isPlanLoading && plan === 'cooked' && (
                  <Link 
                    to="/pricing" 
                    className="group relative flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 bg-[length:200%_auto] animate-gradient-x text-white rounded-lg md:rounded-xl overflow-hidden shadow-[0_0_0_2px_rgba(139,92,246,0.2)] hover:shadow-[0_0_0_2px_rgba(139,92,246,0.4)] transition-all duration-300"
                  > 
                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 rounded-xl opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-300" />
                    
                    {/* Shine effect */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    </div>
                    
                    {/* Content */}
                    <div className="relative flex items-center gap-2">
                      <span className="text-xs md:text-sm font-medium whitespace-nowrap">
                        <span className="hidden sm:inline"></span>
                        Upgrade Now
                      </span>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded-full text-xs font-medium">
                        <Sparkles className="w-2.5 h-2.5 md:w-3 md:h-3 animate-pulse" />
                        <span>Pro</span>
                      </div>
                    </div>
                  </Link>
                )}


                {/* Dashboard Button */}
                <Link
                  to="/dashboard"
                  className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 transition-all duration-200 transform hover:scale-105 shadow-md"
                >
                  <LayoutDashboard className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="font-medium text-sm md:text-base">Dashboard</span>
                </Link>

                {/* User Menu */}
                <UserMenu 
                  userName={userName || 'User'} 
                  onLogout={handleLogout}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 md:gap-4">
                <Link
                  to="/pricing"
                  className="text-sm md:text-base px-3 md:px-4 py-1.5 md:py-2 text-indigo-600 hover:text-indigo-500 transition-colors"
                >
                  Pricing
                </Link>
                <Link
                  to="/signup"
                  className="text-sm md:text-base px-3 md:px-4 py-1.5 md:py-2 text-indigo-600 hover:text-indigo-500 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="text-sm md:text-base px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 shadow-sm transition-all duration-200 hover:shadow-md"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow">
        {React.cloneElement(children as React.ReactElement, { 
          documents, 
          onDocumentsChange: () => loadDocumentsRef.current?.()
        })}
      </main>

      {isLandingPage && <Footer />}

      {/* Feature Tour Modal */}
      <FeatureTourModal 
        isOpen={showFeatureTour} 
        onClose={() => setShowFeatureTour(false)} 
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <LoadingProvider>
          <SubscriptionProvider>
            <Routes>
              <Route path="/" element={<Layout><HomePage /></Layout>} />
              <Route path="/signup" element={<AuthForm />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/privacy" element={<Layout><PrivacyPolicy /></Layout>} />
              <Route path="/terms" element={<Layout><TermsOfService /></Layout>} />
              <Route path="/cookies" element={<Layout><CookiePolicy /></Layout>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/feedback" element={<Layout><Feedback /></Layout>} />
              <Route path="/feature-request" element={<Layout><FeatureRequest /></Layout>} />
              <Route path="/pricing" element={<Layout><Pricing /></Layout>} />
              <Route path="/checkout/success" element={<CheckoutSuccess />} />
              <Route path="/support" element={<Layout><Support /></Layout>} />
              <Route path="/verify-email" element={<EmailVerification />} />
              <Route path="/email-verified" element={<EmailVerified />} />
              <Route path="/auth/action" element={<AuthAction />} />
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Layout><Dashboard /></Layout>
                  </ProtectedRoute>
                } 
              />
              <Route
                path="/document/:id"
                element={
                  <ProtectedRoute>
                    <Layout><DocumentView /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/purchase-messages"
                element={
                  <ProtectedRoute>
                    <Layout><MessagePurchase /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/record"
                element={
                  <ProtectedRoute>
                    <Layout><LiveLectureRecorder /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/lecture/:id"
                element={
                  <ProtectedRoute>
                    <Layout><LecturePage /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Layout><Profile /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <CookieConsent userId={localStorage.getItem('userId')} />
          </SubscriptionProvider>
        </LoadingProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function HomePage() {
  return (
    <>
      <Hero />
      <Features />
    </>
  );
}

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const userId = localStorage.getItem('userId');
  if (!userId) {
    return <Navigate to="/signup" replace />;
  }
  return <>{children}</>;
}

export default App;