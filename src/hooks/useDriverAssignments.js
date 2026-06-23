import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  db,
  collection,
  doc,
  limit,
  onSnapshot,
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

    setLoading(true);
    const queries = [];
    if (driverId) {
      queries.push(
        query(
          collection(db, FIRESTORE_COLLECTIONS.ASSIGNMENTS),
          where('driverId', '==', driverId),
          where('status', 'in', ACTIVE_ASSIGNMENT_STATUSES),
          orderBy('offeredAt', 'desc'),
          limit(25)
        )
      );
    }
    if (driverEmail) {
      queries.push(
        query(
          collection(db, FIRESTORE_COLLECTIONS.ASSIGNMENTS),
          where('driverEmail', '==', driverEmail),
          where('status', 'in', ACTIVE_ASSIGNMENT_STATUSES),
          orderBy('offeredAt', 'desc'),
          limit(25)
        )
      );
    }

    const unsubscribes = queries.map((q) =>
      onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAssignments((prev) => {
          const byId = new Map(prev.map((a) => [a.id, a]));
          docs.forEach((d) => byId.set(d.id, d));
          return sortAssignments([...byId.values()]);
        });
        setLoading(false);
        setError(null);
      }, (err) => {
        setError(err.message || 'Driver assignment refresh failed');
        setLoading(false);
      })
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
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
