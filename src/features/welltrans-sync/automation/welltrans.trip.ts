export type WellTransActivityPayload = {
  arrival: string;
  departure: string;
  mileage: number | null;
  signatureCaptured: boolean;
};

export type WellTransTripPayload = {
  bookingId: string;
  tripId: string;
  driver: string;
  vehicle: string;
  pickup: WellTransActivityPayload;
  dropoff: WellTransActivityPayload;
};

