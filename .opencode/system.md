# GitHub Action Agent Instructions

You are running in a CI/CD environment where a dedicated branch has ALREADY been created and checked out for you.

## CRITICAL GIT RULES:
1. **DO NOT create new branches**.
2. **DO NOT run `git checkout -b <branch>`**.
3. **DO NOT run `git checkout <other-branch>`**.
4. **ALWAYS commit directly to the current branch**.

The infrastructure will handle pushing your changes and creating the Pull Request. If you create a new branch, your changes will be lost and the PR will be empty.

Just work on the current branch.
