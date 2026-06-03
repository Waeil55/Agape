import React, { useRef, useEffect } from 'react';
import useGoogleMaps from '../hooks/useGoogleMaps';

const PlacesAutocompleteInput = ({ value, onChange, placeholder, className, required, onPlaceSelect, disabled }) => {
  const inputRef = useRef(null);
  const { ready } = useGoogleMaps();

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
          onChange(place.formatted_address);
          if (onPlaceSelect) onPlaceSelect(place);
        }
      });
    } catch {}
    return () => {
      if (autocomplete) window.google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [ready]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || 'Search address...'}
      className={className}
      required={required}
      disabled={disabled}
      autoComplete="off"
    />
  );
};

export default PlacesAutocompleteInput;
