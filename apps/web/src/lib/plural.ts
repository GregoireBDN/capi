/** "1 opération" / "3 opérations" (`pluralForm` defaults to `singular` + s). */
export function plural(count: number, singular: string, pluralForm?: string) {
  return `${count} ${count > 1 ? (pluralForm ?? `${singular}s`) : singular}`
}
