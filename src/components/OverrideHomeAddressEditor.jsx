import { MapPin } from 'lucide-react';
import { loadGoogleMapsApi } from '../hooks/useGoogleMaps';
import { normalizeOverridePolicy } from '../utils/tripCostOverrides';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';

const addressPart = (place, type, short = false) => place?.address_components
  ?.find((part) => part.types?.includes(type))?.[short ? 'short_name' : 'long_name'] || '';

const placeToSharedHomePolicy = (place, current) => {
  const street = [addressPart(place, 'street_number'), addressPart(place, 'route')].filter(Boolean).join(' ');
  return {
    ...current,
    homeAddress: street || place?.formatted_address || current.homeAddress,
    homeCity: addressPart(place, 'locality') || addressPart(place, 'postal_town') || current.homeCity,
    homeState: addressPart(place, 'administrative_area_level_1', true) || current.homeState,
    homeZip: addressPart(place, 'postal_code') || current.homeZip,
    homeLat: null,
    homeLng: null,
    homeFormattedAddress: '',
  };
};

const geocodeHomeAddress = async (address) => {
  const maps = await loadGoogleMapsApi();
  if (!maps?.Geocoder) throw new Error('Google address verification is unavailable.');
  return new Promise((resolve, reject) => {
    new maps.Geocoder().geocode({ address }, (results, status) => {
      const result = results?.[0];
      const location = result?.geometry?.location;
      const lat = typeof location?.lat === 'function' ? location.lat() : Number(location?.lat);
      const lng = typeof location?.lng === 'function' ? location.lng() : Number(location?.lng);
      if (status === 'OK' && Number.isFinite(lat) && Number.isFinite(lng)) resolve({ result, lat, lng });
      else reject(new Error(`Home address could not be verified: ${status || 'UNKNOWN_ERROR'}`));
    });
  });
};

export const verifyOverrideHomePolicy = async (policy) => {
  const normalized = normalizeOverridePolicy(policy);
  if (!normalized.homeAddress || !normalized.homeCity || !normalized.homeState || !/^\d{5}(?:-\d{4})?$/.test(normalized.homeZip)) {
    throw new Error('Enter one shared street address, city, state, and valid ZIP code.');
  }
  const fullHomeAddress = [normalized.homeAddress, normalized.homeAddress2, normalized.homeCity, normalized.homeState, normalized.homeZip].filter(Boolean).join(', ');
  const verified = await geocodeHomeAddress(fullHomeAddress);
  return normalizeOverridePolicy({
    ...placeToSharedHomePolicy(verified.result, normalized),
    homeAddress2: normalized.homeAddress2,
    homeLat: verified.lat,
    homeLng: verified.lng,
    homeFormattedAddress: verified.result.formatted_address || fullHomeAddress,
  });
};

export const getOverrideHomePolicyUpdates = (policy) => {
  const normalized = normalizeOverridePolicy(policy);
  return {
    homeAddress: normalized.homeAddress,
    homeAddress2: normalized.homeAddress2,
    homeCity: normalized.homeCity,
    homeState: normalized.homeState,
    homeZip: normalized.homeZip,
    homeLat: normalized.homeLat,
    homeLng: normalized.homeLng,
    homeFormattedAddress: normalized.homeFormattedAddress,
  };
};

const OverrideHomeAddressEditor = ({ policy, onChange, disabled = false, compact = false }) => {
  const draft = normalizeOverridePolicy(policy);
  const updateField = (key, value) => onChange?.({
    ...draft,
    [key]: value,
    homeLat: null,
    homeLng: null,
    homeFormattedAddress: '',
  });

  return (
    <div className={`space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 ${compact ? 'p-3' : 'p-4'}`}>
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MapPin size={16} className="text-blue-600" /> Home address</h4>
        <p className="mt-1 text-xs font-semibold text-slate-500">This one shared address is used for every driver’s first trip from home and last trip returning home. Driver-profile addresses are not used for override mileage.</p>
      </div>
      <div className={`grid gap-3 rounded-xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'} sm:grid-cols-2 lg:grid-cols-6`}>
        <label className="text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-3">Street address
          <PlacesAutocompleteInput value={draft.homeAddress} onChange={(value) => updateField('homeAddress', value)} onPlaceSelect={(place) => onChange?.(placeToSharedHomePolicy(place, draft))} placeholder="Start typing your home street address" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900" disabled={disabled} />
        </label>
        <label className="text-xs font-semibold text-slate-600 lg:col-span-1">Apt / unit<input value={draft.homeAddress2} onChange={(event) => updateField('homeAddress2', event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold" disabled={disabled} /></label>
        <label className="text-xs font-semibold text-slate-600 lg:col-span-2">City<input value={draft.homeCity} onChange={(event) => updateField('homeCity', event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold" disabled={disabled} /></label>
        <label className="text-xs font-semibold text-slate-600 sm:col-span-1 lg:col-span-2">State<input value={draft.homeState} onChange={(event) => updateField('homeState', event.target.value.toUpperCase().slice(0, 2))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold uppercase" disabled={disabled} /></label>
        <label className="text-xs font-semibold text-slate-600 sm:col-span-1 lg:col-span-2">ZIP code<input value={draft.homeZip} onChange={(event) => updateField('homeZip', event.target.value.replace(/[^0-9-]/g, '').slice(0, 10))} inputMode="numeric" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold" disabled={disabled} /></label>
        <div className="flex items-end sm:col-span-2 lg:col-span-2"><p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">The address is verified with Google when saved.</p></div>
      </div>
    </div>
  );
};

export default OverrideHomeAddressEditor;
