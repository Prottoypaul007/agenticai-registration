import { randomInt } from "node:crypto";

export type ContestParticipant = {
  source: "outsider" | "batch14";
  reference: string;
  full_name: string;
  email: string;
  phone: string;
};

export type ContestTeam = { name: string; members: ContestParticipant[] };

const techPrefixes = ["Quantum", "Neural", "Binary", "Pixel", "Cyber", "Circuit", "Vector", "Cipher",
  "Cloud", "Kernel", "Logic", "Syntax", "Data", "Photon", "Fusion", "Nano"];
const techNames = ["Coders", "Pioneers", "Bots", "Networks", "Architects", "Hackers", "Signals", "Engines",
  "Builders", "Navigators", "Makers", "Catalysts", "Crafters", "Explorers", "Innovators", "Guardians"];

export function techTeamNames(count: number): string[] {
  const names = techPrefixes.flatMap(prefix => techNames.map(name => `${prefix} ${name}`));
  if (count > names.length) throw new Error("Too many contest teams for the available unique names");
  for (let i = names.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names.slice(0, count);
}

export function formContestTeams(participants: ContestParticipant[]): ContestTeam[] {
  if (!participants.length) return [];
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const count = shuffled.length;
  const fullTeams = Math.floor(count / 4);
  const remainder = count % 4;
  let sizes: number[];
  if (count < 4) sizes = [count];
  else if (count === 6) sizes = [3, 3]; // Two distinct teams of five are impossible.
  else {
    sizes = Array(fullTeams).fill(4);
    if (remainder === 1 || remainder === 2) {
      const indexes = sizes.map((_, index) => index);
      for (let i = 0; i < remainder; i++) {
        const pick = randomInt(indexes.length);
        sizes[indexes.splice(pick, 1)[0]]++;
      }
    } else if (remainder === 3) sizes.push(3);
  }

  let offset = 0;
  const names = techTeamNames(sizes.length);
  return sizes.map((size, index) => {
    const team = { name: names[index], members: shuffled.slice(offset, offset + size) };
    offset += size;
    return team;
  });
}
