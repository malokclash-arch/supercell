// stats.js — حساب إحصائيات المعاملات (تفعيل/تنصيب/صيانة + حالات الطلبات)
function computeStats(entries) {
  const stats = {
    total: entries.length,
    activation: 0,
    installation: 0,
    maintenance: 0,
    other_reason: 0,
    completed: 0,
    in_progress: 0,
    closed_cancelled: 0,
    revenue_total: 0,
    by_employee: {}
  };

  for (const e of entries) {
    const reason = (e.visit_reason || "").toLowerCase();
    if (reason.startsWith("recharge card")) stats.activation++;
    else if (reason.startsWith("installation") || reason.includes("purchase ont") || reason.includes("purchase onu") || reason.includes("mesh")) stats.installation++;
    else if (reason.startsWith("maintenance")) stats.maintenance++;
    else stats.other_reason++;

    const status = (e.status || "").toLowerCase();
    if (status === "done") stats.completed++;
    else if (status === "in progress" || status === "pending") stats.in_progress++;
    else if (status === "closed") stats.closed_cancelled++;

    if (e.revenue_amount) stats.revenue_total += Number(e.revenue_amount) || 0;

    const emp = e.employee_name || "غير محدد";
    stats.by_employee[emp] = (stats.by_employee[emp] || 0) + 1;
  }

  return stats;
}

module.exports = { computeStats };
