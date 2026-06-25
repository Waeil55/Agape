import { useEffect, useState } from 'react';
import {
  db,
  collection,
  onSnapshot,
  limit,
  orderBy,
  query,
  where,
} from '../config/firebase';
import { FIRESTORE_COLLECTIONS } from '../config/firestoreSchema';

export function useSystemEvents({ eventType = null, aggregateId = null, maxEvents = 200 } = {}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const constraints = [];
    if (aggregateId) {
      constraints.push(where('aggregateId', '==', aggregateId));
    } else if (eventType) {
      constraints.push(where('type', '==', eventType));
    }
    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(limit(maxEvents));

    const eventsQuery = query(collection(db, FIRESTORE_COLLECTIONS.SYSTEM_EVENTS), ...constraints);
    
    const unsubscribe = onSnapshot(
      eventsQuery,
      (snap) => {
        setEvents(snap.docs.map((eventDoc) => ({ id: eventDoc.id, ...eventDoc.data() })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('System events listener failed:', err);
        setError(err.message || 'System events listener failed');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [eventType, aggregateId, maxEvents]);

  return { events, loading, error };
}

export default useSystemEvents;
