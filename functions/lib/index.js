"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPortalSession = exports.handleSubscriptionUpdated = exports.handleSubscriptionUpdate = exports.handleSubscriptionCancel = void 0;
const admin = require("firebase-admin");
const stripe_1 = require("stripe");
const firestore_1 = require("firebase-functions/v2/firestore");
admin.initializeApp();
const db = admin.firestore();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
});
// Handle subscription cancellation
exports.handleSubscriptionCancel = (0, firestore_1.onDocumentCreated)('customers/{userId}/cancellation_requests/{requestId}', async (event) => {
    var _a;
    const snap = event.data;
    const { userId } = event.params;
    if (!snap) {
        console.error('No snapshot data available');
        return;
    }
    try {
        // Get active subscription
        const subscriptionsRef = db
            .collection('customers')
            .doc(userId)
            .collection('subscriptions');
        const subscriptionsSnapshot = await subscriptionsRef
            .where('status', 'in', ['active', 'trialing'])
            .limit(1)
            .get();
        if (subscriptionsSnapshot.empty) {
            throw new Error('No active subscription found');
        }
        const subscription = subscriptionsSnapshot.docs[0];
        const subscriptionData = subscription.data();
        // Get the correct subscription ID
        const stripeSubscriptionId = subscriptionData.subscription_id ||
            subscriptionData.id ||
            ((_a = subscriptionData.metadata) === null || _a === void 0 ? void 0 : _a.subscription_id) ||
            snap.data().subscriptionId;
        if (!stripeSubscriptionId) {
            throw new Error('No subscription ID found in subscription data');
        }
        // Cancel subscription in Stripe
        await stripe.subscriptions.update(stripeSubscriptionId, {
            cancel_at_period_end: true
        });
        // Update subscription document
        await subscription.ref.update({
            cancel_at_period_end: true,
            canceled_at: admin.firestore.FieldValue.serverTimestamp()
        });
        // Update cancellation request status
        await snap.ref.update({
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    catch (error) {
        console.error('Error canceling subscription:', error);
        await snap.ref.update({
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            errorDetails: JSON.stringify(error, null, 2),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    }
});
// Handle subscription updates
exports.handleSubscriptionUpdate = (0, firestore_1.onDocumentCreated)('customers/{userId}/subscription_updates/{requestId}', async (event) => {
    const snap = event.data;
    const { userId } = event.params;
    if (!snap) {
        console.error('No snapshot data available');
        return;
    }
    try {
        const updateData = snap.data();
        const { newPriceId, subscriptionId } = updateData;
        if (!subscriptionId || !newPriceId) {
            throw new Error('Missing required subscription update data');
        }
        // Get current subscription from Stripe
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const subscriptionItemId = subscription.items.data[0].id;
        // Update the subscription in Stripe
        const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
            items: [{
                    id: subscriptionItemId,
                    price: newPriceId,
                }],
            proration_behavior: 'always_invoice',
            payment_behavior: 'pending_if_incomplete',
        });
        // Update status in Firestore
        await snap.ref.update({
            status: 'completed',
            updatedSubscription: updatedSubscription,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    catch (error) {
        console.error('Error updating subscription:', error);
        await snap.ref.update({
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            errorDetails: JSON.stringify(error, null, 2),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    }
});
// Handle subscription status updates
exports.handleSubscriptionUpdated = (0, firestore_1.onDocumentWritten)('customers/{userId}/subscriptions/{subscriptionId}', async (event) => {
    var _a, _b, _c, _d, _e;
    const { userId } = event.params;
    const newData = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after) === null || _b === void 0 ? void 0 : _b.data();
    if (!newData)
        return; // Document was deleted
    try {
        // Update user's subscription status in their profile
        await db.collection('users').doc(userId).update({
            subscriptionStatus: newData.status,
            subscriptionPlan: ((_e = (_d = (_c = newData.items) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.price) === null || _e === void 0 ? void 0 : _e.id) || null,
            subscriptionPeriodEnd: newData.current_period_end
        });
    }
    catch (error) {
        console.error('Error updating user subscription status:', error);
    }
});
// Handle customer portal session creation
exports.createPortalSession = (0, firestore_1.onDocumentCreated)('customers/{userId}/checkout_sessions/{sessionId}', async (event) => {
    var _a;
    const snap = event.data;
    const { userId } = event.params;
    if (!snap)
        return;
    const data = snap.data();
    if (data.type !== 'portal')
        return;
    try {
        // Get customer ID
        const customerRef = db.collection('customers').doc(userId);
        const customer = await customerRef.get();
        const customerId = (_a = customer.data()) === null || _a === void 0 ? void 0 : _a.stripeCustomerId;
        if (!customerId) {
            // Create a new Stripe customer if one doesn't exist
            const user = await db.collection('users').doc(userId).get();
            const userData = user.data();
            if (!userData) {
                throw new Error('User data not found');
            }
            const newCustomer = await stripe.customers.create({
                email: userData.email,
                metadata: {
                    firebaseUID: userId
                }
            });
            // Save the new customer ID
            await customerRef.set({
                stripeCustomerId: newCustomer.id,
                email: userData.email
            });
            // Use the new customer ID
            customerId = newCustomer.id;
        }
        // Create portal session
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: data.return_url || `${process.env.WEBAPP_URL}/dashboard`,
        });
        // Update the session document
        await snap.ref.update({
            url: session.url,
            created: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (error) {
        console.error('Error creating portal session:', error);
        await snap.ref.update({
            error: {
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
        });
    }
});
//# sourceMappingURL=index.js.map