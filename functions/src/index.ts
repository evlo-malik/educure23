import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

admin.initializeApp();
const db = admin.firestore();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

// Scheduled function to reset usage limits
export const resetUsageLimits = onSchedule('every day 00:00', async (event) => {
  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();

  try {
    // Get all users with usage data
    const [messageUsageSnapshot, uploadUsageSnapshot, vocalizeUsageSnapshot] = await Promise.all([
      db.collection('messageUsage').get(),
      db.collection('uploadUsage').get(),
      db.collection('vocalizeUsage').get()
    ]);

    // Reset daily message limits
    messageUsageSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const lastReset = data.textMessages?.lastReset?.toDate() || new Date(0);
      const isNewDay = now.toDate().getDate() !== lastReset.getDate();

      if (isNewDay) {
        batch.update(doc.ref, {
          'textMessages.count': 0,
          'textMessages.lastReset': now
        });
      }
    });

    // Reset weekly area message and document upload limits
    const checkWeeklyReset = (lastReset: admin.firestore.Timestamp) => {
      const daysSinceReset = Math.floor(
        (now.toDate().getTime() - lastReset.toDate().getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSinceReset >= 7;
    };

    messageUsageSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const lastReset = data.areaMessages?.lastReset;
      
      if (lastReset && checkWeeklyReset(lastReset)) {
        batch.update(doc.ref, {
          'areaMessages.count': 0,
          'areaMessages.lastReset': now
        });
      }
    });

    uploadUsageSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const documentsLastReset = data.documents?.lastReset;
      
      if (documentsLastReset && checkWeeklyReset(documentsLastReset)) {
        batch.update(doc.ref, {
          'documents.count': 0,
          'documents.lastReset': now
        });
      }
    });

    // Reset monthly lecture recording and vocalize limits
    const checkMonthlyReset = (lastReset: admin.firestore.Timestamp) => {
      const daysSinceReset = Math.floor(
        (now.toDate().getTime() - lastReset.toDate().getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSinceReset >= 30;
    };

    uploadUsageSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const lecturesLastReset = data.lectures?.lastReset;
      
      if (lecturesLastReset && checkMonthlyReset(lecturesLastReset)) {
        batch.update(doc.ref, {
          'lectures.count': 0,
          'lectures.lastReset': now
        });
      }
    });

    vocalizeUsageSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const standardLastReset = data.standard?.lastReset;
      const proLastReset = data.pro?.lastReset;

      if (standardLastReset && checkMonthlyReset(standardLastReset)) {
        batch.update(doc.ref, {
          'standard.count': 0,
          'standard.lastReset': now
        });
      }

      if (proLastReset && checkMonthlyReset(proLastReset)) {
        batch.update(doc.ref, {
          'pro.count': 0,
          'pro.lastReset': now
        });
      }
    });

    // Commit all updates
    await batch.commit();
    console.log('Successfully reset usage limits');

  } catch (error) {
    console.error('Error resetting usage limits:', error);
    throw error;
  }
});

// Rest of your existing Cloud Functions...
[Previous Cloud Functions code...]