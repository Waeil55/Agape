/**
 * @typedef {'pending'|'processing'|'awaiting_review'|'completed'|'failed'} BrokerSyncStatus
 * @typedef {{ bookingId:string, tripId:string, pickup:object, dropoff:object }} BrokerTripPayload
 * @typedef {{ id:string, displayName:string, validateSettings:(settings:object)=>string[], mapTrip:(trip:object)=>BrokerTripPayload }} BrokerSyncProvider
 */
export {};
