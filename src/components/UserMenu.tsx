import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  User, 
  LogOut, 
  LifeBuoy, 
  MessageSquare,
  Lightbulb,
  Star,
  Skull
} from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';

interface UserMenuProps {
  userName: string;
  onLogout: () => void;
}

export default function UserMenu({ userName, onLogout }: UserMenuProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const { plan } = useSubscription();

  const renderPlanIcon = () => {
    switch (plan) {
      case 'commited':
        return <Star className="w-4 h-4" />;
      case 'locked-in':
        return (
          <img 
            src="https://evlo-malik.github.io/uni-logos/goat.png" 
            alt="GOAT"
            className="w-[15px] h-[15px] object-contain filter grayscale brightness-50" // Reduced size slightly
          />
        );
      default:
        return <Skull className="w-4 h-4" />;
    }
  };


  const getPlanDisplay = () => {
    switch (plan) {
      case 'commited':
        return 'Commited Member';
      case 'locked-in':
        return 'Locked In Member';
      default:
        return 'Cooked Member';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold">
          {userName?.charAt(0).toUpperCase()}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-gray-700 truncate">{userName}</p>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <span className="flex items-center">
              {renderPlanIcon()}
            </span>
            {getPlanDisplay()}
          </p>
        </div>
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-100 py-1 animate-fadeIn z-50">
          {/* User Info */}
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <span className="flex items-center">
                {renderPlanIcon()}
              </span>
              {getPlanDisplay()}
            </p>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <Link
              to="/profile"
              onClick={() => setShowDropdown(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <User className="h-4 w-4" />
              Profile
            </Link>

            <Link
              to="/pricing"
              onClick={() => setShowDropdown(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Star className="h-4 w-4" />
              Upgrade Plan
            </Link>

            <Link
              to="/support"
              onClick={() => setShowDropdown(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <LifeBuoy className="h-4 w-4" />
              Support
            </Link>

            <Link
              to="/feedback"
              onClick={() => setShowDropdown(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
              Feedback
            </Link>

            <Link
              to="/feature-request"
              onClick={() => setShowDropdown(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Lightbulb className="h-4 w-4" />
              Feature Request
            </Link>

            <div className="border-t border-gray-100 my-1"></div>

            <button
              onClick={() => {
                setShowDropdown(false);
                onLogout();
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors w-full"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
