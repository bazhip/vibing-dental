import { describe, expect, it } from 'vitest';
import { unsubscribeToken, verifyUnsubscribeToken } from './unsubscribe';

const user = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
describe('unsubscribe tokens', () => {
  it('round-trips the user id', async () => {
    expect(await verifyUnsubscribeToken(await unsubscribeToken(user, 'secret'), 'secret')).toBe(user);
  });
  it('rejects a different secret, a tampered id, and malformed tokens', async () => {
    const token = await unsubscribeToken(user, 'secret');
    expect(await verifyUnsubscribeToken(token, 'other')).toBeNull();
    expect(await verifyUnsubscribeToken(token.replace('3f2b', '3f2c'), 'secret')).toBeNull();
    expect(await verifyUnsubscribeToken('', 'secret')).toBeNull();
    expect(await verifyUnsubscribeToken('nodot', 'secret')).toBeNull();
    expect(await verifyUnsubscribeToken(`not-a-uuid.${token.split('.')[1]}`, 'secret')).toBeNull();
  });
});
