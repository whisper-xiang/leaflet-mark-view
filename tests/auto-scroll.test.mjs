import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../auto-scroll.js', import.meta.url), 'utf8'), context);
function setup(top = 0, height = 1200) {
  const area = { scrollTop: top, scrollHeight: height, clientHeight: 200 };
  const frames = new Map();
  let id = 0, status;
  const clock = {
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
    cancelAnimationFrame(key) { frames.delete(key); },
  };
  const controller = context.createAutoScroller(area, (running, message) => { status = { running, message }; }, clock);
  return { area, controller, frames, get status() { return status; }, tick(time) {
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time));
  } };
}
test('time-based speed is independent of refresh rate and accumulates fractional movement', () => {
  for (const fps of [30, 60, 120]) {
    const s = setup(); s.controller.configure(5, false); s.controller.start(); s.tick(0);
    for (let i = 1; i <= fps; i++) s.tick(i * 1000 / fps);
    assert.ok(Math.abs(s.area.scrollTop - 5) < 0.0001);
  }
});
test('repeated start does not duplicate frames; pause cancels and resume preserves position', () => {
  const s = setup(100); s.controller.start(); s.controller.start(); assert.equal(s.frames.size, 1);
  s.tick(0); s.tick(100); assert.equal(s.area.scrollTop, 103.5);
  s.controller.stop(); assert.equal(s.frames.size, 0);
  s.area.scrollTop = 300; s.controller.start(); s.tick(10000); assert.equal(s.area.scrollTop, 300);
});
test('bottom stops, restart goes to top, and looping returns to top', () => {
  const s = setup(999); s.controller.start(); s.tick(0); // Starts over when already at bottom.
  assert.equal(s.area.scrollTop, 0);
  s.controller.stop(); s.area.scrollTop = 998; s.controller.start(); s.tick(0); s.tick(100);
  assert.equal(s.area.scrollTop, 1000); assert.equal(s.controller.running, false);
  s.controller.configure(35, true); s.area.scrollTop = 998; s.controller.start(); s.tick(0); s.tick(100);
  assert.equal(s.area.scrollTop, 0); assert.equal(s.controller.running, true);
});
test('short content never schedules a loop and shrinking content stops', () => {
  const s = setup(0, 200); s.controller.configure(35, true); s.controller.start();
  assert.equal(s.frames.size, 0); assert.equal(s.controller.running, false);
  s.area.scrollHeight = 1200; s.controller.start(); s.area.scrollHeight = 100; s.tick(0);
  assert.equal(s.controller.running, false); assert.equal(s.frames.size, 0);
});
test('live speed changes apply and long frame gaps are capped', () => {
  const s = setup(); s.controller.start(); s.tick(0); s.controller.configure(100, false); s.tick(10000);
  assert.equal(s.area.scrollTop, 10);
  assert.equal(s.controller.configure('bad', false), 35);
  assert.equal(s.controller.configure(900, false), 200);
});
