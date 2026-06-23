# Todo

Use the maestro-architecture skill for this task. The generated maestro skill failed to add the human review task in the task list after correctly selecting the default workflow to complete a task. I would like to add a hook in order to avoid such issues. I was thinking about using the TaskCreated hook to check if the added tasks match the selected workflow. If they don't match, a warning should be displayed.

Use the workflow-view skill for this task. When I change the selected workflow, using the dropdown, I loose all changes unsaved. I think that the app should use Zustand to store the workflow state and avoid losing changes when switching workflows.
