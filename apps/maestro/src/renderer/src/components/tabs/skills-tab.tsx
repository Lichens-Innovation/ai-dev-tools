// The Skills tab: every skill this project, this machine, or an installed plugin makes available.

import DiscoveredDefinitionsList from "./discovered-definitions";
import CreateLink from "./create-link";
import type { DiscoveredDefinition } from "../../utils/tools";

export default function SkillsTab({ skills }: { skills: DiscoveredDefinition[] }) {
  return (
    <div className="flex flex-col gap-6">
      <DiscoveredDefinitionsList items={skills} emptyLabel="skills" />
      <CreateLink to="/create-skill" label="Create a skill" />
    </div>
  );
}
