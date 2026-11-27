// Sending the order to a supplier from the phone: opens WhatsApp / Viber / SMS
// with the text ready, the admin just presses send. No account or paid API
// needed; only the supplier's phone number (Dobavljači).

/** "064 123 4567" / "+381 64 1234567" / "00381…" → "381641234567" (digits, international). */
export function intlPhone(phone: string): string | null {
  let d = phone.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = `381${d.slice(1)}`
  return /^\d{8,15}$/.test(d) ? d : null
}

export function whatsappUrl(phone: string, text: string): string | null {
  const p = intlPhone(phone)
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null
}

/** Viber can't prefill text for a number: open the chat; the text is copied first so it can be pasted. */
export function viberUrl(phone: string): string | null {
  const p = intlPhone(phone)
  return p ? `viber://chat?number=%2B${p}` : null
}

export function smsUrl(phone: string, text: string): string | null {
  const p = intlPhone(phone)
  // "?&body=" works on both iPhone and Android.
  return p ? `sms:+${p}?&body=${encodeURIComponent(text)}` : null
}
