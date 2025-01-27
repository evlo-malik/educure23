import React from 'react';
import { motion } from 'framer-motion';
import { 
  LifeBuoy, 
  Mail, 
  MessageSquare,
  FileText,
  Youtube,
  Brain,
  Clock,
  ArrowRight,
  Shield,
  FileQuestion,
  Lightbulb
} from 'lucide-react';
import { Link } from 'react-router-dom';

const commonQuestions = [
  {
    question: "How do I upload documents?",
    answer: "You can upload PDF documents by clicking the 'Upload' button on your dashboard or simply drag and drop files into the upload area.",
    icon: FileText
  },
  {
    question: "What file formats are supported?",
    answer: "Currently, we support PDF files for document analysis and YouTube videos for transcript generation.",
    icon: Youtube
  },
  {
    question: "How does the AI analysis work?",
    answer: "Our advanced AI analyzes your documents to create summaries, flashcards, and interactive study materials while maintaining context and accuracy.",
    icon: Brain
  },
  {
    question: "What are the usage limits?",
    answer: "Free users can upload up to 5 documents. Premium users get increased limits and additional features.",
    icon: Clock
  }
];

export default function Support() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="w-20 h-20 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 p-4 mx-auto mb-6"
          >
            <LifeBuoy className="w-full h-full text-white" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4"
          >
            How Can We Help?
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-gray-600"
          >
            Get the help you need with our comprehensive support resources
          </motion.p>
        </div>

        {/* Support Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {/* Email Support */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-purple-500 opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300" />
            <div className="relative bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 p-2.5 mb-4">
                <Mail className="w-full h-full text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Email Support</h3>
              <p className="text-gray-600 mb-4">Need help? Send us an email and we'll get back to you within 24 hours.</p>
              <a
                href="mailto:admin@educure.io"
                className="flex items-center text-indigo-600 hover:text-indigo-500 font-medium transition-colors"
              >
                Contact Support
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </div>
          </motion.div>

          {/* Feature Requests */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-orange-500 opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300" />
            <div className="relative bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 p-2.5 mb-4">
                <Lightbulb className="w-full h-full text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Feature Requests</h3>
              <p className="text-gray-600 mb-4">Have an idea for improving our platform? We'd love to hear it!</p>
              <Link
                to="/feature-request"
                className="flex items-center text-indigo-600 hover:text-indigo-500 font-medium transition-colors"
              >
                Submit Request
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </motion.div>

          {/* Feedback */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300" />
            <div className="relative bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 p-2.5 mb-4">
                <MessageSquare className="w-full h-full text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Send Feedback</h3>
              <p className="text-gray-600 mb-4">Share your thoughts and help us improve your experience.</p>
              <Link
                to="/feedback"
                className="flex items-center text-indigo-600 hover:text-indigo-500 font-medium transition-colors"
              >
                Submit Feedback
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Common Questions */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-8">Frequently Asked Questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {commonQuestions.map((item, index) => (
              <motion.div
                key={item.question}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex gap-4"
              >
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-indigo-600" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">{item.question}</h3>
                  <p className="text-gray-600">{item.answer}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}