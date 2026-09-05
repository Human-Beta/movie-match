import assert from "node:assert/strict";
import test from "node:test";

import { ParticipantBroadcastPublisher, type ParticipantBroadcastConfig } from "@/lib/realtime/participant-broadcast";

const config: ParticipantBroadcastConfig = {
  projectUrl: "https://project-ref.supabase.co",
  publishableKey: "sb_publishable_test-key",
};
const topic = "room:11111111-1111-4111-8111-111111111111";

test("sends a minimal public invalidation through the Broadcast REST endpoint", async () => {
  const requests: Array<{ input: URL | RequestInfo; init?: RequestInit }> = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requests.push({ input, init });
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const publisher = new ParticipantBroadcastPublisher(config, { fetchImpl });

  const delivered = await publisher.publishParticipantsChanged(topic);
  const request = requests.at(0) ?? null;

  assert.equal(delivered, true);
  assert.equal(requests.length, 1);
  assert.ok(request);
  assert.ok(request.init);
  assert.equal(
    request.input.toString(),
    "https://project-ref.supabase.co/realtime/v1/api/broadcast/room%3A11111111-1111-4111-8111-111111111111/events/participants_changed",
  );
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.body, "{}");
  assert.equal(new Headers(request.init.headers).get("apikey"), config.publishableKey);
  assert.equal(new Headers(request.init.headers).get("Content-Type"), "application/json");
  assert.equal(request.input.toString().includes(config.publishableKey), false);
  assert.deepEqual(JSON.parse(String(request.init.body)), {});
});

test("retries failures with a bounded exponential delay and then succeeds", async () => {
  let calls = 0;
  const waits: number[] = [];
  const fetchImpl = (async () => {
    calls += 1;

    if (calls === 1) {
      throw new Error("simulated network failure");
    }

    return new Response(null, { status: calls === 2 ? 503 : 202 });
  }) as typeof fetch;
  const publisher = new ParticipantBroadcastPublisher(config, {
    fetchImpl,
    maxAttempts: 3,
    retryDelayMs: 10,
    sleep: async (milliseconds): Promise<void> => {
      waits.push(milliseconds);
    },
  });

  assert.equal(await publisher.publishParticipantsChanged(topic), true);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
});

test("returns false without throwing after the retry bound is exhausted", async () => {
  let calls = 0;
  const publisher = new ParticipantBroadcastPublisher(config, {
    fetchImpl: (async () => {
      calls += 1;
      throw new Error("simulated permanent outage");
    }) as typeof fetch,
    maxAttempts: 3,
    retryDelayMs: 0,
    sleep: async (): Promise<void> => undefined,
  });

  assert.equal(await publisher.publishParticipantsChanged(topic), false);
  assert.equal(calls, 3);
});
