/**
 * @typedef {'pending'|'processing'|'awaiting_review'|'completed'|'failed'} BrokerSyncStatus
 * @typedef {{ bookingId:string, tripId:string, pickup:object, dropoff:object }} BrokerTripPayload
 * @typedef {'production'|'planned'|'disabled'} BrokerProviderStatus
 * @typedef {{ exactBookingMatch:boolean, deterministicMapping:boolean, humanApply:boolean, queue:boolean, readBackVerification?:boolean }} BrokerCapabilities
 * @typedef {{ id:string, displayName:string, status:BrokerProviderStatus, capabilities:BrokerCapabilities, validateSettings:(settings:object)=>string[], validateTrip:(trip:object)=>object, mapTrip:(trip:object)=>BrokerTripPayload }} BrokerSyncProvider
 */
export {};
