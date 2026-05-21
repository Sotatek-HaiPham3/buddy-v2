import { describe, expect, it } from 'vitest';
import { parseSseStream } from '../../api/sse.js';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe('parseSseStream', () => {
  it('parses token and done events across chunks', async () => {
    const stream = streamOf([
      'event: token\ndata: {"de',
      'lta":"hi"}\n\nevent: done\ndata: {"message_id":"m1"}\n\n',
    ]);
    const events: unknown[] = [];
    for await (const ev of parseSseStream(stream.getReader())) events.push(ev);
    expect(events).toEqual([
      { event: 'token', data: { delta: 'hi' } },
      { event: 'done', data: { message_id: 'm1' } },
    ]);
  });
});
