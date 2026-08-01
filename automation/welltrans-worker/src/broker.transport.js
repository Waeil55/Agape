export const BROKER_TRANSPORTS = Object.freeze({
  playwright: Object.freeze({ id: 'playwright', available: true, mode: 'human_review_staging', parallelWrites: 1 }),
  tripspark_api: Object.freeze({ id: 'tripspark_api', available: false, mode: 'vendor_credentials_required', parallelWrites: 0 }),
  tripspark_file_exchange: Object.freeze({ id: 'tripspark_file_exchange', available: false, mode: 'vendor_certification_required', parallelWrites: 0 }),
});

export function selectBrokerTransport(id = 'playwright') {
  const transport = BROKER_TRANSPORTS[id];
  if (!transport) throw new Error(`Unknown broker transport: ${id}`);
  if (!transport.available) throw new Error(`${id} is locked until TripSpark supplies certified access.`);
  return transport;
}
