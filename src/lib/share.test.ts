import { describe, expect, it } from 'vitest'
import { intlPhone, smsUrl, whatsappUrl } from './share'
import { csvCell, toCsv } from './csv'

describe('phone numbers for sending the order', () => {
  it('turns Serbian numbers into international ones', () => {
    expect(intlPhone('064 123 4567')).toBe('381641234567')
    expect(intlPhone('+381 64/123-4567')).toBe('381641234567')
    expect(intlPhone('00381641234567')).toBe('381641234567')
    expect(intlPhone('12')).toBeNull()
  })

  it('builds WhatsApp and SMS links with the text', () => {
    expect(whatsappUrl('0641234567', 'Coca 2 gajbe')).toBe('https://wa.me/381641234567?text=Coca%202%20gajbe')
    expect(smsUrl('0641234567', 'a&b')).toBe('sms:+381641234567?&body=a%26b')
  })
})

describe('Excel (CSV) export', () => {
  it('uses ; and decimal comma, quotes only when needed', () => {
    expect(csvCell(2.5)).toBe('2,5')
    expect(csvCell('Šljivovica; 0,7')).toBe('"Šljivovica; 0,7"')
    expect(csvCell('kaže "ok"')).toBe('"kaže ""ok"""')
    expect(csvCell('Coca Cola 0,25')).toBe('Coca Cola 0,25')
    expect(csvCell(null)).toBe('')
    expect(toCsv(['A', 'B'], [['x', 1]])).toBe('A;B\r\nx;1')
  })
})
