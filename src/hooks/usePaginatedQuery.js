import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  getDocsFromServer,
} from '../config/firebase';
import { db } from '../config/firebase';

const DEFAULT_PAGE_SIZE = 50;

export function usePaginatedQuery(collectionPath, options = {}) {
  const {
    filters = [],
    orderByField = 'updatedAtLocal',
    orderByDirection = 'desc',
    pageSize = DEFAULT_PAGE_SIZE,
    enabled = true,
  } = options;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const hasMoreRef = useRef(true);
  const lastDocRef = useRef(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (reset = false) => {
    if (loadingRef.current || !enabled) return;
    if (!reset && !hasMoreRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      if (reset) {
        lastDocRef.current = null;
        setHasMore(true);
        hasMoreRef.current = true;
      }

      const constraints = [];

      for (const filter of filters) {
        if (filter.operator === '==') {
          constraints.push(where(filter.field, '==', filter.value));
        } else if (filter.operator === 'in') {
          constraints.push(where(filter.field, 'in', filter.value));
        } else if (filter.operator === '>=') {
          constraints.push(where(filter.field, '>=', filter.value));
        } else if (filter.operator === '<=') {
          constraints.push(where(filter.field, '<=', filter.value));
        }
      }

      constraints.push(orderBy(orderByField, orderByDirection));
      constraints.push(firestoreLimit(pageSize));

      if (lastDocRef.current && !reset) {
        constraints.push(startAfter(lastDocRef.current));
      }

      const q = query(collection(db, collectionPath), ...constraints);
      const snapshot = await getDocsFromServer(q);

      if (snapshot.empty) {
        setHasMore(false);
        hasMoreRef.current = false;
        if (reset) setData([]);
        return;
      }

      const newDocs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];

      if (snapshot.docs.length < pageSize) {
        setHasMore(false);
        hasMoreRef.current = false;
      }

      setData(prev => reset ? newDocs : [...prev, ...newDocs]);
    } catch (err) {
      console.error('Paginated query error:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [collectionPath, filters, orderByField, orderByDirection, pageSize, enabled]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadPage(false);
    }
  }, [loadPage, loading, hasMore]);

  const refresh = useCallback(() => {
    loadPage(true);
  }, [loadPage]);

  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  useEffect(() => {
    if (enabled) {
      refresh();
    }
  }, [enabled, collectionPath, filterKey]);

  return {
    data,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}

export function usePaginatedTrips(dateKey, options = {}) {
  return usePaginatedQuery(`trips/${dateKey}`, {
    orderByField: 'time',
    orderByDirection: 'asc',
    pageSize: 50,
    ...options,
  });
}

export function usePaginatedDriverTrips(dateKey, driverId, options = {}) {
  return usePaginatedQuery(`trips/${dateKey}`, {
    filters: [{ field: 'driverId', operator: '==', value: driverId }],
    orderByField: 'time',
    orderByDirection: 'asc',
    pageSize: 50,
    ...options,
  });
}

export function usePaginatedAssignments(dateKey, options = {}) {
  return usePaginatedQuery(`assignments/${dateKey}`, {
    orderByField: 'offeredAtLocal',
    orderByDirection: 'desc',
    pageSize: 50,
    ...options,
  });
}

export default usePaginatedQuery;
