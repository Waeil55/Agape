import { useEffect, useState } from 'react';
import {
  db,
  collection,
  getDocsFromServer,
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

    let cancelled = false;
    const eventsQuery = query(collection(db, FIRESTORE_COLLECTIONS.SYSTEM_EVENTS), ...constraints);
    const refreshEvents = async () => {
      try {
        const snap = await getDocsFromServer(eventsQuery);
        if (cancelled) return;
        setEvents(snap.docs.map((eventDoc) => ({ id: eventDoc.id, ...eventDoc.data() })));
        setLoading(false);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'System events listener failed');
        setLoading(false);
      }
    };

    refreshEvents();
    const timer = setInterval(refreshEvents, 15000);
    window.addEventListener('online', refreshEvents);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', refreshEvents);
    };
  }, [eventType, aggregateId, maxEvents]);

  return { events, loading, error };
}

export default useSystemEvents;
