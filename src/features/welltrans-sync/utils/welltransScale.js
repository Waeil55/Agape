export const WELLTRANS_REVIEW_BATCH_SIZE = 250;
export const WELLTRANS_TABLE_PAGE_SIZE = 100;

export const partitionWellTransRun = (
  tripIds,
  shardSize = WELLTRANS_REVIEW_BATCH_SIZE,
) => {
  if (!Number.isInteger(shardSize) || shardSize < 1) {
    throw new Error('WellTrans shard size must be a positive integer');
  }
  const uniqueIds = [...new Set((tripIds || []).map(String))];
  return Array.from(
    { length: Math.ceil(uniqueIds.length / shardSize) },
    (_, index) => uniqueIds.slice(index * shardSize, (index + 1) * shardSize),
  );
};

export const pageWellTransRows = (
  rows,
  page,
  pageSize = WELLTRANS_TABLE_PAGE_SIZE,
) => {
  const safePage = Math.max(0, Number(page) || 0);
  return (rows || []).slice(safePage * pageSize, (safePage + 1) * pageSize);
};
