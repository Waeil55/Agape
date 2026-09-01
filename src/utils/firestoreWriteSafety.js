import { sanitizeFirestorePayload } from './firestorePayload';

export const sanitizeFirestoreWriteData = (data) => {
  const sanitized = sanitizeFirestorePayload(data);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    throw new TypeError('Firestore write data must be a non-null object');
  }
  return sanitized;
};

export const sanitizeFirestoreUpdateArguments = (args) => {
  if (args.length === 1 && args[0] && typeof args[0] === 'object') {
    return [sanitizeFirestoreWriteData(args[0])];
  }

  // Firebase also accepts update(ref, field, value, ...). Preserve every field
  // path and validate each paired value before it reaches the SDK.
  const sanitized = [...args];
  for (let index = 1; index < sanitized.length; index += 2) {
    if (sanitized[index] === undefined) {
      throw new TypeError(`Firestore update contains undefined at argument ${index + 1}`);
    }
    sanitized[index] = sanitizeFirestorePayload(sanitized[index]);
  }
  return sanitized;
};

export const wrapFirestoreWriteContext = (context) => {
  let safeContext;
  safeContext = new Proxy(context, {
    get(target, property) {
      if (property === 'set') {
        return (reference, data, options) => {
          const safeData = sanitizeFirestoreWriteData(data);
          if (options === undefined) target.set(reference, safeData);
          else target.set(reference, safeData, options);
          return safeContext;
        };
      }
      if (property === 'update') {
        return (reference, ...args) => {
          target.update(reference, ...sanitizeFirestoreUpdateArguments(args));
          return safeContext;
        };
      }
      if (property === 'delete') {
        return (reference) => {
          target.delete(reference);
          return safeContext;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return safeContext;
};
