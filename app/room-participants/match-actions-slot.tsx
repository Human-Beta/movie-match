import type { ReactNode } from "react";

import type { ParticipantRole } from "@/lib/participants/participant-service";

/**
 * The match result owns the host-only action region. Task 015 supplies its
 * authoritative action controls through this slot without changing guest UI.
 */
export function MatchActionsSlot({ children, participantRole }: Readonly<{ children?: ReactNode; participantRole: ParticipantRole }>): ReactNode {
  if (participantRole !== "host" || children === undefined) {
    return null;
  }

  return <div className="mt-6">{children}</div>;
}
