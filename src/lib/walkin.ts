export function normalizeDui(value: string): string {
  const input = value.trim()
  if (!/^\d{8}-?\d$/.test(input)) throw new Error('Escribe los 9 números del DUI: 00000000-0.')
  const digits = input.replace('-', '')
  return `${digits.slice(0, 8)}-${digits.slice(8)}`
}
