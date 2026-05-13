# TODO

1. Refactor style variables names
1. Refactor the claude-fs package to split its code
1. Add a custom env variable to the dev command from the `apps/help-server/package.json` to indicate with an env variable if the code is ran locally or in docker. When using the docker container, set the env variable to true. Then use this variable instead of trying a function locally and seing if it returns something before trying the docker version.
1. Create a small package for public logos
