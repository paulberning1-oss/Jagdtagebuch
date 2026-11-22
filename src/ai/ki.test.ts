import { describe, expect, it } from 'vitest'
import { allowedUsers, checkRequest, dailyLimit, pickModel } from '../../supabase/functions/ki/validate'
import { kiErrorText } from './ki'

const user = (content: string) => ({ role: 'user', content })

describe('KI-Funktion: Anfrage prüfen', () => {
  it('gültige Anfrage', () => {
    const r = checkRequest({ task: 'test', consent: true, messages: [user('Hallo')] })
    expect(r.ok).toBe(true)
  })

  it('ohne Zustimmung abgelehnt', () => {
    expect(checkRequest({ task: 'test', messages: [user('Hallo')] })).toEqual({ ok: false, error: 'consent_missing' })
    expect(checkRequest({ task: 'test', consent: 'ja', messages: [user('Hallo')] }).ok).toBe(false)
  })

  it('Rollen müssen abwechseln, erste und letzte vom Nutzer', () => {
    expect(checkRequest({ task: 'chat', consent: true, messages: [{ role: 'assistant', content: 'x' }] }).ok).toBe(false)
    expect(checkRequest({ task: 'chat', consent: true, messages: [user('a'), user('b')] }).ok).toBe(false)
    expect(checkRequest({ task: 'chat', consent: true, messages: [user('a'), { role: 'assistant', content: 'b' }] }).ok).toBe(false)
    expect(checkRequest({ task: 'chat', consent: true, messages: [user('a'), { role: 'assistant', content: 'b' }, user('c')] }).ok).toBe(true)
    // keine fremden Rollen (z. B. system) aus der App
    expect(checkRequest({ task: 'chat', consent: true, messages: [{ role: 'system', content: 'x' }] }).ok).toBe(false)
  })

  it('Größen und Aufgaben begrenzt', () => {
    expect(checkRequest({ task: 'hack', consent: true, messages: [user('a')] }).ok).toBe(false)
    expect(checkRequest({ task: 'test', consent: true, messages: [user('x'.repeat(60_001))] }).ok).toBe(false)
    expect(checkRequest({ task: 'test', consent: true, context: 'x'.repeat(400_001), messages: [user('a')] }).ok).toBe(false)
    expect(checkRequest({ task: 'test', consent: true, messages: [user('  ')] }).ok).toBe(false)
    expect(checkRequest({ task: 'status', consent: true, messages: [] }).ok).toBe(true)
  })

  it('nur erlaubte Modelle, sonst Standard', () => {
    expect(pickModel('claude-sonnet-5-5', 'claude-opus-5-5')).toBe('claude-sonnet-5-5')
    expect(pickModel('claude-fable-5-2', 'claude-opus-5-5')).toBe('claude-opus-5-5')
    expect(pickModel(undefined, 'claude-opus-5-5')).toBe('claude-opus-5-5')
  })

  it('Freischaltung und Tageslimit aus den Secrets', () => {
    expect(allowedUsers(undefined).size).toBe(0) // nicht gesetzt = niemand
    const a = allowedUsers(' ABC-1 , def-2\nghi ')
    expect([...a]).toEqual(['abc-1', 'def-2', 'ghi'])
    expect(dailyLimit(undefined)).toBe(30)
    expect(dailyLimit('50')).toBe(50)
    expect(dailyLimit('0')).toBe(30)
    expect(dailyLimit('abc')).toBe(30)
  })

  it('verständliche Fehlertexte', () => {
    expect(kiErrorText('limit', { used: 30, limit: 30 })).toContain('30 von 30')
    expect(kiErrorText('not_allowed')).toContain('KI_NUTZER')
    expect(kiErrorText('unbekannt', { detail: 'x' })).toContain('(x)')
  })
})
