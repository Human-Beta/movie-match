"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

import { clientEnv } from "@/lib/env/client";

const client = createClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export const realtime = {
  channel: client.channel.bind(client),
  removeChannel: async (channel: RealtimeChannel): Promise<void> => {
    await client.removeChannel(channel);
  },
};
