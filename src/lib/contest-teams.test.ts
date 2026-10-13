import { describe, expect, it } from "vitest";
import { curatedTechTeamNames, formContestTeams, techTeamNames, type ContestParticipant } from "./contest-teams";

const participants = (count: number): ContestParticipant[] => Array.from({ length: count }, (_, i) => ({
  source: "outsider", reference: `AGNT-${String(i).padStart(12, "0")}`,
  full_name: `Person ${i}`, email: `person${i}@example.com`, phone: String(i)
}));

describe("contest team formation", () => {
  it.each([
    [0, []], [1, [1]], [2, [2]], [3, [3]], [4, [4]], [5, [5]],
    [6, [3, 3]], [7, [3, 4]], [8, [4, 4]], [9, [4, 5]],
    [10, [5, 5]], [11, [3, 4, 4]], [12, [4, 4, 4]]
  ])("assigns %i participants exactly once", (count, expected) => {
    const input = participants(count);
    const teams = formContestTeams(input);
    expect(teams.map(team => team.members.length).sort()).toEqual(expected);
    expect(new Set(teams.flatMap(team => team.members.map(member => member.reference))).size).toBe(count);
    expect(new Set(teams.map(team => team.name)).size).toBe(teams.length);
    expect(teams.every(team => !/^Team \d+$/.test(team.name))).toBe(true);
    expect(input.map(person => person.reference)).toEqual(participants(count).map(person => person.reference));
  });
  it("provides distinct tech names for the largest supported roster", () => {
    expect(curatedTechTeamNames).toHaveLength(20);
    expect(new Set(curatedTechTeamNames).size).toBe(20);
    expect(new Set(techTeamNames(20))).toEqual(new Set(curatedTechTeamNames));
    const names = techTeamNames(250);
    expect(new Set(names).size).toBe(250);
    expect(names.every(name => /^(Quantum|Neural|Binary|Pixel|Cyber|Circuit|Vector|Cipher|Cloud|Kernel|Logic|Syntax|Data|Photon|Fusion|Nano|Algorithm|Matrix|API|Debug) /.test(name))).toBe(true);
  });
});
