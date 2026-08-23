import { useMemo, useSyncExternalStore } from 'react';

export const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

const mediaQueryStores = new Map();

export const createMediaQueryStore = (query) => {
  let mediaQueryList = null;
  let removeNativeListener = null;
  const subscribers = new Set();

  const getMediaQueryList = () => {
    if (
      !mediaQueryList
      && typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
    ) {
      mediaQueryList = window.matchMedia(query);
    }
    return mediaQueryList;
  };

  const notifySubscribers = () => {
    subscribers.forEach((subscriber) => subscriber());
  };

  const attachNativeListener = () => {
    const queryList = getMediaQueryList();
    if (!queryList || removeNativeListener) return;

    if (typeof queryList.addEventListener === 'function') {
      queryList.addEventListener('change', notifySubscribers);
      removeNativeListener = () => queryList.removeEventListener('change', notifySubscribers);
      return;
    }

    if (typeof queryList.addListener === 'function') {
      queryList.addListener(notifySubscribers);
      removeNativeListener = () => queryList.removeListener?.(notifySubscribers);
    }
  };

  const detachNativeListener = () => {
    removeNativeListener?.();
    removeNativeListener = null;
  };

  return {
    getSnapshot: () => Boolean(getMediaQueryList()?.matches),
    subscribe: (subscriber) => {
      subscribers.add(subscriber);
      if (subscribers.size === 1) attachNativeListener();

      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) detachNativeListener();
      };
    },
  };
};
const getMediaQueryStore = (query) => {
  if (!mediaQueryStores.has(query)) {
    mediaQueryStores.set(query, createMediaQueryStore(query));
  }
  return mediaQueryStores.get(query);
};

export const useMediaQuery = (query, serverFallback = false) => {
  const store = useMemo(() => getMediaQueryStore(query), [query]);
  const getServerSnapshot = useMemo(() => () => serverFallback, [serverFallback]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
};
