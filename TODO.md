# Todo

Workflow-view bug: Toggle between workflows in the app does not works, changes, but then stays the same if try to go back. Unsave changes are removed. Maybe we should use a state manager like zustand to save the client side afk.yaml version to save ?

Workflow-view bug: Local skills are correctly discovered on install, and are prensent in the instances, but not in the left sidebar even if they are correctly listed in the preview of the afk.yaml file in the skills_available section.

Why do the scripts afk-render-orchestrator, afk-set-session-workflow and bash-validation and afk-session need to be copied in the project on installation ? If the afk project is updated, how can the scripts be updated as well ? For example if I were to add a validation step in the afk project.

Is the `.claude/.gitignore` file added on project installation necessary since the root `.gitignore` is already updated ? I don’t think so ?
