const monthOnly = new Intl.DateTimeFormat("es-PE", {
  month: "long",
  timeZone: "UTC",
});

const monthAndYear = new Intl.DateTimeFormat("es-PE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatCampaignMonth(
  year: number,
  month: number,
  includeYear = true,
) {
  const value = new Date(Date.UTC(year, month - 1, 1));
  const label = (includeYear ? monthAndYear : monthOnly).format(value);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
