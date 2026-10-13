const { pacificDate } = require('./time');

async function reserveCapacity(client, promotionId, now) {
  const day = pacificDate(now);
  const locked = await client.query(
    `SELECT total_issued, to_char(daily_date, 'YYYY-MM-DD') AS daily_date, daily_issued, total_cap, daily_cap, physical_supply
     FROM capacity_ledger WHERE promotion_id = $1 FOR UPDATE`,
    [promotionId]
  );
  if (!locked.rowCount) return false;
  const row = locked.rows[0];
  const dailyUsed = row.daily_date === day ? Number(row.daily_issued) : 0;
  if (row.total_cap != null && Number(row.total_issued) >= Number(row.total_cap)) return false;
  if (row.physical_supply != null && Number(row.total_issued) >= Number(row.physical_supply)) return false;
  if (row.daily_cap != null && dailyUsed >= Number(row.daily_cap)) return false;
  await client.query(
    `UPDATE capacity_ledger
     SET total_issued = total_issued + 1, daily_issued = $2, daily_date = $3::date, updated_at = now()
     WHERE promotion_id = $1`,
    [promotionId, dailyUsed + 1, day]
  );
  return true;
}

module.exports = { reserveCapacity };
