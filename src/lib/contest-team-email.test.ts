import { describe, expect, it, vi } from "vitest";
import type { ContestParticipant } from "./contest-teams";

const send = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/gmail", () => ({ sendGmailMessage: send }));
import { sendContestTeamEmail } from "./contest-team-email";
import { EVENT_VENUE, EVENT_MAPS_URL } from "./venue";

const member = (name: string, reference: string): ContestParticipant => ({
  source: "outsider", reference, full_name: name, email: `${name.toLowerCase()}@example.com`, phone: "01700000000"
});

describe("contest notification", () => {
  it("sends only the recipient's team roster", async () => {
    const first = member("Alice", "AGNT-AAAAAAAAAAAA");
    const second = member("Bob", "AGNT-BBBBBBBBBBBB");
    await sendContestTeamEmail(first, { name: "Team 01", members: [first, second] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(first.email);
    expect(send.mock.calls[0][0].html).toContain("Alice");
    expect(send.mock.calls[0][0].html).toContain("Bob");
    expect(send.mock.calls[0][0].html).not.toContain("Team 02");
    expect(send.mock.calls[0][0].html).toContain(EVENT_VENUE);
    expect(send.mock.calls[0][0].html).toContain(EVENT_MAPS_URL.replaceAll("&", "&amp;"));
    expect(send.mock.calls[0][0].text).toContain(EVENT_VENUE);
    expect(send.mock.calls[0][0].text).toContain(EVENT_MAPS_URL);
  });

  it("refuses to send a roster to a person outside that team", async () => {
    send.mockClear();
    await expect(sendContestTeamEmail(member("Alice", "AGNT-AAAAAAAAAAAA"), {
      name: "Team 02", members: [member("Bob", "AGNT-BBBBBBBBBBBB")]
    })).rejects.toThrow("does not belong");
    expect(send).not.toHaveBeenCalled();
  });
});
