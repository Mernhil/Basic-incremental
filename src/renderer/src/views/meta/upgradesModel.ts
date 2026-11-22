import type { Content, PerkLine, PerkMilestone, PerkOption } from '../../../../data';
import {
  lineLevel,
  lineMilestones,
  milestoneStatus,
  pickedOption,
  waitingPicks,
  type GameState,
  type MilestoneStatus,
} from '../../../../game';
import { COPY } from '../../copy';
import { upgradeLineName } from '../../pages/upgradeRowModel';
import { amountText } from '../../settings/coins';

/**
 * The Upgrades view's board (UI_RULES §2 "The Upgrades view"; DESIGN.md §4 Milestone picks): every
 * repeatable line's milestones by place, Logging, Mining and Training, each with its status (a
 * waiting pick, a pick made, one kept from an earlier run, one still ahead), the count waiting for
 * the title bar and the pile, and the lifetime Money line. Display logic only.
 */

export interface MilestoneItem {
  milestone: PerkMilestone;
  status: MilestoneStatus;
  /** The perk picked there, when one is. */
  picked: PerkOption | null;
  /** "Lv 10". */
  levelText: string;
  /** What the status says ("Picked", "Comes back at Lv 10", "At Lv 25"); empty while waiting. */
  note: string;
}

export interface MilestoneLine {
  key: string;
  line: PerkLine;
  name: string;
  levelText: string;
  items: MilestoneItem[];
}

export interface MilestoneGroup {
  key: 'training';
  title: string;
  lines: MilestoneLine[];
}

export interface MilestoneBoard {
  groups: MilestoneGroup[];
  /** Picks waiting now (the subtitle and the pile hint). */
  waiting: number;
  /** Lifetime Money earned, in coins. */
  lifetime: string;
}

function lineView(state: GameState, content: Content, line: PerkLine): MilestoneLine {
  return {
    key: `${line.kind}:${line.id}`,
    line,
    name: upgradeLineName(content, line),
    levelText: COPY.row.level(lineLevel(state, line)),
    items: lineMilestones(content, line).map((m) => {
      const status = milestoneStatus(state, m);
      const note =
        status === 'active'
          ? COPY.picks.picked
          : status === 'kept'
            ? COPY.picks.kept(m.level)
            : status === 'ahead'
              ? COPY.picks.ahead(m.level)
              : '';
      return {
        milestone: m,
        status,
        picked: pickedOption(state, m),
        levelText: COPY.row.level(m.level),
        note,
      };
    }),
  };
}

/** The lines of each group in the order the views show them. */
export function boardLines(content: Content): Record<MilestoneGroup['key'], PerkLine[]> {
  return {
    training: content.training.map((t) => ({ kind: 'training' as const, id: t.id })),
  };
}

export function milestoneBoard(state: GameState, content: Content): MilestoneBoard {
  const lines = boardLines(content);
  const keys = ['training'] as const;
  return {
    groups: keys.map((key) => ({
      key,
      title: COPY.picks.groups[key],
      lines: lines[key].map((l) => lineView(state, content, l)),
    })),
    waiting: waitingPicks(state, content).length,
    lifetime: amountText(content, content.perks.currency, state.upgrades.moneyEarned),
  };
}
