function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatPGFlexReadableDateTime(value: unknown) {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;

  if (!date || Number.isNaN(date.getTime())) {
    return undefined;
  }

  const hours = date.getUTCHours();
  const meridiem = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return (
    [
      padDatePart(date.getUTCDate()),
      padDatePart(date.getUTCMonth() + 1),
      date.getUTCFullYear(),
    ].join("-") +
    `-${padDatePart(displayHours)}:${padDatePart(date.getUTCMinutes())}${meridiem}`
  );
}
