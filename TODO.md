# Todo

I want to improve the log view. Use the /maestro-architecture and /log-view skills for this task. I also added a new version of the design in 

First for the left panel, I want to make it thinner. It only displays the name of the steps (main session, human review, agent instance, skill) with an icon to its left to show in the step was: successfull (green checkmark), failed (red cross), success with notes (warning). The user can still click on a step in the left panel to auto scroll to it’s part of the log in the middle main section that displays the full log. In the left panel, the selected step is underlined. The underline color can be the same as the step’s success (green, red, yellow).

The middle section has a little style change. Each step is framed into a rounded edge border. Clicking on/inside it select the step. When selected, the border of the step can be larger and colored as the step’s success (green, red, yellow). The related step on the left pane becomes selected as well.

Finally, in the right pane, is displayed all the content related to the step selected. There are 3 main sections: Input, Process, Output. The input is the context and prompt received at the start of the step (e.g. at the agent startup). The process is all the normal log that the step produced. The output is what the step outputs at the end, before transitionning to the next step.

Maybe the hooks and scripts in place are not complete enough right now to get the input and success step for the instances. We will need to check this first before updating the log view.