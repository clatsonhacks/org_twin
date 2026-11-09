import type { Department } from "../../../../shared/types";

/** A department as the 3D world draws it: roles become rows of desks inside, workers outside. */
export interface TeamView {
  key: string;
  name: string;
  emoji: string;
  color: string;
  headcount: number;
  hours: number;
  roles: RoleView[];
}

export interface RoleView {
  key: string;
  name: string;
  headcount: number;
  hours: number;
}

export function toTeam(d: Department): TeamView {
  const roles = d.roles.filter((r) => r.title.trim());
  const total = Math.max(1, roles.reduce((n, r) => n + Math.max(1, r.count), 0));
  return {
    key: d.id,
    name: d.name,
    emoji: d.emoji,
    color: d.color,
    headcount: d.headcount,
    hours: d.hoursAutomatable,
    roles: roles.length
      ? roles.map((r, i) => ({
          key: `r${i}`,
          name: r.title,
          headcount: Math.max(1, r.count),
          hours: Math.round((d.hoursAutomatable * Math.max(1, r.count)) / total),
        }))
      : [{ key: "r0", name: "Team", headcount: Math.max(1, d.headcount), hours: d.hoursAutomatable }],
  };
}

/** A person sitting at a desk inside a department. One role with headcount 3 → 3 people. */
export interface Person {
  id: string;
  team: string;
  role: string;
  roleName: string;
  name: string;
  seat: number;
}

/** Desks drawn per role; extra headcount is shown as "+N" on the role sign. */
export const MAX_DESKS_PER_ROLE = 6;

const FIRST = [
  "Maya", "Leo", "Aisha", "Tom", "Priya", "Jonas", "Sofia", "Kenji", "Elena", "Omar", "Grace", "Mateo",
  "Nina", "Ravi", "Chloe", "Sam", "Lina", "Diego", "Hana", "Ben", "Zara", "Felix", "Iris", "Kwame",
  "Ana", "Yusuf", "Mila", "Theo", "Noor", "Luca", "Ivy", "Arjun", "Ella", "Marco", "Sana", "Hugo",
];
const LAST = ["K.", "R.", "M.", "S.", "T.", "L.", "P.", "D.", "B.", "W.", "N.", "O.", "H.", "C.", "V.", "A."];

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function peopleOf(team: TeamView): Person[] {
  const used = new Set<string>();
  const out: Person[] = [];
  team.roles.forEach((r) => {
    const n = Math.max(1, Math.min(MAX_DESKS_PER_ROLE, r.headcount));
    for (let seat = 0; seat < n; seat++) {
      let h = hash(`${team.key}/${r.key}/${seat}`);
      let name = "";
      for (let tries = 0; tries < FIRST.length; tries++, h = hash(`${h}`)) {
        name = `${FIRST[h % FIRST.length]} ${LAST[(h >>> 8) % LAST.length]}`;
        if (!used.has(name)) break;
      }
      used.add(name);
      out.push({ id: `${r.key}#${seat}`, team: team.key, role: r.key, roleName: r.name, name, seat });
    }
  });
  return out;
}
