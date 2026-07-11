import React, { useRef, useEffect, useCallback } from 'react';
import useGoogleMaps from '../hooks/useGoogleMaps';

const PlacesAutocompleteInput = ({ value, onChange, placeholder, className, required, onPlaceSelect, disabled }) => {
  const inputRef = useRef(null);
  const { ready } = useGoogleMaps();
  const autocompleteRef = useRef(null);
  const isSettingRef = useRef(false);

  useEffect(() => {
    if (!ready || !inputRef.current || !window.google?.maps?.places) return;
    try {
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ['formatted_address', 'address_components', 'geometry', 'place_id'],
        types: ['address'],
        componentRestrictions: { country: 'us' },
      });
      autocompleteRef.current = ac;
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (place?.formatted_address) {
          isSettingRef.current = true;
          inputRef.current.value = place.formatted_address;
          onChange(place.formatted_address);
          if (onPlaceSelect) onPlaceSelect(place);
          setTimeout(() => { isSettingRef.current = false; }, 100);
        }
      });
    } catch {}
    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [ready]);

  useEffect(() => {
    if (inputRef.current && !isSettingRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = value || '';
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={value || ''}
      onChange={(e) => {
        if (isSettingRef.current) return;
        onChange(e.target.value);
      }}
      placeholder={placeholder || 'Search address...'}
      className={className}
      required={required}
      disabled={disabled}
      autoComplete="off"
    />
  );
};

export default PlacesAutocompleteInput;
