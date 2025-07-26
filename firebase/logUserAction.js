// Logging utility for all services/pages

// Modular logging utility for all services/pages
import { addDoc, collection, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/**
 * Logs a user action to Firestore and deletes logs older than 1 week.
 * @param {object} db - Firestore database instance
 * @param {string} action - Action performed
 * @param {object|string} details - Details about the action
 */
export async function logUserAction(db, action, details) {
    try {
        const dispatcherID = sessionStorage.getItem('dispatcherSessionId') || 'Unknown';
        const discordName = sessionStorage.getItem('discordName') || 'Unknown';
        const irlName = sessionStorage.getItem('irlName') || 'Unknown';
        const now = new Date();
        const logEntry = {
            timestamp: now,
            action,
            details,
            dispatcherID,
            discordName,
            irlName
        };

        // Add the new log entry
        await addDoc(collection(db, 'logs'), logEntry);

        // Delete logs older than 1 week
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const logsRef = collection(db, 'logs');
        const oldLogsQuery = query(logsRef, where('timestamp', '<', oneWeekAgo));
        const oldLogsSnapshot = await getDocs(oldLogsQuery);
        for (const docSnap of oldLogsSnapshot.docs) {
            await deleteDoc(docSnap.ref);
        }

        // Ensure at least one placeholder log exists in the collection
        const placeholderQuery = query(logsRef, where('action', '==', '__placeholder__'));
        const placeholderSnapshot = await getDocs(placeholderQuery);
        if (placeholderSnapshot.empty) {
            await addDoc(logsRef, {
                placeholder: true,
                timestamp: new Date()
            });
        }
    } catch (e) {
        console.error('Failed to log user action:', action, details, e);
    }
}

