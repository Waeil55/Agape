import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  db,
  collection,
  doc,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '../config/firebase';
import {
  ASSIGNMENT_STATUSES,
  FIRESTORE_COLLECTIONS,
  SYSTEM_EVENT_TYPES,
} from '../config/firestoreSchema';
import { emitSystemEvent } from '../services/firestoreEventEngine';

const ACTIVE_ASSIGNMENT_STATUSES = [
  ASSIGNMENT_STATUSES.OFFERED,
  ASSIGNMENT_STATUSES.TRANSFERRED,
];

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const sortAssignments = (assignments) => assignments.sort((a, b) => {
    const aTime = a.offeredAt?.toMillis?.() || Date.parse(a.offeredAtLocal || a.updatedAtLocal || 0) || 0;
    const bTime = b.offeredAt?.toMillis?.() || Date.parse(b.offeredAtLocal || b.updatedAtLocal || 0) || 0;
    return bTime - aTime;
  });

export function useDriverAssignments({ enabled, driver, currentUser, resubscribeKey = 0 }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const driverId = driver?.id || '';
  const driverEmail = normalizeEmail(driver?.email || currentUser);

  useEffect(() => {
    if (!enabled || (!driverId && !driverEmail)) {
      setAssignments([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    let inFlight = null;
    setLoading(true);

    const publish = (resultSets) => {
      const byId = new Map();
      resultSets.forEach((docs) => {
        docs.forEach((assignment) => {
          if (assignment?.id) byId.set(assignment.id, assignment);
        });
      });
      setAssignments(sortAssignments([...byId.values()]));
      setLoading(false);
      setError(null);
    };

    const fetchFor = async (field, value) => {
      if (!value) return [field, []];
      const assignmentQuery = query(
        collection(db, FIRESTORE_COLLECTIONS.ASSIGNMENTS),
        where(field, '==', value),
        where('status', 'in', ACTIVE_ASSIGNMENT_STATUSES),
        orderBy('offeredAt', 'desc'),
        limit(25)
      );
      const snap = await getDocsFromServer(assignmentQuery);
      return [field, snap.docs.map((assignmentDoc) => ({ id: assignmentDoc.id, ...assignmentDoc.data() }))];
    };

    const refreshAssignments = async () => {
      if (inFlight) return inFlight;
      inFlight = Promise.all([
        fetchFor('driverId', driverId),
        fetchFor('driverEmail', driverEmail),
      ]).then((entries) => {
        if (cancelled) return;
        publish(new Map(entries));
      }).catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Driver assignment refresh failed');
        setLoading(false);
      }).finally(() => {
        inFlight = null;
      });
      return inFlight;
    };

    refreshAssignments();
    const timer = setInterval(refreshAssignments, 12000);
    window.addEventListener('online', refreshAssignments);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', refreshAssignments);
    };
  }, [enabled, driverId, driverEmail, resubscribeKey]);

  const acknowledgeAssignment = useCallback(async (assignmentId) => {
    if (!assignmentId) return false;
    const assignment = assignments.find((item) => item.id === assignmentId);
    await updateDoc(doc(db, FIRESTORE_COLLECTIONS.ASSIGNMENTS, assignmentId), {
      deliveryState: 'seen',
      seenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    emitSystemEvent({
      type: SYSTEM_EVENT_TYPES.ASSIGNMENT_UPDATED,
      aggregateType: 'assignment',
      aggregateId: assignmentId,
      tripId: assignment?.tripId || null,
      driverId: assignment?.driverId || driverId || null,
      assignmentId,
      actor: { userId: currentUser || driverEmail || driverId || 'driver', role: 'driver' },
      severity: 'info',
      payload: {
        before: { deliveryState: assignment?.deliveryState || 'queued' },
        after: { deliveryState: 'seen' },
        changedFields: ['deliveryState', 'seenAt'],
      },
    }).catch((err) => console.error('Assignment seen event failed:', err));
    return true;
  }, [assignments, currentUser, driverEmail, driverId]);

  const acceptAssignment = useCallback(async (assignmentId) => {
    if (!assignmentId) return false;
    const assignment = assignments.find((item) => item.id === assignmentId);
    await updateDoc(doc(db, FIRESTORE_COLLECTIONS.ASSIGNMENTS, assignmentId), {
      status: ASSIGNMENT_STATUSES.ACCEPTED,
      deliveryState: 'seen',
      seenAt: assignment?.seenAt || serverTimestamp(),
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    emitSystemEvent({
      type: SYSTEM_EVENT_TYPES.ASSIGNMENT_UPDATED,
      aggregateType: 'assignment',
      aggregateId: assignmentId,
      tripId: assignment?.tripId || null,
      driverId: assignment?.driverId || driverId || null,
      assignmentId,
      actor: { userId: currentUser || driverEmail || driverId || 'driver', role: 'driver' },
      severity: 'info',
      payload: {
        before: { status: assignment?.status || ASSIGNMENT_STATUSES.OFFERED },
        after: { status: ASSIGNMENT_STATUSES.ACCEPTED, deliveryState: 'seen' },
        changedFields: ['status', 'deliveryState', 'respondedAt'],
      },
    }).catch((err) => console.error('Assignment accept event failed:', err));
    return true;
  }, [assignments, currentUser, driverEmail, driverId]);

  const unseenCount = useMemo(
    () => assignments.filter((assignment) => assignment.deliveryState !== 'seen').length,
    [assignments]
  );

  return {
    assignments,
    unseenCount,
    loading,
    error,
    acknowledgeAssignment,
    acceptAssignment,
  };
}

export default useDriverAssignments;
