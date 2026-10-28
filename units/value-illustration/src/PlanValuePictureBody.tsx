// The Illustration line of a Value card: the value graph. Every change to the levels goes up whole through onChange.

import { carryOthers } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanValueGraph } from "@kaigilb/gilbplatformcode-value-graph";
import { type ValueLineProps } from "@kaigilb/gilbplatformcode-value-line-kit";

export function PlanValuePictureBody({ data, editing, canEdit, onChange, legacy, record, host }: ValueLineProps) {
  // The old stored list is read-only until it is moved into records.
  if (legacy?.levels) {
    editing = false;
    canEdit = false;
  }
  return (
    <div className="w-full py-2">
      <PlanValueGraph
        data={data}
        title={record.facts.title}
        editing={editing || !!canEdit}
        progress={host?.progress ?? null}
        capped={host?.capped ?? null}
        {...(host?.onNotice ? { onNotice: host.onNotice } : {})}
        onChangeLevels={(levels) => onChange({ ...data, levels: carryOthers(levels, data.levels) })}
      />
    </div>
  );
}
