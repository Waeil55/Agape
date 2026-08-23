const forEachBrowserStorage = (callback) => {
  if (typeof window === 'undefined') return;
  [window.localStorage, window.sessionStorage].forEach(callback);
};

const removeMatchingKeys = (storageArea, matches) => {
  const keys = [];
  for (let index = 0; index < storageArea.length; index += 1) {
    const key = storageArea.key(index);
    if (matches(key || '')) keys.push(key);
  }
  keys.forEach((key) => storageArea.removeItem(key));
};

export function purgeLegacyChatStorage() {
  forEachBrowserStorage((storageArea) => {
    removeMatchingKeys(storageArea, (key) => key === 'agape_chat_outbox' || /^agape_chat_draft_.+/.test(key));
  });
}

export function purgeLegacyRoutePlanStorage() {
  forEachBrowserStorage((storageArea) => {
    removeMatchingKeys(storageArea, (key) => /^agape_routePlan_(?!theme$)[^:]+(?::expanded)?$/.test(key));
  });
}
