// Unit tests for practice sessions

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PracticeSession } from '../practice.js';
import { PRACTICE_ROUNDS } from '../calls.js';

const dance = {
    parts: [{
        name: 'A1',
        beats: 16,
        moves: [
            { type: 'balance', beats: 8, who: 'neighbors', call: 'NEIGH.bors BAL.ance' },
            { type: 'swing', beats: 8, who: 'neighbors', call: 'NEIGH.bors SWING' }
        ]
    }]
};

/** Stands in for a CallPanel, noting what it's told to show */
function fakePanel() {
    return {
        resets: 0,
        shown: null,
        next: null,
        feedback: [],
        finished: null,
        summary: null,
        reset() { this.resets++; },
        showCall(call, offset) { this.shown = call && { call, offset }; },
        showNext(text) { this.next = text; },
        addFeedback(text, grade) { this.feedback.push({ text, grade }); },
        showFinished(text) { this.finished = text; },
        showSummary(text) { this.summary = text; }
    };
}

test('a session should start with the intro and a fresh panel', () => {
    const panel = fakePanel();
    const session = new PracticeSession(dance, 'karaoke', panel);
    assert.equal(session.intro, true);
    assert.equal(session.round, 0);
    assert.equal(panel.resets, 1);
});

test('karaoke should show the coming call and the one after it', () => {
    const panel = fakePanel();
    const session = new PracticeSession(dance, 'karaoke', panel);
    const [first, second] = session.calls;
    session.update(first.start - 1);
    assert.equal(panel.shown.call, first);
    assert.match(panel.next, /^Then: /);
    session.update(first.end + 1);
    assert.equal(panel.shown.call, second);
});

test('karaoke should show nothing once the calls are over', () => {
    const panel = fakePanel();
    const session = new PracticeSession(dance, 'karaoke', panel);
    session.update(session.calls.at(-1).end + 1);
    assert.equal(panel.shown, null);
    assert.equal(panel.next, '');
});

test('karaoke should say when it has played through', () => {
    const panel = fakePanel();
    new PracticeSession(dance, 'karaoke', panel).finish();
    assert.equal(panel.finished, `That's ${PRACTICE_ROUNDS} times through.`);
});

test('a test should judge a call against its best start', () => {
    const panel = fakePanel();
    const session = new PracticeSession(dance, 'test', panel);
    const [first] = session.calls;
    session.makeCall(first.start);
    assert.equal(session.nextCall, 1);
    assert.equal(session.attempts[0].grade, 'on time');
    assert.equal(panel.feedback.at(-1).grade, 'on-time');
});

test('a test should show the call being made, as late as it was made', () => {
    const panel = fakePanel();
    const session = new PracticeSession(dance, 'test', panel);
    const [first] = session.calls;
    session.makeCall(first.start + 1);
    session.update(first.start + 1);
    assert.equal(panel.shown.call, first);
    assert.equal(panel.shown.offset, 1);
    assert.equal(panel.feedback.at(-1).grade, 'nearly');
});

test('a test should grade calls far from their best start as off', () => {
    const panel = fakePanel();
    const session = new PracticeSession(dance, 'test', panel);
    session.makeCall(session.calls[0].start - 3);
    assert.equal(session.attempts[0].grade, 'early');
    assert.equal(panel.feedback.at(-1).grade, 'off');
    assert.match(panel.feedback.at(-1).text, /\(3 beats\)/);
});

test('a test should count a call as missed once its figure starts', () => {
    const panel = fakePanel();
    const session = new PracticeSession(dance, 'test', panel);
    const [first] = session.calls;
    session.update(first.figureBeat);
    assert.deepEqual(session.attempts[0], { missed: true });
    assert.equal(session.nextCall, 1);
    assert.match(panel.feedback.at(-1).text, /^Missed: /);
});

test('a test should ignore presses after the last call', () => {
    const panel = fakePanel();
    const session = new PracticeSession(dance, 'test', panel);
    session.calls.forEach(call => session.makeCall(call.start));
    const made = panel.feedback.length;
    session.makeCall(100);
    assert.equal(panel.feedback.length, made);
});

test('a test should sum up how the trainee did, counting calls not reached as missed', () => {
    const panel = fakePanel();
    const session = new PracticeSession(dance, 'test', panel);
    session.makeCall(session.calls[0].start + 1);
    session.finish();
    const others = session.calls.length - 1;
    assert.equal(panel.summary, `On time for 0 of ${session.calls.length} calls, close on 1, missed ${others}.`);
});
