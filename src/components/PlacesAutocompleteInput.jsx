import React, { useRef, useEffect } from 'react';
import useGoogleMaps from '../hooks/useGoogleMaps';

const PlacesAutocompleteInput = ({ value, onChange, placeholder, className, required, onPlaceSelect, disabled }) => {
  const inputRef = useRef(null);
  const { ready } = useGoogleMaps();
  const skipNextRef = useRef(false);

  useEffect(() => {
    if (!ready || !inputRef.current || !window.google?.maps?.places) return;
    let autocomplete;
    try {
      autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ['formatted_address', 'address_components', 'geometry', 'place_id'],
        types: ['address'],
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place?.formatted_address) {
          skipNextRef.current = true;
          onChange(place.formatted_address);
          if (onPlaceSelect) onPlaceSelect(place);
        }
      });
    } catch {}
    return () => {
      if (autocomplete) window.google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [ready, onChange, onPlaceSelect]);

  useEffect(() => {
    if (inputRef.current && value !== undefined && inputRef.current.value !== value) {
      inputRef.current.value = value || '';
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={value || ''}
      onChange={(e) => {
        if (skipNextRef.current) { skipNextRef.current = false; return; }
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
