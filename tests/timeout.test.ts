import assert from 'node:assert/strict';
import test from 'node:test';
import { timeoutSignal } from '../src/timeout.ts';

test('request deadlines still abort when Safari lacks AbortSignal.timeout', t => {
  const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')!;
  Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
  t.after(() => Object.defineProperty(AbortSignal, 'timeout', descriptor));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signal = timeoutSignal(5000);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(4999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(signal.aborted, true);
});

test('modern browsers keep their native timeout signal', t => {
  const signal = new AbortController().signal;
  const native = t.mock.method(AbortSignal, 'timeout', () => signal);
  assert.equal(timeoutSignal(12000), signal);
  assert.deepEqual(native.mock.calls[0].arguments, [12000]);
});
